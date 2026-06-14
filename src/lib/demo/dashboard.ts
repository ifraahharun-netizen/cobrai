import { getDemoCustomers } from "./customers";

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

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function getAccountName(customer: any, fallback: string) {
    return customer?.name ?? customer?.account ?? fallback;
}

function realisticMrrProtectedTrend(length: number) {
    let value = 620;

    return Array.from({ length }, (_, index) => {
        const progress = length <= 1 ? 1 : index / (length - 1);

        const trendLift = 28 + progress * 34;
        const weekdayPush = [16, -10, 22, 8, 36, -18, 12][index % 7];
        const campaignSpike =
            index === Math.floor(length * 0.45) ||
                index === Math.floor(length * 0.72)
                ? 140
                : 0;

        const dip =
            index === Math.floor(length * 0.35) ||
                index === Math.floor(length * 0.62)
                ? -95
                : 0;

        const wave = Math.sin(index * 0.85) * 42;

        value = value + trendLift + weekdayPush + wave * 0.32 + campaignSpike + dip;

        return Math.round(clamp(value, 520, 2200));
    });
}

function realisticCurrentMonthChurn(length: number) {
    let value = 4.8;

    return Array.from({ length }, (_, index) => {
        const progress = length <= 1 ? 1 : index / (length - 1);

        const downwardPressure = 0.055 + progress * 0.025;
        const weeklyNoise = [0.12, -0.08, 0.16, -0.04, -0.14, 0.09, -0.06][index % 7];
        const saveImpact =
            index === Math.floor(length * 0.42) ||
                index === Math.floor(length * 0.7)
                ? -0.34
                : 0;

        const smallSpike =
            index === Math.floor(length * 0.28) ||
                index === Math.floor(length * 0.58)
                ? 0.26
                : 0;

        value = value - downwardPressure + weeklyNoise + saveImpact + smallSpike;

        return Number(clamp(value, 2.4, 5.2).toFixed(1));
    });
}

function realisticSixMonthMrr() {
    return [690, 1040, 930, 1460, 1320, 1856];
}

function realisticSixMonthChurn() {
    return [4.6, 4.9, 4.2, 4.4, 3.6, 2.8];
}

export function getDemoDashboardData(userLocale: string) {
    const customers = getDemoCustomers();
    const months = monthLabels(userLocale, 6);
    const currentMonthDays = currentMonthDayLabels(userLocale);

    const currentMonthMrrProtectedValues = realisticMrrProtectedTrend(
        currentMonthDays.length
    );

    const currentMonthChurnPct = realisticCurrentMonthChurn(
        currentMonthDays.length
    );

    const totalMrrSeries = [75100, 76800, 78200, 79400, 81250, 80700];

    const mrrAtRiskSeries = [7800, 7200, 6900, 6400, 6150, 5700];

    const churnPct = realisticSixMonthChurn();

    const mrrProtectedValues = realisticSixMonthMrr();

    const activeUsersValues = [
        128, 136, 129, 144, 139, 157, 151, 166, 159, 172,
        164, 181, 169, 156, 162, 149, 158, 147, 171, 183,
        176, 194, 188, 173, 181, 169, 178, 186, 179, 191,
    ];

    const riskAccounts = [
        {
            id: "demo-kite-labs",
            company: "Kite Labs",
            email: "finance@kitelabs.io",
            reason: "Renewal window approaching with lower engagement signals.",
            risk: 87,
            mrr: 1850,
            tags: ["renewal", "usage"],
            updatedAt: demoIsoDate(1),
        },
        {
            id: "demo-cedarworks",
            company: "CedarWorks",
            email: "success@cedarworks.io",
            reason: "Product usage dropped during the last 14 days.",
            risk: 82,
            mrr: 1460,
            tags: ["usage"],
            updatedAt: demoIsoDate(2),
        },
        {
            id: "demo-novapay",
            company: "NovaPay",
            email: "ops@novapay.io",
            reason: "Health score is declining before the next billing cycle.",
            risk: 76,
            mrr: 1320,
            tags: ["health", "billing"],
            updatedAt: demoIsoDate(3),
        },
        {
            id: "demo-peak-ops",
            company: "Peak Ops",
            email: "billing@peakops.io",
            reason: "Payment retry needed after a failed invoice.",
            risk: 69,
            mrr: 1070,
            tags: ["billing"],
            updatedAt: demoIsoDate(4),
        },
    ];

    const opportunities = [
        {
            id: "demo-brightops",
            company: "BrightOps",
            email: "team@brightops.io",
            signal: "Usage increased this month. Recommend annual upgrade outreach.",
            upside: 1650,
            updatedAt: demoIsoDate(2),
        },
    ];

    const savedAccount = riskAccounts[0];
    const retainedAccount = riskAccounts[1];
    const pendingAccount = riskAccounts[2];

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
                mrrProtectedMinor: latest(mrrProtectedValues) * 100,
                accountsSaved: 3,
                actionsExecuted: 6,
                successRate: 67,
                mrrProtectedPct: Math.abs(
                    percentChange(latest(mrrProtectedValues), previous(mrrProtectedValues))
                ),
                accountsSavedPct: 18,
                actionsExecutedPct: 12,
                successRatePct: 7,
            },
            recentMrrSaved: [
                {
                    id: "demo-saved-kite-labs",
                    account: savedAccount.company,
                    mrrSavedMinor: 92000,
                    date: demoIsoDate(1),
                },
                {
                    id: "demo-saved-cedarworks",
                    account: retainedAccount.company,
                    mrrSavedMinor: 61000,
                    date: demoIsoDate(2),
                },
            ],
            nextPriorityAccounts: riskAccounts.slice(0, 3).map((account) => ({
                id: account.id,
                account: getAccountName(account, "At-risk account"),
                aiReason: account.reason,
                aiAction: "Send a personalised retention check-in this week.",
                mrrMinor: account.mrr * 100,
                riskScore: account.risk,
            })),
            progressBreakdown: [
                {
                    id: "demo-progress-kite-labs",
                    accountId: savedAccount.id,
                    customerId: savedAccount.id,
                    account: savedAccount.company,
                    action: "Renewal protection email",
                    aiReason: "At-risk revenue was protected after a targeted retention action.",
                    outcome: "success" as const,
                    mrrSavedMinor: 92000,
                    riskScore: 63,
                    date: demoIsoDate(1),
                    kind: "email" as const,
                },
                {
                    id: "demo-progress-cedarworks",
                    accountId: retainedAccount.id,
                    customerId: retainedAccount.id,
                    account: retainedAccount.company,
                    action: "Usage recovery check-in",
                    aiReason: "Engagement recovered after a personalised success message.",
                    outcome: "success" as const,
                    mrrSavedMinor: 61000,
                    riskScore: 58,
                    date: demoIsoDate(2),
                    kind: "email" as const,
                },
                {
                    id: "demo-progress-novapay",
                    accountId: pendingAccount.id,
                    customerId: pendingAccount.id,
                    account: pendingAccount.company,
                    action: "Billing risk follow-up",
                    aiReason: "Health score is still declining and needs owner attention.",
                    outcome: "pending" as const,
                    mrrSavedMinor: 0,
                    riskScore: pendingAccount.risk,
                    date: demoIsoDate(3),
                    kind: "retry_payment" as const,
                },
            ],
            actionPerformance: [],
        },
    };
}