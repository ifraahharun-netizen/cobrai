import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/stripe";

type PlanTier = "free" | "starter" | "pro";

function toDate(value?: number | null): Date | null {
    return typeof value === "number" ? new Date(value * 1000) : null;
}

function isActiveSubscriptionStatus(status: string): boolean {
    return status === "trialing" || status === "active" || status === "past_due";
}

function tierFromSubscription(
    status: string,
    requestedTier: string | null | undefined
): PlanTier {
    if (!isActiveSubscriptionStatus(status)) return "free";
    if (requestedTier === "pro") return "pro";
    return "starter";
}

function getStripeCustomerId(
    customer: string | Stripe.Customer | Stripe.DeletedCustomer | null
): string | null {
    if (!customer) return null;
    return typeof customer === "string" ? customer : customer.id;
}

function getSubscriptionPeriod(subscription: Stripe.Subscription) {
    const firstItem = subscription.items.data[0];

    return {
        currentPeriodStart: toDate(firstItem?.current_period_start ?? null),
        currentPeriodEnd: toDate(firstItem?.current_period_end ?? null),
    };
}

function amountFromInvoice(invoice: Stripe.Invoice) {
    const i = invoice as any;

    return Number(
        i.amount_paid ??
        i.amount_due ??
        i.total ??
        i.subtotal ??
        0
    );
}

function invoiceDueDate(invoice: Stripe.Invoice) {
    const i = invoice as any;

    return (
        toDate(i.due_date) ||
        toDate(i.created) ||
        new Date()
    );
}

function invoicePaidDate(invoice: Stripe.Invoice) {
    const i = invoice as any;

    return (
        toDate(i.status_transitions?.paid_at) ||
        toDate(i.effective_at) ||
        null
    );
}

function normalizeInvoiceStatus(invoice: Stripe.Invoice, fallback: string) {
    const status = String(invoice.status || fallback || "open").toLowerCase();

    if (status === "paid") return "paid";
    if (status === "uncollectible") return "failed";
    if (status === "void") return "void";
    if (status === "draft") return "draft";
    if (status === "open") return "open";

    return status;
}

async function updateWorkspacePlan(workspaceId: string, tier: PlanTier) {
    await prisma.workspace.update({
        where: { id: workspaceId },
        data: {
            tier,
            demoMode: tier === "free",
        },
    });
}

async function saveStripeEventOnce(event: Stripe.Event) {
    try {
        await prisma.stripeEvent.create({
            data: {
                id: event.id,
                workspaceId: "unknown",
                type: event.type,
                payload: event as any,
            },
        });

        return true;
    } catch (error: any) {
        if (error?.code === "P2002") {
            return false;
        }

        throw error;
    }
}

async function updateSavedStripeEventWorkspace(eventId: string, workspaceId: string) {
    await prisma.stripeEvent.updateMany({
        where: { id: eventId },
        data: { workspaceId },
    });
}

async function resolveWorkspaceIdFromSubscription(subscription: Stripe.Subscription) {
    const metadataWorkspaceId = subscription.metadata?.workspaceId;

    if (metadataWorkspaceId) return metadataWorkspaceId;

    const stripeCustomerId = getStripeCustomerId(subscription.customer);

    if (!stripeCustomerId) return null;

    const storedCustomer = await prisma.stripeCustomer.findUnique({
        where: { stripeId: stripeCustomerId },
        select: { workspaceId: true },
    });

    return storedCustomer?.workspaceId || null;
}

async function resolveWorkspaceIdFromInvoice(stripe: Stripe, invoice: Stripe.Invoice) {
    const i = invoice as any;

    if (invoice.metadata?.workspaceId) {
        return invoice.metadata.workspaceId;
    }

    const subscriptionId =
        typeof i.subscription === "string"
            ? i.subscription
            : i.subscription?.id || null;

    if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const workspaceId = await resolveWorkspaceIdFromSubscription(subscription);

        if (workspaceId) return workspaceId;
    }

    const stripeCustomerId = getStripeCustomerId(invoice.customer as any);

    if (stripeCustomerId) {
        const storedCustomer = await prisma.stripeCustomer.findUnique({
            where: { stripeId: stripeCustomerId },
            select: { workspaceId: true },
        });

        if (storedCustomer?.workspaceId) return storedCustomer.workspaceId;
    }

    return null;
}

