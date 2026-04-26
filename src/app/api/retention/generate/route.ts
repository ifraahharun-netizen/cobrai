export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { verifyFirebaseIdToken } from "@/lib/firebaseAdmin";

type Tier = "starter" | "pro" | "scale";

function bearer(req: Request) {
    const auth = req.headers.get("authorization") || "";
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (!m) throw new Error("Unauthorized");
    return m[1];
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
    try {
        // 1) Auth
        const token = bearer(req);
        const decoded = await verifyFirebaseIdToken(token);

        const user = await prisma.user.findUnique({
            where: { firebaseUid: decoded.uid },
            select: { id: true, workspaceId: true },
        });

        if (!user?.workspaceId) {
            return NextResponse.json({ ok: false, error: "No workspace for this user" }, { status: 401 });
        }

        const workspaceId = user.workspaceId;

        // 2) Body
        const body = await req.json().catch(() => ({} as any));
        const tier: Tier = body?.tier ?? "starter";

        // 3) Fetch customers (REAL) – keep loose so TS doesn’t fight you
        const customers: any[] = await prisma.customer.findMany({
            where: { workspaceId },
            take: 50,
        });

        if (!customers.length) {
            return NextResponse.json({ ok: false, error: "No customers found for this workspace." }, { status: 400 });
        }

        // 4) REAL AI: Generate structured plan
        const plan = await generateWithOpenAI({ customers, tier });

        // 5) Enforce tier server-side (real)
        if (tier === "starter") {
            plan.actions = plan.actions.slice(0, 2);
        }

        // 6) Save plan + actions (RELATION create)
        const saved = await prisma.retentionPlan.create({
            data: {
                workspaceId,
                createdById: user.id,
                name: plan.name,
                goal: plan.goal,
                steps: plan.steps, // Json (array of strings)
                reasoning: plan.reasoning ?? null,
                suggested: plan.suggestedPlans ?? null, // Json? (array)
                status: "ready",
                actions: {
                    create: plan.actions.map((a) => ({
                        customerId: a.customerId ?? null,
                        customerName: a.customerName ?? null,
                        title: a.title,
                        reason: a.reason,
                        priority: a.priority,
                        type: a.type,
                        payload: a.payload ?? undefined,
                        status: "pending",
                    })),
                },
            },
            include: { actions: true },
        });

        return NextResponse.json({ ok: true, plan: saved });
    } catch (err: any) {
        console.error("Retention generate error:", err);
        return NextResponse.json(
            { ok: false, error: err?.message ?? "Failed to generate retention plan" },
            { status: err?.message === "Unauthorized" ? 401 : 500 }
        );
    }
}

/**
 * REAL AI generator using OpenAI Responses API + Structured Outputs (json_schema)
 * - Always returns valid JSON for your DB write
 * - Grounded on your actual customers slice (no fake customers)
 */
async function generateWithOpenAI(input: { customers: any[]; tier: Tier }) {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error("Missing OPENAI_API_KEY");
    }

    // Keep customer context small (avoid sending huge data / PII)
    const compactCustomers = input.customers.slice(0, 25).map((c) => ({
        id: c.id ?? null,
        name: c.companyName ?? c.name ?? c.company ?? c.orgName ?? null,
        riskScore: c.riskScore ?? c.churnRisk ?? c.risk ?? null,
        healthScore: c.healthScore ?? null,
        mrr: c.mrr ?? null,
        updatedAt: c.updatedAt ?? null,
        reason: c.reason ?? c.churnReason ?? null,
    }));

    const schema = {
        name: "cobrai_retention_plan_v1",
        strict: true,
        schema: {
            type: "object",
            additionalProperties: false,
            properties: {
                name: { type: "string" },
                goal: { type: "string" },
                steps: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 8 },
                reasoning: { type: "string" },
                suggestedPlans: {
                    type: "array",
                    minItems: 2,
                    maxItems: 5,
                    items: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                            name: { type: "string" },
                            why: { type: "string" },
                        },
                        required: ["name", "why"],
                    },
                },
                actions: {
                    type: "array",
                    minItems: 2,
                    maxItems: 10,
                    items: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                            customerId: { anyOf: [{ type: "string" }, { type: "null" }] },
                            customerName: { anyOf: [{ type: "string" }, { type: "null" }] },
                            title: { type: "string" },
                            reason: { type: "string" },
                            priority: { type: "string", enum: ["High", "Medium", "Low"] },
                            type: { type: "string", enum: ["email", "inapp_nudge", "webhook", "hubspot_task", "stripe_retry"] },
                            payload: { anyOf: [{ type: "object" }, { type: "null" }] },
                        },
                        required: ["title", "reason", "priority", "type"],
                    },
                },
            },
            required: ["name", "goal", "steps", "reasoning", "suggestedPlans", "actions"],
        },
    };

    const resp = await openai.responses.create({
        // Pick a general model. You can upgrade later.
        model: "gpt-4o-mini",
        instructions:
            "You are Cobrai's Retention Copilot. Generate a practical retention plan and actions grounded ONLY in the provided customer signals. Do not invent customers or metrics. If data is missing, choose actions that don't require missing fields (e.g., in-app nudge instead of email). Keep actions specific and customer-linked when possible.",
        input: [
            {
                role: "user",
                content: `Tier: ${input.tier}\nCustomers (compact JSON):\n${JSON.stringify(compactCustomers)}`,
            },
        ],
        // Structured outputs via json_schema in Responses API :contentReference[oaicite:2]{index=2}
        text: {
            format: {
                type: "json_schema",
                json_schema: schema,
            } as any,
        },
        // keep output bounded so it doesn't get truncated
        max_output_tokens: 900,
    });

    // Responses API provides output_text (SDK flattens text output)
    const raw = (resp as any).output_text as string | undefined;
    if (!raw) throw new Error("OpenAI returned no output_text");

    let parsed: any;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new Error("OpenAI output was not valid JSON");
    }

    // Normalise + safety fallbacks
    const plan = {
        name: String(parsed.name ?? "Retention Plan"),
        goal: String(parsed.goal ?? "Reduce churn risk"),
        steps: Array.isArray(parsed.steps) ? parsed.steps.map((s: any) => String(s)).slice(0, 8) : [],
        reasoning: String(parsed.reasoning ?? ""),
        suggestedPlans: Array.isArray(parsed.suggestedPlans) ? parsed.suggestedPlans : [],
        actions: Array.isArray(parsed.actions) ? parsed.actions : [],
    };

    if (!plan.steps.length) throw new Error("AI did not return steps");
    if (plan.actions.length < 1) throw new Error("AI did not return actions");

    return plan as {
        name: string;
        goal: string;
        steps: string[];
        reasoning: string;
        suggestedPlans: Array<{ name: string; why: string }>;
        actions: Array<{
            customerId?: string | null;
            customerName?: string | null;
            title: string;
            reason: string;
            priority: "High" | "Medium" | "Low";
            type: "email" | "inapp_nudge" | "webhook" | "hubspot_task" | "stripe_retry";
            payload?: any | null;
        }>;
    };
}
