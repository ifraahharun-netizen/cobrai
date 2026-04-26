import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthError, getWorkspaceFromRequest } from "@/lib/auth/getWorkspaceFromRequest";

type RiskLevel = "critical" | "high" | "medium" | "low";
type SortKey = "risk" | "mrr" | "updatedAt" | "lastActiveAt";
type SortDir = "asc" | "desc";

function riskLevelFromScore(score: number): RiskLevel {
    if (score >= 85) return "critical";
    if (score >= 70) return "high";
    if (score >= 50) return "medium";
    return "low";
}

function monthStart(date = new Date()) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

function previousMonthStart(date = new Date()) {
    return new Date(date.getFullYear(), date.getMonth() - 1, 1);
}

function previousMonthEnd(date = new Date()) {
    return new Date(date.getFullYear(), date.getMonth(), 0, 23, 59, 59, 999);
}

function pctDelta(current: number, previous: number) {
    if (!previous) return current ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
}

function absoluteDelta(current: number, previous: number) {
    return current - previous;
}

function scoreDeltaPct(current: number, previous: number) {
    if (!previous) return current ? 100 : 0;
    return Number((((current - previous) / previous) * 100).toFixed(1));
}

function buildSignals(args: {
    status?: string | null;
    lastActiveAt?: Date | null;
    recentFailedInvoices?: number;
    recentOverdueInvoices?: number;
}) {
    const signals: Array<{ key: string; label: string }> = [];
    const now = Date.now();

    if (typeof args.recentFailedInvoices === "number" && args.recentFailedInvoices > 0) {
        signals.push({ key: "billing_failed", label: "Payment failed" });
    }

    if (typeof args.recentOverdueInvoices === "number" && args.recentOverdueInvoices > 0) {
        signals.push({ key: "invoice_overdue", label: "Invoice overdue" });
    }

    if (args.lastActiveAt) {
        const days = Math.max(0, Math.floor((now - args.lastActiveAt.getTime()) / 86400000));
        if (days >= 30) {
            signals.push({ key: "inactive_30d", label: "Inactive 30+ days" });
        } else if (days >= 14) {
            signals.push({ key: "inactive_14d", label: "Low recent activity" });
        }
    }

    if ((args.status || "").toLowerCase() === "past_due") {
        signals.push({ key: "past_due", label: "Past due" });
    }

    return signals.slice(0, 3);
}

function nextActionFromReason(reasonKey: string, signals: Array<{ key: string; label: string }>) {
    const key = (reasonKey || "").toLowerCase();
    const signalKeys = signals.map((s) => s.key);

    if (key.includes("billing") || signalKeys.includes("billing_failed") || signalKeys.includes("invoice_overdue")) {
        return "Resolve billing issue + confirm billing contact today.";
    }

    if (key.includes("inactive") || signalKeys.includes("inactive_30d") || signalKeys.includes("inactive_14d")) {
        return "Reach out with a quick check-in + offer a 10-min walkthrough to re-activate usage.";
    }

    return "Send check-in email today.";
}

function parseSort(value: string | null): SortKey {
    if (value === "mrr" || value === "updatedAt" || value === "lastActiveAt") return value;
    return "risk";
}

function parseDir(value: string | null): SortDir {
    return value === "asc" ? "asc" : "desc";
}

