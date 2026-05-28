// lib/ai/types.ts

export type DataSource = "demo" | "live";

export type InsightSeverity =
    | "low"
    | "medium"
    | "high"
    | "critical";

export type RiskBand =
    | "high"
    | "medium"
    | "low";

export type InsightSource =
    | "ai"
    | "fallback"
    | "cache"
    | "fallback_after_error";

export type AiActionType =
    | "send_billing_recovery_email"
    | "send_reactivation_email"
    | "assign_csm_outreach"
    | "review_health_blockers"
    | "retry_failed_payment"
    | "view_failed_accounts"
    | "monitor_account"
    | "trigger_winback_campaign"
    | "offer_expansion"
    | "schedule_success_call"
    | "none";

export type AiInsightKind =
    | "billing_failed"
    | "inactive_user"
    | "billing"
    | "low_health"
    | "high_churn"
    | "workflow_failed"
    | "revenue_protected"
    | "expansion_opportunity"
    | "general_summary"
    | "risk"
    | "adoption"
    | "engagement"
    | "retention"
    | "expansion"
    | "onboarding"
    | "usage_drop"
    | "payment_risk"
    | "growth_signal"
    | "renewal_risk"
    | "no_action";

export type RecommendedActionType = AiActionType;
export type InsightType = AiInsightKind;

export type RecommendedAction = {
    type: AiActionType;

    title: string;

    description: string;

    priority: "low" | "medium" | "high";
};

export type AiBusinessHealth = {
    overallScore: number;

    label:
    | "Strong"
    | "Healthy"
    | "Watch"
    | "At Risk";

    summary: string;
};

export type AiForecast = {
    nextMonthMrr: number;

    projectedGrowthPct: number;

    predictedChurnPct: number;

    confidence:
    | "Low"
    | "Medium"
    | "High";
};

export type AiMrrDriver = {
    label: string;

    impact: number;

    direction:
    | "positive"
    | "negative";

    explanation: string;
};

export type AiRiskAccount = {
    customerId: string;

    customerName: string;

    churnRisk: number;

    mrrAtRiskMinor: number;

    reason: string;

    recommendedAction: string;
};

export type Insight = {
    kind: AiInsightKind;

    title: string;

    text: string;

    action?: RecommendedAction | null;

    severity: InsightSeverity;

    focusId?: string | null;

    confidence?: number;

    evidence?: string[];

    accountIds?: string[];

    createdAt?: string;

    source?: InsightSource;
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

    usageTrend?: "up" | "down" | "flat";

    engagementScore?: number;

    recentLoginCount?: number;

    supportTicketCount?: number;

    lastPaymentStatus?: string;

    teamSeats?: number;

    plan?: string | null;

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

        tone:
        | "danger"
        | "warning"
        | "neutral"
        | "success";
    }>;
};

export type AiBusinessNarrative = {
    headline: string;

    summary: string;

    businessHealth: string;

    churnPrediction: string;

    engagementAnalysis: string;

    revenueForecast: string;

    forecastExplanation?: {
        mrr: string;
        churn: string;
    };

    health?: AiBusinessHealth;

    forecast?: AiForecast;

    mrrDrivers?: AiMrrDriver[];

    riskAccounts?: AiRiskAccount[];

    engagementScore?: number;
};

export type ExecutiveSummary = {
    overview: string;

    biggestRisk: string;

    biggestOpportunity: string;

    recommendedPriority: string;
};

export type AiResponse = {
    insights: Insight[];

    operationalSummary: AiOperationalSummary;

    businessNarrative: AiBusinessNarrative;

    executiveSummary?: ExecutiveSummary;
};

export type WorkspaceInsightResult = {
    insights: Insight[];

    actions: ActionFirstRecommendation[];

    operationalSummary: AiOperationalSummary;

    businessNarrative: AiBusinessNarrative;

    executiveSummary: ExecutiveSummary;

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
    customer: {
        id: string;

        name: string;
    } | null;

    amount: number;

    dueAt: Date;
};