import { prisma } from "@/lib/prisma";
import { isOwnerExempt, parseExemptEmails } from "@/lib/billing/access-rules";

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
    /** What's at stake in the business right now (live data, demo rows excluded). */
    atStake: TrialAtStake;
    currency: string;
    summary: string;
};

export type TrialAtStakeAccount = {
    name: string;
    reason: string;
    riskScore: number;
    mrrMinor: number;
    /** The step Cobrai would take next (shown blurred until they pay). */
    nextStep: string;
};

/** Suggested next step for an at-risk account, from its risk reason. */
export function nextStepForReason(reasonKey: string, reasonLabel: string): string {
    const text = `${reasonKey} ${reasonLabel}`.toLowerCase();
    if (/payment|billing|invoice|past_due|unpaid|card/.test(text)) return "Retry the payment and email the billing contact";
    if (/cancel/.test(text)) return "Reach out before the cancellation takes effect";
    if (/downgrad|contraction|seat/.test(text)) return "Offer a plan review call before they downgrade further";
    if (/inactiv|login|usage|engagement|adoption|quiet/.test(text)) return "Send a re-engagement email with a tailored tip";
    if (/upgrade|expansion|upsell/.test(text)) return "Suggest the plan that fits their growth";
    return "Book a personal check-in from your team";
}

export type TrialAtStake = {
    /** Recurring revenue Cobrai is tracking this month. */
    mrrTrackedMinor: number;
    /** Monthly revenue from accounts flagged at risk (score 60+). */
    atRiskMinor: number;
    atRiskAccounts: number;
    /** Failed invoices that haven't been paid yet. */
    failedPaymentsMinor: number;
    failedPayments: number;
    /** Biggest at-risk accounts, largest first. */
    topAccounts: TrialAtStakeAccount[];
};

function monthKeyUtc(date: Date) {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function loadAtStake(workspaceId: string, now: Date): Promise<TrialAtStake> {
    const riskWhere = { workspaceId, isDemo: false, riskScore: { gte: 60 } };
    const [mrr, riskAgg, topRisks, failed] = await Promise.all([
        prisma.mrrSnapshot.aggregate({
            where: { workspaceId, month: monthKeyUtc(now), active: true },
            _sum: { mrrMinor: true },
        }),
        prisma.accountRisk.aggregate({
            where: riskWhere,
            _count: { id: true },
            _sum: { mrr: true },
        }),
        prisma.accountRisk.findMany({
            where: riskWhere,
            orderBy: [{ mrr: "desc" }, { riskScore: "desc" }],
            take: 3,
            select: { companyName: true, reasonKey: true, reasonLabel: true, riskScore: true, mrr: true },
        }),
        prisma.invoice.aggregate({
            where: { workspaceId, isDemo: false, failedAt: { not: null }, paidAt: null, status: { notIn: ["paid", "void", "uncollectible"] } },
            _count: { id: true },
            _sum: { amount: true },
        }),
    ]);

    return {
        mrrTrackedMinor: clampCurrencyMinor(mrr._sum.mrrMinor),
        // AccountRisk.mrr is in major units.
        atRiskMinor: clampCurrencyMinor(Number(riskAgg._sum.mrr || 0) * 100),
        atRiskAccounts: riskAgg._count.id,
        failedPaymentsMinor: clampCurrencyMinor(failed._sum.amount),
        failedPayments: failed._count.id,
        topAccounts: topRisks.map((r) => ({
            name: r.companyName,
            reason: r.reasonLabel,
            riskScore: r.riskScore,
            mrrMinor: clampCurrencyMinor(Number(r.mrr || 0) * 100),
            nextStep: nextStepForReason(r.reasonKey, r.reasonLabel),
        })),
    };
}

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
            ownerEmail: true,
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
                ownerEmail: true,
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
    // Owners on BILLING_EXEMPT_EMAILS never see the lock (same rule as the API check).
    const accessExempt = isOwnerExempt(
        workspace.ownerEmail,
        parseExemptEmails(process.env.BILLING_EXEMPT_EMAILS)
    );
    const trialExpired =
        !accessExempt &&
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
        atStake,
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
        loadAtStake(workspaceId, now),
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
        atStake,
        currency: (workspace.currency || "GBP").toUpperCase(),
        summary:
            latestNarrative?.narrative?.trim() ||
            makeFallbackSummary(impact, workspace.currency || "GBP"),
    };
}

