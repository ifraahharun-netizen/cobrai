import type { CustomerFact, Insight } from "./types";

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

    for (const v of values) {
        const s = safeString(v, 80);
        if (!s) continue;
        if (seen.has(s.toLowerCase())) continue;
        seen.add(s.toLowerCase());
        out.push(s);
        if (out.length >= max) break;
    }

    return out;
}

export function buildFallbackInsights(facts: CustomerFact[]): Insight[] {
    const insights: Insight[] = [];

    const byBilling = [...facts]
        .filter((f) => f.recentBillingFailure)
        .sort((a, b) => b.recentBillingFailureAmount - a.recentBillingFailureAmount);

    const byChurn = [...facts].sort((a, b) => b.churnRisk - a.churnRisk);
    const byInactivity = [...facts].sort((a, b) => (b.daysInactive ?? 0) - (a.daysInactive ?? 0));

    const billed = byBilling[0];
    if (billed) {
        insights.push({
            kind: "billing_failed",
            title: "Recover failed billing",
            text: `${billed.name} has failed billing worth ${shortMoney(
                billed.recentBillingFailureAmount
            )}. Trigger recovery now.`,
            focusId: billed.id,
            confidence: 0.93,
            evidence: dedupeStrings([
                "Recent failed invoice present",
                `Failed amount ${shortMoney(billed.recentBillingFailureAmount)}`,
            ]),
        });
    }

    const inactive = byInactivity.find((f) => (f.daysInactive ?? 0) >= 21);
    if (inactive) {
        insights.push({
            kind: "inactive_user",
            title: "Re-engage inactive account",
            text: `${inactive.name} has been inactive for ${inactive.daysInactive} days. Send a reactivation sequence.`,
            focusId: inactive.id,
            confidence: 0.9,
            evidence: dedupeStrings([
                `Inactive for ${inactive.daysInactive} days`,
                `Risk band ${inactive.riskBand}`,
            ]),
        });
    }

    const risky = byChurn.find((f) => f.churnRisk >= 0.8);
    if (risky) {
        insights.push({
            kind: "high_churn",
            title: "Prioritise churn outreach",
            text: `${risky.name} shows elevated churn risk. Assign owner and intervene this week.`,
            focusId: risky.id,
            confidence: 0.88,
            evidence: dedupeStrings([
                `Churn risk ${risky.churnRisk.toFixed(2)}`,
                risky.healthScore !== null ? `Health score ${risky.healthScore}` : "",
            ]),
        });
    }

    const lowHealth = facts.find((f) => (f.healthScore ?? 100) < 40);
    if (lowHealth) {
        insights.push({
            kind: "low_health",
            title: "Address weak health score",
            text: `${lowHealth.name} has a low health score. Review usage blockers and customer support needs.`,
            focusId: lowHealth.id,
            confidence: 0.84,
            evidence: dedupeStrings([
                lowHealth.healthScore !== null ? `Health score ${lowHealth.healthScore}` : "",
                `Risk band ${lowHealth.riskBand}`,
            ]),
        });
    }

    if (!insights.length) {
        insights.push({
            kind: "no_action",
            title: "No urgent retention issue",
            text: "No strong retention risk was detected in the latest data snapshot.",
            focusId: null,
            confidence: 0.95,
            evidence: ["No high-confidence risk trigger found"],
        });
    }

    return insights.slice(0, 4);
}