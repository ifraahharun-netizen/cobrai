export type Tier = "starter" | "pro" | "scale";

export type RiskAccount = {
    id: string;
    company: string;
    reason: string;
    risk: number; // 0-100
    mrr: number;  // number in GBP (e.g. 190)
};

export type PlanActionKey = "billing" | "adoption" | "usage" | "support";

export type GeneratedPlan = {
    summary: {
        highRiskCount: number;
        mediumRiskCount: number;
        customersAnalysed: number;
        mrrAtRisk: number;
        churnWindow: string;
        patternsFound: number;
    };
    actions: Array<{
        key: PlanActionKey;
        priority: 1 | 2 | 3;
        title: string;
        why: string;
        recommended: string[];
        impactLabel: string;
        affectedCount: number;
        accountIds: string[];
    }>;
    expected: {
        mrrPrevented: number;
        riskReductionPct: number;
    };
};