import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import {
    AuthError,
    getWorkspaceFromRequest,
} from "@/lib/auth/getWorkspaceFromRequest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type QueueType =
    | "immediate_attention"
    | "billing_recovery"
    | "upsell_opportunity"
    | "reactivation"
    | "expansion_momentum";

type RecoveryRow = {
    id: string;
    customerId?: string | null;
    accountRiskId?: string | null;
    type: QueueType;
    priority: string;
    name: string;
    email?: string | null;
    reason: string;
    action: string;
    valueMinor: number;
    confidence: number;
    lastEventAt?: string | null;
    score?: number;
    forecastImpactPct?: number;
    opportunity?: string;
    whyNow?: string;
    suggestedAction?: string;
    context?: Record<string, unknown>;
};

const openai = process.env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;

function jsonError(message: string, status = 400) {
    return NextResponse.json({ ok: false, error: message }, { status });
}

function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

function monthKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function daysAgo(days: number) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date;
}

function toMinorFromMajor(value: number | null | undefined) {
    return Math.round(Number(value || 0) * 100);
}

function daysSince(date?: Date | string | null) {
    if (!date) return null;

    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return null;

    return Math.max(
        0,
        Math.floor((Date.now() - parsed.getTime()) / (1000 * 60 * 60 * 24))
    );
}

function normaliseRisk(value: number) {
    if (!Number.isFinite(value)) return 0;
    if (value > 1) return clamp(value, 0, 100) / 100;
    return clamp(value, 0, 1);
}

function inferUsageTrend(args: {
    churnRisk: number;
    daysInactive: number | null;
    healthScore: number | null;
}) {
    if (
        (args.daysInactive ?? 0) >= 14 ||
        args.churnRisk >= 0.7 ||
        (args.healthScore ?? 100) < 45
    ) {
        return "down";
    }

    if (args.churnRisk <= 0.3 && (args.healthScore ?? 0) >= 75) {
        return "up";
    }

    return "flat";
}

function inferEngagementScore(args: {
    daysInactive: number | null;
    healthScore: number | null;
    churnRisk: number;
}) {
    const inactivePenalty = Math.min(40, (args.daysInactive ?? 0) * 1.5);
    const churnPenalty = args.churnRisk * 35;
    const healthBoost = (args.healthScore ?? 50) * 0.45;

    return clamp(
        Math.round(100 - inactivePenalty - churnPenalty + healthBoost),
        0,
        100
    );
}

function inferRecentLoginCount(daysInactive: number | null) {
    if (daysInactive === null) return 0;
    if (daysInactive <= 2) return 14;
    if (daysInactive <= 5) return 9;
    if (daysInactive <= 10) return 5;
    if (daysInactive <= 20) return 2;
    return 0;
}

function buildReasonFlags(args: {
    churnRisk: number;
    healthScore: number | null;
    daysInactive: number | null;
    failedInvoiceCount: number;
    usageTrend: "up" | "down" | "flat";
    engagementScore: number;
    recentLoginCount: number;
    supportTicketCount: number;
}) {
    const flags: string[] = [];

    if (args.churnRisk >= 0.8) flags.push("high_churn");
    if ((args.healthScore ?? 100) < 40) flags.push("low_health");
    if ((args.daysInactive ?? 0) >= 14) flags.push("inactive_14d");
    if ((args.daysInactive ?? 0) >= 21) flags.push("inactive_21d");
    if ((args.daysInactive ?? 0) >= 30) flags.push("inactive_30d");
    if (args.failedInvoiceCount > 0) flags.push("billing_failed_recent");
    if (args.usageTrend === "down") flags.push("usage_declining");
    if (args.engagementScore <= 35) flags.push("low_engagement");
    if (args.recentLoginCount <= 1) flags.push("minimal_logins");
    if (args.supportTicketCount >= 3) flags.push("support_friction");

    return flags;
}

