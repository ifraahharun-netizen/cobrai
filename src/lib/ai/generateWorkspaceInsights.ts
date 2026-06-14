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
    AiBusinessNarrative,
    AiOperationalSummary,
    AiResponse,
    CustomerFact,
    Insight,
    InsightSource,
    WorkspaceInsightResult,
} from "./types";
import { buildAccountRisk } from "../risk/buildAccountRisk";


const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const CACHE_MINUTES = 30;
function normalizeCurrency(value?: string | null) {
    return (value || "GBP").toUpperCase();
}

function formatCurrencyFromMinor(minor: number, currency = "GBP") {
    const amount = Number(minor || 0) / 100;

    try {
        return new Intl.NumberFormat("en-GB", {
            style: "currency",
            currency,
        }).format(amount);
    } catch {
        return `${amount.toFixed(2)} ${currency}`;
    }
}

function buildRiskAccountAction(customer: CustomerFact) {
    const flags = Array.isArray(customer.reasonFlags)
        ? customer.reasonFlags.join(" ").toLowerCase()
        : "";

    const daysInactive = Number(customer.daysInactive || 0);
    const churnRisk = Number(customer.churnRisk || 0);

    if (
        customer.recentBillingFailure ||
        flags.includes("billing") ||
        flags.includes("payment") ||
        flags.includes("invoice") ||
        flags.includes("failed")
    ) {
        return "Retry failed payment and send billing recovery email";
    }

    if (
        flags.includes("usage") ||
        flags.includes("inactive") ||
        flags.includes("engagement") ||
        daysInactive >= 14
    ) {
        return "Send usage recovery email and offer onboarding support";
    }

    if (flags.includes("renewal") || flags.includes("contract")) {
        return "Schedule renewal check-in with decision maker";
    }

    if (flags.includes("downgrade") || flags.includes("plan")) {
        return "Send downgrade prevention offer";
    }

    if (churnRisk >= 85) {
        return "Assign urgent CSM outreach";
    }

    if (churnRisk >= 70) {
        return "Send personalised retention email";
    }

    return "Monitor account and review next health signal";
}

