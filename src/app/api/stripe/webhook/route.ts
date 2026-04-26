// src/app/api/stripe/webhook/route.ts
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
    if (!isActiveSubscriptionStatus(status)) {
        return "free";
    }

    if (requestedTier === "pro") {
        return "pro";
    }

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

async function updateWorkspacePlan(workspaceId: string, tier: PlanTier) {
    await prisma.workspace.update({
        where: { id: workspaceId },
        data: {
            tier,
            demoMode: tier === "free",
        },
    });
}

export async function POST(req: NextRequest) {
    const stripe = getStripeClient();
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    if (!signature) {
        return new NextResponse("Missing stripe-signature header", { status: 400 });
    }

    if (!process.env.STRIPE_WEBHOOK_SECRET) {
        return new NextResponse("Missing STRIPE_WEBHOOK_SECRET", { status: 500 });
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

                if (stripeCustomerId) {
                    const customer = await stripe.customers.retrieve(stripeCustomerId);

                    if (!("deleted" in customer)) {
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
                    }
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
                        tierFromSubscription(subscription.status, subscription.metadata?.tier ?? requestedTier)
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

                const workspaceId = subscription.metadata?.workspaceId;
                const stripeCustomerId = getStripeCustomerId(subscription.customer);

                if (!workspaceId) {
                    console.error("Missing workspaceId in subscription metadata");
                    break;
                }

                if (!stripeCustomerId) {
                    console.error("Missing stripe customer id on subscription");
                    break;
                }

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

            default:
                break;
        }

        return NextResponse.json({ received: true });
    } catch (error) {
        console.error("Stripe webhook handling error:", error);
        return new NextResponse("Webhook handler failed", { status: 500 });
    }
}