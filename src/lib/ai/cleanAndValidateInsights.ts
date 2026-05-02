// lib/ai/cleanAndValidateInsights.ts

import type {
    CustomerFact,
    Insight,
    InsightSeverity,
    InsightType,
    RecommendedAction,
    RecommendedActionType,
} from "./types";

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

function computeBackendConfidence(
    insight: Pick<Insight, "kind" | "focusId">,
    factMap: Map<string, CustomerFact>
): number {
    const fact = insight.focusId ? factMap.get(insight.focusId) : undefined;

    switch (insight.kind) {
        case "billing_failed":
            return fact?.recentBillingFailure ? 0.95 : 0.35;

        case "inactive_user":
            return (fact?.daysInactive ?? 0) >= 21 ? 0.9 : 0.4;

        case "low_health":
            return (fact?.healthScore ?? 100) < 40 ? 0.86 : 0.45;

        case "high_churn":
            return (fact?.churnRisk ?? 0) >= 0.8 ? 0.9 : 0.45;

        case "expansion_opportunity":
            return 0.65;

        case "general_summary":
            return 0.72;

        case "no_action":
            return 0.85;

        default:
            return 0.4;
    }
}

function resolveSeverity(kind: InsightType, fact?: CustomerFact): InsightSeverity {
    if (kind === "billing_failed") return "critical";
    if (kind === "high_churn") return "high";
    if (kind === "inactive_user") return "high";
    if (kind === "low_health") return "medium";
    if (kind === "expansion_opportunity") return "low";
    if (kind === "no_action") return "low";

    if (fact?.recentBillingFailure) return "critical";
    if ((fact?.churnRisk ?? 0) >= 0.8) return "high";
    if ((fact?.healthScore ?? 100) < 40) return "medium";

    return "low";
}

function resolveAction(kind: InsightType): RecommendedAction {
    switch (kind) {
        case "billing_failed":
            return {
                type: "send_billing_recovery_email",
                title: "Recover payment",
                description:
                    "Send a billing recovery email to resolve the failed payment.",
                priority: "high",
            };

        case "inactive_user":
            return {
                type: "send_reactivation_email",
                title: "Re-engage customer",
                description:
                    "Send a reactivation email to bring the customer back.",
                priority: "high",
            };

        case "high_churn":
            return {
                type: "assign_csm_outreach",
                title: "Manual outreach",
                description:
                    "Reach out to this customer directly to prevent churn.",
                priority: "high",
            };

        case "low_health":
            return {
                type: "review_health_blockers",
                title: "Review account issues",
                description:
                    "Investigate what is causing low engagement or friction.",
                priority: "medium",
            };

        case "expansion_opportunity":
            return {
                type: "monitor_account",
                title: "Monitor opportunity",
                description:
                    "Track this account for expansion signals before outreach.",
                priority: "low",
            };

        case "no_action":
            return {
                type: "monitor_account",
                title: "Monitor account",
                description:
                    "No immediate action needed. Continue tracking this account.",
                priority: "low",
            };

        default:
            return {
                type: "none",
                title: "No action needed",
                description: "No recommended action is available.",
                priority: "low",
            };
    }
}

function cleanAction(raw: unknown, fallback: RecommendedAction): RecommendedAction {
    if (!raw || typeof raw !== "object") return fallback;

    const row = raw as Record<string, unknown>;

    const allowedTypes = new Set<RecommendedActionType>([
        "send_billing_recovery_email",
        "send_reactivation_email",
        "assign_csm_outreach",
        "review_health_blockers",
        "monitor_account",
        "none",
    ]);

    const type = safeString(row.type, 60) as RecommendedActionType;
    const priorityRaw = safeString(row.priority, 20);

    const priority =
        priorityRaw === "high" || priorityRaw === "medium" || priorityRaw === "low"
            ? priorityRaw
            : fallback.priority;

    if (!allowedTypes.has(type)) return fallback;

    return {
        type,
        title: safeString(row.title, 60) || fallback.title,
        description: safeString(row.description, 140) || fallback.description,
        priority,
    };
}

export function cleanAndValidateInsights(
    raw: unknown,
    facts: CustomerFact[]
): Insight[] {
    const factMap = new Map(facts.map((fact) => [fact.id, fact]));
    const allowedIds = new Set(facts.map((fact) => fact.id));

    const allowedKinds = new Set<InsightType>([
        "billing_failed",
        "inactive_user",
        "low_health",
        "high_churn",
        "expansion_opportunity",
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

        const focusIdRaw =
            typeof row.focusId === "string" ? row.focusId.trim() : null;

        const focusId =
            focusIdRaw && allowedIds.has(focusIdRaw) ? focusIdRaw : null;

        const fact = focusId ? factMap.get(focusId) : undefined;

        const evidence = dedupeStrings(
            Array.isArray(row.evidence) ? row.evidence : []
        );

        const modelConfidence =
            typeof row.confidence === "number"
                ? clamp(row.confidence, 0, 1)
                : 0.5;

        if (!allowedKinds.has(kind)) continue;
        if (!title || !text) continue;

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

        if (forbiddenPhrases.some((phrase) => lowerText.includes(phrase))) {
            continue;
        }

        const backendConfidence = computeBackendConfidence(
            {
                kind,
                focusId,
            },
            factMap
        );

        const fallbackAction = resolveAction(kind);
        const action = cleanAction(row.action, fallbackAction);

        cleaned.push({
            kind,
            title,
            text,
            focusId,
            confidence: Number(
                ((modelConfidence + backendConfidence) / 2).toFixed(2)
            ),
            severity: resolveSeverity(kind, fact),
            action,
            evidence: evidence.length
                ? evidence
                : ["Derived from current workspace data"],
        });
    }

    return cleaned;
}