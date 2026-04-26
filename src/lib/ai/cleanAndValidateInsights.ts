import type { CustomerFact, Insight, InsightType } from "./types";

function clamp(num: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, num));
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

function computeBackendConfidence(i: Insight, factMap: Map<string, CustomerFact>): number {
    const f = i.focusId ? factMap.get(i.focusId) : undefined;

    switch (i.kind) {
        case "billing_failed":
            return f?.recentBillingFailure ? 0.95 : 0.35;
        case "inactive_user":
            return (f?.daysInactive ?? 0) >= 21 ? 0.9 : 0.4;
        case "low_health":
            return (f?.healthScore ?? 100) < 40 ? 0.86 : 0.45;
        case "high_churn":
            return (f?.churnRisk ?? 0) >= 0.8 ? 0.9 : 0.45;
        case "general_summary":
            return 0.72;
        case "no_action":
            return 0.85;
        default:
            return 0.4;
    }
}

export function cleanAndValidateInsights(raw: unknown, facts: CustomerFact[]): Insight[] {
    const factMap = new Map(facts.map((f) => [f.id, f]));
    const allowedIds = new Set(facts.map((f) => f.id));
    const allowedKinds = new Set<InsightType>([
        "billing_failed",
        "inactive_user",
        "low_health",
        "high_churn",
        "general_summary",
        "no_action",
    ]);

    if (!raw || typeof raw !== "object") return [];

    const maybeInsights = (raw as { insights?: unknown }).insights;
    const items = Array.isArray(maybeInsights) ? maybeInsights : [];
    const cleaned: Insight[] = [];

    for (const item of items.slice(0, 4)) {
        if (!item || typeof item !== "object") continue;

        const row = item as Record<string, unknown>;

        const kind = safeString(row.kind, 40) as InsightType;
        const title = safeString(row.title, 60);
        const text = safeString(row.text, 140);
        const focusIdRaw = typeof row.focusId === "string" ? row.focusId.trim() : null;
        const focusId = focusIdRaw && allowedIds.has(focusIdRaw) ? focusIdRaw : null;
        const evidence = dedupeStrings(Array.isArray(row.evidence) ? row.evidence : []);
        const modelConfidence =
            typeof row.confidence === "number" ? clamp(row.confidence, 0, 1) : 0.5;

        if (!allowedKinds.has(kind)) continue;
        if (!title || !text) continue;

        const fact = focusId ? factMap.get(focusId) : undefined;

        if (kind === "billing_failed" && !fact?.recentBillingFailure) continue;
        if (kind === "inactive_user" && (fact?.daysInactive ?? 0) < 21) continue;
        if (kind === "low_health" && (fact?.healthScore ?? 100) >= 40) continue;
        if (kind === "high_churn" && (fact?.churnRisk ?? 0) < 0.8) continue;

        const forbiddenPhrases = [
            "opened",
            "clicked",
            "recovered payment",
            "payment recovered",
            "sentiment",
            "angry",
            "frustrated",
            "upgrade intent",
            "downgrade intent",
        ];

        const lowerText = text.toLowerCase();
        if (forbiddenPhrases.some((p) => lowerText.includes(p))) continue;

        const backendConfidence = computeBackendConfidence(
            {
                kind,
                title,
                text,
                focusId,
                confidence: modelConfidence,
                evidence,
            },
            factMap
        );

        cleaned.push({
            kind,
            title,
            text,
            focusId,
            confidence: Number(((modelConfidence + backendConfidence) / 2).toFixed(2)),
            evidence: evidence.length ? evidence : ["Derived from current workspace data"],
        });
    }

    return cleaned;
}