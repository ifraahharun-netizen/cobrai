// lib/ai/actionFirst.ts

import type {
    CustomerFact,
    Insight,
    RecommendedActionType,
} from "./types";

export type ActionFirstRecommendation = {
    id: string;
    customerId: string;
    customerName: string;
    actionType: RecommendedActionType;
    actionTitle: string;
    actionDescription: string;
    reason: string;
    priority: "low" | "medium" | "high";
    severity: Insight["severity"];
    confidence: number;
    riskScore: number;
    mrrAtRiskMinor: number;
    evidence: string[];
};

function normaliseRiskScore(
    value: number | null | undefined
): number {
    const risk = Number(value ?? 0);

    if (!Number.isFinite(risk)) return 0;

    if (risk <= 1) {
        return Math.round(risk * 100);
    }

    return Math.round(
        Math.min(100, Math.max(0, risk))
    );
}

function toMinorUnits(
    value: number | null | undefined
): number {
    const amount = Number(value ?? 0);

    if (!Number.isFinite(amount)) return 0;

    return Math.round(amount * 100);
}

function priorityWeight(
    priority: "low" | "medium" | "high"
): number {
    if (priority === "high") return 3;
    if (priority === "medium") return 2;

    return 1;
}

function severityWeight(
    severity: Insight["severity"]
): number {
    if (severity === "critical") return 4;
    if (severity === "high") return 3;
    if (severity === "medium") return 2;

    return 1;
}

function behaviourWeight(
    fact?: CustomerFact
): number {
    if (!fact) return 0;

    let score = 0;

    if (fact.usageTrend === "down") {
        score += 3;
    }

    if ((fact.engagementScore ?? 100) <= 35) {
        score += 3;
    }

    if ((fact.daysInactive ?? 0) >= 21) {
        score += 4;
    }

    if ((fact.supportTicketCount ?? 0) >= 3) {
        score += 2;
    }

    if (fact.recentBillingFailure) {
        score += 5;
    }

    return score;
}

function enrichAction(args: {
    insight: Insight;
    fact?: CustomerFact;
}) {
    const { insight, fact } = args;

    const reasonFlags = fact?.reasonFlags ?? [];

    let title = insight.action.title;
    let description = insight.action.description;
    let priority = insight.action.priority;

    if (reasonFlags.includes("billing_failed_recent")) {
        title = "Recover failed payment immediately";

        description =
            "Customer recently experienced a failed payment. Send a billing recovery email and confirm payment details today.";

        priority = "high";
    }

    if (
        reasonFlags.includes("inactive_21d") ||
        reasonFlags.includes("inactive_30d")
    ) {
        title = "Re-engage inactive customer";

        description =
            "Customer activity has dropped significantly. Trigger a re-engagement sequence and offer a short success walkthrough.";
    }

    if (reasonFlags.includes("support_friction")) {
        title = "Resolve customer friction";

        description =
            "Customer shows signs of support friction. Review blockers and assign proactive customer success outreach.";
    }

    if (reasonFlags.includes("usage_declining")) {
        title = "Recover declining product usage";

        description =
            "Usage trend is declining. Send a value-focused check-in and recommend high-impact features.";
    }

    return {
        title,
        description,
        priority,
    };
}

export function buildActionFirstRecommendations(args: {
    insights: Insight[];
    customerFacts: CustomerFact[];
}): ActionFirstRecommendation[] {
    const factsById = new Map(
        args.customerFacts.map((customer) => [
            customer.id,
            customer,
        ])
    );

    const recommendations = args.insights
        .filter((insight) => {
            if (!insight.focusId) return false;

            if (
                insight.kind === "general_summary"
            ) {
                return false;
            }

            if (insight.kind === "no_action") {
                return false;
            }

            if (!insight.action) {
                return false;
            }

            return true;
        })
        .map((insight) => {
            const fact = insight.focusId
                ? factsById.get(insight.focusId)
                : undefined;

            const customerId =
                fact?.id ??
                insight.focusId ??
                "unknown-customer";

            const customerName =
                fact?.name ??
                "Unknown account";

            const enriched = enrichAction({
                insight,
                fact,
            });

            return {
                id: `${customerId}-${insight.action!.type}`,

                customerId,

                customerName,

                actionType:
                    insight.action!.type,

                actionTitle:
                    enriched.title,

                actionDescription:
                    enriched.description,

                reason:
                    insight.text ||
                    insight.title,

                priority:
                    enriched.priority,

                severity:
                    insight.severity,

                confidence:
                    insight.confidence,

                riskScore:
                    normaliseRiskScore(
                        fact?.churnRisk
                    ),

                mrrAtRiskMinor:
                    toMinorUnits(
                        fact?.mrr
                    ),

                evidence:
                    insight.evidence,
            };
        });

    return recommendations.sort((a, b) => {
        const severityDiff =
            severityWeight(
                b.severity
            ) -
            severityWeight(
                a.severity
            );

        if (severityDiff !== 0) {
            return severityDiff;
        }

        const factA = factsById.get(
            a.customerId
        );

        const factB = factsById.get(
            b.customerId
        );

        const behaviourDiff =
            behaviourWeight(factB) -
            behaviourWeight(factA);

        if (behaviourDiff !== 0) {
            return behaviourDiff;
        }

        const priorityDiff =
            priorityWeight(
                b.priority
            ) -
            priorityWeight(
                a.priority
            );

        if (priorityDiff !== 0) {
            return priorityDiff;
        }

        const mrrDiff =
            b.mrrAtRiskMinor -
            a.mrrAtRiskMinor;

        if (mrrDiff !== 0) {
            return mrrDiff;
        }

        return (
            b.confidence -
            a.confidence
        );
    });
}