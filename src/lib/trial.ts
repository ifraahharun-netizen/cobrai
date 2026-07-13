import { prisma } from "@/lib/prisma";

export const TRIAL_LENGTH_DAYS = 14;

export type TrialImpact = {
    accountsMonitored: number;
    highRiskAccounts: number;
    aiActionsGenerated: number;
    customersRetained: number;
    revenueProtectedMinor: number;
    paymentsRecovered: number;
};

export type WorkspaceTrialState = {
    workspaceId: string;
    tier: string;
    trialStartedAt: string | null;
    trialEndsAt: string | null;
    trialExpired: boolean;
    trialActive: boolean;
    hasActiveSubscription: boolean;
    daysRemaining: number;
    impact: TrialImpact;
    summary: string;
};

const ACTIVE_SUBSCRIPTION_STATUSES = new Set([
    "active",
    "trialing",
    "past_due",
]);

function addDays(date: Date, days: number) {
    const result = new Date(date);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
}

function clampCurrencyMinor(value: number | null | undefined) {
    if (!Number.isFinite(value ?? 0)) return 0;
    return Math.max(0, Math.round(value ?? 0));
}

function makeFallbackSummary(impact: TrialImpact, currency = "GBP") {
    const revenue = new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
    }).format(impact.revenueProtectedMinor / 100);

    return [
        `During your 14-day Pro trial, Cobrai monitored ${impact.accountsMonitored.toLocaleString("en-GB")} customer accounts`,
        `identified ${impact.highRiskAccounts.toLocaleString("en-GB")} high-risk accounts`,
        `and generated ${impact.aiActionsGenerated.toLocaleString("en-GB")} retention actions.`,
        impact.revenueProtectedMinor > 0
            ? `Recorded outcomes indicate approximately ${revenue} in protected recurring revenue.`
            : "Cobrai is ready to keep monitoring new risk signals and revenue opportunities.",
    ].join(" ");
}

export async function getOrStartWorkspaceTrial(
    workspaceId: string
): Promise<WorkspaceTrialState> {
    const now = new Date();

    let workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: {
            id: true,
            tier: true,
            currency: true,
            trialStartedAt: true,
            trialEndsAt: true,
            trialUsed: true,
            stripeSubscriptions: {
                orderBy: { updatedAt: "desc" },
                take: 5,
                select: {
                    status: true,
                    currentPeriodEnd: true,
                    endedAt: true,
                },
            },
        },
    });

    if (!workspace) {
        throw new Error("Workspace not found.");
    }

    const hasActiveSubscription = workspace.stripeSubscriptions.some(
        (subscription) =>
            ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status) &&
            (!subscription.endedAt || subscription.endedAt > now) &&
            (!subscription.currentPeriodEnd ||
                subscription.currentPeriodEnd > now)
    );

    if (
        !hasActiveSubscription &&
        !workspace.trialUsed &&
        !workspace.trialStartedAt &&
        !workspace.trialEndsAt
    ) {
        const trialStartedAt = now;
        const trialEndsAt = addDays(trialStartedAt, TRIAL_LENGTH_DAYS);

        workspace = await prisma.workspace.update({
            where: { id: workspace.id },
            data: {
                tier: "pro",
                trialStartedAt,
                trialEndsAt,
                trialUsed: true,
            },
            select: {
                id: true,
                tier: true,
                currency: true,
                trialStartedAt: true,
                trialEndsAt: true,
                trialUsed: true,
                stripeSubscriptions: {
                    orderBy: { updatedAt: "desc" },
                    take: 5,
                    select: {
                        status: true,
                        currentPeriodEnd: true,
                        endedAt: true,
                    },
                },
            },
        });
    }

    const trialStartedAt = workspace.trialStartedAt;
    const trialEndsAt = workspace.trialEndsAt;
    const trialActive =
        !hasActiveSubscription &&
        Boolean(trialEndsAt && trialEndsAt.getTime() > now.getTime());
    const trialExpired =
        !hasActiveSubscription &&
        Boolean(trialEndsAt && trialEndsAt.getTime() <= now.getTime());

    const daysRemaining =
        trialActive && trialEndsAt
            ? Math.max(
                1,
                Math.ceil(
                    (trialEndsAt.getTime() - now.getTime()) /
                    (24 * 60 * 60 * 1000)
                )
            )
            : 0;

    const rangeStart =
        trialStartedAt ??
        (trialEndsAt
            ? addDays(trialEndsAt, -TRIAL_LENGTH_DAYS)
            : addDays(now, -TRIAL_LENGTH_DAYS));

    const [
        accountsMonitored,
        highRiskAccounts,
        aiActionsGenerated,
        retainedOutcomes,
        paymentsRecovered,
        latestNarrative,
    ] = await Promise.all([
        prisma.customer.count({
            where: {
                workspaceId,
                createdAt: { lte: now },
            },
        }),
        prisma.accountRisk.count({
            where: {
                workspaceId,
                riskScore: { gte: 60 },
                createdAt: { gte: rangeStart, lte: now },
            },
        }),
        prisma.actionExecution.count({
            where: {
                workspaceId,
                createdAt: { gte: rangeStart, lte: now },
            },
        }),
        prisma.actionOutcomeSnapshot.aggregate({
            where: {
                workspaceId,
                createdAt: { gte: rangeStart, lte: now },
                retainedRevenueMinor: { gt: 0 },
            },
            _count: { id: true },
            _sum: { retainedRevenueMinor: true },
        }),
        prisma.actionOutcomeSnapshot.count({
            where: {
                workspaceId,
                createdAt: { gte: rangeStart, lte: now },
                paymentRecovered: true,
            },
        }),
        prisma.aiWorkspaceNarrative.findFirst({
            where: {
                workspaceId,
                createdAt: { gte: rangeStart, lte: now },
            },
            orderBy: { createdAt: "desc" },
            select: {
                narrative: true,
            },
        }),
    ]);

    const impact: TrialImpact = {
        accountsMonitored,
        highRiskAccounts,
        aiActionsGenerated,
        customersRetained: retainedOutcomes._count.id,
        revenueProtectedMinor: clampCurrencyMinor(
            retainedOutcomes._sum.retainedRevenueMinor
        ),
        paymentsRecovered,
    };

    return {
        workspaceId: workspace.id,
        tier: workspace.tier,
        trialStartedAt: trialStartedAt?.toISOString() ?? null,
        trialEndsAt: trialEndsAt?.toISOString() ?? null,
        trialExpired,
        trialActive,
        hasActiveSubscription,
        daysRemaining,
        impact,
        summary:
            latestNarrative?.narrative?.trim() ||
            makeFallbackSummary(impact, workspace.currency || "GBP"),
    };
}