function buildRiskAction(reason: string, riskScore: number) {
    const text = reason.toLowerCase();

    if (
        text.includes("payment") ||
        text.includes("billing") ||
        text.includes("invoice") ||
        text.includes("failed")
    ) {
        return "Retry payment and send billing recovery email";
    }

    if (
        text.includes("inactive") ||
        text.includes("usage") ||
        text.includes("engagement") ||
        text.includes("health")
    ) {
        return "Send usage recovery email and offer onboarding support";
    }

    if (text.includes("renewal") || text.includes("contract")) {
        return "Schedule renewal check-in with decision maker";
    }

    if (text.includes("downgrade") || text.includes("plan")) {
        return "Send downgrade prevention offer";
    }

    if (riskScore >= 85) return "Escalate urgent retention outreach";

    return "Send personalised retention email";
}

function priorityFromScore(score: number) {
    if (score >= 85) return "Critical";
    if (score >= 70) return "High";
    if (score >= 50) return "Medium";
    return "Low";
}

function buildFallbackOpportunity(type: QueueType) {
    if (type === "billing_recovery") return "Revenue recovery";
    if (type === "upsell_opportunity") return "Expansion opportunity";
    if (type === "reactivation") return "Reactivation";
    if (type === "expansion_momentum") return "Expansion momentum";
    return "Retention recovery";
}

function buildFallbackWhyNow(row: RecoveryRow) {
    if (row.type === "billing_recovery") {
        return `${row.name} has overdue revenue that should be recovered before the account becomes harder to retain.`;
    }

    if (row.type === "upsell_opportunity") {
        return `${row.name} is showing strong health signals, making this a good moment to explore expansion.`;
    }

    if (row.type === "reactivation") {
        return `${row.name} is inactive or no longer active, so quick re-engagement may help recover revenue.`;
    }

    if (row.type === "expansion_momentum") {
        return `${row.name} increased MRR this month, which may indicate room for further expansion.`;
    }

    return `${row.name} has elevated risk signals and represents revenue that may need immediate attention.`;
}

function normaliseAiText(value: unknown, fallback: string) {
    if (typeof value !== "string") return fallback;
    const cleaned = value.trim();
    return cleaned.length ? cleaned : fallback;
}

async function enrichRowsWithOpenAi(args: {
    rows: RecoveryRow[];
    currency: string | null;
    currentMrrMinor: number;
    forecastMrrMinor: number;
    revenueGapMinor: number;
}) {
    const { rows, currency, currentMrrMinor, forecastMrrMinor, revenueGapMinor } =
        args;

    const rowsWithFallback = rows.map((row) => ({
        ...row,
        opportunity: row.opportunity || buildFallbackOpportunity(row.type),
        whyNow: row.whyNow || buildFallbackWhyNow(row),
        suggestedAction: row.suggestedAction || row.action,
    }));

    if (!openai || !rowsWithFallback.length) return rowsWithFallback;

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            temperature: 0.45,
            response_format: { type: "json_object" },
            messages: [
                {
                    role: "developer",
                    content: `
You are Cobrai, an AI revenue recovery copilot for B2B SaaS founders.

For every account, write founder-facing insight for a Revenue Recovery Queue.

Return:
- opportunity: short label, max 4 words
- whyNow: specific explanation of what is happening, why it matters, and the revenue implication
- suggestedAction: specific next step tied to the signal

Rules:
- Use only supplied data.
- Do not invent usage, renewals, calls, seats, revenue, emails, or customer behaviour.
- Do not expose robotic labels like "low_health" or "inactive_14d".
- Do not say "health score" unless it genuinely helps the explanation.
- Keep whyNow under 30 words.
- Keep suggestedAction under 24 words.
- Make every row feel different when the signal is different.
- Use the supplied currency code if money is mentioned.
- Return strict JSON only.

Shape:
{
  "rows": [
    {
      "id": "string",
      "opportunity": "string",
      "whyNow": "string",
      "suggestedAction": "string"
    }
  ]
}
`,
                },
                {
                    role: "user",
                    content: JSON.stringify({
                        currency,
                        currentMrrMinor,
                        forecastMrrMinor,
                        revenueGapMinor,
                        rows: rowsWithFallback.slice(0, 15).map((row) => ({
                            id: row.id,
                            accountName: row.name,
                            type: row.type,
                            priority: row.priority,
                            reason: row.reason,
                            ruleBasedAction: row.action,
                            valueMinor: row.valueMinor,
                            confidence: row.confidence,
                            forecastImpactPct: row.forecastImpactPct,
                            lastEventAt: row.lastEventAt,
                            context: row.context || {},
                        })),
                    }),
                },
            ],
        });

        const content = completion.choices[0]?.message?.content || "{}";
        const parsed = JSON.parse(content) as {
            rows?: Array<{
                id?: string;
                opportunity?: string;
                whyNow?: string;
                suggestedAction?: string;
            }>;
        };

        const aiById = new Map(
            (parsed.rows || [])
                .filter((row) => row.id)
                .map((row) => [row.id as string, row])
        );

        return rowsWithFallback.map((row) => {
            const ai = aiById.get(row.id);

            return {
                ...row,
                opportunity: normaliseAiText(
                    ai?.opportunity,
                    row.opportunity || buildFallbackOpportunity(row.type)
                ),
                whyNow: normaliseAiText(
                    ai?.whyNow,
                    row.whyNow || buildFallbackWhyNow(row)
                ),
                suggestedAction: normaliseAiText(
                    ai?.suggestedAction,
                    row.suggestedAction || row.action
                ),
            };
        });
    } catch (error) {
        console.error("[OpenAI revenue recovery enrichment failed]", error);
        return rowsWithFallback;
    }
}