function buildRiskAccountReason(customer: CustomerFact) {
    const flags = Array.isArray(customer.reasonFlags)
        ? customer.reasonFlags.filter(Boolean)
        : [];

    if (flags.length) return flags.join(" + ");

    if (customer.recentBillingFailure) {
        return "Failed payment + billing risk";
    }

    if (Number(customer.daysInactive || 0) >= 14) {
        return `Inactive for ${customer.daysInactive} days`;
    }

    if (Number(customer.healthScore || 0) < 50) {
        return "Low customer health score";
    }

    return "Elevated churn risk";
}

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
            stripeSubscriptions: {
                orderBy: {
                    updatedAt: "desc",
                },
                take: 1,
                select: {
                    currency: true,
                },
            },
        },
    });

    const isTrialActive =
        !!workspace?.trialEndsAt &&
        new Date(workspace.trialEndsAt).getTime() > Date.now();

    const shouldBypassCache =
        workspace?.demoMode ||
        isTrialActive ||
        workspace?.tier === "pro";

    const workspaceCurrency = normalizeCurrency(
        workspace?.stripeSubscriptions?.[0]?.currency
    );

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
                result: {
                    path: ["source"],
                    equals: ["ai"],
                },
            },
            orderBy: { createdAt: "desc" },
        });
    }
    if (cached?.result) {
        const cachedResult = cached.result as {
            insights?: Insight[];
            actions?: ActionFirstRecommendation[];
            operationalSummary?: AiOperationalSummary;

            businessNarrative?: AiBusinessNarrative;

            executiveSummary?: {
                overview: string;
                biggestRisk: string;
                biggestOpportunity: string;
                recommendedPriority: string;
            };
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

            businessNarrative:
                cachedResult.businessNarrative ?? {
                    headline: "Business performance remains stable.",

                    summary: "Cobrai did not detect major retention volatility.",

                    businessHealth: "Overall business health is currently stable.",

                    churnPrediction: "No major churn acceleration detected.",

                    engagementAnalysis:
                        "Customer engagement trends remain relatively consistent.",

                    revenueForecast:
                        "Revenue is expected to remain stable if current trends continue.",

                    forecastExplanation: {
                        mrr:
                            "MRR is expected to remain stable because no major revenue or retention volatility was detected.",
                        churn:
                            "Churn is expected to remain controlled because no major churn acceleration was detected.",
                    },
                },

            executiveSummary:
                cachedResult.executiveSummary ?? {
                    overview: "Retention performance remains stable.",

                    biggestRisk: "No critical business risk detected.",

                    biggestOpportunity: "Expansion opportunities remain available.",

                    recommendedPriority: "Continue monitoring customer health.",
                },

            cached: true,

            source: "cache",

            timeframe,

            promptVersion: PROMPT_VERSION,
        };
    }

    // =========================================================
    // ANALYTICS CONTEXT
    // =========================================================

    const latestWorkspaceSnapshot =
        await prisma.workspaceAnalyticsSnapshot.findFirst({
            where: {
                workspaceId: args.workspaceId,
            },
            orderBy: {
                snapshotDate: "desc",
            },
        });

    const latestMrrSnapshot = await prisma.mrrSnapshot.findFirst({
        where: {
            workspaceId: args.workspaceId,
            active: true,
        },
        orderBy: {
            month: "desc",
        },
        select: {
            mrrMinor: true,
            month: true,
        },
    });

    const latestNarratives =
        await prisma.aiWorkspaceNarrative.findMany({
            where: {
                workspaceId: args.workspaceId,
            },

            orderBy: {
                createdAt: "desc",
            },

            take: 5,
        });

    // =========================================================
    // CUSTOMERS
    // =========================================================

    let topCustomers = await prisma.customer.findMany({
        where: {
            workspaceId: args.workspaceId,
        },

        orderBy: {
            churnRisk: "desc",
        },

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

    topCustomers = topCustomers.slice(0, 8);

    const failedInvoices = await prisma.invoice.findMany({
        where: {
            workspaceId: args.workspaceId,
            status: "failed",
        },

        orderBy: {
            dueAt: "desc",
        },

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
    function toMinorAmount(value: number) {
        if (!Number.isFinite(value) || value <= 0) return 0;

        return value >= 10000 ? Math.round(value) : Math.round(value * 100);
    }

    const customerMrrMinor = customerFacts.reduce(
        (sum, c) => sum + toMinorAmount(Number(c.mrr || 0)),
        0
    );

    const snapshotMrrMinor =
        typeof latestMrrSnapshot?.mrrMinor === "number"
            ? latestMrrSnapshot.mrrMinor
            : 0;

    const analyticsSnapshotMrrMinor =
        typeof latestWorkspaceSnapshot?.totalMrr === "number"
            ? toMinorAmount(latestWorkspaceSnapshot.totalMrr)
            : 0;

    const totalMrr = Math.max(
        customerMrrMinor,
        snapshotMrrMinor,
        analyticsSnapshotMrrMinor
    );

    const highRiskCustomers = customerFacts.filter(
        (c) => c.riskBand === "high"
    );

    const avgHealth =
        customerFacts.length > 0
            ? customerFacts.reduce(
                (sum, c) => sum + Number(c.healthScore || 0),
                0
            ) / customerFacts.length
            : 70;

    const inactiveCustomers = customerFacts.filter(
        (c) => Number(c.daysInactive || 0) >= 7
    );

    const failedBillingCustomers = customerFacts.filter(
        (c) => c.recentBillingFailure
    );

    const engagementScore = Math.max(
        0,
        Math.min(
            100,
            Math.round(
                avgHealth * 0.55 +
                (100 - highRiskCustomers.length * 4) * 0.25 +
                (100 - inactiveCustomers.length * 3) * 0.2
            )
        )
    );

    const projectedChurnPct =
        highRiskCustomers.length > 0
            ? Number(
                (
                    highRiskCustomers.reduce((sum, c) => sum + c.churnRisk, 0) /
                    highRiskCustomers.length /
                    18
                ).toFixed(1)
            )
            : 1.8;

    const projectedGrowthPct =
        totalMrr > 0
            ? Math.max(
                -15,
                Math.min(
                    30,
                    Number((((engagementScore - 50) / 5) - projectedChurnPct).toFixed(1))
                )
            )
            : 0;

    const nextMonthMrr = Math.round(
        totalMrr * (1 + projectedGrowthPct / 100)
    );

    const payload = {
        timeframe,

        currency: workspaceCurrency,

        businessMetrics: {
            totalMrr,
            engagementScore,
            projectedChurnPct,
            projectedGrowthPct,
            nextMonthMrr,
            inactiveCustomers: inactiveCustomers.length,
            failedBillingCustomers:
                failedBillingCustomers.length,
            avgHealth,
        },

        promptVersion: PROMPT_VERSION,

        workspaceAnalytics:
            latestWorkspaceSnapshot,

        recentNarratives:
            latestNarratives,

        customerFacts,

        rules: {
            maxInsights: 4,

            allowedKinds,

            allowedActionTypes,

            allowedFocusIds: customerFacts.map(
                (customer) => customer.id
            ),

            grounding:
                "Use only facts explicitly present in customerFacts or workspaceAnalytics. Do not infer unsupported product usage or customer behavior.",

            wording:
                "Keep every insight concise, executive-level, intelligent, and operationally useful.",
        },
    };

    const fallbackInsights =
        buildFallbackInsights(customerFacts);


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

        const executiveSummary = {
            overview:
                "Retention performance requires monitoring.",

            biggestRisk:
                "High-risk accounts require follow-up.",

            biggestOpportunity:
                "Expansion opportunities exist among healthier accounts.",

            recommendedPriority:
                "Prioritize customer recovery and engagement.",
        };

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

                    executiveSummary,

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

            executiveSummary,

            businessNarrative: {
                headline:
                    engagementScore >= 75
                        ? "Customer retention remains stable despite early churn signals."
                        : engagementScore >= 55
                            ? "Retention is stable, but early churn signals need attention."
                            : "Retention risk is rising across vulnerable accounts.",

                summary:
                    highRiskCustomers.length > 0
                        ? `Cobrai identified ${highRiskCustomers.length} elevated-risk account${highRiskCustomers.length === 1 ? "" : "s"} requiring proactive follow-up.`
                        : "Cobrai did not detect broad retention instability this period.",

                businessHealth:
                    engagementScore >= 75
                        ? "Overall customer health remains steady, with isolated risk signals being monitored."
                        : "Customer health needs attention due to churn exposure, inactivity, or unresolved risk signals.",

                churnPrediction:
                    `${projectedChurnPct.toFixed(1)}% projected churn next month based on current risk patterns and account health.`,

                engagementAnalysis:
                    inactiveCustomers.length > 0
                        ? `${inactiveCustomers.length} account${inactiveCustomers.length === 1 ? "" : "s"} show weaker engagement and should be reviewed before risk increases.`
                        : "Engagement remains stable with no major inactivity cluster detected this period.",

                revenueForecast:
                    `Next-month MRR is projected at ${formatCurrencyFromMinor(
                        nextMonthMrr,
                        workspaceCurrency
                    )}, a ${projectedGrowthPct >= 0 ? "+" : ""}${projectedGrowthPct.toFixed(
                        1
                    )}% movement based on current MRR, churn exposure, engagement health, and billing-risk signals.`,

                forecastExplanation: {
                    mrr:
                        "MRR is expected to remain stable because no major revenue or retention volatility was detected.",
                    churn:
                        "Churn is expected to remain controlled because no major churn acceleration was detected.",
                },
                health: {
                    overallScore: engagementScore,
                    label:
                        engagementScore >= 80
                            ? "Strong"
                            : engagementScore >= 65
                                ? "Healthy"
                                : engagementScore >= 45
                                    ? "Watch"
                                    : "At Risk",
                    summary:
                        engagementScore >= 75
                            ? "Retention health is stable with manageable churn exposure."
                            : "Retention health needs attention due to weak engagement and elevated customer risk.",
                },

                forecast: {
                    nextMonthMrr,
                    projectedGrowthPct,
                    predictedChurnPct: projectedChurnPct,
                    confidence:
                        engagementScore >= 75
                            ? "High"
                            : engagementScore >= 55
                                ? "Medium"
                                : "Low",
                },

                mrrDrivers: [
                    {
                        label: "Engagement health",
                        impact: engagementScore,
                        direction: engagementScore >= 60 ? "positive" : "negative",
                        explanation:
                            "Engagement health is influencing the next-month revenue outlook and retention stability.",
                    },
                    {
                        label: "Churn exposure",
                        impact: projectedChurnPct,
                        direction: "negative",
                        explanation:
                            "High-risk accounts and inactivity signals are increasing pressure on projected MRR.",
                    },
                ],

                engagementScore,
            },

            cached: false,

            source,

            timeframe,

            promptVersion: PROMPT_VERSION,
        };
    };

    // =========================================================
    // API KEY
    // =========================================================


    console.log("[AI DEBUG]", {
        hasOpenAiKey: !!process.env.OPENAI_API_KEY,
        tier: workspace?.tier,
        demoMode: workspace?.demoMode,
        isTrialActive,
    });

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

    console.log("[AI USAGE DECISION]", usageDecision);

    const shouldForceOpenAi =
        workspace?.tier === "pro" ||
        workspace?.demoMode === true ||
        isTrialActive;

    if (!usageDecision.allowed && !shouldForceOpenAi) {
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
You are Cobrai.

Cobrai is an AI-powered retention intelligence platform for SaaS companies.

You analyze:
- retention health
- churn acceleration
- revenue movement
- expansion opportunities
- billing instability
- customer engagement
- operational inefficiencies

You think like:
- a VP of Customer Success
- a SaaS revenue operator
- a retention strategist
- an executive business analyst

Prioritize:
- causal reasoning
- trend explanation
- operational impact
- revenue implications
- retention urgency
- executive-level clarity

Avoid generic observations.
Always explain:
- what changed
- why it matters
- what will likely happen next
- what action should happen now
- which revenue drivers influenced growth
- which accounts represent the biggest churn exposure
- whether engagement health is improving or deteriorating
- how billing instability affects retention
- what the next-month revenue outlook looks like

You must behave like:
- a SaaS CFO
- a VP Customer Success
- a retention strategist
- a revenue intelligence analyst

Return:
- executive-level insights
- operational recommendations
- churn predictions
- revenue forecasting
- engagement health analysis
- key MRR drivers
- highest-risk accounts
- concise but intelligent summaries

Never hallucinate metrics.
For businessNarrative.forecastExplanation:
- mrr must explain why the next MRR forecast is likely, using current MRR, engagement health, churn exposure, failed billing, expansion signals, and customer risk.
- churn must explain why the churn forecast is likely, using high-risk accounts, inactivity, billing issues, customer health, and retention progress.
- Keep each explanation under 22 words.
- Do not say “based on the last 6 months” unless monthly history is explicitly supplied.
- Do not invent causes that are not present in the payload.
Only use supplied analytics data.

Focus heavily on:
- revenue risk
- churn acceleration
- engagement deterioration
- billing instability
- expansion likelihood
- retention leverage opportunities

Use the supplied currency field for all money wording. Do not hardcode GBP or £.

Do NOT repeat customer facts verbatim.
Synthesize patterns across accounts and business trends.
Return JSON with this exact top-level shape:
{
  "insights": [],
  "operationalSummary": {},
  "businessNarrative": {
    "headline": string,
    "summary": string,
    "businessHealth": string,
    "churnPrediction": string,
    "engagementAnalysis": string,
    "revenueForecast": string,
    "forecastExplanation": {
    "mrr": string,
    "churn": string
    },
    "health": {
      "overallScore": number,
      "label": "Strong" | "Healthy" | "Watch" | "At Risk",
      "summary": string
    },
    "forecast": {
      "nextMonthMrr": number,
      "projectedGrowthPct": number,
      "predictedChurnPct": number,
      "confidence": "Low" | "Medium" | "High"
    },
    "mrrDrivers": [],
    "riskAccounts": [],
    "engagementScore": number
  },
  "executiveSummary": {}
}
  For businessNarrative.riskAccounts:
- recommendedAction must be specific to the actual signal.
- If billing/payment/invoice failed: use retry failed payment or billing recovery wording.
- If usage dropped, inactive, or low engagement: use usage recovery or reactivation wording.
- If renewal risk: use renewal check-in wording.
- If downgrade signal: use downgrade prevention wording.
- Do NOT repeat "Trigger retention follow-up" for every account.
- Each account should have a different action when the underlying reason is different.

For forecast.nextMonthMrr, return minor units only.
Example: £1,200.50 should be 120050.

Return STRICT JSON.
`,
                    },

                    {
                        role: "user",

                        content:
                            JSON.stringify(payload),
                    },
                ],

                response_format: {
                    type: "json_object",
                },
            });

        const content =
            completion.choices[0]?.message
                ?.content ?? "{}";

        let parsed: AiResponse | null =
            null;

        try {
            parsed = JSON.parse(
                content
            ) as AiResponse;
        } catch {
            parsed = null;
        }

        let insights =
            cleanAndValidateInsights(
                parsed,
                customerFacts
            );

        let source: InsightSource =
            "ai";

        if (!insights.length && !parsed?.businessNarrative) {
            throw new Error(
                "OpenAI returned empty insights and no business narrative"
            );
        }

        if (!insights.length) {
            insights = buildFallbackInsights(customerFacts).map((item) => ({
                ...item,
                source: "ai",
            }));
        }

        const seenCustomers =
            new Set<string>();

        const seenTitles =
            new Set<string>();

        insights = insights.filter(
            (item) => {
                const focusId =
                    item.focusId || "";

                const title =
                    item.title
                        ?.trim()
                        .toLowerCase();

                if (
                    focusId &&
                    seenCustomers.has(
                        focusId
                    )
                ) {
                    return false;
                }

                if (
                    title &&
                    seenTitles.has(
                        title
                    )
                ) {
                    return false;
                }

                if (focusId) {
                    seenCustomers.add(
                        focusId
                    );
                }

                if (title) {
                    seenTitles.add(
                        title
                    );
                }

                return true;
            }
        );

        const actions =
            buildActionFirstRecommendations(
                {
                    insights,
                    customerFacts,
                }
            );

        const operationalSummary =
            parsed?.operationalSummary ??
            buildOperationalSummary({
                insights,
                actions,
                customerFacts,
            });

        const businessNarrative =
            parsed?.businessNarrative ?? {
                headline:
                    engagementScore >= 70
                        ? "Business retention health is stable."
                        : "Retention risk signals require attention.",

                summary:
                    "Cobrai identified key retention, engagement, and revenue signals impacting overall business health.",

                businessHealth:
                    engagementScore >= 70
                        ? "Customer engagement and retention remain relatively healthy."
                        : "Churn exposure and inactivity trends weakened overall health.",

                churnPrediction:
                    `Projected churn is approximately ${projectedChurnPct.toFixed(1)}% next month based on engagement and risk trends.`,

                engagementAnalysis:
                    `${inactiveCustomers.length} accounts show low engagement patterns contributing to retention risk.`,

                revenueForecast:
                    `Projected next month MRR is ${formatCurrencyFromMinor(
                        nextMonthMrr,
                        workspaceCurrency
                    )}. This is based on current MRR, projected growth, churn exposure, inactive accounts, and billing-risk signals.`,

                forecastExplanation: {
                    mrr:
                        "MRR is expected to remain stable because no major revenue or retention volatility was detected.",
                    churn:
                        "Churn is expected to remain controlled because no major churn acceleration was detected.",
                },
                health: {
                    overallScore: engagementScore,

                    label:
                        engagementScore >= 80
                            ? "Strong"
                            : engagementScore >= 65
                                ? "Healthy"
                                : engagementScore >= 45
                                    ? "Watch"
                                    : "At Risk",

                    summary:
                        engagementScore >= 70
                            ? "Engagement and retention metrics are stable."
                            : "Business health weakened due to churn and inactivity.",
                },

                forecast: {
                    nextMonthMrr,

                    projectedGrowthPct,

                    predictedChurnPct:
                        projectedChurnPct,

                    confidence:
                        engagementScore >= 75
                            ? "High"
                            : engagementScore >= 55
                                ? "Medium"
                                : "Low",
                },

                mrrDrivers: [
                    {
                        label:
                            "Expansion revenue",

                        impact: 24,

                        direction:
                            "positive",

                        explanation:
                            "Expansion activity from retained customers increased MRR.",
                    },

                    {
                        label:
                            "Customer inactivity",

                        impact: 16,

                        direction:
                            "negative",

                        explanation:
                            "Reduced engagement increased churn exposure.",
                    },
                ],
                riskAccounts:
                    highRiskCustomers
                        .slice(0, 5)
                        .map((c) => {
                            const reason =
                                c.reasonFlags?.join(", ") ||
                                "High churn exposure";

                            const recommendedAction =
                                c.recentBillingFailure
                                    ? "Retry billing and send recovery email"
                                    : "Trigger re-engagement outreach";

                            return {
                                customerId: c.id,
                                customerName: c.name,
                                churnRisk: c.churnRisk,
                                mrrAtRiskMinor: Math.round(c.mrr * 100),
                                reason,
                                recommendedAction,
                                opportunity: "Retention recovery",
                                whyNow: reason,
                                suggestedAction: recommendedAction,
                            };
                        }),
                engagementScore,
            };


        const safeBusinessNarrative: AiBusinessNarrative = {
            ...businessNarrative,

            health: {
                overallScore:
                    businessNarrative?.health?.overallScore && businessNarrative.health.overallScore > 0
                        ? businessNarrative.health.overallScore
                        : engagementScore,

                label:
                    businessNarrative?.health?.label ||
                    (engagementScore >= 80
                        ? "Strong"
                        : engagementScore >= 65
                            ? "Healthy"
                            : engagementScore >= 45
                                ? "Watch"
                                : "At Risk"),

                summary:
                    businessNarrative?.health?.summary ||
                    "Business health calculated from engagement, churn exposure and customer activity.",
            },

            forecast: {
                nextMonthMrr:
                    businessNarrative?.forecast?.nextMonthMrr &&
                        businessNarrative.forecast.nextMonthMrr > 0
                        ? businessNarrative.forecast.nextMonthMrr
                        : nextMonthMrr,

                projectedGrowthPct:
                    typeof businessNarrative?.forecast?.projectedGrowthPct === "number"
                        ? businessNarrative.forecast.projectedGrowthPct
                        : projectedGrowthPct,

                predictedChurnPct:
                    typeof businessNarrative?.forecast?.predictedChurnPct === "number"
                        ? businessNarrative.forecast.predictedChurnPct
                        : projectedChurnPct,

                confidence:
                    businessNarrative?.forecast?.confidence ||
                    (engagementScore >= 75
                        ? "High"
                        : engagementScore >= 55
                            ? "Medium"
                            : "Low"),
            },

            engagementScore:
                businessNarrative?.engagementScore &&
                    businessNarrative.engagementScore > 0
                    ? businessNarrative.engagementScore
                    : engagementScore,

            mrrDrivers:
                businessNarrative?.mrrDrivers?.length
                    ? businessNarrative.mrrDrivers
                    : [
                        {
                            label: "Engagement health",
                            impact: engagementScore,
                            direction:
                                engagementScore >= 60
                                    ? ("positive" as const)
                                    : ("negative" as const),
                            explanation:
                                "Customer engagement trends directly influence retention stability and projected revenue movement.",
                        },
                        {
                            label: "Churn exposure",
                            impact: projectedChurnPct,
                            direction: "negative" as const,
                            explanation:
                                "High-risk accounts and inactivity signals increase churn pressure on projected MRR.",
                        },
                    ],
        };

        const executiveSummary =
            parsed?.executiveSummary ?? {
                overview:
                    "Retention performance remains stable.",

                biggestRisk:
                    "No critical business risk detected.",

                biggestOpportunity:
                    "Expansion opportunities remain available.",

                recommendedPriority:
                    "Continue monitoring customer health.",
            };

        await prisma.insightRun.create({
            data: {
                workspaceId:
                    args.workspaceId,

                type: runType,

                result: {
                    promptVersion:
                        PROMPT_VERSION,

                    timeframe,

                    source,

                    input: payload,

                    rawModelOutput:
                        content,

                    insights,

                    actions,

                    operationalSummary,

                    businessNarrative: safeBusinessNarrative,

                    executiveSummary,

                    aiUsage: {
                        limit:
                            usageDecision.limit,

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
                completion.usage
                    ?.prompt_tokens ?? 0,

            tokensOut:
                completion.usage
                    ?.completion_tokens ??
                0,
        }).catch(() => null);

        return {
            insights,

            actions,

            operationalSummary,

            businessNarrative: safeBusinessNarrative,

            executiveSummary,

            cached: false,

            source,

            timeframe,

            promptVersion:
                PROMPT_VERSION,
        };
    } catch (err) {
        console.error("[OpenAI insights failed]", err);

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