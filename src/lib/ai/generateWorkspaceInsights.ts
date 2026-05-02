// lib/ai/generateWorkspaceInsights.ts

import OpenAI from "openai";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

import { buildCustomerFacts } from "./buildCustomerFacts";
import { buildFallbackInsights } from "./buildFallbackInsights";
import { cleanAndValidateInsights } from "./cleanAndValidateInsights";
import { buildRunType, PROMPT_VERSION } from "./buildRunType";
import { buildActionFirstRecommendations } from "./actionFirst";
import { checkAiUsageLimit, recordAiUsageRun } from "./aiUsage";

import type {
    ActionFirstRecommendation,
    AiOperationalSummary,
    AiResponse,
    CustomerFact,
    Insight,
    InsightSource,
    WorkspaceInsightResult,
} from "./types";

const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const CACHE_MINUTES = 0;

const allowedKinds = [
    "billing_failed",
    "inactive_user",
    "low_health",
    "high_churn",
    "workflow_failed",
    "revenue_protected",
    "expansion_opportunity",
    "general_summary",
    "no_action",
] as const;

const allowedActionTypes = [
    "send_billing_recovery_email",
    "send_reactivation_email",
    "assign_csm_outreach",
    "review_health_blockers",
    "retry_failed_payment",
    "view_failed_accounts",
    "monitor_account",
    "none",
] as const;

function confidenceLabel(score: number): "Low" | "Medium" | "High" {
    if (score >= 0.75) return "High";
    if (score >= 0.45) return "Medium";
    return "Low";
}

function buildOperationalSummary(args: {
    insights: Insight[];
    actions: ActionFirstRecommendation[];
    customerFacts: CustomerFact[];
}): AiOperationalSummary {
    const { insights, actions, customerFacts } = args;

    const revenueAtRiskMinor = actions.reduce(
        (sum, action) => sum + Number(action.mrrAtRiskMinor || 0),
        0
    );

    const failedBillingCount = customerFacts.filter(
        (customer) => customer.recentBillingFailure
    ).length;

    const highRiskCount = customerFacts.filter(
        (customer) => customer.riskBand === "high"
    ).length;

    const avgConfidence =
        insights.length > 0
            ? insights.reduce((sum, item) => sum + Number(item.confidence || 0), 0) /
            insights.length
            : 0.5;

    const topAction = actions[0];

    return {
        headline: topAction
            ? `${topAction.customerName} needs action now`
            : "No urgent retention action needed",
        summary: topAction
            ? `${actions.length} priority action${actions.length === 1 ? "" : "s"} found. ${highRiskCount} high-risk account${highRiskCount === 1 ? "" : "s"} and ${failedBillingCount} failed billing signal${failedBillingCount === 1 ? "" : "s"} need attention.`
            : "Cobrai did not find a high-confidence account requiring immediate action.",
        confidence: confidenceLabel(avgConfidence),
        revenueAtRiskMinor,
        revenueProtectedMinor: 0,
        failedActionsCount: failedBillingCount,
        pendingActionsCount: actions.length,
        successActionsCount: 0,
        primaryAction: {
            title: topAction?.actionTitle || "Monitor account health",
            description:
                topAction?.actionDescription ||
                "Keep monitoring churn risk, billing status, and customer activity.",
            type: topAction?.actionType || "monitor_account",
        },
        actionButtons: topAction
            ? [
                {
                    label: topAction.actionTitle,
                    type: topAction.actionType,
                    href: `/dashboard/accounts-at-risk/${topAction.customerId}`,
                    tone:
                        topAction.severity === "critical" || topAction.severity === "high"
                            ? "danger"
                            : topAction.severity === "medium"
                                ? "warning"
                                : "neutral",
                },
                {
                    label: "View priority accounts",
                    type: "view_failed_accounts",
                    href: "/dashboard/accounts-at-risk?filter=critical",
                    tone: "neutral",
                },
            ]
            : [
                {
                    label: "View accounts",
                    type: "monitor_account",
                    href: "/dashboard/accounts-at-risk",
                    tone: "neutral",
                },
            ],
    };
}

