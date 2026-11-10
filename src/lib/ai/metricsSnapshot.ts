// lib/ai/metricsSnapshot.ts
//
// Builds the numbers-only metrics snapshot Claude reads, from the dashboard
// summary (live) or the demo data. Shared by the metrics read and Ask Claude.

import prisma from "@/lib/prisma";
import { getWorkspaceFromRequest } from "@/lib/auth/getWorkspaceFromRequest";
import { getDemoDashboardData } from "@/lib/demo/dashboard";
import type { MetricsSnapshot } from "@/lib/ai/claudeMetricsRead";

type Series = { labels: string[]; values: number[] };

type SummaryResponse = {
    ok?: boolean;
    kpis?: { atRiskAccounts?: number };
    totalMrrTrend?: { current: number; previous: number };
    mrrAtRiskTrend?: { current: number; previous: number };
    churnProxyTrend?: { current: number; previous: number };
    mrrProtected?: { current: number; previous: number };
    mrrProtectedChart?: { months: string[]; values: number[] };
    churnTrend?: { months: string[]; values: number[] };
    activeUsers?: { last7Days?: Array<{ timestamp: string; value: number }> };
};

function num(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function series(labels: unknown, values: unknown): Series {
    const safeLabels = Array.isArray(labels) ? labels.map(String) : [];
    const safeValues = Array.isArray(values) ? values.map((value) => Number(value) || 0) : [];
    const length = Math.min(safeLabels.length, safeValues.length);
    return { labels: safeLabels.slice(0, length), values: safeValues.slice(0, length) };
}

function dayLabel(iso: string) {
    const date = new Date(iso);
    return Number.isNaN(date.getTime())
        ? iso
        : date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function demoSnapshot(currency: string): MetricsSnapshot {
    const demo = getDemoDashboardData("en-GB");
    const users = (demo.activeUsersValues ?? []).slice(-7);
    const today = new Date();

    return {
        currency,
        source: "demo",
        totalMrr: { current: demo.kpis.totalMrrCurrent, previous: demo.kpis.totalMrrPrevious },
        mrrAtRisk: { current: demo.kpis.mrrAtRiskCurrent, previous: demo.kpis.mrrAtRiskPrevious },
        churnRate: { current: demo.kpis.churnProxyCurrent, previous: demo.kpis.churnProxyPrevious },
        mrrProtected: { current: demo.kpis.mrrProtectedCurrent, previous: demo.kpis.mrrProtectedPrevious },
        atRiskAccounts: demo.riskAccounts.filter((account) => account.risk >= 60).length,
        churnSeries: series(demo.churnMonths, demo.churnPct),
        mrrProtectedSeries: series(demo.mrrProtectedMonths, demo.mrrProtectedValues),
        activeUsersSeries: {
            labels: users.map((_, index) => {
                const date = new Date(today);
                date.setDate(today.getDate() - (users.length - 1 - index));
                return dayLabel(date.toISOString());
            }),
            values: users,
        },
    };
}

async function liveSnapshot(req: Request, currency: string): Promise<MetricsSnapshot | null> {
    // Reuse the dashboard's own numbers so this page always agrees with it.
    const res = await fetch(new URL("/api/dashboard/summary", req.url), {
        headers: { Authorization: req.headers.get("authorization") ?? "" },
        cache: "no-store",
    });

    if (!res.ok) return null;

    const data = (await res.json().catch(() => null)) as SummaryResponse | null;
    if (!data?.ok) return null;

    const users = data.activeUsers?.last7Days ?? [];

    return {
        currency,
        source: "live",
        totalMrr: { current: num(data.totalMrrTrend?.current) ?? 0, previous: num(data.totalMrrTrend?.previous) },
        mrrAtRisk: { current: num(data.mrrAtRiskTrend?.current) ?? 0, previous: num(data.mrrAtRiskTrend?.previous) },
        churnRate: { current: num(data.churnProxyTrend?.current), previous: num(data.churnProxyTrend?.previous) },
        mrrProtected: { current: num(data.mrrProtected?.current) ?? 0, previous: num(data.mrrProtected?.previous) },
        atRiskAccounts: num(data.kpis?.atRiskAccounts),
        churnSeries: series(data.churnTrend?.months, data.churnTrend?.values),
        mrrProtectedSeries: series(data.mrrProtectedChart?.months, data.mrrProtectedChart?.values),
        activeUsersSeries: {
            labels: users.map((point) => dayLabel(point.timestamp)),
            values: users.map((point) => Number(point.value) || 0),
        },
    };
}

export async function loadSnapshot(req: Request) {
    const { workspaceId } = await getWorkspaceFromRequest(req);

    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { demoMode: true, currency: true },
    });

    if (!workspace) return { workspaceId, snapshot: null };

    const currency = workspace.currency || "GBP";
    const snapshot = workspace.demoMode
        ? demoSnapshot(currency)
        : (await liveSnapshot(req, currency)) ?? demoSnapshot(currency);

    return { workspaceId, snapshot };
}