async function upsertStripeCustomerForWorkspace(
    stripe: Stripe,
    workspaceId: string,
    stripeCustomerId: string
) {
    const customer = await stripe.customers.retrieve(stripeCustomerId);

    if ("deleted" in customer) return null;

    await prisma.stripeCustomer.upsert({
        where: { stripeId: customer.id },
        update: {
            workspaceId,
            email: customer.email ?? null,
            name: customer.name ?? null,
        },
        create: {
            stripeId: customer.id,
            workspaceId,
            email: customer.email ?? null,
            name: customer.name ?? null,
        },
    });

    return customer;
}

async function findOrCreateCobraiCustomer(args: {
    workspaceId: string;
    stripeCustomerId: string;
    stripeCustomer?: Stripe.Customer | null;
    amount: number;
    status: string;
}) {
    const existing = await prisma.customer.findFirst({
        where: {
            workspaceId: args.workspaceId,
            stripeCustomerId: args.stripeCustomerId,
        },
        select: { id: true },
    });

    if (existing) {
        await prisma.customer.update({
            where: { id: existing.id },
            data: {
                mrr: args.amount || 0,
                status: args.status === "paid" ? "active" : args.status,
            },
        });

        return existing.id;
    }

    const customer = await prisma.customer.create({
        data: {
            workspaceId: args.workspaceId,
            stripeCustomerId: args.stripeCustomerId,
            name:
                args.stripeCustomer?.name ||
                args.stripeCustomer?.email ||
                "Stripe customer",
            email: args.stripeCustomer?.email || null,
            mrr: args.amount || 0,
            churnRisk: args.status === "paid" ? 0.25 : 0.78,
            riskScore: args.status === "paid" ? 25 : 78,
            status: args.status === "paid" ? "active" : args.status,
        },
        select: { id: true },
    });

    return customer.id;
}

async function createCustomerEvent(args: {
    workspaceId: string;
    customerId: string;
    type: string;
    occurredAt: Date;
    value?: number | null;
}) {
    await prisma.event.create({
        data: {
            workspaceId: args.workspaceId,
            customerId: args.customerId,
            type: args.type,
            occurredAt: args.occurredAt,
            value: typeof args.value === "number" ? args.value : null,
        },
    });
}