export async function generateWorkspaceInsights(args: {
    workspaceId: string;
    timeframe?: string;
    source?: "demo" | "live";
}): Promise<WorkspaceInsightResult> {
    const timeframe = args.timeframe ?? "week";
    const sourceMode = args.source ?? "demo";
    const runType = buildRunType(timeframe);

    const cachedSince = new Date(Date.now() - CACHE_MINUTES * 60 * 1000);

    const cached = await prisma.insightRun.findFirst({
        where: {
            workspaceId: args.workspaceId,
            type: runType,
            createdAt: { gte: cachedSince },
        },
        orderBy: { createdAt: "desc" },
    });

    if (cached?.result) {
        const cachedResult = cached.result as {
            insights?: Insight[];
            actions?: ActionFirstRecommendation[];
            operationalSummary?: AiOperationalSummary;
        };

        await recordAiUsageRun({
            workspaceId: args.workspaceId,
            source: "cache",
            timeframe,
        }).catch(() => null);

        return {
            insights: cachedResult.insights ?? [],
            actions: cachedResult.actions ?? [],
            operationalSummary:
                cachedResult.operationalSummary ??
                buildOperationalSummary({
                    insights: cachedResult.insights ?? [],
                    actions: cachedResult.actions ?? [],
                    customerFacts: [],
                }),
            cached: true,
            source: "cache",
            timeframe,
            promptVersion: PROMPT_VERSION,
        };
    }

    const workspace = await prisma.workspace.findUnique({
        where: { id: args.workspaceId },
        select: {
            id: true,
            tier: true,
            trialEndsAt: true,
            demoMode: true,
        },
    });

    const topCustomers = await prisma.customer.findMany({
        where: { workspaceId: args.workspaceId },
        orderBy: { churnRisk: "desc" },
        take: 8,
        select: {
            id: true,
            name: true,
            churnRisk: true,
            mrr: true,
            lastActiveAt: true,
            healthScore: true,
        },
    });

    const failedInvoices = await prisma.invoice.findMany({
        where: {
            workspaceId: args.workspaceId,
            status: "failed",
        },
        orderBy: { dueAt: "desc" },
        take: 10,
        select: {
            customer: {
                select: {
                    id: true,
                    name: true,
                },
            },
            amount: true,
            dueAt: true,
        },
    });

    const customerFacts = buildCustomerFacts({
        customers: topCustomers,
        failedInvoices,
        source: sourceMode,
    });

    const payload = {
        timeframe,
        promptVersion: PROMPT_VERSION,
        customerFacts,
        rules: {
            maxInsights: 4,
            allowedKinds,
            allowedActionTypes,
            allowedFocusIds: customerFacts.map((customer) => customer.id),
            grounding:
                "Use only facts explicitly present in customerFacts. Do not infer email opens, clicks, sentiment, payment recovery, product usage events, upgrade intent, downgrade intent, or customer emotions unless provided.",
            wording:
                "Keep every insight concise, clear, and suitable for a minimal SaaS dashboard. Prefer decisive action-first language, for example: 'Send billing recovery email today' instead of vague wording like 'Consider reaching out'.",
        },
    };

    const fallbackInsights = buildFallbackInsights(customerFacts);

    const buildAndSaveFallback = async (
        source: InsightSource,
        extra?: Record<string, unknown>
    ): Promise<WorkspaceInsightResult> => {
        const actions = buildActionFirstRecommendations({
            insights: fallbackInsights,
            customerFacts,
        });

        const operationalSummary = buildOperationalSummary({
            insights: fallbackInsights,
            actions,
            customerFacts,
        });

        await prisma.insightRun.create({
            data: {
                workspaceId: args.workspaceId,
                type: runType,
                result: {
                    promptVersion: PROMPT_VERSION,
                    timeframe,
                    source,
                    input: payload,
                    rawModelOutput: null,
                    insights: fallbackInsights,
                    actions,
                    operationalSummary,
                    ...(extra ?? {}),
                } as Prisma.InputJsonValue,
            },
        });

        await recordAiUsageRun({
            workspaceId: args.workspaceId,
            source: source === "fallback_after_error" ? "fallback_after_error" : "fallback",
            timeframe,
        }).catch(() => null);

        return {
            insights: fallbackInsights,
            actions,
            operationalSummary,
            cached: false,
            source,
            timeframe,
            promptVersion: PROMPT_VERSION,
        };
    };

    if (!process.env.OPENAI_API_KEY) {
        return buildAndSaveFallback("fallback", {
            reason: "OPENAI_API_KEY missing",
        });
    }

    const usageDecision = await checkAiUsageLimit({
        workspaceId: args.workspaceId,
        tier: workspace?.tier ?? "free",
        trialEndsAt: workspace?.trialEndsAt ?? null,
        demoMode: workspace?.demoMode ?? false,
    });

    if (!usageDecision.allowed) {
        return buildAndSaveFallback("fallback", {
            aiLimit: {
                limit: usageDecision.limit,
                used: usageDecision.used,
                remaining: usageDecision.remaining,
                reason: usageDecision.reason,
            },
        });
    }

    try {
        const completion = await client.chat.completions.create({
            model: "gpt-4o-mini",
            temperature: 0.2,
            messages: [
                {
                    role: "developer",
                    content:
                        "You generate retention actions for a SaaS dashboard. Return only structured data matching the required schema. Use only facts explicitly present in the input. Do not invent ids, metrics, customer behaviour, emotions, intent, email opens, email clicks, payment recovery, or product events. Keep wording short, decisive, useful, and action-focused. Use direct next actions like 'Send billing recovery email today' or 'Trigger re-engagement email now'. Avoid vague wording like 'consider', 'maybe', 'could', or 'might'. Every insight should support a clear recommended action. If evidence is weak, use general_summary or no_action.",
                },
                {
                    role: "user",
                    content: JSON.stringify(payload),
                },
            ],
            response_format: {
                type: "json_schema",
                json_schema: {
                    name: "saas_retention_insights",
                    strict: true,
                    schema: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                            insights: {
                                type: "array",
                                maxItems: 4,
                                items: {
                                    type: "object",
                                    additionalProperties: false,
                                    properties: {
                                        kind: {
                                            type: "string",
                                            enum: [...allowedKinds],
                                        },
                                        title: { type: "string" },
                                        text: { type: "string" },
                                        severity: {
                                            type: "string",
                                            enum: ["low", "medium", "high", "critical"],
                                        },
                                        focusId: {
                                            type: ["string", "null"],
                                        },
                                        confidence: {
                                            type: "number",
                                            minimum: 0,
                                            maximum: 1,
                                        },
                                        evidence: {
                                            type: "array",
                                            items: { type: "string" },
                                            maxItems: 4,
                                        },
                                        action: {
                                            type: "object",
                                            additionalProperties: false,
                                            properties: {
                                                type: {
                                                    type: "string",
                                                    enum: [...allowedActionTypes],
                                                },
                                                title: { type: "string" },
                                                description: { type: "string" },
                                                priority: {
                                                    type: "string",
                                                    enum: ["low", "medium", "high"],
                                                },
                                            },
                                            required: [
                                                "type",
                                                "title",
                                                "description",
                                                "priority",
                                            ],
                                        },
                                    },
                                    required: [
                                        "kind",
                                        "title",
                                        "text",
                                        "severity",
                                        "focusId",
                                        "confidence",
                                        "evidence",
                                        "action",
                                    ],
                                },
                            },
                            operationalSummary: {
                                type: "object",
                                additionalProperties: false,
                                properties: {
                                    headline: { type: "string" },
                                    summary: { type: "string" },
                                    confidence: {
                                        type: "string",
                                        enum: ["Low", "Medium", "High"],
                                    },
                                    revenueAtRiskMinor: { type: "number" },
                                    revenueProtectedMinor: { type: "number" },
                                    failedActionsCount: { type: "number" },
                                    pendingActionsCount: { type: "number" },
                                    successActionsCount: { type: "number" },
                                    primaryAction: {
                                        type: "object",
                                        additionalProperties: false,
                                        properties: {
                                            title: { type: "string" },
                                            description: { type: "string" },
                                            type: {
                                                type: "string",
                                                enum: [...allowedActionTypes],
                                            },
                                        },
                                        required: ["title", "description", "type"],
                                    },
                                    actionButtons: {
                                        type: "array",
                                        maxItems: 3,
                                        items: {
                                            type: "object",
                                            additionalProperties: false,
                                            properties: {
                                                label: { type: "string" },
                                                type: {
                                                    type: "string",
                                                    enum: [...allowedActionTypes],
                                                },
                                                href: { type: "string" },
                                                tone: {
                                                    type: "string",
                                                    enum: ["danger", "warning", "neutral", "success"],
                                                },
                                            },
                                            required: ["label", "type", "href", "tone"],
                                        },
                                    },
                                },
                                required: [
                                    "headline",
                                    "summary",
                                    "confidence",
                                    "revenueAtRiskMinor",
                                    "revenueProtectedMinor",
                                    "failedActionsCount",
                                    "pendingActionsCount",
                                    "successActionsCount",
                                    "primaryAction",
                                    "actionButtons",
                                ],
                            },
                        },
                        required: ["insights", "operationalSummary"],
                    },
                },
            },
        });

        const content = completion.choices[0]?.message?.content ?? "{}";

        let parsed: AiResponse | null = null;

        try {
            parsed = JSON.parse(content) as AiResponse;
        } catch {
            parsed = null;
        }

        let insights = cleanAndValidateInsights(parsed, customerFacts);
        let source: InsightSource = "ai";

        if (!insights.length) {
            insights = fallbackInsights;
            source = "fallback";
        }

        const actions = buildActionFirstRecommendations({
            insights,
            customerFacts,
        });

        const operationalSummary =
            parsed?.operationalSummary ??
            buildOperationalSummary({
                insights,
                actions,
                customerFacts,
            });

        await prisma.insightRun.create({
            data: {
                workspaceId: args.workspaceId,
                type: runType,
                result: {
                    promptVersion: PROMPT_VERSION,
                    timeframe,
                    source,
                    input: payload,
                    rawModelOutput: content,
                    insights,
                    actions,
                    operationalSummary,
                    aiUsage: {
                        limit: usageDecision.limit,
                        usedBeforeRun: usageDecision.used,
                        remainingBeforeRun: usageDecision.remaining,
                    },
                } as Prisma.InputJsonValue,
            },
        });

        await recordAiUsageRun({
            workspaceId: args.workspaceId,
            source: source === "ai" ? "openai" : "fallback",
            timeframe,
            tokensIn: completion.usage?.prompt_tokens ?? 0,
            tokensOut: completion.usage?.completion_tokens ?? 0,
        }).catch(() => null);

        return {
            insights,
            actions,
            operationalSummary,
            cached: false,
            source,
            timeframe,
            promptVersion: PROMPT_VERSION,
        };
    } catch (err) {
        return buildAndSaveFallback("fallback_after_error", {
            error: err instanceof Error ? err.message : String(err),
        });
    }
}