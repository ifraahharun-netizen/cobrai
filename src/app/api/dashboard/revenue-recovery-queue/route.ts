import { NextRequest, NextResponse } from "next/server";
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

        const queue = new Map<string, any>();

        function addRow(row: {
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
        }) {
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
                reason: `Overdue invoice for ${overdueDays} day${overdueDays === 1 ? "" : "s"}`,
                action: "Retry payment and send billing recovery email",
                valueMinor: amountMinor,
                confidence: clamp(78 + Math.min(overdueDays, 15) + amountBoost, 80, 96),
                lastEventAt: invoice.dueAt.toISOString(),
            });
        }

        for (const customer of inactiveCustomers) {
            const valueMinor = Number(customer.mrr || 0);
            const churnRisk = Number(customer.churnRisk || 50);

            addRow({
                id: customer.id,
                customerId: customer.id,
                type: "reactivation",
                priority: valueMinor >= 50000 || churnRisk >= 80 ? "High" : "Medium",
                name: customer.name || "Unnamed account",
                email: customer.email,
                reason:
                    customer.status !== "active"
                        ? "Customer is no longer active"
                        : "Customer has been inactive for 30+ days",
                action: "Send reactivation email with a clear next step",
                valueMinor,
                confidence: clamp(Math.round(churnRisk), 50, 85),
                lastEventAt:
                    customer.lastActiveAt?.toISOString?.() ||
                    customer.updatedAt.toISOString(),
            });
        }

        for (const customer of healthyCustomers) {
            const baseMrrMinor = Number(customer.mrr || 0);
            const healthScore = Number(customer.healthScore || 70);

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
            });
        }

        const rows = Array.from(queue.values())
            .sort((a, b) => b.score - a.score)
            .map(({ score, ...row }) => ({
                ...row,
                forecastImpactPct:
                    revenueGapMinor > 0
                        ? Math.min(100, Math.round((row.valueMinor / revenueGapMinor) * 100))
                        : 0,
            }));

        let runningTotal = 0;

        const selectedRows = rows.filter((row, index) => {
            if (revenueGapMinor <= 0) return index < 12;
            if (runningTotal >= revenueGapMinor) return false;

            runningTotal += row.valueMinor;
            return true;
        });

        const potentialRecoveryMinor = selectedRows.reduce(
            (sum, row) => sum + row.valueMinor,
            0
        );

        const typeCounts = selectedRows.reduce<Record<string, number>>((acc, row) => {
            acc[row.type] = (acc[row.type] || 0) + 1;
            return acc;
        }, {});

        return NextResponse.json({
            ok: true,
            currency: workspace.currency,
            currentMrrMinor,
            forecastMrrMinor,
            revenueGapMinor,
            potentialRecoveryMinor,
            recoveryCoveragePct:
                revenueGapMinor > 0
                    ? Math.min(100, Math.round((potentialRecoveryMinor / revenueGapMinor) * 100))
                    : 100,
            typeCounts,
            rows: selectedRows,
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