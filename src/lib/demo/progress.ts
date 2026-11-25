import { getDemoDashboardData } from "./dashboard";

export type ProgressKind = "email" | "retry_payment";

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

/**
 * Progress demo data is the same saved and pending accounts the Dashboard
 * shows (from the shared demo story), so "revenue saved" matches everywhere.
 */
export function getDemoProgress(): ProgressApiResponse {
    const progress = getDemoDashboardData("en-GB").progressData;
    const breakdown = progress.progressBreakdown;

    const byAction = new Map<string, ProgressApiResponse["actionPerformance"][number]>();
    for (const row of breakdown) {
        const current = byAction.get(row.action) ?? {
            id: `perf-${row.action.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
            action: row.action,
            executions: 0,
            mrrSavedMinor: 0,
            avgRiskDecreasePct: row.outcome === "success" ? 18 : 0,
        };
        current.executions += 1;
        current.mrrSavedMinor += row.mrrSavedMinor;
        byAction.set(row.action, current);
    }

    return {
        mode: "demo",
        workspaceTier: "starter",
        connectedIntegrations: [],
        kpis: progress.kpis,
        recentMrrSaved: progress.recentMrrSaved,
        nextPriorityAccounts: progress.nextPriorityAccounts,
        progressBreakdown: breakdown,
        actionPerformance: [...byAction.values()],
    };
}
