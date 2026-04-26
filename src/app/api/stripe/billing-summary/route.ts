import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/stripe";
import { requireAuthenticatedUser } from "@/lib/apiAuth";

export async function GET(req: Request) {
    try {
        const authResult = await requireAuthenticatedUser(req);

        if (!authResult.ok) {
            return authResult.response;
        }

        const { user } = authResult;

        if (!user.workspaceId) {
            return NextResponse.json({
                workspaceId: null,
                plan: "free",
                billingStatus: null,
                renewalDate: null,
                trialEndsAt: null,
                stripeCustomerId: null,
                stripeSubscriptionId: null,
                hasBilling: false,
            });
        }

        const workspace = await prisma.workspace.findUnique({
            where: { id: user.workspaceId },
            select: {
                id: true,
                tier: true,
                trialEndsAt: true,
                stripeCustomers: {
                    orderBy: { createdAt: "desc" },
                    take: 1,
                    select: {
                        stripeId: true,
                    },
                },
                stripeSubscriptions: {
                    orderBy: { createdAt: "desc" },
                    take: 1,
                    select: {
                        stripeId: true,
                        status: true,
                        currentPeriodEnd: true,
                    },
                },
            },
        });

        if (!workspace) {
            return NextResponse.json({
                workspaceId: null,
                plan: "free",
                billingStatus: null,
                renewalDate: null,
                trialEndsAt: null,
                stripeCustomerId: null,
                stripeSubscriptionId: null,
                hasBilling: false,
            });
        }

        const latestCustomer = workspace.stripeCustomers[0] ?? null;
        const latestSubscription = workspace.stripeSubscriptions[0] ?? null;

        const hasRealStripeCustomer = !!latestCustomer?.stripeId?.startsWith("cus_");
        const hasRealStripeSubscription = !!latestSubscription?.stripeId?.startsWith("sub_");

        let billingStatus: string | null = latestSubscription?.status ?? null;
        let renewalDate: string | null =
            latestSubscription?.currentPeriodEnd?.toISOString() ?? null;

        if (hasRealStripeSubscription && latestSubscription?.stripeId) {
            try {
                const stripe = getStripeClient();
                const subscription = await stripe.subscriptions.retrieve(
                    latestSubscription.stripeId,
                    {
                        expand: ["items.data"],
                    }
                );

                billingStatus = subscription.status;

                const firstItem = subscription.items.data[0];
                renewalDate = firstItem?.current_period_end
                    ? new Date(firstItem.current_period_end * 1000).toISOString()
                    : renewalDate;
            } catch (error) {
                console.error("Stripe refresh failed:", error);
            }
        }

        return NextResponse.json({
            workspaceId: workspace.id,
            plan:
                workspace.tier === "pro"
                    ? "pro"
                    : workspace.tier === "starter"
                        ? "starter"
                        : "free",
            billingStatus,
            renewalDate,
            trialEndsAt: workspace.trialEndsAt?.toISOString() ?? null,
            stripeCustomerId: hasRealStripeCustomer ? latestCustomer?.stripeId ?? null : null,
            stripeSubscriptionId: hasRealStripeSubscription
                ? latestSubscription?.stripeId ?? null
                : null,
            hasBilling: hasRealStripeCustomer || hasRealStripeSubscription,
        });
    } catch (error) {
        console.error("Billing summary error:", error);
        return NextResponse.json(
            { error: "Failed to load billing summary" },
            { status: 500 }
        );
    }
}