async function handleInvoiceEvent(
    stripe: Stripe,
    event: Stripe.Event,
    fallbackStatus: string,
    eventType: "payment_successful" | "payment_failed" | "invoice_created"
) {
    const invoice = event.data.object as Stripe.Invoice;

    const workspaceId = await resolveWorkspaceIdFromInvoice(stripe, invoice);

    if (!workspaceId) {
        console.error(`Missing workspaceId for ${event.type}`);
        return;
    }

    await updateSavedStripeEventWorkspace(event.id, workspaceId);

    const stripeCustomerId = getStripeCustomerId(invoice.customer as any);

    if (!stripeCustomerId) {
        console.error(`Missing stripe customer id for ${event.type}`);
        return;
    }

    const stripeCustomer = await upsertStripeCustomerForWorkspace(
        stripe,
        workspaceId,
        stripeCustomerId
    );

    const status =
        eventType === "payment_successful"
            ? "paid"
            : eventType === "payment_failed"
                ? "failed"
                : normalizeInvoiceStatus(invoice, fallbackStatus);

    const amount = amountFromInvoice(invoice);
    const dueAt = invoiceDueDate(invoice);
    const paidAt = status === "paid" ? invoicePaidDate(invoice) || new Date() : null;

    const customerId = await findOrCreateCobraiCustomer({
        workspaceId,
        stripeCustomerId,
        stripeCustomer,
        amount,
        status,
    });

    await prisma.invoice.create({
        data: {
            workspaceId,
            customerId,
            status,
            amount,
            dueAt,
            paidAt,
            isDemo: false,
        },
    });

    await createCustomerEvent({
        workspaceId,
        customerId,
        type: eventType,
        occurredAt: paidAt || dueAt || new Date(),
        value: amount,
    });

    if (eventType === "payment_failed") {
        await prisma.accountRisk.upsert({
            where: {
                id: `stripe-risk-${customerId}`,
            },
            update: {
                workspaceId,
                customerId,
                companyName:
                    stripeCustomer?.name ||
                    stripeCustomer?.email ||
                    "Stripe customer",
                riskScore: 78,
                previousRiskScore: 50,
                reasonKey: "billing_risk",
                reasonLabel: "Payment failed",
                mrr: amount,
            },
            create: {
                id: `stripe-risk-${customerId}`,
                workspaceId,
                customerId,
                companyName:
                    stripeCustomer?.name ||
                    stripeCustomer?.email ||
                    "Stripe customer",
                riskScore: 78,
                previousRiskScore: 50,
                reasonKey: "billing_risk",
                reasonLabel: "Payment failed",
                mrr: amount,
                isDemo: false,
            },
        });
    }
}

