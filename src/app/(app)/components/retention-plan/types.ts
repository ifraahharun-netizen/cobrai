export type PlanScopeKey =
    | "highRisk"
    | "mediumRisk"
    | "newCustomers"
    | "billingOnly";

export type RiskPatternKey =
    | "billingRecovery"
    | "featureAdoption"
    | "supportBacklog"
    | "usageDropoff";

export type PlanScope = {
    key: PlanScopeKey;
    label: string;
    hint: string;
    defaultOn?: boolean;
};

export type PlanSummary = {
    highRiskCount: number;
    mrrAtRisk: number; // £
    churnWindow: string; // "7–14 days"
    patternsFound: number;
    customersAnalysed: number;
};

export type PlanAction = {
    key: RiskPatternKey;
    priority: 1 | 2 | 3;
    title: string;
    why: string;
    recommended: string[];
    impactLabel: string; // e.g. "Potential save: £900 MRR"
    affectedCount: number;
};

export type GeneratedPlan = {
    summary: PlanSummary;
    actions: PlanAction[];
    expected: {
        mrrPrevented: number;
        riskReductionPct: number;
    };
};

export type ExecutionOptions = {
    createTasks: boolean;
    syncCrm: boolean; // Pro+
    sendOutreach: boolean; // Pro+
};
