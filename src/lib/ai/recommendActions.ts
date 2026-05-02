// lib/ai/recommendedActions.ts

import type {
    CustomerFact,
    Insight,
    RecommendedAction,
    RecommendedActionType,
} from "./types";

export type AutomationRecommendation = {
    customerId: string;
    customerName: string;
    actionType: string;
    aiReason: string;
    riskScore: number;
    mrrSavedMinor: number;
    recommendedAction: RecommendedActionType;
    priority: RecommendedAction["priority"];
};

function mapInsightKindToRecommendedAction(
    kind: Insight["kind"]
): RecommendedActionType {
    switch (kind) {
        case "billing_failed":
            return "send_billing_recovery_email";

        case "inactive_user":
            return "send_reactivation_email";

        case "low_health":
            return "review_health_blockers";

        case "high_churn":
            return "assign_csm_outreach";

        case "expansion_opportunity":
            return "monitor_account";

        case "general_summary":
        case "no_action":
        default:
            return "monitor_account";
    }
}

function mapRecommendedActionToLabel(action: RecommendedActionType): string {
    switch (action) {
        case "send_billing_recovery_email":
            return "Billing recovery email";

        case "send_reactivation_email":
            return "Re-engagement email";

        case "assign_csm_outreach":
            return "Manual outreach";

        case "review_health_blockers":
            return "Account health review";

        case "monitor_account":
            return "Monitor account";

        case "none":
        default:
            return "No action needed";
    }
}

function normaliseRiskScore(value: number | null | undefined): number {
    const risk = Number(value ?? 0);

    if (!Number.isFinite(risk)) return 0;

    if (risk <= 1) return Math.round(risk * 100);

    return Math.round(Math.min(100, Math.max(0, risk)));
}

function toMinorUnits(value: number | null | undefined): number {
    const amount = Number(value ?? 0);

    if (!Number.isFinite(amount)) return 0;

    return Math.round(amount * 100);
}

export function recommendActions(
    insights: Insight[],
    customerFacts: CustomerFact[]
): AutomationRecommendation[] {
    const factsById = new Map(customerFacts.map((customer) => [customer.id, customer]));

    return insights
        .filter(
            (insight) =>
                insight.kind !== "general_summary" &&
                insight.kind !== "no_action" &&
                Boolean(insight.focusId)
        )
        .map((insight) => {
            const fact = insight.focusId
                ? factsById.get(insight.focusId)
                : undefined;

            const recommendedAction =
                insight.action?.type ?? mapInsightKindToRecommendedAction(insight.kind);

            const actionType =
                insight.action?.title ?? mapRecommendedActionToLabel(recommendedAction);

            return {
                customerId: fact?.id ?? insight.focusId ?? "unknown-customer",
                customerName: fact?.name ?? "Unknown account",
                actionType,
                aiReason: insight.action?.description || insight.text || insight.title,
                riskScore: normaliseRiskScore(fact?.churnRisk),
                mrrSavedMinor: toMinorUnits(fact?.mrr),
                recommendedAction,
                priority: insight.action?.priority ?? "medium",
            };
        });
}