// lib/ai/buildFallbackInsights.ts

import type {
    CustomerFact,
    Insight,
    InsightSeverity,
    RecommendedAction,
} from "./types";

function shortMoney(amount: number): string {
    return new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "GBP",
        maximumFractionDigits: 0,
    }).format(amount);
}

function safeString(value: unknown, max = 140): string {
    return String(value ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max);
}

function dedupeStrings(values: unknown[], max = 4): string[] {
    const out: string[] = [];
    const seen = new Set<string>();

    for (const value of values) {
        const text = safeString(value, 80);
        const key = text.toLowerCase();

        if (!text || seen.has(key)) continue;

        seen.add(key);
        out.push(text);

        if (out.length >= max) break;
    }

    return out;
}

function makeInsight(args: {
    kind: Insight["kind"];
    title: string;
    text: string;
    focusId?: string | null;
    confidence: number;
    severity: InsightSeverity;
    action: RecommendedAction;
    evidence: unknown[];
}): Insight {
    return {
        kind: args.kind,
        title: args.title,
        text: args.text,
        focusId: args.focusId ?? null,
        confidence: args.confidence,
        severity: args.severity,
        action: args.action,
        evidence: dedupeStrings(args.evidence),
    };
}

export function buildFallbackInsights(facts: CustomerFact[]): Insight[] {
    const insights: Insight[] = [];

    const byBilling = [...facts]
        .filter((fact) => fact.recentBillingFailure)
        .sort(
            (a, b) =>
                b.recentBillingFailureAmount - a.recentBillingFailureAmount
        );

    const byChurn = [...facts].sort((a, b) => b.churnRisk - a.churnRisk);

    const byInactivity = [...facts].sort(
        (a, b) => (b.daysInactive ?? 0) - (a.daysInactive ?? 0)
    );

    const billed = byBilling[0];

    if (billed) {
        insights.push(
            makeInsight({
                kind: "billing_failed",
                title: "Recover failed billing",
                text: `${billed.name} has failed billing worth ${shortMoney(
                    billed.recentBillingFailureAmount
                )}. Trigger recovery now.`,
                focusId: billed.id,
                confidence: 0.93,
                severity: "critical",
                action: {
                    type: "send_billing_recovery_email",
                    title: "Recover payment",
                    description:
                        "Send a billing recovery email to resolve the failed payment.",
                    priority: "high",
                },
                evidence: [
                    "Recent failed invoice present",
                    `Failed amount ${shortMoney(
                        billed.recentBillingFailureAmount
                    )}`,
                ],
            })
        );
    }

    const inactive = byInactivity.find(
        (fact) => (fact.daysInactive ?? 0) >= 21
    );

    if (inactive) {
        insights.push(
            makeInsight({
                kind: "inactive_user",
                title: "Re-engage inactive account",
                text: `${inactive.name} has been inactive for ${inactive.daysInactive} days. Send a reactivation sequence.`,
                focusId: inactive.id,
                confidence: 0.9,
                severity: "high",
                action: {
                    type: "send_reactivation_email",
                    title: "Re-engage customer",
                    description:
                        "Send a reactivation email to bring the customer back.",
                    priority: "high",
                },
                evidence: [
                    `Inactive for ${inactive.daysInactive} days`,
                    `Risk band ${inactive.riskBand}`,
                ],
            })
        );
    }

    const risky = byChurn.find((fact) => fact.churnRisk >= 0.8);

    if (risky) {
        insights.push(
            makeInsight({
                kind: "high_churn",
                title: "Prioritise churn outreach",
                text: `${risky.name} shows elevated churn risk. Assign owner and intervene this week.`,
                focusId: risky.id,
                confidence: 0.88,
                severity: "high",
                action: {
                    type: "assign_csm_outreach",
                    title: "Manual outreach",
                    description:
                        "Reach out to this customer directly to prevent churn.",
                    priority: "high",
                },
                evidence: [
                    `Churn risk ${Math.round(risky.churnRisk * 100)}%`,
                    risky.healthScore !== null
                        ? `Health score ${risky.healthScore}`
                        : "",
                ],
            })
        );
    }

    const lowHealth = facts.find((fact) => (fact.healthScore ?? 100) < 40);

    if (lowHealth) {
        insights.push(
            makeInsight({
                kind: "low_health",
                title: "Review account health",
                text: `${lowHealth.name} has a low health score. Review blockers before risk increases.`,
                focusId: lowHealth.id,
                confidence: 0.84,
                severity: "medium",
                action: {
                    type: "review_health_blockers",
                    title: "Review account issues",
                    description:
                        "Investigate what is causing low engagement or friction.",
                    priority: "medium",
                },
                evidence: [
                    lowHealth.healthScore !== null
                        ? `Health score ${lowHealth.healthScore}`
                        : "",
                    `Risk band ${lowHealth.riskBand}`,
                ],
            })
        );
    }

    if (!insights.length) {
        insights.push(
            makeInsight({
                kind: "no_action",
                title: "No urgent retention issue",
                text: "No strong retention risk was detected in the latest data snapshot.",
                focusId: null,
                confidence: 0.95,
                severity: "low",
                action: {
                    type: "monitor_account",
                    title: "Monitor account",
                    description:
                        "No immediate action needed. Continue tracking this account.",
                    priority: "low",
                },
                evidence: ["No high-confidence risk trigger found"],
            })
        );
    }

    return insights.slice(0, 4);
}