export async function GET(req: NextRequest) {
    try {
        const auth = await getWorkspaceFromRequest(req);

        const workspace = await prisma.workspace.findUnique({
            where: { id: auth.workspaceId },
            select: {
                id: true,
                currency: true,
                demoMode: true,
            },
        });

        if (!workspace) return jsonError("Workspace not found", 404);

        const currentMonth = monthKey();
        const previousMonth = monthKey(
            new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)
        );

        const [
            accountRisks,
            overdueInvoices,
            inactiveCustomers,
            healthyCustomers,
            currentMrrAgg,
            latestSnapshot,
            currentSnapshots,
            previousSnapshots,
        ] = await Promise.all([
            prisma.accountRisk.findMany({
                where: {
                    workspaceId: workspace.id,
                    isDemo: workspace.demoMode,
                    riskScore: { gte: 45 },
                },
                select: {
                    id: true,
                    customerId: true,
                    companyName: true,
                    riskScore: true,
                    reasonLabel: true,
                    reasonKey: true,
                    mrr: true,
                    updatedAt: true,
                    previousRiskScore: true,
                    previousUpdatedAt: true,
                    customer: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            mrr: true,
                            churnRisk: true,
                            healthScore: true,
                            lastActiveAt: true,
                            status: true,
                            updatedAt: true,
                            plan: true,
                            seats: true,
                        },
                    },
                },
                orderBy: [{ riskScore: "desc" }, { mrr: "desc" }],
                take: 80,
            }),

            prisma.invoice.findMany({
                where: {
                    workspaceId: workspace.id,
                    isDemo: workspace.demoMode,
                    paidAt: null,
                    status: { notIn: ["paid", "void", "refunded"] },
                    dueAt: { lte: new Date() },
                },
                select: {
                    id: true,
                    amount: true,
                    status: true,
                    dueAt: true,
                    customerId: true,
                    customer: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            status: true,
                        },
                    },
                },
                orderBy: { amount: "desc" },
                take: 50,
            }),

            prisma.customer.findMany({
                where: {
                    workspaceId: workspace.id,
                    isDemo: workspace.demoMode,
                    OR: [
                        { status: { in: ["cancelled", "canceled", "inactive"] } },
                        { lastActiveAt: { lt: daysAgo(30) } },
                    ],
                },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    mrr: true,
                    churnRisk: true,
                    healthScore: true,
                    lastActiveAt: true,
                    status: true,
                    updatedAt: true,
                    plan: true,
                    seats: true,
                },
                orderBy: { mrr: "desc" },
                take: 50,
            }),

            prisma.customer.findMany({
                where: {
                    workspaceId: workspace.id,
                    isDemo: workspace.demoMode,
                    status: "active",
                    churnRisk: { lt: 45 },
                    healthScore: { gte: 70 },
                    mrr: { gt: 0 },
                },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    mrr: true,
                    churnRisk: true,
                    healthScore: true,
                    lastActiveAt: true,
                    updatedAt: true,
                    plan: true,
                    seats: true,
                },
                orderBy: [{ healthScore: "desc" }, { mrr: "desc" }],
                take: 50,
            }),

            prisma.mrrSnapshot.aggregate({
                where: {
                    workspaceId: workspace.id,
                    month: currentMonth,
                    active: true,
                },
                _sum: { mrrMinor: true },
            }),

            prisma.workspaceAnalyticsSnapshot.findFirst({
                where: { workspaceId: workspace.id },
                orderBy: { snapshotDate: "desc" },
                select: {
                    totalMrr: true,
                    projectedMrr30d: true,
                    mrrAtRisk: true,
                    snapshotDate: true,
                },
            }),

            prisma.mrrSnapshot.findMany({
                where: {
                    workspaceId: workspace.id,
                    month: currentMonth,
                    active: true,
                },
                select: {
                    stripeCustomerId: true,
                    mrrMinor: true,
                    customer: {
                        select: {
                            id: true,
                            email: true,
                            name: true,
                        },
                    },
                },
            }),

            prisma.mrrSnapshot.findMany({
                where: {
                    workspaceId: workspace.id,
                    month: previousMonth,
                    active: true,
                },
                select: {
                    stripeCustomerId: true,
                    mrrMinor: true,
                },
            }),
        ]);

        const currentMrrMinor =
            Number(currentMrrAgg._sum.mrrMinor || 0) ||
            toMinorFromMajor(latestSnapshot?.totalMrr);

        const forecastMrrMinor =
            latestSnapshot?.projectedMrr30d && latestSnapshot.projectedMrr30d > 0
                ? toMinorFromMajor(latestSnapshot.projectedMrr30d)
                : Math.round(currentMrrMinor * 1.08);

        const revenueGapMinor = Math.max(0, forecastMrrMinor - currentMrrMinor);

        const queue = new Map<string, RecoveryRow>();

        function addRow(row: RecoveryRow) {
            if (!row.id || row.valueMinor <= 0) return;

            const confidence = clamp(Number(row.confidence || 0), 1, 99);
            const valueMinor = Math.round(Number(row.valueMinor || 0));
            const score = valueMinor * (confidence / 100);

            const existing = queue.get(row.id);
            const existingScore = existing
                ? existing.valueMinor * (existing.confidence / 100)
                : 0;

            if (!existing || score > existingScore) {
                queue.set(row.id, {
                    ...row,
                    valueMinor,
                    confidence,
                    score,
                });
            }
        }

        for (const risk of accountRisks) {
            const riskScore = clamp(Number(risk.riskScore || 0), 1, 99);
            const churnRisk = normaliseRisk(Number(risk.customer?.churnRisk || 0));
            const healthScore = risk.customer?.healthScore ?? null;
            const daysInactive = daysSince(risk.customer?.lastActiveAt);
            const usageTrend = inferUsageTrend({
                churnRisk,
                daysInactive,
                healthScore,
            });
            const engagementScore = inferEngagementScore({
                churnRisk,
                daysInactive,
                healthScore,
            });
            const recentLoginCount = inferRecentLoginCount(daysInactive);
            const supportTicketCount =
                churnRisk >= 0.75 || (healthScore ?? 100) < 45 ? 2 : 0;

            const reason =
                risk.reasonLabel ||
                risk.reasonKey ||
                "Customer needs immediate attention";

            const valueMinor =
                toMinorFromMajor(risk.mrr) ||
                Number(risk.customer?.mrr || 0);

            addRow({
                id: risk.customerId || risk.id,
                customerId: risk.customerId,
                accountRiskId: risk.id,
                type: "immediate_attention",
                priority: priorityFromScore(riskScore),
                name: risk.customer?.name || risk.companyName || "Unnamed account",
                email: risk.customer?.email || null,
                reason,
                action: buildRiskAction(reason, riskScore),
                valueMinor,
                confidence: clamp(riskScore, 45, 96),
                lastEventAt:
                    risk.customer?.lastActiveAt?.toISOString?.() ||
                    risk.updatedAt.toISOString(),
                context: {
                    riskScore,
                    previousRiskScore: risk.previousRiskScore,
                    reasonKey: risk.reasonKey,
                    churnRisk,
                    healthScore,
                    daysInactive,
                    usageTrend,
                    engagementScore,
                    recentLoginCount,
                    supportTicketCount,
                    status: risk.customer?.status,
                    plan: risk.customer?.plan,
                    seats: risk.customer?.seats,
                    customerMrrMinor: Number(risk.customer?.mrr || 0),
                },
            });
        }

        for (const invoice of overdueInvoices) {
            if (!invoice.customer?.id) continue;

            const overdueDays = Math.max(
                1,
                Math.floor(
                    (Date.now() - new Date(invoice.dueAt).getTime()) /
                    (1000 * 60 * 60 * 24)
                )
            );

            const amountMinor = Number(invoice.amount || 0);
            const amountBoost = amountMinor >= 50000 ? 8 : amountMinor >= 10000 ? 4 : 0;

            addRow({
                id: invoice.customer.id,
                customerId: invoice.customer.id,
                type: "billing_recovery",
                priority:
                    overdueDays >= 14 || amountMinor >= 50000 ? "Critical" : "High",
                name: invoice.customer.name || "Unnamed account",
                email: invoice.customer.email,
                reason: `Overdue invoice for ${overdueDays} day${overdueDays === 1 ? "" : "s"
                    }`,
                action: "Retry payment and send billing recovery email",
                valueMinor: amountMinor,
                confidence: clamp(78 + Math.min(overdueDays, 15) + amountBoost, 80, 96),
                lastEventAt: invoice.dueAt.toISOString(),
                context: {
                    invoiceStatus: invoice.status,
                    overdueDays,
                    overdueAmountMinor: amountMinor,
                    customerStatus: invoice.customer.status,
                    lastPaymentStatus: "failed",
                    recentBillingFailure: true,
                },
            });
        }

        for (const customer of inactiveCustomers) {
            const valueMinor = Number(customer.mrr || 0);
            const churnRisk = normaliseRisk(Number(customer.churnRisk || 50));
            const healthScore = customer.healthScore ?? null;
            const daysInactive = daysSince(customer.lastActiveAt);
            const usageTrend = inferUsageTrend({
                churnRisk,
                daysInactive,
                healthScore,
            });
            const engagementScore = inferEngagementScore({
                churnRisk,
                daysInactive,
                healthScore,
            });
            const recentLoginCount = inferRecentLoginCount(daysInactive);

            addRow({
                id: customer.id,
                customerId: customer.id,
                type: "reactivation",
                priority: valueMinor >= 50000 || churnRisk >= 0.8 ? "High" : "Medium",
                name: customer.name || "Unnamed account",
                email: customer.email,
                reason:
                    customer.status !== "active"
                        ? "Customer is no longer active"
                        : "Customer has been inactive for 30+ days",
                action: "Send reactivation email with a clear next step",
                valueMinor,
                confidence: clamp(Math.round(churnRisk * 100), 50, 85),
                lastEventAt:
                    customer.lastActiveAt?.toISOString?.() ||
                    customer.updatedAt.toISOString(),
                context: {
                    churnRisk,
                    healthScore,
                    daysInactive,
                    usageTrend,
                    engagementScore,
                    recentLoginCount,
                    status: customer.status,
                    plan: customer.plan,
                    seats: customer.seats,
                    customerMrrMinor: valueMinor,
                },
            });
        }

        for (const customer of healthyCustomers) {
            const baseMrrMinor = Number(customer.mrr || 0);
            const healthScore = Number(customer.healthScore || 70);
            const churnRisk = normaliseRisk(Number(customer.churnRisk || 0));
            const daysInactive = daysSince(customer.lastActiveAt);
            const usageTrend = inferUsageTrend({
                churnRisk,
                daysInactive,
                healthScore,
            });
            const engagementScore = inferEngagementScore({
                churnRisk,
                daysInactive,
                healthScore,
            });

            const upsideMultiplier = clamp(healthScore / 100, 0.7, 0.95) * 0.3;
            const valueMinor = Math.round(baseMrrMinor * upsideMultiplier);

            addRow({
                id: customer.id,
                customerId: customer.id,
                type: "upsell_opportunity",
                priority: healthScore >= 85 || baseMrrMinor >= 50000 ? "High" : "Medium",
                name: customer.name || "Unnamed account",
                email: customer.email,
                reason: `Healthy account with ${healthScore}% health score`,
                action: "Offer annual upgrade, add-on, or seat expansion",
                valueMinor,
                confidence: clamp(healthScore, 65, 92),
                lastEventAt:
                    customer.lastActiveAt?.toISOString?.() ||
                    customer.updatedAt.toISOString(),
                context: {
                    healthScore,
                    churnRisk,
                    daysInactive,
                    usageTrend,
                    engagementScore,
                    status: "active",
                    plan: customer.plan,
                    seats: customer.seats,
                    customerMrrMinor: baseMrrMinor,
                    estimatedExpansionMinor: valueMinor,
                },
            });
        }

        const previousByStripeCustomer = new Map(
            previousSnapshots.map((snapshot) => [
                snapshot.stripeCustomerId,
                Number(snapshot.mrrMinor || 0),
            ])
        );

        for (const snapshot of currentSnapshots) {
            const previous = previousByStripeCustomer.get(snapshot.stripeCustomerId) || 0;
            const current = Number(snapshot.mrrMinor || 0);
            const delta = current - previous;

            if (delta <= 0) continue;

            addRow({
                id: snapshot.customer?.id || snapshot.stripeCustomerId,
                customerId: snapshot.customer?.id || null,
                type: "expansion_momentum",
                priority: delta >= 50000 ? "High" : "Medium",
                name:
                    snapshot.customer?.name ||
                    snapshot.customer?.email ||
                    "Stripe customer",
                email: snapshot.customer?.email || null,
                reason: "MRR increased this month",
                action: "Follow up and look for expansion momentum",
                valueMinor: delta,
                confidence: delta >= 50000 ? 86 : 74,
                lastEventAt: new Date().toISOString(),
                context: {
                    previousMrrMinor: previous,
                    currentMrrMinor: current,
                    mrrIncreaseMinor: delta,
                },
            });
        }

        const rows = Array.from(queue.values())
            .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
            .map(({ score, ...row }) => ({
                ...row,
                forecastImpactPct:
                    revenueGapMinor > 0
                        ? Math.min(
                            100,
                            Math.round((row.valueMinor / revenueGapMinor) * 100)
                        )
                        : 0,
            }));

        let runningTotal = 0;

        const selectedRows = rows.filter((row, index) => {
            if (revenueGapMinor <= 0) return index < 12;
            if (runningTotal >= revenueGapMinor) return false;

            runningTotal += row.valueMinor;
            return true;
        });

        const selectedCustomerIds = selectedRows
            .map((row) => row.customerId)
            .filter((id): id is string => Boolean(id));

        const [recentHealthSnapshots, recentEvents, recentTimelineEvents] =
            selectedCustomerIds.length
                ? await Promise.all([
                    prisma.customerHealthSnapshot.findMany({
                        where: {
                            workspaceId: workspace.id,
                            customerId: { in: selectedCustomerIds },
                        },
                        orderBy: { snapshotDate: "desc" },
                        take: selectedCustomerIds.length * 3,
                        select: {
                            customerId: true,
                            snapshotDate: true,
                            healthScore: true,
                            churnRisk: true,
                            mrrMinor: true,
                            engagementScore: true,
                            productUsageScore: true,
                            billingScore: true,
                            supportScore: true,
                            activeDays7d: true,
                            activeDays30d: true,
                        },
                    }),

                    prisma.event.findMany({
                        where: {
                            workspaceId: workspace.id,
                            customerId: { in: selectedCustomerIds },
                            occurredAt: { gte: daysAgo(45) },
                        },
                        orderBy: { occurredAt: "desc" },
                        take: selectedCustomerIds.length * 5,
                        select: {
                            customerId: true,
                            type: true,
                            value: true,
                            occurredAt: true,
                        },
                    }),

                    prisma.accountTimelineEvent.findMany({
                        where: {
                            workspaceId: workspace.id,
                            customerId: { in: selectedCustomerIds },
                        },
                        orderBy: { createdAt: "desc" },
                        take: selectedCustomerIds.length * 3,
                        select: {
                            customerId: true,
                            type: true,
                            title: true,
                            description: true,
                            severity: true,
                            source: true,
                            createdAt: true,
                        },
                    }),
                ])
                : [[], [], []];

        const healthByCustomer = new Map<string, typeof recentHealthSnapshots>();
        const eventsByCustomer = new Map<string, typeof recentEvents>();
        const timelineByCustomer = new Map<string, typeof recentTimelineEvents>();

        for (const snapshot of recentHealthSnapshots) {
            const current = healthByCustomer.get(snapshot.customerId) || [];
            current.push(snapshot);
            healthByCustomer.set(snapshot.customerId, current);
        }

        for (const event of recentEvents) {
            const current = eventsByCustomer.get(event.customerId) || [];
            current.push(event);
            eventsByCustomer.set(event.customerId, current);
        }

        for (const event of recentTimelineEvents) {
            const current = timelineByCustomer.get(event.customerId) || [];
            current.push(event);
            timelineByCustomer.set(event.customerId, current);
        }

        const rowsWithRicherContext = selectedRows.map((row) => {
            if (!row.customerId) return row;

            const healthSnapshots = healthByCustomer.get(row.customerId) || [];
            const events = eventsByCustomer.get(row.customerId) || [];
            const timelineEvents = timelineByCustomer.get(row.customerId) || [];

            const latestHealth = healthSnapshots[0];
            const previousHealth = healthSnapshots[1];

            return {
                ...row,
                context: {
                    ...(row.context || {}),
                    latestHealthSnapshot: latestHealth
                        ? {
                            snapshotDate: latestHealth.snapshotDate.toISOString(),
                            healthScore: latestHealth.healthScore,
                            churnRisk: latestHealth.churnRisk,
                            mrrMinor: latestHealth.mrrMinor,
                            engagementScore: latestHealth.engagementScore,
                            productUsageScore: latestHealth.productUsageScore,
                            billingScore: latestHealth.billingScore,
                            supportScore: latestHealth.supportScore,
                            activeDays7d: latestHealth.activeDays7d,
                            activeDays30d: latestHealth.activeDays30d,
                        }
                        : null,
                    previousHealthSnapshot: previousHealth
                        ? {
                            snapshotDate: previousHealth.snapshotDate.toISOString(),
                            healthScore: previousHealth.healthScore,
                            churnRisk: previousHealth.churnRisk,
                            mrrMinor: previousHealth.mrrMinor,
                            engagementScore: previousHealth.engagementScore,
                            productUsageScore: previousHealth.productUsageScore,
                            billingScore: previousHealth.billingScore,
                            supportScore: previousHealth.supportScore,
                            activeDays7d: previousHealth.activeDays7d,
                            activeDays30d: previousHealth.activeDays30d,
                        }
                        : null,
                    recentEvents: events.slice(0, 5).map((event) => ({
                        type: event.type,
                        value: event.value,
                        occurredAt: event.occurredAt.toISOString(),
                    })),
                    recentTimelineEvents: timelineEvents.slice(0, 3).map((event) => ({
                        type: event.type,
                        title: event.title,
                        description: event.description,
                        severity: event.severity,
                        source: event.source,
                        createdAt: event.createdAt.toISOString(),
                    })),
                },
            };
        });

        const enrichedRows = await enrichRowsWithOpenAi({
            rows: rowsWithRicherContext,
            currency: workspace.currency,
            currentMrrMinor,
            forecastMrrMinor,
            revenueGapMinor,
        });

        const publicRows = enrichedRows.map(({ context, ...row }) => row);

        const potentialRecoveryMinor = publicRows.reduce(
            (sum, row) => sum + row.valueMinor,
            0
        );

        const typeCounts = publicRows.reduce<Record<string, number>>((acc, row) => {
            acc[row.type] = (acc[row.type] || 0) + 1;
            return acc;
        }, {});
        console.log(
            "ENRICHED ROW SAMPLE",
            enrichedRows[0]
        );
        return NextResponse.json({
            ok: true,
            currency: workspace.currency,
            currentMrrMinor,
            forecastMrrMinor,
            revenueGapMinor,
            potentialRecoveryMinor,
            recoveryCoveragePct:
                revenueGapMinor > 0
                    ? Math.min(
                        100,
                        Math.round((potentialRecoveryMinor / revenueGapMinor) * 100)
                    )
                    : 100,
            typeCounts,
            rows: publicRows,
            generatedAt: new Date().toISOString(),
        });
    } catch (error) {
        if (error instanceof AuthError) {
            return jsonError(error.message, error.status);
        }

        console.error("Revenue recovery queue error:", error);
        return jsonError("Failed to load revenue recovery queue", 500);
    }
}