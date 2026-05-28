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

function getAccountName(customer: any, fallback: string) {
    return customer?.name ?? customer?.account ?? fallback;
}

export function getDemoDashboardData(userLocale: string) {
    const customers = getDemoCustomers();
    const months = monthLabels(userLocale, 10);

    const totalMrrSeries = [
        68200,
        70100,
        72400,
        73900,
        75100,
        76800,
        78200,
        79400,
        81250,
        80700,
    ];

    const mrrAtRiskSeries = [
        9800,
        9400,
        8900,
        8300,
        7800,
        7200,
        6900,
        6400,
        6150,
        5700,
    ];

    const churnPct = [
        5.1,
        4.7,
        4.9,
        4.2,
        3.9,
        3.7,
        3.2,
        3.1,
        3.4,
        2.6,
    ];

    const mrrProtectedValues = [
        210,
        430,
        390,
        710,
        880,
        1160,
        1090,
        1490,
        1695,
        1856,
    ];

    const activeUsersValues = [
        142,
        139,
        144,
        147,
        143,
        148,
        151,
        146,
        149,
        152,
        148,
        151,
        153,
        150,
        154,
        157,
        153,
        158,
        160,
        156,
        161,
        163,
        159,
        164,
        166,
        162,
        167,
        169,
        165,
        170,
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