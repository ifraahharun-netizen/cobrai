import { NextResponse } from "next/server";
import Stripe from "stripe";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function getStripeClient() {
    const secretKey = process.env.STRIPE_SECRET_KEY;

    if (!secretKey) {
        throw new Error("Missing STRIPE_SECRET_KEY");
    }

    return new Stripe(secretKey);
}

function getWebhookSecret() {
    const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

    if (!secret) {
        throw new Error("Missing STRIPE_CONNECT_WEBHOOK_SECRET");
    }

    return secret;
}

function unixToDate(value?: number | null) {
    return value ? new Date(value * 1000) : null;
}

function getMonthKey(date = new Date()) {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function getSubscriptionPeriod(subscription: Stripe.Subscription) {
    const primaryItem = subscription.items.data[0] as
        | (Stripe.SubscriptionItem & {
            current_period_start?: number | null;
            current_period_end?: number | null;
        })
        | undefined;

    return {
        currentPeriodStart: unixToDate(primaryItem?.current_period_start ?? null),
        currentPeriodEnd: unixToDate(primaryItem?.current_period_end ?? null),
    };
}

function getMonthlyAmountMinorFromSubscription(
    subscription: Stripe.Subscription
): number {
    const activeStatuses = new Set([
        "active",
        "trialing",
        "past_due",
        "unpaid",
    ]);

    if (!activeStatuses.has(subscription.status)) {
        return 0;
    }

    let total = 0;

    for (const item of subscription.items.data) {
        const price = item.price;

        if (!price?.recurring) continue;
        if (price.recurring.usage_type === "metered") continue;

        const unitAmount = price.unit_amount ?? 0;
        const quantity = item.quantity ?? 1;
        const interval = price.recurring.interval;
        const intervalCount = price.recurring.interval_count ?? 1;

        let monthly = 0;

        if (interval === "month") {
            monthly = (unitAmount * quantity) / intervalCount;
        } else if (interval === "year") {
            monthly = (unitAmount * quantity) / (12 * intervalCount);
        } else if (interval === "week") {
            monthly = (unitAmount * quantity * 52) / (12 * intervalCount);
        } else if (interval === "day") {
            monthly = (unitAmount * quantity * 365) / (12 * intervalCount);
        }

        total += Math.round(monthly);
    }

    return total;
}

async function getWorkspaceByStripeAccountId(stripeAccountId: string) {
    return prisma.workspace.findFirst({
        where: {
            stripeAccountId,
        },
        select: {
            id: true,
            stripeAccountId: true,
        },
    });
}

async function upsertStripeCustomer(params: {
    workspaceId: string;
    customer: Stripe.Customer;
}) {
    const { workspaceId, customer } = params;

    await prisma.stripeCustomer.upsert({
        where: {
            stripeId: customer.id,
        },
        update: {
            workspaceId,
            email: customer.email ?? null,
            name: customer.name ?? null,
        },
        create: {
            workspaceId,
            stripeId: customer.id,
            email: customer.email ?? null,
            name: customer.name ?? null,
        },
    });
}

async function upsertStripeSubscription(params: {
    workspaceId: string;
    subscription: Stripe.Subscription;
}) {
    const { workspaceId, subscription } = params;

    const stripeCustomerId =
        typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer?.id;

    if (!stripeCustomerId) return;

    const { currentPeriodStart, currentPeriodEnd } =
        getSubscriptionPeriod(subscription);

    await prisma.stripeSubscription.upsert({
        where: {
            stripeId: subscription.id,
        },
        update: {
            workspaceId,
            stripeCustomerId,
            status: subscription.status,
            currency: subscription.currency ?? null,
            currentPeriodStart,
            currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
            canceledAt: unixToDate(subscription.canceled_at),
            endedAt: unixToDate(subscription.ended_at),
        },
        create: {
            workspaceId,
            stripeId: subscription.id,
            stripeCustomerId,
            status: subscription.status,
            currency: subscription.currency ?? null,
            currentPeriodStart,
            currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
            canceledAt: unixToDate(subscription.canceled_at),
            endedAt: unixToDate(subscription.ended_at),
        },
    });

    const month = getMonthKey();
    const mrrMinor = getMonthlyAmountMinorFromSubscription(subscription);

    await prisma.mrrSnapshot.upsert({
        where: {
            workspaceId_stripeCustomerId_month: {
                workspaceId,
                stripeCustomerId,
                month,
            },
        },
        update: {
            mrrMinor,
            active: mrrMinor > 0,
        },
        create: {
            workspaceId,
            stripeCustomerId,
            month,
            mrrMinor,
            active: mrrMinor > 0,
            firstSeenMonth: month,
        },
    });
}

async function markInvoiceFailure(params: {
    workspaceId: string;
    invoice: Stripe.Invoice;
}) {
    const { workspaceId, invoice } = params;

    const stripeCustomerId =
        typeof invoice.customer === "string"
            ? invoice.customer
            : invoice.customer?.id;

    if (!stripeCustomerId) return;

    const customer = await prisma.customer.findFirst({
        where: {
            workspaceId,
            stripeCustomerId,
        },
        select: {
            id: true,
            name: true,
            email: true,
            riskScore: true,
            mrr: true,
        },
    });

    const amountMinor =
        typeof invoice.amount_due === "number" ? invoice.amount_due : 0;

    if (customer) {
        await prisma.actionExecution.create({
            data: {
                workspaceId,
                customerId: customer.id,
                actionType: "retry_payment",
                channel: "manual",
                title: "Payment failed",
                subject: invoice.number
                    ? `Invoice ${invoice.number} payment failed`
                    : "Invoice payment failed",
                body: "Stripe reported a failed payment on the connected account.",
                reason: "invoice.payment_failed",
                status: "pending",
                metadata: {
                    stripeInvoiceId: invoice.id,
                    stripeCustomerId,
                    amountDueMinor: amountMinor,
                    hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
                } as Prisma.JsonObject,
            },
        });
    }

    await prisma.integration.updateMany({
        where: {
            workspaceId,
            provider: "stripe",
        },
        data: {
            lastSyncError: null,
            lastSyncedAt: new Date(),
        },
    });
}

export async function POST(req: Request) {
    try {
        const stripe = getStripeClient();
        const webhookSecret = getWebhookSecret();

        const rawBody = await req.text();
        const signature = req.headers.get("stripe-signature");

        if (!signature) {
            return NextResponse.json(
                { error: "Missing Stripe signature" },
                { status: 400 }
            );
        }

        const event = stripe.webhooks.constructEvent(
            rawBody,
            signature,
            webhookSecret
        );

        const stripeAccountId =
            event.account ||
            (typeof event.data.object === "object" &&
                event.data.object &&
                "account" in event.data.object
                ? String((event.data.object as { account?: string }).account ?? "")
                : "");

        if (!stripeAccountId) {
            return NextResponse.json({ received: true });
        }

        const workspace = await getWorkspaceByStripeAccountId(stripeAccountId);

        if (!workspace) {
            return NextResponse.json({ received: true });
        }

        await prisma.stripeEvent.upsert({
            where: {
                id: event.id,
            },
            update: {},
            create: {
                id: event.id,
                workspaceId: workspace.id,
                type: event.type,
                payload: JSON.parse(rawBody) as Prisma.JsonObject,
            },
        });

        switch (event.type) {
            case "customer.created":
            case "customer.updated": {
                const customer = event.data.object as Stripe.Customer;

                if (!customer.deleted) {
                    await upsertStripeCustomer({
                        workspaceId: workspace.id,
                        customer,
                    });
                }
                break;
            }

            case "customer.subscription.created":
            case "customer.subscription.updated":
            case "customer.subscription.deleted": {
                const subscription = event.data.object as Stripe.Subscription;

                const stripeCustomerId =
                    typeof subscription.customer === "string"
                        ? subscription.customer
                        : subscription.customer?.id;

                if (stripeCustomerId) {
                    const fullCustomer = await stripe.customers.retrieve(
                        stripeCustomerId,
                        {},
                        {
                            stripeAccount: stripeAccountId,
                        }
                    );

                    if (!("deleted" in fullCustomer) || !fullCustomer.deleted) {
                        await upsertStripeCustomer({
                            workspaceId: workspace.id,
                            customer: fullCustomer as Stripe.Customer,
                        });
                    }
                }

                const fullSubscription = await stripe.subscriptions.retrieve(
                    subscription.id,
                    {
                        expand: ["items.data.price"],
                    },
                    {
                        stripeAccount: stripeAccountId,
                    }
                );

                await upsertStripeSubscription({
                    workspaceId: workspace.id,
                    subscription: fullSubscription,
                });

                break;
            }

            case "invoice.payment_failed": {
                const invoice = event.data.object as Stripe.Invoice;

                await markInvoiceFailure({
                    workspaceId: workspace.id,
                    invoice,
                });
                break;
            }

            case "invoice.paid":
            case "invoice.finalized":
            case "customer.deleted":
            default:
                break;
        }

        await prisma.workspace.update({
            where: {
                id: workspace.id,
            },
            data: {
                stripeLastSyncedAt: new Date(),
            },
        });

        await prisma.integration.upsert({
            where: {
                workspaceId_provider: {
                    workspaceId: workspace.id,
                    provider: "stripe",
                },
            },
            update: {
                status: "connected",
                externalAccountId: stripeAccountId,
                lastSyncError: null,
                lastSyncedAt: new Date(),
                disconnectedAt: null,
            },
            create: {
                workspaceId: workspace.id,
                provider: "stripe",
                status: "connected",
                externalAccountId: stripeAccountId,
                lastSyncedAt: new Date(),
            },
        });

        return NextResponse.json({ received: true });
    } catch (error) {
        console.error("[Stripe Webhook] failed:", error);

        return NextResponse.json(
            { error: "Webhook handler failed" },
            { status: 400 }
        );
    }
}