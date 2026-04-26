export type InsightType =
    | "billing_failed"
    | "inactive_user"
    | "low_health"
    | "high_churn"
    | "general_summary"
    | "no_action";

export type RiskBand = "high" | "medium" | "low";
export type InsightSeverity = "low" | "medium" | "high" | "critical";
export type InsightSource = "ai" | "fallback" | "cache" | "fallback_after_error";
export type DataSource = "demo" | "live";

export type Insight = {
    kind: InsightType;
    title: string;
    text: string;
    focusId?: string | null;
    confidence: number;
    evidence: string[];
};

export type CustomerFact = {
    id: string;
    name: string;
    mrr: number;
    churnRisk: number;
    healthScore: number | null;
    lastActiveAt: string | null;
    daysInactive: number | null;
    riskBand: RiskBand;
    recentBillingFailure: boolean;
    recentBillingFailureAmount: number;
    reasonFlags: string[];
    source?: DataSource;
};

export type AiResponse = {
    insights: Insight[];
};

export type RecommendedAction = {
    type:
    | "send_billing_recovery_email"
    | "send_reactivation_email"
    | "assign_csm_outreach"
    | "review_health_blockers"
    | "monitor_account"
    | "none";
    title: string;
    description: string;
    priority: "low" | "medium" | "high";
};

export type WorkspaceInsightResult = {
    insights: Insight[];
    cached: boolean;
    source: InsightSource;
    timeframe: string;
    promptVersion: string;
};

export type TopCustomerRow = {
    id: string;
    name: string;
    churnRisk: number;
    mrr: number;
    lastActiveAt: Date | null;
    healthScore: number | null;
};

export type FailedInvoiceRow = {
    customer: { id: string; name: string } | null;
    amount: number;
    dueAt: Date;
};