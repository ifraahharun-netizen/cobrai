import { NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type SyncBody = {
    uid?: string;
};

function getStripeClient() {
    const secretKey = process.env.STRIPE_SECRET_KEY;

    if (!secretKey) {
        throw new Error("Missing STRIPE_SECRET_KEY");
    }

    return new Stripe(secretKey);
}

async function getWorkspaceForUid(uid: string) {
    return prisma.workspace.findFirst({
        where: {
            user: {
                some: {
                    firebaseUid: uid,
                },
            },
        },
        select: {
            id: true,
            stripeAccountId: true,
            stripeConnectedAt: true,
        },
    });
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

export async function POST(req: Request) {
    try {
        const body = (await req.json()) as SyncBody;
        const uid = typeof body?.uid === "string" ? body.uid : null;

        if (!uid) {
            return NextResponse.json({ error: "Missing uid" }, { status: 400 });
        }

        const workspace = await getWorkspaceForUid(uid);

        if (!workspace) {
            return NextResponse.json(
                { error: "Workspace not found" },
                { status: 404 }
            );
        }

        if (!workspace.stripeAccountId) {
            return NextResponse.json(
                { error: "Stripe is not connected for this workspace" },
                { status: 400 }
            );
        }

        const stripe = getStripeClient();
        const stripeAccount = workspace.stripeAccountId;

        const allCustomers: Stripe.Customer[] = [];
        let customerStartingAfter: string | undefined = undefined;

        while (true) {
            const page = await stripe.customers.list(
                {
                    limit: 100,
                    starting_after: customerStartingAfter,
                },
                {
                    stripeAccount,
                }
            );

            for (const customer of page.data) {
                if (!customer.deleted) {
                    allCustomers.push(customer);
                }
            }

            if (!page.has_more || page.data.length === 0) break;
            customerStartingAfter = page.data[page.data.length - 1]?.id;
        }

        for (const customer of allCustomers) {
            await prisma.stripeCustomer.upsert({
                where: {
                    stripeId: customer.id,
                },
                update: {
                    workspaceId: workspace.id,
                    email: customer.email ?? null,
                    name: customer.name ?? null,
                },
                create: {
                    workspaceId: workspace.id,
                    stripeId: customer.id,
                    email: customer.email ?? null,
                    name: customer.name ?? null,
                },
            });
        }

        const allSubscriptions: Stripe.Subscription[] = [];
        let subscriptionStartingAfter: string | undefined = undefined;

        while (true) {
            const page = await stripe.subscriptions.list(
                {
                    status: "all",
                    limit: 100,
                    starting_after: subscriptionStartingAfter,
                    expand: ["data.items.data.price"],
                },
                {
                    stripeAccount,
                }
            );

            allSubscriptions.push(...page.data);

            if (!page.has_more || page.data.length === 0) break;
            subscriptionStartingAfter = page.data[page.data.length - 1]?.id;
        }

        for (const subscription of allSubscriptions) {
            const customerId =
                typeof subscription.customer === "string"
                    ? subscription.customer
                    : subscription.customer?.id;

            if (!customerId) continue;

            const { currentPeriodStart, currentPeriodEnd } =
                getSubscriptionPeriod(subscription);

            await prisma.stripeSubscription.upsert({
                where: {
                    stripeId: subscription.id,
                },
                update: {
                    workspaceId: workspace.id,
                    stripeCustomerId: customerId,
                    status: subscription.status,
                    currency: subscription.currency ?? null,
                    currentPeriodStart,
                    currentPeriodEnd,
                    cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
                    canceledAt: unixToDate(subscription.canceled_at),
                    endedAt: unixToDate(subscription.ended_at),
                },
                create: {
                    workspaceId: workspace.id,
                    stripeId: subscription.id,
                    stripeCustomerId: customerId,
                    status: subscription.status,
                    currency: subscription.currency ?? null,
                    currentPeriodStart,
                    currentPeriodEnd,
                    cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
                    canceledAt: unixToDate(subscription.canceled_at),
                    endedAt: unixToDate(subscription.ended_at),
                },
            });
        }

        const month = getMonthKey();
        const mrrByCustomer = new Map<string, number>();

        for (const subscription of allSubscriptions) {
            const customerId =
                typeof subscription.customer === "string"
                    ? subscription.customer
                    : subscription.customer?.id;

            if (!customerId) continue;

            const amountMinor = getMonthlyAmountMinorFromSubscription(subscription);
            if (amountMinor <= 0) continue;

            const prev = mrrByCustomer.get(customerId) ?? 0;
            mrrByCustomer.set(customerId, prev + amountMinor);
        }

        for (const [stripeCustomerId, mrrMinor] of mrrByCustomer.entries()) {
            await prisma.mrrSnapshot.upsert({
                where: {
                    workspaceId_stripeCustomerId_month: {
                        workspaceId: workspace.id,
                        stripeCustomerId,
                        month,
                    },
                },
                update: {
                    mrrMinor,
                    active: mrrMinor > 0,
                },
                create: {
                    workspaceId: workspace.id,
                    stripeCustomerId,
                    month,
                    mrrMinor,
                    active: mrrMinor > 0,
                    firstSeenMonth: month,
                },
            });
        }

        const syncedCustomerIds = new Set(allCustomers.map((c) => c.id));

        for (const stripeCustomerId of syncedCustomerIds) {
            if (mrrByCustomer.has(stripeCustomerId)) continue;

            await prisma.mrrSnapshot.upsert({
                where: {
                    workspaceId_stripeCustomerId_month: {
                        workspaceId: workspace.id,
                        stripeCustomerId,
                        month,
                    },
                },
                update: {
                    mrrMinor: 0,
                    active: false,
                },
                create: {
                    workspaceId: workspace.id,
                    stripeCustomerId,
                    month,
                    mrrMinor: 0,
                    active: false,
                    firstSeenMonth: month,
                },
            });
        }

        await prisma.integration.upsert({
            where: {
                workspaceId_provider: {
                    workspaceId: workspace.id,
                    provider: "stripe",
                },
            },
            update: {
                status: "connected",
                externalAccountId: stripeAccount,
                connectedAt: workspace.stripeConnectedAt ?? new Date(),
                disconnectedAt: null,
                lastSyncError: null,
                lastSyncedAt: new Date(),
            },
            create: {
                workspaceId: workspace.id,
                provider: "stripe",
                status: "connected",
                externalAccountId: stripeAccount,
                connectedAt: workspace.stripeConnectedAt ?? new Date(),
                lastSyncedAt: new Date(),
            },
        });

        await prisma.workspace.update({
            where: {
                id: workspace.id,
            },
            data: {
                stripeLastSyncedAt: new Date(),
            },
        });

        const totalMrrMinor = Array.from(mrrByCustomer.values()).reduce(
            (sum, value) => sum + value,
            0
        );

        return NextResponse.json({
            ok: true,
            workspaceId: workspace.id,
            stripeAccountId: stripeAccount,
            synced: {
                customers: allCustomers.length,
                subscriptions: allSubscriptions.length,
                mrrSnapshots: syncedCustomerIds.size,
                month,
                totalMrrMinor,
            },
        });
    } catch (error) {
        console.error("[Stripe Sync] failed:", error);

        return NextResponse.json(
            { error: "Failed to sync Stripe data" },
            { status: 500 }
        );
    }
}