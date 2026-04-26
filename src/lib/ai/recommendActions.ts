import type { CustomerFact, Insight, RecommendedAction } from "./types";

export type AutomationRecommendation = {
    customerId: string;
    customerName: string;
    actionType: string;
    aiReason: string;
    riskScore: number;
    mrrSavedMinor: number;
    recommendedAction: RecommendedAction["type"];
};

function mapInsightKindToRecommendedAction(kind: Insight["kind"]): RecommendedAction["type"] {
    switch (kind) {
        case "billing_failed":
            return "send_billing_recovery_email";
        case "inactive_user":
            return "send_reactivation_email";
        case "low_health":
            return "review_health_blockers";
        case "high_churn":
            return "assign_csm_outreach";
        case "general_summary":
        case "no_action":
        default:
            return "monitor_account";
    }
}

function mapRecommendedActionToLabel(action: RecommendedAction["type"]) {
    switch (action) {
        case "send_billing_recovery_email":
            return "Billing recovery email";
        case "send_reactivation_email":
            return "Re-engagement email";
        case "assign_csm_outreach":
            return "CSM outreach";
        case "review_health_blockers":
            return "Health review";
        case "monitor_account":
        case "none":
        default:
            return "Retention action";
    }
}

export function recommendActions(
    insights: Insight[],
    customerFacts: CustomerFact[]
): AutomationRecommendation[] {
    const factsById = new Map(customerFacts.map((c) => [c.id, c]));

    return insights
        .filter((insight) => insight.kind !== "general_summary" && insight.kind !== "no_action")
        .map((insight) => {
            const fact = insight.focusId ? factsById.get(insight.focusId) : undefined;

            const recommendedAction = mapInsightKindToRecommendedAction(insight.kind);
            const actionType = mapRecommendedActionToLabel(recommendedAction);

            return {
                customerId: fact?.id ?? insight.focusId ?? "unknown-customer",
                customerName: fact?.name ?? "Unknown account",
                actionType,
                aiReason: insight.text || insight.title,
                riskScore: fact?.churnRisk ?? 0,
                mrrSavedMinor: Math.round((fact?.mrr ?? 0) * 100),
                recommendedAction,
            };
        });
}