export async function GET(req: Request) {
    try {
        const { workspaceId } = await getWorkspaceFromRequest(req);

        const url = new URL(req.url);
        const q = (url.searchParams.get("q") || "").trim();
        const sort = parseSort(url.searchParams.get("sort"));
        const dir = parseDir(url.searchParams.get("dir"));
        const page = Math.max(1, Number(url.searchParams.get("page") || "1"));
        const pageSize = Math.min(100, Math.max(5, Number(url.searchParams.get("pageSize") || "10")));
        const skip = (page - 1) * pageSize;
        const riskFilter = (url.searchParams.get("riskFilter") || "all").trim().toLowerCase();

        const baseSearchWhere: any = {
            workspaceId,
            ...(q
                ? {
                    OR: [
                        { companyName: { contains: q, mode: "insensitive" } },
                        { reasonLabel: { contains: q, mode: "insensitive" } },
                        { customer: { name: { contains: q, mode: "insensitive" } } },
                        { customer: { email: { contains: q, mode: "insensitive" } } },
                    ],
                }
                : {}),
        };

        const filteredWhere: any = { ...baseSearchWhere };

        if (riskFilter === "critical") {
            filteredWhere.riskScore = { gte: 85 };
        } else if (riskFilter === "high") {
            filteredWhere.riskScore = { gte: 70, lt: 85 };
        } else if (riskFilter === "moderate") {
            filteredWhere.riskScore = { gte: 50, lt: 70 };
        } else if (riskFilter === "low") {
            filteredWhere.riskScore = { lt: 50 };
        }

        const criticalWhere: any = {
            ...baseSearchWhere,
            riskScore: { gte: 85 },
        };

        const orderBy =
            sort === "mrr"
                ? [{ customer: { mrr: dir } }, { updatedAt: "desc" as const }]
                : sort === "lastActiveAt"
                    ? [{ customer: { lastActiveAt: dir } }, { updatedAt: "desc" as const }]
                    : sort === "updatedAt"
                        ? [{ updatedAt: dir }]
                        : [{ riskScore: dir }, { updatedAt: "desc" as const }];

        const [
            total,
            criticalTotal,
            rows,
            currentSummary,
            previousSummary,
            totalCustomers,
            previousTotalCustomers,
        ] = await Promise.all([
            prisma.accountRisk.count({ where: filteredWhere }),
            prisma.accountRisk.count({ where: criticalWhere }),
            prisma.accountRisk.findMany({
                where: filteredWhere,
                orderBy,
                skip,
                take: pageSize,
                include: {
                    customer: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            mrr: true,
                            plan: true,
                            status: true,
                            lastActiveAt: true,
                        },
                    },
                },
            }),
            prisma.accountRisk.aggregate({
                where: {
                    workspaceId,
                    updatedAt: { gte: monthStart() },
                },
                _count: { id: true },
                _sum: { mrr: true, riskScore: true },
                _avg: { riskScore: true },
            }),
            prisma.accountRiskSnapshot.aggregate({
                where: {
                    workspaceId,
                    snapshotDate: {
                        gte: previousMonthStart(),
                        lte: previousMonthEnd(),
                    },
                },
                _count: { id: true },
                _sum: { mrrMinor: true, riskScore: true },
                _avg: { riskScore: true },
            }),
            prisma.customer.count({
                where: { workspaceId },
            }),
            prisma.customer.count({
                where: {
                    workspaceId,
                    createdAt: { lte: previousMonthEnd() },
                },
            }),
        ]);

        const customerIds = rows.map((r) => r.customerId).filter(Boolean) as string[];

        const [invoiceGroups, openActions] = await Promise.all([
            prisma.invoice.groupBy({
                by: ["customerId", "status"],
                where: {
                    workspaceId,
                    customerId: { in: customerIds.length ? customerIds : ["__none__"] },
                },
                _count: { _all: true },
            }),
            prisma.action.findMany({
                where: {
                    workspaceId,
                    customerId: { in: customerIds.length ? customerIds : ["__none__"] },
                    done: false,
                },
                orderBy: { createdAt: "desc" },
                select: {
                    id: true,
                    customerId: true,
                    title: true,
                },
            }),
        ]);

        const invoiceMap = new Map<string, { failed: number; overdue: number }>();
        for (const item of invoiceGroups) {
            const current = invoiceMap.get(item.customerId) || { failed: 0, overdue: 0 };
            const status = (item.status || "").toLowerCase();

            if (status === "failed") current.failed += item._count._all;
            if (status === "open" || status === "past_due" || status === "overdue") current.overdue += item._count._all;

            invoiceMap.set(item.customerId, current);
        }

        const actionMap = new Map<string, string>();
        for (const action of openActions) {
            if (action.customerId && !actionMap.has(action.customerId)) {
                actionMap.set(action.customerId, action.title);
            }
        }

        const mapped = rows.map((r) => {
            const customer = r.customer;
            const customerId = r.customerId || customer?.id || null;
            const invoiceInfo = customerId ? invoiceMap.get(customerId) : undefined;

            const signals = buildSignals({
                status: customer?.status,
                lastActiveAt: customer?.lastActiveAt,
                recentFailedInvoices: invoiceInfo?.failed || 0,
                recentOverdueInvoices: invoiceInfo?.overdue || 0,
            });

            const previousRiskScore =
                typeof r.previousRiskScore === "number" ? r.previousRiskScore : r.riskScore;

            const riskDeltaPct = scoreDeltaPct(r.riskScore, previousRiskScore);

            return {
                id: r.id,
                customerId,
                companyName: customer?.name || r.companyName,
                email: customer?.email || undefined,
                riskScore: r.riskScore,
                riskLevel: riskLevelFromScore(r.riskScore),
                reasonKey: r.reasonKey,
                reasonLabel: r.reasonLabel,
                riskTrend: riskDeltaPct > 0 ? "up" : riskDeltaPct < 0 ? "down" : "flat",
                riskDelta: Math.abs(riskDeltaPct),
                previousRiskScore,
                status: customer?.status || "active",
                lastActiveAt: customer?.lastActiveAt?.toISOString() || null,
                signals,
                nextAction: customerId
                    ? actionMap.get(customerId) || nextActionFromReason(r.reasonKey, signals)
                    : nextActionFromReason(r.reasonKey, signals),
                mrr: typeof customer?.mrr === "number" ? customer.mrr : Math.round(Number(r.mrr || 0)),
                updatedAt: r.updatedAt.toISOString(),
            };
        });

        const currentMrrAtRisk = Math.round(Number(currentSummary._sum.mrr || 0));
        const previousMrrAtRisk = Math.round(Number(previousSummary._sum.mrrMinor || 0) / 100);

        const currentRiskScore = Math.round(Number(currentSummary._avg.riskScore || 0));
        const previousRiskScore = Math.round(Number(previousSummary._avg.riskScore || 0));

        const summary = {
            mrrAtRisk: currentMrrAtRisk,
            accountsAtRisk: Number(currentSummary._count.id || 0),
            totalCustomers,
            totalCustomersDelta: absoluteDelta(totalCustomers, previousTotalCustomers),
            riskScore: currentRiskScore,
            mrrAtRiskDeltaPct: pctDelta(currentMrrAtRisk, previousMrrAtRisk),
            churnProbabilityDeltaPct: pctDelta(currentRiskScore, previousRiskScore),
        };

        return NextResponse.json({
            ok: true,
            mode: total > 0 ? "live" : "empty",
            hasLiveData: total > 0,
            page,
            pageSize,
            total,
            criticalTotal,
            rows: mapped,
            summary,
        });
    } catch (e: any) {
        if (e instanceof AuthError) {
            return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
        }

        console.error("GET /api/dashboard/accounts-at-risk failed", e);

        return NextResponse.json(
            { ok: false, error: "Failed to load accounts at risk" },
            { status: 500 }
        );
    }
}