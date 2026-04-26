import OpenAI from "openai";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { buildCustomerFacts } from "./buildCustomerFacts";
import { buildFallbackInsights } from "./buildFallbackInsights";
import { cleanAndValidateInsights } from "./cleanAndValidateInsights";
import { buildRunType, PROMPT_VERSION } from "./buildRunType";
import type {
    AiResponse,
    Insight,
    InsightSource,
    WorkspaceInsightResult,
} from "./types";

const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const CACHE_MINUTES = 10;

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
        const cachedResult = cached.result as { insights?: Insight[] };

        return {
            insights: cachedResult?.insights ?? [],
            cached: true,
            source: "cache",
            timeframe,
            promptVersion: PROMPT_VERSION,
        };
    }

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
            customer: { select: { id: true, name: true } },
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
            allowedKinds: [
                "billing_failed",
                "inactive_user",
                "low_health",
                "high_churn",
                "general_summary",
                "no_action",
            ],
            allowedFocusIds: customerFacts.map((c) => c.id),
            grounding:
                "Use only facts explicitly present in customerFacts. Do not infer email opens, clicks, sentiment, payment recovery, product usage events, or intent unless provided.",
        },
    };

    const fallbackInsights = buildFallbackInsights(customerFacts);

    if (!process.env.OPENAI_API_KEY) {
        await prisma.insightRun.create({
            data: {
                workspaceId: args.workspaceId,
                type: runType,
                result: {
                    promptVersion: PROMPT_VERSION,
                    timeframe,
                    source: "fallback",
                    input: payload,
                    rawModelOutput: null,
                    insights: fallbackInsights,
                } as Prisma.InputJsonValue,
            },
        });

        return {
            insights: fallbackInsights,
            cached: false,
            source: "fallback",
            timeframe,
            promptVersion: PROMPT_VERSION,
        };
    }

    try {
        const completion = await client.chat.completions.create({
            model: "gpt-4o-mini",
            temperature: 0.2,
            messages: [
                {
                    role: "developer",
                    content:
                        "You generate retention insights for a SaaS dashboard. " +
                        "Return only structured data matching the required schema. " +
                        "Use only facts explicitly present in the input. " +
                        "Do not invent ids. " +
                        "Do not mention unsupported signals like email opens, clicks, sentiment, intent, or payment recovery unless explicitly present. " +
                        "If evidence is weak, use general_summary or no_action.",
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
                                            enum: [
                                                "billing_failed",
                                                "inactive_user",
                                                "low_health",
                                                "high_churn",
                                                "general_summary",
                                                "no_action",
                                            ],
                                        },
                                        title: { type: "string" },
                                        text: { type: "string" },
                                        focusId: { type: ["string", "null"] },
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
                                    },
                                    required: [
                                        "kind",
                                        "title",
                                        "text",
                                        "focusId",
                                        "confidence",
                                        "evidence",
                                    ],
                                },
                            },
                        },
                        required: ["insights"],
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
                } as Prisma.InputJsonValue,
            },
        });

        return {
            insights,
            cached: false,
            source,
            timeframe,
            promptVersion: PROMPT_VERSION,
        };
    } catch (err) {
        const insights = fallbackInsights;

        await prisma.insightRun.create({
            data: {
                workspaceId: args.workspaceId,
                type: runType,
                result: {
                    promptVersion: PROMPT_VERSION,
                    timeframe,
                    source: "fallback_after_error",
                    input: payload,
                    rawModelOutput: null,
                    insights,
                    error: err instanceof Error ? err.message : String(err),
                } as Prisma.InputJsonValue,
            },
        });

        return {
            insights,
            cached: false,
            source: "fallback_after_error",
            timeframe,
            promptVersion: PROMPT_VERSION,
        };
    }
}