import { getDemoStory } from "./story";

function latest(values: number[]) {
    return values[values.length - 1] ?? 0;
}

function previous(values: number[]) {
    return values[values.length - 2] ?? 0;
}

function percentChange(current: number, prev: number) {
    if (!prev) return 0;
    return ((current - prev) / prev) * 100;
}

function demoIsoDate(daysAgo: number) {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return date.toISOString();
}

function monthLabels(userLocale: string, count = 10) {
    return Array.from({ length: count }, (_, i) => {
        const date = new Date();
        date.setDate(1);
        date.setMonth(date.getMonth() - (count - 1 - i));

        return date.toLocaleString(userLocale, { month: "short" });
    });
}

function currentMonthDayLabels(userLocale: string) {
    const now = new Date();
    const dayCount = now.getDate();

    return Array.from({ length: dayCount }, (_, index) => {
        const date = new Date(now.getFullYear(), now.getMonth(), index + 1);

        return date.toLocaleDateString(userLocale, {
            day: "numeric",
            month: "short",
        });
    });
}



/**
 * Daily points for the current month that move from last month's value to
 * this month's, with a little day-to-day noise, and end exactly on `to`.
 */
function dailyPath(length: number, from: number, to: number, noise: number, decimals: number) {
    return Array.from({ length }, (_, index) => {
        if (index === length - 1) return to;
        const progress = length <= 1 ? 1 : (index + 1) / length;
        const wobble =
            (Math.sin(index * 1.37) * 0.6 + [0.3, -0.2, 0.4, -0.1, -0.3, 0.2, -0.15][index % 7]) * noise;
        const value = from + (to - from) * progress + wobble;
        return Number(value.toFixed(decimals));
    });
}

export function getDemoDashboardData(userLocale: string) {
    const story = getDemoStory();
    const months = monthLabels(userLocale, 6);
    const currentMonthDays = currentMonthDayLabels(userLocale);

    // Daily views of this month: MRR (the Total MRR chart) and churn.
    const currentMonthMrrProtectedValues = dailyPath(
        currentMonthDays.length,
        story.totalMrr.previous,
        story.totalMrr.current,
        18,
        0
    );
    const currentMonthChurnPct = dailyPath(
        currentMonthDays.length,
        story.churnPct.previous,
        story.churnPct.current,
        0.12,
        1
    );

    const totalMrrSeries = story.series.mrr.slice(-6).map((p) => Number(p.valueMinor) / 100);
    const mrrAtRiskSeries = story.mrrAtRisk.sixMonths;
    const churnPct = story.churnSixMonths;
    const mrrProtectedValues = story.revenueSaved.sixMonths;

    const activeUsersValues = [
        128, 136, 129, 144, 139, 157, 151, 166, 159, 172,
        164, 181, 169, 156, 162, 149, 158, 147, 171, 183,
        176, 194, 188, 173, 181, 169, 178, 186, 179, 191,
    ];

    // Ids match getDemoCustomers(), so every row opens its account page.
    const riskAccounts = story.atRisk.map((account, index) => ({
        id: account.id,
        company: account.name,
        email: account.email ?? "",
        reason: account.signal.reason,
        risk: account.risk,
        mrr: account.mrrMajor,
        tags: account.signal.tags,
        updatedAt: demoIsoDate(index + 1),
    }));

    const opportunities = story.opportunities.map(({ account, upside }, index) => ({
        id: account.id,
        company: account.name,
        email: account.email ?? "",
        signal: `${account.signal.reason} ${account.signal.nextAction}`,
        upside,
        updatedAt: demoIsoDate(index + 2),
    }));

    const savedRows = story.saved.map((account, index) => ({
        account,
        minor: Number(account.signal.savedThisMonthMinor || 0),
        date: demoIsoDate(index * 4 + 3),
    }));

    const pendingRows = story.critical.map((account, index) => ({
        account,
        date: demoIsoDate(index + 1),
    }));

    const actionsExecuted = savedRows.length + pendingRows.length;

    return {
        churnMonths: months,
        churnPct,

        mrrProtectedMonths: months,
        mrrProtectedValues,

        currentMonthDays,
        currentMonthMrrProtectedValues,
        currentMonthChurnPct,

        activeUsersValues,

        riskAccounts,
        opportunities,

        /** Headline numbers shared with the summary API and Claude (MAJOR units). */
        story: {
            subscribers: story.subscribers.current,
            subscribersPrevious: story.subscribers.previous,
            atRiskAccounts: story.atRisk.length,
            criticalAccounts: story.critical.length,
            failedPaymentsTotal: story.failedPaymentsTotal,
            weightedRisk: story.weightedRisk,
        },

        kpis: {
            totalMrrCurrent: latest(totalMrrSeries),
            totalMrrPrevious: previous(totalMrrSeries),

            mrrAtRiskCurrent: latest(mrrAtRiskSeries),
            mrrAtRiskPrevious: previous(mrrAtRiskSeries),

            churnProxyCurrent: latest(churnPct),
            churnProxyPrevious: previous(churnPct),

            mrrProtectedCurrent: latest(mrrProtectedValues),
            mrrProtectedPrevious: previous(mrrProtectedValues),
        },

        progressData: {
            mode: "demo" as const,
            workspaceTier: "pro",
            connectedIntegrations: [],
            kpis: {
                mrrProtectedMinor: Math.round(latest(mrrProtectedValues) * 100),
                accountsSaved: savedRows.length,
                actionsExecuted,
                successRate: Math.round((savedRows.length / actionsExecuted) * 100),
                mrrProtectedPct: Math.abs(
                    percentChange(latest(mrrProtectedValues), previous(mrrProtectedValues))
                ),
                accountsSavedPct: 0,
                actionsExecutedPct: 0,
                successRatePct: 0,
            },
            recentMrrSaved: savedRows.map(({ account, minor, date }) => ({
                id: `demo-saved-${account.id}`,
                account: account.name,
                mrrSavedMinor: minor,
                date,
            })),
            nextPriorityAccounts: riskAccounts.slice(0, 3).map((account) => ({
                id: account.id,
                account: account.company,
                aiReason: account.reason,
                aiAction: story.accounts.find((a) => a.id === account.id)?.signal.nextAction
                    ?? "Send a personalised retention check-in this week.",
                mrrMinor: Math.round(account.mrr * 100),
                riskScore: account.risk,
            })),
            progressBreakdown: [
                ...savedRows.map(({ account, minor, date }) => ({
                    id: `demo-progress-${account.id}`,
                    accountId: account.id,
                    customerId: account.id,
                    account: account.name,
                    action: account.signal.savedBy ?? "Retention check-in",
                    aiReason: account.signal.reason,
                    outcome: "success" as const,
                    mrrSavedMinor: minor,
                    riskScore: account.risk,
                    date,
                    kind: account.signal.savedBy?.toLowerCase().includes("payment")
                        ? ("retry_payment" as const)
                        : ("email" as const),
                })),
                ...pendingRows.map(({ account, date }) => ({
                    id: `demo-progress-${account.id}`,
                    accountId: account.id,
                    customerId: account.id,
                    account: account.name,
                    action: "Billing recovery email",
                    aiReason: account.signal.reason,
                    outcome: "pending" as const,
                    mrrSavedMinor: 0,
                    riskScore: account.risk,
                    date,
                    kind: "email" as const,
                })),
            ],
            actionPerformance: [],
        },
    };
}
