import { NextResponse } from "next/server";
import Stripe from "stripe";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { subscriptionMrr } from "@/lib/stripe-connect/mrr";
import {
    customerIdForStripeCustomer,
    refreshConnectedCustomer,
    upsertInvoiceFromStripe,
    upsertStripeCustomerMirror,
} from "@/lib/stripe-connect/sync";

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

function customerIdOf(value: string | { id: string } | null | undefined) {
    if (!value) return null;
    return typeof value === "string" ? value : value.id;
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

/*
 * A cancellation that was scheduled and then withdrawn is revenue saved.
 * Recorded as an Event (value in MAJOR units) for the "Revenue saved" metric.
 */
async function recordCancellationReversal(args: {
    workspaceId: string;
    customerId: string;
    subscription: Stripe.Subscription;
    previous: Partial<Stripe.Subscription> | undefined;
}) {
    const { subscription, previous } = args;
    const wasScheduled =
        previous?.cancel_at_period_end === true ||
        (typeof previous?.cancel_at === "number" && previous.cancel_at > 0);
    const nowScheduled =
        subscription.cancel_at_period_end || !!subscription.cancel_at;

    if (!wasScheduled || nowScheduled) return;
    if (subscription.status !== "active" && subscription.status !== "past_due") return;

    const { mrrMinor } = subscriptionMrr(subscription);
    if (mrrMinor <= 0) return;

    await prisma.event.create({
        data: {
            workspaceId: args.workspaceId,
            customerId: args.customerId,
            type: "cancellation_reversed",
            value: mrrMinor / 100,
        },
    });
}

async function recordPaymentFailureAction(args: {
    workspaceId: string;
    customerId: string;
    stripeCustomerId: string;
    invoice: Stripe.Invoice;
}) {
    const { invoice } = args;
    const amountMinor =
        typeof invoice.amount_due === "number" ? invoice.amount_due : 0;

    await prisma.actionExecution.create({
        data: {
            workspaceId: args.workspaceId,
            customerId: args.customerId,
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
                stripeCustomerId: args.stripeCustomerId,
                amountDueMinor: amountMinor,
                hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
            } as Prisma.JsonObject,
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

        // Stripe retries deliveries; one-off side effects (actions, saved
        // revenue events) only run on the first delivery. Recomputed state is
        // idempotent and always runs.
        const alreadySeen = await prisma.stripeEvent.findUnique({
            where: { id: event.id },
            select: { id: true },
        });

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

        const base = {
            workspaceId: workspace.id,
            stripeAccount: stripeAccountId,
            stripe,
        };

        switch (event.type) {
            case "customer.created":
            case "customer.updated": {
                const customer = event.data.object as Stripe.Customer;

                if (!customer.deleted) {
                    await upsertStripeCustomerMirror(workspace.id, customer);
                }
                break;
            }

            case "customer.subscription.created":
            case "customer.subscription.updated":
            case "customer.subscription.deleted":
            case "customer.subscription.paused":
            case "customer.subscription.resumed": {
                const subscription = event.data.object as Stripe.Subscription;
                const stripeCustomerId = customerIdOf(subscription.customer);
                if (!stripeCustomerId) break;

                // Recompute the customer from ALL their subscriptions, never
                // from this one alone.
                const refreshed = await refreshConnectedCustomer({
                    ...base,
                    stripeCustomerId,
                });

                if (
                    refreshed &&
                    !alreadySeen &&
                    event.type === "customer.subscription.updated"
                ) {
                    await recordCancellationReversal({
                        workspaceId: workspace.id,
                        customerId: refreshed.customerId,
                        subscription,
                        previous: event.data.previous_attributes as
                            | Partial<Stripe.Subscription>
                            | undefined,
                    });
                }

                break;
            }

            case "invoice.payment_failed":
            case "invoice.paid":
            case "invoice.marked_uncollectible": {
                const invoice = event.data.object as Stripe.Invoice;
                const stripeCustomerId = customerIdOf(
                    invoice.customer as string | { id: string } | null
                );
                if (!stripeCustomerId) break;

                const customerId = await customerIdForStripeCustomer({
                    ...base,
                    stripeCustomerId,
                });
                if (!customerId) break;

                await upsertInvoiceFromStripe({
                    workspaceId: workspace.id,
                    customerId,
                    invoice,
                    failedNow: event.type === "invoice.payment_failed",
                });

                if (event.type === "invoice.payment_failed" && !alreadySeen) {
                    await recordPaymentFailureAction({
                        workspaceId: workspace.id,
                        customerId,
                        stripeCustomerId,
                        invoice,
                    });
                }

                // Status (past_due/active) and risk follow the invoice.
                await refreshConnectedCustomer({ ...base, stripeCustomerId });
                break;
            }

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
