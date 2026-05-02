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

function priorityWeight(priority: "low" | "medium" | "high"): number {
    if (priority === "high") return 3;
    if (priority === "medium") return 2;
    return 1;
}

function severityWeight(severity: Insight["severity"]): number {
    if (severity === "critical") return 4;
    if (severity === "high") return 3;
    if (severity === "medium") return 2;
    return 1;
}

export function buildActionFirstRecommendations(args: {
    insights: Insight[];
    customerFacts: CustomerFact[];
}): ActionFirstRecommendation[] {
    const factsById = new Map(
        args.customerFacts.map((customer) => [customer.id, customer])
    );

    const recommendations = args.insights
        .filter((insight) => {
            if (!insight.focusId) return false;
            if (insight.kind === "general_summary") return false;
            if (insight.kind === "no_action") return false;
            if (!insight.action) return false;

            return true;
        })
        .map((insight) => {
            const fact = insight.focusId
                ? factsById.get(insight.focusId)
                : undefined;

            const customerId = fact?.id ?? insight.focusId ?? "unknown-customer";
            const customerName = fact?.name ?? "Unknown account";

            return {
                id: `${customerId}-${insight.action!.type}`,
                customerId,
                customerName,
                actionType: insight.action!.type,
                actionTitle: insight.action!.title,
                actionDescription: insight.action!.description,
                reason: insight.text || insight.title,
                priority: insight.action!.priority,
                severity: insight.severity,
                confidence: insight.confidence,
                riskScore: normaliseRiskScore(fact?.churnRisk),
                mrrAtRiskMinor: toMinorUnits(fact?.mrr),
                evidence: insight.evidence,
            };
        });

    return recommendations.sort((a, b) => {
        const severityDiff = severityWeight(b.severity) - severityWeight(a.severity);
        if (severityDiff !== 0) return severityDiff;

        const priorityDiff = priorityWeight(b.priority) - priorityWeight(a.priority);
        if (priorityDiff !== 0) return priorityDiff;

        const mrrDiff = b.mrrAtRiskMinor - a.mrrAtRiskMinor;
        if (mrrDiff !== 0) return mrrDiff;

        return b.confidence - a.confidence;
    });
}