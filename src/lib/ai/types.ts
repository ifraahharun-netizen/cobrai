// lib/ai/types.ts

export type DataSource = "demo" | "live";

export type InsightSeverity = "low" | "medium" | "high" | "critical";
export type RiskBand = "high" | "medium" | "low";
export type InsightSource = "ai" | "fallback" | "cache" | "fallback_after_error";

export type AiActionType =
    | "send_billing_recovery_email"
    | "send_reactivation_email"
    | "assign_csm_outreach"
    | "review_health_blockers"
    | "retry_failed_payment"
    | "view_failed_accounts"
    | "monitor_account"
    | "none";

export type AiInsightKind =
    | "billing_failed"
    | "inactive_user"
    | "low_health"
    | "high_churn"
    | "workflow_failed"
    | "revenue_protected"
    | "expansion_opportunity"
    | "general_summary"
    | "no_action";

export type RecommendedActionType = AiActionType;
export type InsightType = AiInsightKind;

export type RecommendedAction = {
    type: AiActionType;
    title: string;
    description: string;
    priority: "low" | "medium" | "high";
};

export type Insight = {
    kind: AiInsightKind;
    title: string;
    text: string;
    action: RecommendedAction;
    severity: InsightSeverity;
    focusId: string | null;
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

export type ActionFirstRecommendation = {
    id: string;
    customerId: string;
    customerName: string;
    actionType: AiActionType;
    actionTitle: string;
    actionDescription: string;
    reason: string;
    priority: "low" | "medium" | "high";
    severity: InsightSeverity;
    confidence: number;
    riskScore: number;
    mrrAtRiskMinor: number;
    evidence: string[];
};

export type AiOperationalSummary = {
    headline: string;
    summary: string;
    confidence: "Low" | "Medium" | "High";
    revenueAtRiskMinor: number;
    revenueProtectedMinor: number;
    failedActionsCount: number;
    pendingActionsCount: number;
    successActionsCount: number;
    primaryAction: {
        title: string;
        description: string;
        type: AiActionType;
    };
    actionButtons: Array<{
        label: string;
        type: AiActionType;
        href: string;
        tone: "danger" | "warning" | "neutral" | "success";
    }>;
};

export type AiResponse = {
    insights: Insight[];
    operationalSummary: AiOperationalSummary;
};

export type WorkspaceInsightResult = {
    insights: Insight[];
    actions: ActionFirstRecommendation[];
    operationalSummary: AiOperationalSummary;
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