export type ProgressKind = "email" | "notification" | "retry_payment";

export type ProgressApiResponse = {
    mode: "demo" | "live";
    workspaceTier: string;
    connectedIntegrations: string[];
    kpis: {
        mrrProtectedMinor: number;
        accountsSaved: number;
        actionsExecuted: number;
        successRate: number;
        mrrProtectedPct: number;
        accountsSavedPct: number;
        actionsExecutedPct: number;
        successRatePct: number;
    };
    recentMrrSaved: {
        id: string;
        account: string;
        mrrSavedMinor: number;
    }[];
    nextPriorityAccounts: {
        id: string;
        account: string;
        aiReason: string;
        mrrMinor: number;
        riskScore: number;
    }[];
    progressBreakdown: {
        id: string;
        accountId?: string;
        customerId?: string;
        account: string;
        kind: ProgressKind;
        action: string;
        aiReason: string;
        outcome: "success" | "pending" | "failed";
        mrrSavedMinor: number;
        riskScore: number;
        date: string;
    }[];
    actionPerformance: {
        id: string;
        action: string;
        executions: number;
        mrrSavedMinor: number;
        avgRiskDecreasePct: number;
    }[];
};

export function getDemoProgress(): ProgressApiResponse {
    const now = Date.now();

    return {
        mode: "demo",
        workspaceTier: "starter",
        connectedIntegrations: [],
        kpis: {
            mrrProtectedMinor: 125000,
            accountsSaved: 8,
            actionsExecuted: 14,
            successRate: 57,
            mrrProtectedPct: 12,
            accountsSavedPct: 10,
            actionsExecutedPct: 8,
            successRatePct: 5,
        },

        recentMrrSaved: [
            {
                id: "acme-groups",
                account: "Acme Groups",
                mrrSavedMinor: 20000,
            },
            {
                id: "global-tech",
                account: "Global Tech",
                mrrSavedMinor: 15000,
            },
            {
                id: "clearpath-labs",
                account: "Clearpath Labs",
                mrrSavedMinor: 18000,
            },
        ],

        nextPriorityAccounts: [
            {
                id: "northstar-ai",
                account: "Northstar AI",
                aiReason: "Low engagement and declining weekly usage",
                mrrMinor: 12000,
                riskScore: 78,
            },
            {
                id: "peak-ops",
                account: "Peak Ops",
                aiReason: "Recent failed payment and no recovery yet",
                mrrMinor: 16000,
                riskScore: 84,
            },
            {
                id: "futura-health",
                account: "Futura Health",
                aiReason: "Renewal reminder ignored and support activity dropped",
                mrrMinor: 11000,
                riskScore: 73,
            },
        ],

        progressBreakdown: [
            {
                id: "acme-groups-progress-1",
                customerId: "acme-groups",
                accountId: "acme-groups-risk",
                account: "Acme Groups",
                kind: "email",
                action: "Billing recovery email",
                aiReason: "Payment failed",
                outcome: "success",
                mrrSavedMinor: 20000,
                riskScore: 65,
                date: new Date(now).toISOString(),
            },
            {
                id: "northstar-ai-progress-1",
                customerId: "northstar-ai",
                accountId: "northstar-ai-risk",
                account: "Northstar AI",
                kind: "email",
                action: "Re-engagement email",
                aiReason: "Low engagement",
                outcome: "pending",
                mrrSavedMinor: 12000,
                riskScore: 78,
                date: new Date(now - 1000 * 60 * 60 * 24).toISOString(),
            },
            {
                id: "peak-ops-progress-1",
                customerId: "peak-ops",
                accountId: "peak-ops-risk",
                account: "Peak Ops",
                kind: "retry_payment",
                action: "Retry payment scheduled",
                aiReason: "Card payment failed on renewal",
                outcome: "pending",
                mrrSavedMinor: 16000,
                riskScore: 84,
                date: new Date(now - 1000 * 60 * 60 * 36).toISOString(),
            },
            {
                id: "peak-ops-progress-2",
                customerId: "peak-ops",
                accountId: "peak-ops-risk",
                account: "Peak Ops",
                kind: "retry_payment",
                action: "Retry payment recovered",
                aiReason: "Second retry attempt succeeded",
                outcome: "success",
                mrrSavedMinor: 16000,
                riskScore: 52,
                date: new Date(now - 1000 * 60 * 60 * 72).toISOString(),
            },
            {
                id: "futura-health-progress-1",
                customerId: "futura-health",
                accountId: "futura-health-risk",
                account: "Futura Health",
                kind: "notification",
                action: "Renewal reminder notification",
                aiReason: "Renewal window approaching with weak engagement",
                outcome: "pending",
                mrrSavedMinor: 11000,
                riskScore: 73,
                date: new Date(now - 1000 * 60 * 60 * 48).toISOString(),
            },
            {
                id: "global-tech-progress-1",
                customerId: "global-tech",
                accountId: "global-tech-risk",
                account: "Global Tech",
                kind: "notification",
                action: "In-app usage alert",
                aiReason: "Usage dropped below healthy threshold",
                outcome: "success",
                mrrSavedMinor: 15000,
                riskScore: 58,
                date: new Date(now - 1000 * 60 * 60 * 96).toISOString(),
            },
            {
                id: "clearpath-labs-progress-1",
                customerId: "clearpath-labs",
                accountId: "clearpath-labs-risk",
                account: "Clearpath Labs",
                kind: "email",
                action: "Executive check-in email",
                aiReason: "Expansion slowed and support response time increased",
                outcome: "failed",
                mrrSavedMinor: 18000,
                riskScore: 81,
                date: new Date(now - 1000 * 60 * 60 * 120).toISOString(),
            },
            {
                id: "orbit-stack-progress-1",
                customerId: "orbit-stack",
                accountId: "orbit-stack-risk",
                account: "Orbit Stack",
                kind: "retry_payment",
                action: "Retry payment failed",
                aiReason: "Payment method expired",
                outcome: "failed",
                mrrSavedMinor: 9000,
                riskScore: 88,
                date: new Date(now - 1000 * 60 * 60 * 144).toISOString(),
            },
            {
                id: "lumen-ops-progress-1",
                customerId: "lumen-ops",
                accountId: "lumen-ops-risk",
                account: "Lumen Ops",
                kind: "notification",
                action: "Customer health alert",
                aiReason: "High-risk account crossed intervention threshold",
                outcome: "success",
                mrrSavedMinor: 14000,
                riskScore: 57,
                date: new Date(now - 1000 * 60 * 60 * 168).toISOString(),
            },
            {
                id: "nova-works-progress-1",
                customerId: "nova-works",
                accountId: "nova-works-risk",
                account: "Nova Works",
                kind: "email",
                action: "Check-in email",
                aiReason: "Recent inactivity and no login activity",
                outcome: "pending",
                mrrSavedMinor: 10000,
                riskScore: 75,
                date: new Date(now - 1000 * 60 * 60 * 192).toISOString(),
            },
            {
                id: "brightpath-progress-1",
                customerId: "brightpath",
                accountId: "brightpath-risk",
                account: "Brightpath",
                kind: "notification",
                action: "Billing warning notification",
                aiReason: "Upcoming invoice risk detected",
                outcome: "success",
                mrrSavedMinor: 13000,
                riskScore: 54,
                date: new Date(now - 1000 * 60 * 60 * 216).toISOString(),
            },
            {
                id: "echo-finance-progress-1",
                customerId: "echo-finance",
                accountId: "echo-finance-risk",
                account: "Echo Finance",
                kind: "retry_payment",
                action: "Retry payment scheduled",
                aiReason: "Initial collection failed",
                outcome: "pending",
                mrrSavedMinor: 17000,
                riskScore: 82,
                date: new Date(now - 1000 * 60 * 60 * 240).toISOString(),
            },
        ],

        actionPerformance: [
            {
                id: "perf-billing-recovery-email",
                action: "Billing recovery email",
                executions: 4,
                mrrSavedMinor: 50000,
                avgRiskDecreasePct: 22,
            },
            {
                id: "perf-reengagement-email",
                action: "Re-engagement email",
                executions: 5,
                mrrSavedMinor: 32000,
                avgRiskDecreasePct: 18,
            },
            {
                id: "perf-renewal-notification",
                action: "Renewal reminder notification",
                executions: 3,
                mrrSavedMinor: 21000,
                avgRiskDecreasePct: 14,
            },
            {
                id: "perf-retry-payment",
                action: "Retry payment workflow",
                executions: 2,
                mrrSavedMinor: 25000,
                avgRiskDecreasePct: 27,
            },
        ],
    };
}