export async function POST(req: NextRequest) {
    const stripe = getStripeClient();
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    if (!signature) {
        return new NextResponse("Missing stripe-signature header", { status: 400 });
    }

    if (!process.env.STRIPE_WEBHOOK_SECRET) {
        console.error("Missing STRIPE_WEBHOOK_SECRET");
        return new NextResponse("Webhook configuration error", { status: 500 });
    }

    let event: Stripe.Event;

    try {
        event = stripe.webhooks.constructEvent(
            body,
            signature,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (error) {
        console.error("Stripe webhook signature verification failed:", error);
        return new NextResponse("Invalid signature", { status: 400 });
    }

    try {
        const shouldContinue = await saveStripeEventOnce(event);

        if (!shouldContinue) {
            return NextResponse.json({ received: true, duplicate: true });
        }

        switch (event.type) {
            case "checkout.session.completed": {
                const session = event.data.object as Stripe.Checkout.Session;

                const workspaceId = session.metadata?.workspaceId;
                const requestedTier =
                    session.metadata?.tier === "pro" ? "pro" : "starter";

                const stripeCustomerId =
                    typeof session.customer === "string" ? session.customer : null;

                const stripeSubscriptionId =
                    typeof session.subscription === "string"
                        ? session.subscription
                        : null;

                if (!workspaceId) {
                    console.error("Missing workspaceId in checkout.session.completed");
                    break;
                }
                const workspaceExists = await prisma.workspace.findUnique({
                    where: { id: workspaceId },
                    select: { id: true },
                });

                if (!workspaceExists) {
                    console.error("Invalid workspaceId in checkout.session.completed");
                    break;
                }

                await updateSavedStripeEventWorkspace(event.id, workspaceId);

                if (stripeCustomerId) {
                    await upsertStripeCustomerForWorkspace(stripe, workspaceId, stripeCustomerId);
                }

                if (stripeSubscriptionId) {
                    const subscription = await stripe.subscriptions.retrieve(
                        stripeSubscriptionId,
                        {
                            expand: ["items.data"],
                        }
                    );

                    const subscriptionCustomerId = getStripeCustomerId(
                        subscription.customer
                    );

                    if (!subscriptionCustomerId) {
                        console.error("Missing stripe customer id on checkout subscription");
                        break;
                    }

                    const { currentPeriodStart, currentPeriodEnd } =
                        getSubscriptionPeriod(subscription);

                    await prisma.stripeSubscription.upsert({
                        where: { stripeId: subscription.id },
                        update: {
                            workspaceId,
                            stripeCustomerId: subscriptionCustomerId,
                            status: subscription.status,
                            currency: subscription.currency ?? null,
                            currentPeriodStart,
                            currentPeriodEnd,
                            cancelAtPeriodEnd: subscription.cancel_at_period_end,
                            canceledAt: toDate(subscription.canceled_at),
                            endedAt: toDate(subscription.ended_at),
                        },
                        create: {
                            stripeId: subscription.id,
                            workspaceId,
                            stripeCustomerId: subscriptionCustomerId,
                            status: subscription.status,
                            currency: subscription.currency ?? null,
                            currentPeriodStart,
                            currentPeriodEnd,
                            cancelAtPeriodEnd: subscription.cancel_at_period_end,
                            canceledAt: toDate(subscription.canceled_at),
                            endedAt: toDate(subscription.ended_at),
                        },
                    });

                    await updateWorkspacePlan(
                        workspaceId,
                        tierFromSubscription(
                            subscription.status,
                            subscription.metadata?.tier ?? requestedTier
                        )
                    );
                } else {
                    await updateWorkspacePlan(workspaceId, requestedTier);
                }

                break;
            }

            case "customer.subscription.created":
            case "customer.subscription.updated":
            case "customer.subscription.deleted": {
                const incomingSubscription = event.data.object as Stripe.Subscription;

                const subscription = await stripe.subscriptions.retrieve(
                    incomingSubscription.id,
                    {
                        expand: ["items.data"],
                    }
                );

                const workspaceId = await resolveWorkspaceIdFromSubscription(subscription);
                const stripeCustomerId = getStripeCustomerId(subscription.customer);

                if (!workspaceId) {
                    console.error("Missing workspaceId in subscription metadata");
                    break;
                }

                await updateSavedStripeEventWorkspace(event.id, workspaceId);

                if (!stripeCustomerId) {
                    console.error("Missing stripe customer id on subscription");
                    break;
                }

                await upsertStripeCustomerForWorkspace(stripe, workspaceId, stripeCustomerId);

                const { currentPeriodStart, currentPeriodEnd } =
                    getSubscriptionPeriod(subscription);

                await prisma.stripeSubscription.upsert({
                    where: { stripeId: subscription.id },
                    update: {
                        workspaceId,
                        stripeCustomerId,
                        status: subscription.status,
                        currency: subscription.currency ?? null,
                        currentPeriodStart,
                        currentPeriodEnd,
                        cancelAtPeriodEnd: subscription.cancel_at_period_end,
                        canceledAt: toDate(subscription.canceled_at),
                        endedAt: toDate(subscription.ended_at),
                    },
                    create: {
                        stripeId: subscription.id,
                        workspaceId,
                        stripeCustomerId,
                        status: subscription.status,
                        currency: subscription.currency ?? null,
                        currentPeriodStart,
                        currentPeriodEnd,
                        cancelAtPeriodEnd: subscription.cancel_at_period_end,
                        canceledAt: toDate(subscription.canceled_at),
                        endedAt: toDate(subscription.ended_at),
                    },
                });

                await updateWorkspacePlan(
                    workspaceId,
                    tierFromSubscription(subscription.status, subscription.metadata?.tier)
                );

                break;
            }

            case "invoice.payment_succeeded":
            case "invoice.paid": {
                await handleInvoiceEvent(
                    stripe,
                    event,
                    "paid",
                    "payment_successful"
                );
                break;
            }

            case "invoice.payment_failed": {
                await handleInvoiceEvent(
                    stripe,
                    event,
                    "failed",
                    "payment_failed"
                );
                break;
            }

            case "invoice.finalized":
            case "invoice.created": {
                await handleInvoiceEvent(
                    stripe,
                    event,
                    "open",
                    "invoice_created"
                );
                break;
            }

            default:
                break;
        }

        return NextResponse.json({ received: true });
    } catch (error) {
        console.error("Stripe webhook handling error:", error);
        return new NextResponse("Webhook handler failed", { status: 500 });
    }
}