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

const CACHE_MINUTES = 30;

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
                        topAction.severity === "critical" ||
                            topAction.severity === "high"
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

    // =========================================================
    // WORKSPACE
    // =========================================================

    const workspace = await prisma.workspace.findUnique({
        where: { id: args.workspaceId },
        select: {
            id: true,
            tier: true,
            trialEndsAt: true,
            demoMode: true,
        },
    });

    const isTrialActive =
        !!workspace?.trialEndsAt &&
        new Date(workspace.trialEndsAt).getTime() > Date.now();

    const shouldBypassCache =
        workspace?.demoMode ||
        isTrialActive ||
        workspace?.tier === "pro";

    // =========================================================
    // CACHE
    // =========================================================

    let cached: any = null;

    if (!shouldBypassCache && !workspace?.demoMode) {
        const cachedSince = new Date(
            Date.now() - CACHE_MINUTES * 60 * 1000
        );

        cached = await prisma.insightRun.findFirst({
            where: {
                workspaceId: args.workspaceId,
                type: runType,
                createdAt: { gte: cachedSince },
            },
            orderBy: { createdAt: "desc" },
        });
    }

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

    // =========================================================
    // CUSTOMERS
    // =========================================================

    let topCustomers = await prisma.customer.findMany({
        where: { workspaceId: args.workspaceId },

        orderBy: { churnRisk: "desc" },

        take: 12,

        select: {
            id: true,
            name: true,
            churnRisk: true,
            mrr: true,
            lastActiveAt: true,
            healthScore: true,
        },
    });

    // Demo + Trial = rotating insights
    if (workspace?.demoMode || isTrialActive) {
        topCustomers = topCustomers
            .sort(() => Math.random() - 0.5)
            .slice(0, 8);
    } else {
        topCustomers = topCustomers.slice(0, 8);
    }

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

            allowedFocusIds: customerFacts.map(
                (customer) => customer.id
            ),

            grounding:
                "Use only facts explicitly present in customerFacts. Do not infer email opens, clicks, sentiment, payment recovery, product usage events, upgrade intent, downgrade intent, or customer emotions unless provided.",

            wording:
                "Keep every insight concise, clear, and suitable for a minimal SaaS dashboard. Prefer decisive action-first language.",
        },
    };

    const fallbackInsights =
        buildFallbackInsights(customerFacts);

    if (workspace?.demoMode || isTrialActive) {
        customerFacts.sort(() => Math.random() - 0.5);
    }

    const buildAndSaveFallback = async (
        source: InsightSource,
        extra?: Record<string, unknown>
    ): Promise<WorkspaceInsightResult> => {
        const actions =
            buildActionFirstRecommendations({
                insights: fallbackInsights,
                customerFacts,
            });

        const operationalSummary =
            buildOperationalSummary({
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

            source:
                source === "fallback_after_error"
                    ? "fallback_after_error"
                    : "fallback",

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

    // =========================================================
    // API KEY
    // =========================================================

    if (!process.env.OPENAI_API_KEY) {
        return buildAndSaveFallback("fallback", {
            reason: "OPENAI_API_KEY missing",
        });
    }

    // =========================================================
    // USAGE LIMITS
    // =========================================================

    const usageDecision = await checkAiUsageLimit({
        workspaceId: args.workspaceId,

        tier: workspace?.tier ?? "free",

        trialEndsAt:
            workspace?.trialEndsAt ?? null,

        demoMode:
            workspace?.demoMode ?? false,
    });

    if (!usageDecision.allowed) {
        await recordAiUsageRun({
            workspaceId: args.workspaceId,
            source: "blocked_limit",
            timeframe,
        }).catch(() => null);

        return buildAndSaveFallback("fallback", {
            aiLimit: {
                limit: usageDecision.limit,
                used: usageDecision.used,
                remaining: usageDecision.remaining,
                reason: usageDecision.reason,
            },
        });
    }

    // =========================================================
    // OPENAI
    // =========================================================

    try {
        const completion =
            await client.chat.completions.create({
                model: "gpt-4o-mini",

                temperature: 0.7,

                messages: [
                    {
                        role: "developer",
                        content: `
You are Cobrai, an AI retention intelligence system for B2B SaaS teams.

Generate realistic, highly varied retention insights.

CRITICAL RULES:
- Never repeat the same account more than once
- Never repeat the same title
- Never repeat the same action recommendation
- Mix billing, onboarding, churn, adoption, expansion, and recovery insights
- Some insights should be positive opportunities
- Some should be warnings
- Some should be progress updates
- Output should feel dynamic and alive like a real SaaS dashboard

Avoid repetitive wording like:
"Recover declining product usage"

Use varied titles such as:
- Expansion opportunity detected
- Billing recovery in progress
- Trial activation slowing
- Revenue protected this week
- Product engagement recovering
- High-risk renewal approaching
- Adoption improving after outreach
- Payment retry succeeded
- Usage drop accelerating
`,
                    },
                    {
                        role: "user",
                        content: JSON.stringify(payload),
                    },
                ],

                response_format: {
                    type: "json_object",
                },
            });

        const content =
            completion.choices[0]?.message?.content ??
            "{}";

        let parsed: AiResponse | null = null;

        try {
            parsed = JSON.parse(content) as AiResponse;
        } catch {
            parsed = null;
        }

        let insights = cleanAndValidateInsights(
            parsed,
            customerFacts
        );

        let source: InsightSource = "ai";

        if (!insights.length) {
            throw new Error(
                "OpenAI returned empty insights"
            );
        }

        // =========================================================
        // DEDUPE SAME ACCOUNTS
        // =========================================================

        const seen = new Set<string>();

        const seenCustomers = new Set<string>();
        const seenTitles = new Set<string>();

        insights = insights.filter((item) => {
            const focusId = item.focusId || "";
            const title = item.title?.trim().toLowerCase();

            if (focusId && seenCustomers.has(focusId)) {
                return false;
            }

            if (title && seenTitles.has(title)) {
                return false;
            }

            if (focusId) {
                seenCustomers.add(focusId);
            }

            if (title) {
                seenTitles.add(title);
            }

            return true;
        });
        const actions =
            buildActionFirstRecommendations({
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
                        usedBeforeRun:
                            usageDecision.used,
                        remainingBeforeRun:
                            usageDecision.remaining,
                    },
                } as Prisma.InputJsonValue,
            },
        });

        await recordAiUsageRun({
            workspaceId: args.workspaceId,

            source:
                source === "ai"
                    ? "openai"
                    : "fallback",

            timeframe,

            tokensIn:
                completion.usage?.prompt_tokens ?? 0,

            tokensOut:
                completion.usage?.completion_tokens ??
                0,
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
        return buildAndSaveFallback(
            "fallback_after_error",
            {
                error:
                    err instanceof Error
                        ? err.message
                        : String(err),
            }
        );
    }
}