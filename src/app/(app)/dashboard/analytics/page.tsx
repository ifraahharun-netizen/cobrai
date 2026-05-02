"use client";

import {
    useEffect,
    useMemo,
    useState,
    type Dispatch,
    type ReactNode,
    type SetStateAction,
} from "react";
import { useRouter } from "next/navigation";
import EChart from "@/components/charts/EChart";
import type { EChartsOption } from "echarts";

import InsightDrawer from "./InsightDrawer";
import { canAccessFeature, type PlanTier } from "@/lib/permissions";

import { onAuthStateChanged, type User } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase.client";

import type { ActionFirstRecommendation, Insight } from "@/lib/ai/types";

import styles from "./analytics.module.css";

/* ================= TYPES ================= */

type DashboardSummary = {
    ok: boolean;
    error?: string;
    tier?: "free" | "starter" | "pro" | "scale";
    demoMode?: boolean;
    trialEndsAt?: string | null;
    connectedIntegrations?: string[];
    kpis?: {
        totalMrr?: number;
        mrrAtRisk?: number;
        atRiskAccounts?: number;
        retentionPct?: number | null;
        churnPct?: number | null;
    };
    riskAccounts?: Array<{
        id: string;
        company: string;
        reason: string;
        risk: number;
        mrr?: number | null;
    }>;
    activitySummary?: {
        windowLabel: string;
        newSubscriptions: number;
        newTrials: number;
        reactivations: number;
        failedSubscriptions: number;
    };
    history?: Array<{
        id: string;
        type: string;
        label: string;
        company: string | null;
        occurredAt: string;
        valueMinor?: number | null;
    }>;
};

type MrrProtectedRes = {
    ok: boolean;
    mrrProtected?: number;
    error?: string;
};

type AiWorkspaceRes = {
    insights: Insight[];
    actions: ActionFirstRecommendation[];
    cached: boolean;
    source: "ai" | "fallback" | "cache" | "fallback_after_error";
    timeframe: string;
    promptVersion: string;
};

type AutomationStatusRes = {
    ok: boolean;
    lastAutoUpdateAt?: string | null;
    nextAutoUpdateAt?: string | null;
    jobs?: Array<{
        key: "stripe_sync" | "metrics_compute" | "insights_generate";
        label: string;
        status: "ok" | "warn" | "error";
        lastRunAt?: string | null;
        nextRunAt?: string | null;
        lastError?: string | null;
    }>;
    error?: string;
};

type ConfidenceLevel = "High" | "Medium" | "Low";

type ExpansionRow = {
    id: string;
    name: string;
    email?: string | null;
    upsideMinor: number;
    action: string;
    reason?: string;
    confidence?: ConfidenceLevel;
};

type InsightItem = {
    id: string;
    createdAt: string;
    title: string;
    summary: string;
    impactLabel?: string;
    confidence?: "High" | "Medium" | "Low";
    href?: string;
};

type InsightsFeedRes = {
    ok: boolean;
    items: InsightItem[];
    error?: string;
};

type AttentionAccount = {
    id: string;
    company: string;
    risk: number;
    riskBand: "Critical" | "High" | "Medium" | "Low";
    mrrMinor?: number | null;
    driver?: string | null;
    lastActiveAt?: string | null;
    recommendedAction?: string | null;
};

type AttentionRes = {
    ok: boolean;
    rows: AttentionAccount[];
    error?: string;
};

type RangeKey = "auto" | "12m" | "ytd" | "24m";

type TimeseriesRes = {
    ok: boolean;
    mode?: "demo" | "live";
    rangeUsed?: RangeKey;

    mrr: Array<{ month: string; valueMinor: number }>;
    churn: Array<{ month: string; valuePct: number | null }>;
    mau: Array<{ month: string; activeUsers: number }>;
    activityByMonth?: Array<{
        month: string;
        totalSubscribers: number;
        newSubscriptions: number;
        newTrials: number;
        unsubscribes: number;
    }>;

    insights: null | {
        mrr: {
            currentMinor: number;
            prevMinor: number | null;
            deltaMinor: number | null;
            deltaPct: number | null;
            drivers: null | {
                newMinor: number;
                expansionMinor: number;
                contractionMinor: number;
                churnedMinor: number;
                driverAccounts: Array<{
                    id: string;
                    accountName: string;
                    email: string | null;
                    label: string;
                    valueMinor: number;
                    tone: "positive" | "negative";
                    lastEventAt?: string | null;
                }>;
            };
            topMovers: Array<{
                id: string;
                name: string;
                email: string | null;
                deltaMinor: number;
                label: string;
            }>;
        };

        churn: {
            currentPct: number | null;
            prevPct: number | null;
            deltaPp: number | null;
            churnedAccounts: Array<{
                id: string;
                name: string;
                email: string | null;
                mrrMinor: number;
                lastEventAt?: string | null;
            }>;
        };

        months: { current: string; previous: string | null };
    };

    expansionRows?: ExpansionRow[];

    error?: string;
};

type DrawerView = "mrr" | "churn";

/* ================= HELPERS ================= */

function normalizeConfidence(value?: string | null): ConfidenceLevel | undefined {
    if (!value) return undefined;

    const normalized = value.trim().toLowerCase();

    if (normalized === "high") return "High";
    if (normalized === "medium") return "Medium";
    if (normalized === "low") return "Low";

    return undefined;
}

function normalizePlanTier(tier?: "free" | "starter" | "pro" | "scale"): PlanTier {
    if (tier === "pro" || tier === "scale") return "pro";
    if (tier === "starter") return "starter";
    return "free";
}

function formatGBPFromMinor(maybeMinor: number | null | undefined) {
    const minor = Number(maybeMinor || 0);
    const pounds = minor / 100;

    try {
        return new Intl.NumberFormat("en-GB", {
            style: "currency",
            currency: "GBP",
        }).format(pounds);
    } catch {
        return `£${pounds.toFixed(2)}`;
    }
}

function formatCompactGBPFromMinor(minor: number) {
    const pounds = minor / 100;
    return new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "GBP",
        maximumFractionDigits: 0,
        notation: "compact",
    }).format(pounds);
}

function formatPct(v: number | null | undefined) {
    if (v === null || v === undefined) return "—";
    const n = Number(v);
    if (!Number.isFinite(n)) return "—";
    return `${n.toFixed(1)}%`;
}

function riskBand(score: number) {
    if (score >= 85) return "Critical";
    if (score >= 70) return "High";
    if (score >= 45) return "Medium";
    return "Low";
}

async function authedGet(url: string, user: User) {
    const token = await user.getIdToken(true);

    const res = await fetch(url, {
        method: "GET",
        cache: "no-store",
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`${res.status} ${res.statusText} ${text}`);
    }

    return res.json();
}

async function authedPost(url: string, user: User, body?: unknown) {
    const token = await user.getIdToken(true);

    const res = await fetch(url, {
        method: "POST",
        cache: "no-store",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body ?? {}),
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`${res.status} ${res.statusText} ${text}`);
    }

    return res.json();
}

function niceWhen(iso?: string | null) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function formatSigned(n: number, digits = 0) {
    const sign = n > 0 ? "+" : "";
    return `${sign}${n.toFixed(digits)}`;
}

function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

function formatMonthLong(monthKey: string) {
    const d = new Date(`${monthKey}-01T00:00:00`);
    if (Number.isNaN(d.getTime())) return monthKey;

    return d.toLocaleString("en-GB", {
        month: "long",
    });
}

function formatMonthLongYear(monthKey: string | null | undefined) {
    if (!monthKey) return "—";

    const [year, month] = monthKey.split("-").map(Number);
    if (!year || !month) return monthKey;

    const date = new Date(year, month - 1, 1);

    return date.toLocaleString("en-GB", {
        month: "long",
        year: "numeric",
    });
}

function getDeltaArrow(delta: number | null, inverse = false) {
    if (typeof delta !== "number" || !Number.isFinite(delta) || delta === 0) return "→";
    const positive = delta > 0;
    const good = inverse ? !positive : positive;
    return good ? "↑" : "↓";
}

function getTooltipDeltaColor(delta: number | null, inverse = false) {
    if (typeof delta !== "number" || !Number.isFinite(delta) || delta === 0) return "#64748b";
    const positive = delta > 0;
    const good = inverse ? !positive : positive;
    return good ? "#16a34a" : "#dc2626";
}

function buildSeriesTooltipHtml(args: {
    title: string;
    monthKey: string;
    currentValue: number | null;
    previousValue: number | null;
    previousMonthKey?: string | null;
    yMode: "currency" | "percent" | "count";
    inverse?: boolean;
}) {
    const {
        title,
        monthKey,
        currentValue,
        previousValue,
        previousMonthKey = null,
        yMode,
        inverse = false,
    } = args;

    const monthLabel = formatMonthLongYear(monthKey);
    const currentLabel = title === "MAU" ? "Active monthly users" : title;

    const currentText =
        currentValue === null || !Number.isFinite(currentValue)
            ? "—"
            : yMode === "currency"
                ? formatGBPFromMinor(Math.round(currentValue * 100))
                : yMode === "percent"
                    ? `${currentValue.toFixed(1)}%`
                    : `${Math.round(currentValue)}`;

    if (previousValue === null || !Number.isFinite(previousValue)) {
        return `
            <div style="min-width: 170px;">
                <div style="font-weight:700;margin-bottom:6px;">${monthLabel}</div>
                <div style="display:flex;align-items:center;gap:8px;">
                    <span style="display:inline-block;width:10px;height:10px;border-radius:999px;background:#699fe2ff;"></span>
                    <span style="color:#334155;">${currentLabel}</span>
                    <span style="margin-left:auto;font-weight:700;color:#0f172a;">${currentText}</span>
                </div>
            </div>
        `;
    }

    const safeCurrent = currentValue ?? 0;
    const safePrevious = previousValue ?? 0;
    const delta = safeCurrent - safePrevious;

    const arrow = getDeltaArrow(delta, inverse);
    const color = getTooltipDeltaColor(delta, inverse);

    const deltaText =
        yMode === "currency"
            ? formatGBPFromMinor(Math.round(Math.abs(delta) * 100))
            : yMode === "percent"
                ? `${Math.abs(delta).toFixed(1)}pp`
                : `${Math.abs(Math.round(delta))}`;

    const previousText =
        yMode === "currency"
            ? formatGBPFromMinor(Math.round(safePrevious * 100))
            : yMode === "percent"
                ? `${safePrevious.toFixed(1)}%`
                : `${Math.round(safePrevious)}`;

    const previousMonthLabel = previousMonthKey
        ? formatMonthLongYear(previousMonthKey)
        : "previous month";

    const comparisonLine =
        title === "MAU"
            ? `${arrow} ${deltaText} vs ${previousText} active users in ${previousMonthLabel}`
            : `${arrow} ${deltaText} vs ${previousText} in ${previousMonthLabel}`;

    return `
        <div style="min-width: 210px;">
            <div style="font-weight:700;margin-bottom:8px;">${monthLabel}</div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                <span style="display:inline-block;width:10px;height:10px;border-radius:999px;background:#699fe2ff;"></span>
                <span style="color:#334155;">${currentLabel}</span>
                <span style="margin-left:auto;font-weight:700;color:#0f172a;">${currentText}</span>
            </div>
            <div style="font-size:12px;color:${color};font-weight:700;">
                ${comparisonLine}
            </div>
        </div>
    `;
}

function computeMauSummary(series: Array<{ x: string; y: number | null }>) {
    const valid = series.filter(
        (p): p is { x: string; y: number } =>
            typeof p.y === "number" && Number.isFinite(p.y)
    );

    if (!valid.length) {
        return {
            currentValue: null,
            previousValue: null,
            deltaPct: null,
            currentMonthLabel: "—",
        };
    }

    const current = valid[valid.length - 1];
    const previous = valid.length > 1 ? valid[valid.length - 2] : null;

    const deltaPct =
        previous && previous.y > 0
            ? ((current.y - previous.y) / previous.y) * 100
            : null;

    return {
        currentValue: current.y,
        previousValue: previous?.y ?? null,
        deltaPct,
        currentMonthLabel: formatMonthLong(current.x),
    };
}

function computeForecastFromSeries(series: Array<{ x: string; y: number | null }> | null) {
    if (!series || series.length < 2) return null;

    const valid = series.filter(
        (p): p is { x: string; y: number } =>
            typeof p.y === "number" && Number.isFinite(Number(p.y))
    );

    if (valid.length < 2) return null;

    const last = valid[valid.length - 1];
    const prev = valid[valid.length - 2];

    const delta = last.y - prev.y;
    const projected = last.y + delta;

    const window = valid.slice(Math.max(0, valid.length - 6));
    const deltas = window.slice(1).map((p, i) => p.y - window[i].y);
    const absMean = deltas.reduce((acc, d) => acc + Math.abs(d), 0) / Math.max(1, deltas.length);
    const absLast = Math.abs(delta);

    const ratio = absMean > 0 ? absLast / absMean : 1;
    const raw = ratio <= 1.2 ? 0.82 : ratio <= 1.8 ? 0.68 : 0.55;

    return {
        lastMonth: last.x,
        lastValue: last.y,
        prevMonth: prev.x,
        prevValue: prev.y,
        delta,
        projectedNext: projected,
        confidencePct: Math.round(raw * 100),
    };
}

function buildMrrAiSummary(ins: NonNullable<TimeseriesRes["insights"]>["mrr"]) {
    const d = ins.drivers;
    const churned = d?.churnedMinor ?? 0;
    const contraction = d?.contractionMinor ?? 0;
    const expansion = d?.expansionMinor ?? 0;
    const newMinor = d?.newMinor ?? 0;

    const totalDown = churned + contraction;
    const totalUp = newMinor + expansion;

    const mainDrag = churned >= contraction ? "churn" : "contraction";

    const withoutChurnDelta = (ins.deltaMinor ?? 0) + churned;
    const withoutChurnPct =
        ins.prevMinor && ins.prevMinor > 0 ? (withoutChurnDelta / ins.prevMinor) * 100 : null;

    return {
        headline:
            (ins.deltaPct ?? 0) < 0
                ? `MRR fell mainly due to ${mainDrag}.`
                : `MRR grew, driven by new + expansion.`,
        bullets: [
            d
                ? `Downside: ${formatCompactGBPFromMinor(totalDown)} (churn ${formatCompactGBPFromMinor(
                    churned
                )}, contraction ${formatCompactGBPFromMinor(contraction)}).`
                : `Not enough history to decompose drivers yet.`,
            d
                ? `Upside: ${formatCompactGBPFromMinor(totalUp)} (new ${formatCompactGBPFromMinor(
                    newMinor
                )}, expansion ${formatCompactGBPFromMinor(expansion)}).`
                : null,
            d && churned > 0 && Number.isFinite(Number(withoutChurnPct))
                ? `Without churn, MoM would be ${withoutChurnDelta >= 0 ? "+" : "−"}${formatCompactGBPFromMinor(
                    Math.abs(withoutChurnDelta)
                )} (${formatSigned(withoutChurnPct as number, 1)}%).`
                : null,
        ].filter(Boolean) as string[],
    };
}

function buildChurnAiSummary(ins: NonNullable<TimeseriesRes["insights"]>["churn"]) {
    const delta = ins.deltaPp;
    const direction =
        typeof delta === "number" ? (delta > 0 ? "up" : delta < 0 ? "down" : "flat") : "unknown";

    const top = ins.churnedAccounts?.[0];

    return {
        headline:
            direction === "up"
                ? "Churn increased month over month."
                : direction === "down"
                    ? "Churn decreased month over month."
                    : direction === "flat"
                        ? "Churn was flat month over month."
                        : "Churn insight unavailable.",
        bullets: [
            typeof ins.currentPct === "number"
                ? `Current churn: ${ins.currentPct.toFixed(1)}%.`
                : "Current churn not available.",
            typeof delta === "number" ? `MoM change: ${formatSigned(delta, 1)}pp.` : "MoM change unavailable.",
            top ? `Largest churn impact: ${top.name} (${formatGBPFromMinor(top.mrrMinor)}).` : null,
        ].filter(Boolean) as string[],
    };
}

function computeRevenueRetention(
    prevMinor: number | null,
    drivers: { newMinor: number; expansionMinor: number; contractionMinor: number; churnedMinor: number } | null
) {
    if (!prevMinor || prevMinor <= 0 || !drivers) return null;

    const { newMinor, expansionMinor, contractionMinor, churnedMinor } = drivers;

    const grossKept = prevMinor - churnedMinor - contractionMinor;
    const netKept = prevMinor - churnedMinor - contractionMinor + expansionMinor + newMinor;

    const grr = (grossKept / prevMinor) * 100;
    const nrr = (netKept / prevMinor) * 100;

    return {
        grrPct: clamp(grr, 0, 200),
        nrrPct: clamp(nrr, 0, 300),
    };
}

function getBusinessHealthLabel(score: number) {
    if (score >= 80) return "Strong";
    if (score >= 65) return "Healthy";
    if (score >= 45) return "Watch";
    return "At risk";
}

function getBusinessHealthTone(score: number) {
    if (score >= 80) return "#16a34a";
    if (score >= 65) return "#2563eb";
    if (score >= 45) return "#d97706";
    return "#dc2626";
}

function getConfidenceLabel(score: number) {
    if (score >= 80) return "High";
    if (score >= 60) return "Medium";
    return "Low";
}

function formatDeltaPctLabel(v: number | null | undefined) {
    if (v === null || v === undefined || !Number.isFinite(Number(v))) return "—";
    const n = Number(v);
    return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function formatDeltaPpLabel(v: number | null | undefined) {
    if (v === null || v === undefined || !Number.isFinite(Number(v))) return "—";
    const n = Number(v);
    return `${n >= 0 ? "+" : ""}${n.toFixed(1)}pp`;
}

function getDriverRows(
    drivers: NonNullable<TimeseriesRes["insights"]>["mrr"]["drivers"]
) {
    if (!drivers || !Array.isArray(drivers.driverAccounts)) {
        return [];
    }

    return drivers.driverAccounts
        .filter(
            (row) =>
                row &&
                typeof row.valueMinor === "number" &&
                Number.isFinite(row.valueMinor) &&
                row.valueMinor > 0
        )
        .sort((a, b) => b.valueMinor - a.valueMinor)
        .map((row) => ({
            id: row.id,
            accountName: row.accountName,
            email: row.email ?? null,
            label: row.label,
            valueMinor: row.valueMinor,
            tone: row.tone,
            lastEventAt: row.lastEventAt ?? null,
        }));
}

function getRiskAccountRows(
    attention: AttentionRes | null,
    summary: DashboardSummary | null,
    drawerInsights: NonNullable<TimeseriesRes["insights"]>
) {
    const fromAttention =
        attention?.ok && attention.rows?.length
            ? attention.rows
                .slice()
                .sort((a, b) => Number(b.mrrMinor || 0) - Number(a.mrrMinor || 0))
                .map((row) => ({
                    id: row.id,
                    name: row.company,
                    email: null,
                    reason: row.driver || row.recommendedAction || "Risk signal detected",
                    mrrMinor: row.mrrMinor ?? null,
                    automation:
                        row.recommendedAction ||
                        (row.risk >= 85
                            ? "Send check-in + billing recovery automation"
                            : row.risk >= 70
                                ? "Trigger re-engagement sequence"
                                : "Monitor activity and schedule follow-up"),
                    lastEventAt: row.lastActiveAt ?? null,
                }))
            : [];

    if (fromAttention.length) return fromAttention.slice(0, 5);

    const fromSummary =
        summary?.riskAccounts?.length
            ? summary.riskAccounts
                .slice()
                .sort((a, b) => Number(b.mrr || 0) - Number(a.mrr || 0))
                .map((row) => ({
                    id: row.id,
                    name: row.company,
                    email: null,
                    reason: row.reason || "Risk signal detected",
                    mrrMinor:
                        typeof row.mrr === "number" && Number.isFinite(row.mrr)
                            ? Math.round(row.mrr * 100)
                            : null,
                    automation: "Trigger retention follow-up",
                    lastEventAt: null,
                }))
            : [];

    if (fromSummary.length) return fromSummary.slice(0, 5);

    return drawerInsights.churn.churnedAccounts.slice(0, 5).map((row, idx) => ({
        id: row.id || `${row.name}-${idx}`,
        name: row.name,
        email: row.email ?? null,
        reason: "Recently churned or inactive account",
        mrrMinor: row.mrrMinor,
        automation: "Draft win-back email",
        lastEventAt: row.lastEventAt ?? null,
    }));
}

function getExpansionRows(
    mrrSource: TimeseriesRes | null,
    drawerInsights: NonNullable<TimeseriesRes["insights"]>,
    attention: AttentionRes | null
): ExpansionRow[] {
    if (mrrSource?.expansionRows?.length) {
        return mrrSource.expansionRows
            .map((row): ExpansionRow => ({
                id: row.id,
                name: row.name,
                email: row.email ?? null,
                upsideMinor: row.upsideMinor,
                action: row.action,
                reason:
                    row.reason ||
                    (row.upsideMinor > 20000
                        ? "Strong expansion signal from recent billing changes"
                        : "Consistent growth or engagement detected"),
                confidence:
                    normalizeConfidence(row.confidence) ||
                    (row.upsideMinor > 20000
                        ? "High"
                        : row.upsideMinor > 8000
                            ? "Medium"
                            : "Low"),
            }))
            .sort((a, b) => b.upsideMinor - a.upsideMinor)
            .slice(0, 5);
    }

    const movers: ExpansionRow[] = drawerInsights.mrr.topMovers
        .filter((m) => m.deltaMinor > 0)
        .sort((a, b) => b.deltaMinor - a.deltaMinor)
        .slice(0, 5)
        .map((m, idx): ExpansionRow => ({
            id: m.id || `${m.name}-${idx}`,
            name: m.name,
            email: m.email ?? null,
            upsideMinor: m.deltaMinor,
            action: "Offer annual upgrade or seat expansion",
            reason: "Recent MRR increase suggests expansion potential",
            confidence: m.deltaMinor > 20000 ? "High" : "Medium",
        }));

    if (movers.length) return movers;

    const fromAttention: ExpansionRow[] =
        attention?.ok && attention.rows?.length
            ? attention.rows
                .filter((row) => row.risk <= 60)
                .slice(0, 5)
                .map((row): ExpansionRow => ({
                    id: row.id,
                    name: row.company,
                    email: null,
                    upsideMinor: row.mrrMinor ?? 0,
                    action: "Target expansion based on recent positive usage",
                    reason: "Low churn risk with stable usage",
                    confidence: "Medium",
                }))
            : [];

    return fromAttention;
}

function buildBarOption(
    title: string,
    points: Array<{ x: string; y: number | null }>
): EChartsOption {
    const xs = points.map((p) => {
        const d = new Date(`${p.x}-01T00:00:00`);
        if (Number.isNaN(d.getTime())) return p.x;
        return d.toLocaleString("en-GB", { month: "short" });
    });

    const ys = points.map((p) => (Number.isFinite(Number(p.y)) ? Number(p.y) : null));

    const valid = ys.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    const maxVal = valid.length ? Math.max(...valid) : 40;

    return {
        grid: {
            left: 44,
            right: 18,
            top: 22,
            bottom: 36,
            containLabel: false,
        },
        tooltip: {
            trigger: "axis",
            axisPointer: { type: "none" },
            backgroundColor: "#ffffff",
            borderColor: "#e8edf5",
            borderWidth: 1,
            padding: 12,
            extraCssText:
                "border-radius:14px;box-shadow:0 14px 34px rgba(15,23,42,0.12);",
            formatter: (params: any) => {
                const first = Array.isArray(params) ? params[0] : params;
                const dataIndex = typeof first?.dataIndex === "number" ? first.dataIndex : -1;

                if (dataIndex < 0 || dataIndex >= points.length) return "";

                const current = points[dataIndex];
                const previous = dataIndex > 0 ? points[dataIndex - 1] : null;

                return buildSeriesTooltipHtml({
                    title: "MAU",
                    monthKey: current.x,
                    currentValue:
                        typeof current.y === "number" && Number.isFinite(current.y)
                            ? current.y
                            : null,
                    previousValue:
                        previous && typeof previous.y === "number" && Number.isFinite(previous.y)
                            ? previous.y
                            : null,
                    previousMonthKey: previous?.x ?? null,
                    yMode: "count",
                });
            },
        },
        xAxis: {
            type: "category",
            data: xs,
            axisLine: {
                show: true,
                lineStyle: { color: "#e5e7eb" },
            },
            axisTick: { show: false },
            axisLabel: {
                color: "#4b5563",
                fontSize: 12,
                fontWeight: 500,
                margin: 12,
            },
        },
        yAxis: {
            type: "value",
            min: 0,
            max: Math.ceil(maxVal + 8),
            splitNumber: 4,
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: {
                color: "#4b5563",
                fontSize: 12,
                fontWeight: 500,
            },
            splitLine: {
                show: true,
                lineStyle: {
                    color: "#eef2f7",
                    type: "solid",
                },
            },
        },
        series: [
            {
                name: title,
                type: "bar",
                data: ys,
                itemStyle: {
                    color: "#73baf4ff",
                    borderRadius: [10, 10, 0, 0],
                },
                barWidth: 28,
                barCategoryGap: "36%",
                barMinHeight: 8,
                emphasis: { disabled: true },
            },
        ],
    };
}

function buildMetricBarOption(
    title: string,
    points: Array<{ x: string; y: number | null }>,
    yMode: "currency" | "percent" = "currency"
): EChartsOption {
    const xs = points.map((p) => {
        const d = new Date(`${p.x}-01T00:00:00`);
        if (Number.isNaN(d.getTime())) return p.x;
        return d.toLocaleString("en-GB", { month: "short" });
    });

    const ys = points.map((p) => (Number.isFinite(Number(p.y)) ? Number(p.y) : null));

    const valid = ys.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    const hasData = valid.length > 0;

    const minVal = hasData ? Math.min(...valid) : 0;
    const maxVal = hasData ? Math.max(...valid) : 0;
    const range = Math.max(1, maxVal - minVal);

    const axisMin =
        yMode === "percent"
            ? Math.max(0, minVal - range * 0.35)
            : Math.max(0, minVal - range * 0.25);

    const axisMax =
        yMode === "percent"
            ? maxVal + range * 0.4
            : Math.ceil(maxVal + range * 0.2);

    return {
        grid: {
            left: 44,
            right: 18,
            top: 22,
            bottom: 36,
            containLabel: false,
        },
        tooltip: {
            trigger: "axis",
            axisPointer: { type: "none" },
            backgroundColor: "#ffffff",
            borderColor: "#e8edf5",
            borderWidth: 1,
            padding: 12,
            extraCssText:
                "border-radius:14px;box-shadow:0 14px 34px rgba(15,23,42,0.12);",
            formatter: (params: any) => {
                const first = Array.isArray(params) ? params[0] : params;
                const dataIndex = typeof first?.dataIndex === "number" ? first.dataIndex : -1;

                if (dataIndex < 0 || dataIndex >= points.length) return "";

                const current = points[dataIndex];
                const previous = dataIndex > 0 ? points[dataIndex - 1] : null;

                return buildSeriesTooltipHtml({
                    title,
                    monthKey: current.x,
                    currentValue:
                        typeof current.y === "number" && Number.isFinite(current.y)
                            ? current.y
                            : null,
                    previousValue:
                        previous && typeof previous.y === "number" && Number.isFinite(previous.y)
                            ? previous.y
                            : null,
                    previousMonthKey: previous?.x ?? null,
                    yMode,
                    inverse: yMode === "percent",
                });
            },
        },
        xAxis: {
            type: "category",
            data: xs,
            axisLine: {
                show: true,
                lineStyle: { color: "#e5e7eb" },
            },
            axisTick: { show: false },
            axisLabel: {
                color: "#4b5563",
                fontSize: 12,
                fontWeight: 500,
                margin: 12,
            },
        },
        yAxis: {
            type: "value",
            min: axisMin,
            max: axisMax,
            splitNumber: 4,
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: {
                color: "#4b5563",
                fontSize: 12,
                fontWeight: 500,
                formatter: (value: number) => {
                    if (yMode === "currency") return `£${Math.round(value)}`;
                    if (yMode === "percent") return `${Number(value).toFixed(1)}%`;
                    return String(value);
                },
            },
            splitLine: {
                show: true,
                lineStyle: {
                    color: "#eef2f7",
                    type: "solid",
                },
            },
        },
        series: [
            {
                name: title,
                type: "bar",
                data: ys,
                itemStyle: {
                    color: "#73baf4ff",
                    borderRadius: [10, 10, 0, 0],
                },
                barWidth: 28,
                barCategoryGap: "36%",
                barMinHeight: 8,
                emphasis: { disabled: true },
            },
        ],
    };
}

function demoInsights(): NonNullable<TimeseriesRes["insights"]> {
    return {
        months: { previous: "2026-03", current: "2026-04" },
        mrr: {
            currentMinor: 78600,
            prevMinor: 75500,
            deltaMinor: 3100,
            deltaPct: 4.2,
            drivers: {
                newMinor: 12400,
                expansionMinor: 5900,
                contractionMinor: 5900,
                churnedMinor: 13300,
                driverAccounts: [
                    {
                        id: "brightops",
                        accountName: "BrightOps",
                        email: "ops@brightops.com",
                        label: "Annual plan upgrade",
                        valueMinor: 13300,
                        tone: "positive",
                        lastEventAt: "2026-04-05T10:30:00Z",
                    },
                    {
                        id: "kitecrm",
                        accountName: "KiteCRM",
                        email: "finance@kitecrm.com",
                        label: "New subscription started",
                        valueMinor: 12400,
                        tone: "positive",
                        lastEventAt: "2026-04-04T14:10:00Z",
                    },
                    {
                        id: "cedarworks",
                        accountName: "CedarWorks",
                        email: "hello@cedarworks.io",
                        label: "Recovered failed payment",
                        valueMinor: 6800,
                        tone: "positive",
                        lastEventAt: "2026-04-03T09:20:00Z",
                    },
                ],
            },
            topMovers: [
                {
                    id: "bloompay",
                    name: "BloomPay",
                    email: "ops@bloompay.com",
                    deltaMinor: -34900,
                    label: "Churn risk",
                },
                {
                    id: "cedarworks-risk",
                    name: "CedarWorks",
                    email: "hello@cedarworks.io",
                    deltaMinor: -21900,
                    label: "Churn risk",
                },
                {
                    id: "kitelabs",
                    name: "Kite Labs",
                    email: "team@kitelabs.com",
                    deltaMinor: -12900,
                    label: "Churn risk",
                },
                {
                    id: "brightops",
                    name: "BrightOps",
                    email: "ops@brightops.com",
                    deltaMinor: 13300,
                    label: "Expansion",
                },
                {
                    id: "kitecrm",
                    name: "KiteCRM",
                    email: "finance@kitecrm.com",
                    deltaMinor: 12400,
                    label: "New subscription",
                },
            ],
        },
        churn: {
            currentPct: 4.1,
            prevPct: 3.5,
            deltaPp: 0.6,
            churnedAccounts: [
                {
                    id: "bloompay",
                    name: "BloomPay",
                    email: "ops@bloompay.com",
                    mrrMinor: 34900,
                    lastEventAt: "2026-04-05T11:45:00Z",
                },
                {
                    id: "cedarworks-risk",
                    name: "CedarWorks",
                    email: "hello@cedarworks.io",
                    mrrMinor: 21900,
                    lastEventAt: "2026-04-04T16:15:00Z",
                },
                {
                    id: "kitelabs",
                    name: "Kite Labs",
                    email: "team@kitelabs.com",
                    mrrMinor: 12900,
                    lastEventAt: "2026-04-03T08:40:00Z",
                },
            ],
        },
    };
}

export default function AnalyticsPage() {
    const router = useRouter();

    const [status, setStatus] = useState<"checking" | "authed" | "guest">("checking");
    const [user, setUser] = useState<User | null>(null);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [summary, setSummary] = useState<DashboardSummary | null>(null);
    const [mrrProtected, setMrrProtected] = useState<number | null>(null);
    const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);

    const [selectedMauIndex, setSelectedMauIndex] = useState<number | null>(null);

    const mauChartEvents = {
        click: (params: any) => {
            if (typeof params?.dataIndex === "number") {
                setSelectedMauIndex(params.dataIndex);
            }
        },
    };

    const [automation, setAutomation] = useState<AutomationStatusRes | null>(null);
    const [insights, setInsights] = useState<InsightsFeedRes | null>(null);
    const [attention, setAttention] = useState<AttentionRes | null>(null);
    const [actionToast, setActionToast] = useState<string | null>(null);
    const [mrrTimeseries, setMrrTimeseries] = useState<TimeseriesRes | null>(null);
    const [churnTimeseries, setChurnTimeseries] = useState<TimeseriesRes | null>(null);
    const [mauTimeseries, setMauTimeseries] = useState<TimeseriesRes | null>(null);
    const [mrrRange, setMrrRange] = useState<RangeKey>("auto");
    const [churnRange, setChurnRange] = useState<RangeKey>("auto");
    const [mauRange, setMauRange] = useState<RangeKey>("auto");
    const [workspaceAi, setWorkspaceAi] = useState<AiWorkspaceRes | null>(null);

    const [drawerOpen, setDrawerOpen] = useState(false);
    const [drawerView, setDrawerView] = useState<DrawerView>("mrr");

    const openDrawer = (view: DrawerView) => {
        setDrawerView(view);
        setDrawerOpen(true);
    };

    const closeDrawer = () => setDrawerOpen(false);

    useEffect(() => {
        const auth = getFirebaseAuth();

        const unsub = onAuthStateChanged(auth, (u) => {
            if (u) {
                setUser(u);
                setStatus("authed");
            } else {
                setUser(null);
                setStatus("guest");
            }
        });

        return () => unsub();
    }, []);

    useEffect(() => {
        if (status === "guest") {
            router.replace("/");
        }
    }, [status, router]);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            try {
                if (!user) return;

                setLoading(true);
                setError(null);

                const summaryRes = (await authedGet("/api/dashboard/summary", user)) as DashboardSummary;
                if (!summaryRes.ok) throw new Error(summaryRes.error || "Summary failed");

                const mrrRes = (await authedGet("/api/dashboard/metrics/mrr-protected", user)) as MrrProtectedRes;
                if (!mrrRes.ok) throw new Error(mrrRes.error || "MRR protected failed");

                if (cancelled) return;
                setSummary(summaryRes);
                setMrrProtected(mrrRes.mrrProtected ?? 0);
                setLastRefreshedAt(new Date().toISOString());
            } catch (e: any) {
                if (cancelled) return;
                setError(e?.message ?? "Failed to load analytics");
                setSummary(null);
                setMrrProtected(null);
                setWorkspaceAi(null);
            } finally {
                if (cancelled) return;
                setLoading(false);
            }
        }

        if (status === "authed" && user) load();

        return () => {
            cancelled = true;
        };
    }, [status, user]);

    useEffect(() => {
        let cancelled = false;

        async function loadOne(
            selectedRange: RangeKey,
            setter: Dispatch<SetStateAction<TimeseriesRes | null>>
        ) {
            try {
                if (!user) return;

                const res = (await authedGet(
                    `/api/dashboard/analytics/timeseries?range=${selectedRange}`,
                    user
                )) as TimeseriesRes;

                if (!res.ok) throw new Error(res.error || "Timeseries failed");

                if (!cancelled) setter(res);
            } catch {
                if (!cancelled) setter(null);
            }
        }

        if (status === "authed" && user) {
            loadOne(mrrRange, setMrrTimeseries);
            loadOne(churnRange, setChurnTimeseries);
            loadOne(mauRange, setMauTimeseries);
        }

        return () => {
            cancelled = true;
        };
    }, [status, user, mrrRange, churnRange, mauRange]);

    useEffect(() => {
        let cancelled = false;

        async function loadProPanels(s?: DashboardSummary | null) {
            try {
                if (!user) return;

                const isPro = canAccessFeature({
                    plan: normalizePlanTier(s?.tier),
                    feature: "ai-insights",
                    trialEndsAt: s?.trialEndsAt ?? null,
                    isDemoMode: s?.demoMode === true,
                });

                if (!isPro) {
                    setAutomation(null);
                    setInsights(null);
                    setAttention(null);
                    setWorkspaceAi(null);
                    return;
                }

                const [aRes, iRes, tRes, aiRes] = await Promise.allSettled([
                    authedGet("/api/dashboard/automation/status", user) as Promise<AutomationStatusRes>,
                    authedGet("/api/dashboard/automation/insights", user) as Promise<InsightsFeedRes>,
                    authedGet("/api/dashboard/automation/attention", user) as Promise<AttentionRes>,
                    authedPost("/api/dashboard/ai/insights", user, {
                        timeframe: mrrRange === "ytd" ? "month" : "week"
                    }) as Promise<AiWorkspaceRes>,]);

                if (cancelled) return;

                if (aRes.status === "fulfilled" && aRes.value?.ok) setAutomation(aRes.value);
                else setAutomation({ ok: false, error: "Automation status unavailable" });

                if (iRes.status === "fulfilled" && iRes.value?.ok) setInsights(iRes.value);
                else setInsights({ ok: false, items: [], error: "Insights unavailable" });

                if (tRes.status === "fulfilled" && tRes.value?.ok) setAttention(tRes.value);
                else setAttention({ ok: false, rows: [], error: "Attention table unavailable" });
                if (aiRes.status === "fulfilled") setWorkspaceAi(aiRes.value);
                else setWorkspaceAi(null);

            } catch {


                if (cancelled) return;
                setAutomation({ ok: false, error: "Automation status unavailable" });
                setInsights({ ok: false, items: [], error: "Insights unavailable" });
                setAttention({ ok: false, rows: [], error: "Attention table unavailable" });
                setWorkspaceAi(null);

            }
        }

        if (status === "authed" && user && summary) loadProPanels(summary);

        return () => {
            cancelled = true;
        };
    }, [status, user, summary, mrrRange]);

    const mrrSource = mrrTimeseries;
    const churnSource = churnTimeseries;
    const mauSource = mauTimeseries;

    const mrrFallbackSeries: Array<{ x: string; y: number | null }> = [
        { x: "2025-08", y: 642 },
        { x: "2025-09", y: 676 },
        { x: "2025-10", y: 721 },
        { x: "2025-11", y: 748 },
        { x: "2025-12", y: 772 },
        { x: "2026-01", y: 786 },
    ];

    const rawMrrSeries: Array<{ x: string; y: number | null }> =
        mrrSource?.mrr?.length
            ? mrrSource.mrr.map((p) => ({
                x: p.month,
                y: Number.isFinite(Number(p.valueMinor)) ? Number(p.valueMinor) / 100 : null,
            }))
            : [];

    const validRawMrr = rawMrrSeries
        .map((p) => p.y)
        .filter((v): v is number => typeof v === "number" && Number.isFinite(v));

    const hasMeaningfulMrrData =
        rawMrrSeries.length > 0 &&
        validRawMrr.length > 0 &&
        Math.max(...validRawMrr) - Math.min(...validRawMrr) > 8;

    const mrrSeries: Array<{ x: string; y: number | null }> =
        hasMeaningfulMrrData ? rawMrrSeries : mrrFallbackSeries;

    const churnFallbackSeries: Array<{ x: string; y: number | null }> =
        churnRange === "ytd"
            ? [
                { x: "2026-01", y: 3.1 },
                { x: "2026-02", y: 3.4 },
                { x: "2026-03", y: 3.8 },
                { x: "2026-04", y: 4.2 },
            ]
            : [
                { x: "2025-08", y: 2.4 },
                { x: "2025-09", y: 2.8 },
                { x: "2025-10", y: 3.3 },
                { x: "2025-11", y: 3.7 },
                { x: "2025-12", y: 4.0 },
                { x: "2026-01", y: 4.6 },
            ];

    const rawChurnSeries: Array<{ x: string; y: number | null }> =
        churnSource?.churn?.length
            ? churnSource.churn.map((p) => ({
                x: p.month,
                y: typeof p.valuePct === "number" ? Number(p.valuePct) : null,
            }))
            : [];

    const meaningfulChurnPoints = rawChurnSeries.filter(
        (p): p is { x: string; y: number } =>
            typeof p.y === "number" && Number.isFinite(p.y) && p.y > 0.2
    );

    const hasMeaningfulChurnData = meaningfulChurnPoints.length >= 4;

    const churnSeries: Array<{ x: string; y: number | null }> =
        hasMeaningfulChurnData ? rawChurnSeries : churnFallbackSeries;

    const mauFallbackSeries: Array<{ x: string; y: number | null }> =
        mauRange === "ytd"
            ? [
                { x: "2026-01", y: 18 },
                { x: "2026-02", y: 22 },
                { x: "2026-03", y: 27 },
                { x: "2026-04", y: 31 },
            ]
            : [
                { x: "2025-08", y: 12 },
                { x: "2025-09", y: 15 },
                { x: "2025-10", y: 19 },
                { x: "2025-11", y: 24 },
                { x: "2025-12", y: 29 },
                { x: "2026-01", y: 34 },
            ];

    const rawMauSeries: Array<{ x: string; y: number | null }> =
        mauSource?.mau?.length
            ? mauSource.mau.map((p) => ({
                x: p.month,
                y: Number.isFinite(Number(p.activeUsers)) ? Number(p.activeUsers) : null,
            }))
            : [];

    const meaningfulMauPoints = rawMauSeries.filter(
        (p): p is { x: string; y: number } =>
            typeof p.y === "number" && Number.isFinite(p.y) && p.y > 0
    );

    const hasMeaningfulMauData = meaningfulMauPoints.length >= 4;

    const mauSeries: Array<{ x: string; y: number | null }> =
        hasMeaningfulMauData ? rawMauSeries : mauFallbackSeries;

    const mauPrevPoint = mauSeries.length >= 2 ? mauSeries[mauSeries.length - 2] : null;
    const mauCurrentPoint = mauSeries.length >= 1 ? mauSeries[mauSeries.length - 1] : null;

    const selectedMauPoint =
        selectedMauIndex !== null && mauSeries[selectedMauIndex]
            ? mauSeries[selectedMauIndex]
            : mauCurrentPoint;

    const selectedMauMonthLabel = selectedMauPoint?.x
        ? formatMonthLong(selectedMauPoint.x)
        : "Current month";

    const selectedMauActivity = useMemo(() => {
        if (!selectedMauPoint?.x) return null;

        return mauSource?.activityByMonth?.find((row) => row.month === selectedMauPoint.x) ?? null;
    }, [mauSource?.activityByMonth, selectedMauPoint?.x]);

    const mrrRangeLabel = useMemo(() => {
        const used = mrrSource?.rangeUsed || mrrRange;
        if (used === "ytd") return "This year (YTD)";
        if (used === "24m") return "Last 24 months";
        if (used === "12m") return "Last 12 months";
        return "Auto";
    }, [mrrSource?.rangeUsed, mrrRange]);

    const churnRangeLabel = useMemo(() => {
        const used = churnSource?.rangeUsed || churnRange;
        if (used === "ytd") return "This year (YTD)";
        if (used === "24m") return "Last 24 months";
        if (used === "12m") return "Last 12 months";
        return "Auto";
    }, [churnSource?.rangeUsed, churnRange]);

    const mauRangeLabel = useMemo(() => {
        const used = mauSource?.rangeUsed || mauRange;
        if (used === "ytd") return "This year (YTD)";
        if (used === "24m") return "Last 24 months";
        if (used === "12m") return "Last 12 months";
        return "Auto";
    }, [mauSource?.rangeUsed, mauRange]);

    const derived = useMemo(() => {
        const k = summary?.kpis;
        const list = summary?.riskAccounts ?? [];

        const distribution = { Critical: 0, High: 0, Medium: 0, Low: 0 } as Record<
            "Critical" | "High" | "Medium" | "Low",
            number
        >;

        for (const r of list) {
            const band = riskBand(Number(r.risk || 0)) as keyof typeof distribution;
            distribution[band] += 1;
        }

        const isPro = canAccessFeature({
            plan: normalizePlanTier(summary?.tier),
            feature: "forecasting",
            trialEndsAt: summary?.trialEndsAt ?? null,
            isDemoMode: summary?.demoMode === true,
        });

        return {
            distribution,
            retention: k?.retentionPct ?? null,
            churn: k?.churnPct ?? null,
            riskCount: list.length,
            isPro,
        };
    }, [summary]);

    const accountLookup = useMemo(() => {
        const map = new Map<string, { id: string; name: string }>();

        if (attention?.ok) {
            for (const row of attention.rows) {
                map.set(row.company.trim().toLowerCase(), {
                    id: row.id,
                    name: row.company,
                });
            }
        }

        if (summary?.riskAccounts?.length) {
            for (const row of summary.riskAccounts) {
                map.set(row.company.trim().toLowerCase(), {
                    id: row.id,
                    name: row.company,
                });
            }
        }

        return map;
    }, [attention, summary]);

    const drawerInsights = useMemo(() => {
        return mrrTimeseries?.insights ?? demoInsights();
    }, [mrrTimeseries?.insights]);

    const demoKpis = useMemo(() => {
        const isDemo = summary?.demoMode === true;

        if (!isDemo) {
            return {
                totalMrr: summary?.kpis?.totalMrr ?? 0,
                mrrProtected: mrrProtected ?? 0,
                mrrAtRisk: summary?.kpis?.mrrAtRisk ?? 0,
                atRiskAccounts: summary?.kpis?.atRiskAccounts ?? 0,
                churnPct: summary?.kpis?.churnPct ?? null,
            };
        }

        return {
            totalMrr:
                (summary?.kpis?.totalMrr ?? 0) > 0
                    ? summary?.kpis?.totalMrr ?? 0
                    : drawerInsights.mrr.currentMinor,
            mrrProtected: (mrrProtected ?? 0) > 0 ? mrrProtected ?? 0 : 26800,
            mrrAtRisk:
                (summary?.kpis?.mrrAtRisk ?? 0) > 0
                    ? summary?.kpis?.mrrAtRisk ?? 0
                    : 69700,
            atRiskAccounts:
                (summary?.kpis?.atRiskAccounts ?? 0) > 0
                    ? summary?.kpis?.atRiskAccounts ?? 0
                    : 3,
            churnPct:
                typeof summary?.kpis?.churnPct === "number"
                    ? summary.kpis.churnPct
                    : drawerInsights.churn.currentPct ?? null,
        };
    }, [
        summary,
        mrrProtected,
        drawerInsights.mrr.currentMinor,
        drawerInsights.churn.currentPct,
    ]);

    const mrrDeltaPct = useMemo(() => drawerInsights.mrr.deltaPct ?? null, [drawerInsights.mrr.deltaPct]);
    const churnDeltaPp = useMemo(() => drawerInsights.churn.deltaPp ?? null, [drawerInsights.churn.deltaPp]);

    const mrrForecast = useMemo(() => computeForecastFromSeries(mrrSeries), [mrrSeries]);
    const churnForecast = useMemo(() => computeForecastFromSeries(churnSeries), [churnSeries]);

    const aiMrr = useMemo(() => buildMrrAiSummary(drawerInsights.mrr), [drawerInsights.mrr]);
    const aiChurn = useMemo(() => buildChurnAiSummary(drawerInsights.churn), [drawerInsights.churn]);

    const aiRiskOpp = useMemo(() => {
        const fromAttention = attention?.ok ? attention.rows : [];

        const riskFromAttention = fromAttention
            .slice()
            .sort((a, b) => (b.risk || 0) - (a.risk || 0))
            .slice(0, 3);

        const oppFromMovers = (drawerInsights.mrr.topMovers || [])
            .filter((m) => m.deltaMinor > 0)
            .slice()
            .sort((a, b) => b.deltaMinor - a.deltaMinor)
            .slice(0, 3);

        const riskFromMovers = (drawerInsights.mrr.topMovers || [])
            .filter((m) => m.deltaMinor < 0)
            .slice()
            .sort((a, b) => a.deltaMinor - b.deltaMinor)
            .slice(0, 3);

        return {
            risk: riskFromAttention.length
                ? riskFromAttention.map((r) => ({
                    id: r.id,
                    name: r.company,
                    meta: `${r.riskBand} risk • ${r.mrrMinor ? formatCompactGBPFromMinor(r.mrrMinor) : "—"} MRR`,
                    hint: r.recommendedAction || r.driver || "Review engagement + billing signals",
                }))
                : riskFromMovers.map((m) => {
                    const matched = accountLookup.get(m.name.trim().toLowerCase());
                    return {
                        id: matched?.id || "",
                        name: matched?.name || m.name,
                        meta: `MRR down • −${formatCompactGBPFromMinor(Math.abs(m.deltaMinor))}`,
                        hint: "Investigate usage + payment + plan changes",
                    };
                }),
            opp: oppFromMovers.map((m) => {
                const matched = accountLookup.get(m.name.trim().toLowerCase());
                return {
                    id: matched?.id || "",
                    name: matched?.name || m.name,
                    meta: `Upside • +${formatCompactGBPFromMinor(m.deltaMinor)}`,
                    hint: "Target expansion / seat uplift / annual upgrade",
                };
            }),
        };
    }, [attention, drawerInsights.mrr.topMovers, accountLookup]);

    const isDemoPreview = summary?.demoMode === true || !mrrTimeseries?.insights;

    const mauLatestDeltaPct = useMemo(() => {
        const current =
            typeof mauCurrentPoint?.y === "number" && Number.isFinite(mauCurrentPoint.y)
                ? mauCurrentPoint.y
                : null;
        const prev =
            typeof mauPrevPoint?.y === "number" && Number.isFinite(mauPrevPoint.y)
                ? mauPrevPoint.y
                : null;

        if (current === null || prev === null || prev <= 0) return null;
        return ((current - prev) / prev) * 100;
    }, [mauCurrentPoint, mauPrevPoint]);

    const previousMrrMinor = useMemo(() => {
        if (typeof mrrDeltaPct !== "number") return null;
        const current = demoKpis.totalMrr ?? 0;
        const divisor = 1 + mrrDeltaPct / 100;
        if (!Number.isFinite(divisor) || divisor === 0) return null;
        return Math.round(current / divisor);
    }, [demoKpis.totalMrr, mrrDeltaPct]);

    const previousChurnPct = useMemo(() => {
        if (typeof demoKpis.churnPct !== "number" || typeof churnDeltaPp !== "number") return null;
        return demoKpis.churnPct - churnDeltaPp;
    }, [demoKpis.churnPct, churnDeltaPp]);

    const previousMrrProtected = useMemo(() => {
        const current = demoKpis.mrrProtected ?? 0;
        if (!current) return null;
        return Math.round(current * 0.9);
    }, [demoKpis.mrrProtected]);

    const previousMrrAtRisk = useMemo(() => {
        const current = demoKpis.mrrAtRisk ?? 0;
        if (!current) return null;
        return Math.round(current * 0.94);
    }, [demoKpis.mrrAtRisk]);

    const protectedDeltaPct = useMemo(() => {
        if (previousMrrProtected === null || previousMrrProtected === 0) return null;
        return ((demoKpis.mrrProtected - previousMrrProtected) / previousMrrProtected) * 100;
    }, [demoKpis.mrrProtected, previousMrrProtected]);

    const atRiskDeltaPct = useMemo(() => {
        if (previousMrrAtRisk === null || previousMrrAtRisk === 0) return null;
        return ((demoKpis.mrrAtRisk - previousMrrAtRisk) / previousMrrAtRisk) * 100;
    }, [demoKpis.mrrAtRisk, previousMrrAtRisk]);

    const retentionHealth = useMemo(() => {
        return computeRevenueRetention(drawerInsights.mrr.prevMinor, drawerInsights.mrr.drivers);
    }, [drawerInsights.mrr.prevMinor, drawerInsights.mrr.drivers]);

    const failedSubscriptions = summary?.activitySummary?.failedSubscriptions ?? 0;
    const reactivations = summary?.activitySummary?.reactivations ?? 0;
    const atRiskAccounts = demoKpis.atRiskAccounts ?? 0;
    const mrrAtRiskMinor = demoKpis.mrrAtRisk ?? 0;

    const aiInsightMetrics = useMemo(() => {
        const churnNow =
            typeof demoKpis.churnPct === "number"
                ? demoKpis.churnPct
                : drawerInsights.churn.currentPct ?? 0;

        const churnProjection =
            typeof churnForecast?.projectedNext === "number"
                ? churnForecast.projectedNext
                : churnNow;

        const confidenceBase = clamp(
            Math.round(
                ((mrrForecast?.confidencePct ?? 68) +
                    (churnForecast?.confidencePct ?? 66) +
                    (mrrTimeseries?.insights ? 10 : 0)) /
                (mrrTimeseries?.insights ? 2.2 : 2)
            ),
            52,
            94
        );

        const businessHealthScore = clamp(
            Math.round(
                100 -
                churnProjection * 8 +
                (typeof mrrDeltaPct === "number" ? mrrDeltaPct * 4 : 0) +
                ((retentionHealth?.nrrPct ?? 100) - 100) * 1.1 +
                (typeof mauLatestDeltaPct === "number" ? mauLatestDeltaPct * 1.8 : 0) -
                atRiskAccounts * 1.5 -
                failedSubscriptions * 1.2 +
                reactivations * 0.8
            ),
            22,
            96
        );

        return {
            businessHealthScore,
            businessHealthLabel: getBusinessHealthLabel(businessHealthScore),
            businessHealthTone: getBusinessHealthTone(businessHealthScore),
            confidenceScore: confidenceBase,
            confidenceLabel: getConfidenceLabel(confidenceBase),
            nextMonthMrr:
                typeof mrrForecast?.projectedNext === "number"
                    ? Math.round(mrrForecast.projectedNext * 100)
                    : null,
            nextMonthChurn:
                typeof churnForecast?.projectedNext === "number"
                    ? churnForecast.projectedNext
                    : null,
        };
    }, [
        demoKpis.churnPct,
        drawerInsights.churn.currentPct,
        churnForecast,
        mrrDeltaPct,
        mauLatestDeltaPct,
        mrrForecast,
        mrrTimeseries?.insights,
        retentionHealth?.nrrPct,
        atRiskAccounts,
        failedSubscriptions,
        reactivations,
    ]);

    const aiInsightCard = useMemo(() => {
        let headline = "Retention performance is stable with clear next steps.";
        let summaryLine = "No major negative movement detected across recent signals.";
        let tone: "danger" | "warn" | "good" = "good";

        if (failedSubscriptions > 0 && mrrAtRiskMinor > 0) {
            headline = "Revenue risk is rising from failed payments and inactive accounts.";
            summaryLine = `${atRiskAccounts} account${atRiskAccounts === 1 ? "" : "s"} at risk • ${formatGBPFromMinor(
                mrrAtRiskMinor
            )} exposed • ${failedSubscriptions} failed subscription${failedSubscriptions === 1 ? "" : "s"}.`;
            tone = "danger";
        } else if (typeof churnDeltaPp === "number" && churnDeltaPp > 0) {
            headline = "Churn pressure increased and needs action.";
            summaryLine = `${atRiskAccounts} account${atRiskAccounts === 1 ? "" : "s"} currently flagged with churn moving ${formatDeltaPpLabel(
                churnDeltaPp
            )}.`;
            tone = "danger";
        } else if (typeof mrrDeltaPct === "number" && mrrDeltaPct < 0) {
            headline = "MRR softened and needs targeted retention follow-up.";
            summaryLine = `MRR moved ${formatDeltaPctLabel(mrrDeltaPct)} while ${formatGBPFromMinor(
                mrrAtRiskMinor
            )} remains at risk.`;
            tone = "warn";
        } else if (reactivations > 0 || (typeof mauLatestDeltaPct === "number" && mauLatestDeltaPct > 0)) {
            headline = "Engagement is improving and creating expansion potential.";
            summaryLine = `${reactivations} reactivation${reactivations === 1 ? "" : "s"} detected with healthier recent activity.`;
            tone = "good";
        }

        const primaryMetric = {
            label: "Business health",
            value: `${aiInsightMetrics.businessHealthScore}/100`,
            sub: `${aiInsightMetrics.businessHealthLabel} • ${aiInsightMetrics.confidenceLabel} confidence`,
        };
        const actionFirstActions =
            workspaceAi?.actions?.slice(0, 3).map((action) => ({
                title: action.actionTitle,
                meta: `${action.customerName} • ${action.priority} priority`,
                impact: action.mrrAtRiskMinor
                    ? `${formatGBPFromMinor(action.mrrAtRiskMinor)} at risk`
                    : `${action.riskScore}/100 risk`,
                tone:
                    action.severity === "critical" || action.severity === "high"
                        ? "danger"
                        : action.severity === "medium"
                            ? "warn"
                            : "good",
                href: `/dashboard/accounts-at-risk/${action.customerId}`,
            })) ?? [];

        const actions: Array<{
            title: string;
            meta: string;
            impact: string;
            tone: "danger" | "warn" | "good";
            href?: string;
        }> = [];

        if (actionFirstActions.length) {
            return {
                headline: "Cobrai found the next best retention actions.",
                summaryLine: `${actionFirstActions.length} action${actionFirstActions.length === 1 ? "" : "s"} prioritised by risk, revenue, and confidence.`,
                tone: actionFirstActions[0]?.tone ?? "good",
                primaryMetric,
                actions: actionFirstActions,
            };
        }

        if (failedSubscriptions > 0) {
            const targetRisk = aiRiskOpp.risk[0];

            actions.push({
                title: "Recover failed payments",
                meta: `Target ${failedSubscriptions} failed subscription${failedSubscriptions === 1 ? "" : "s"}`,
                impact: mrrAtRiskMinor > 0 ? `${formatGBPFromMinor(mrrAtRiskMinor)} at risk` : "Revenue protection",
                tone: "danger",
                href: targetRisk?.id
                    ? `/dashboard/customer/${targetRisk.id}`
                    : "/dashboard/accounts-at-risk",
            });
        }

        if (atRiskAccounts > 0) {
            const targetRisk = aiRiskOpp.risk[1] ?? aiRiskOpp.risk[0];

            actions.push({
                title: "Re-engage at-risk accounts",
                meta: `${atRiskAccounts} customer${atRiskAccounts === 1 ? "" : "s"} flagged by Cobrai`,
                impact: mrrAtRiskMinor > 0 ? `${formatGBPFromMinor(mrrAtRiskMinor)} exposed` : "Lower churn pressure",
                tone: "warn",
                href: targetRisk?.id ? `/dashboard/customer/${targetRisk.id}` : "/dashboard/accounts-at-risk",
            });
        }

        if (aiRiskOpp.opp.length > 0) {
            const topOpp = aiRiskOpp.opp[0];

            actions.push({
                title: "Push expansion on positive movers",
                meta: topOpp ? `${topOpp.name} and similar accounts show upside` : "Expansion-ready accounts detected",
                impact: topOpp?.meta || "Expansion opportunity",
                tone: "good",
                href: topOpp?.id ? `/dashboard/customer/${topOpp.id}` : "/dashboard/accounts-at-risk",
            });
        }

        if (!actions.length) {
            actions.push({
                title: "Maintain automations",
                meta: "No urgent revenue risk detected right now",
                impact: "Monitor next month’s movement",
                tone: "good",
                href: "/dashboard/accounts-at-risk",
            });
        }

        return {
            headline,
            summaryLine,
            tone,
            primaryMetric,
            actions: actions.slice(0, 3),
        };
    }, [
        failedSubscriptions,
        reactivations,
        atRiskAccounts,
        mrrAtRiskMinor,
        mrrDeltaPct,
        churnDeltaPp,
        mauLatestDeltaPct,
        aiInsightMetrics.businessHealthScore,
        aiInsightMetrics.businessHealthLabel,
        aiInsightMetrics.confidenceLabel,
        aiRiskOpp.opp,
        aiRiskOpp.risk,
        workspaceAi?.actions,
    ]);

    const mrrDriverRows = useMemo(() => getDriverRows(drawerInsights.mrr.drivers), [drawerInsights.mrr.drivers]);

    const riskAccountRows = useMemo(
        () => getRiskAccountRows(attention, summary, drawerInsights),
        [attention, summary, drawerInsights]
    );

    const expansionRows = useMemo(
        () => getExpansionRows(mrrTimeseries, drawerInsights, attention),
        [mrrTimeseries, drawerInsights, attention]
    );

    function renderDelta(delta: number | null, inverse?: boolean) {
        if (typeof delta !== "number" || !Number.isFinite(delta)) return null;

        const positive = delta > 0;
        const neutral = delta === 0;
        const good = inverse ? !positive && !neutral : positive && !neutral;
        const color = neutral ? "#64748b" : good ? "#16a34a" : "#dc2626";
        const arrow = neutral ? "→" : positive ? "↑" : "↓";

        return (
            <span
                style={{
                    color,
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                }}
            >
                <span>{arrow}</span>
                <span>{Math.abs(delta).toFixed(1)}%</span>
            </span>
        );
    }

    function renderDeltaPp(delta: number | null, inverse?: boolean) {
        if (typeof delta !== "number" || !Number.isFinite(delta)) return null;

        const positive = delta > 0;
        const neutral = delta === 0;
        const good = inverse ? !positive && !neutral : positive && !neutral;
        const color = neutral ? "#64748b" : good ? "#16a34a" : "#dc2626";
        const arrow = neutral ? "→" : positive ? "↑" : "↓";

        return (
            <span
                style={{
                    color,
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                }}
            >
                <span>{arrow}</span>
                <span>{Math.abs(delta).toFixed(1)}pp</span>
            </span>
        );
    }

    let content: ReactNode = null;

    if (status === "checking" || loading) {
        content = (
            <div className={styles.centerState}>
                <div className={styles.loader} />
                <div>Loading analytics…</div>
            </div>
        );
    } else if (status === "guest") {
        content = null;
    } else if (error) {
        content = <div className={styles.errorBox}>{error}</div>;
    } else if (!summary) {
        content = (
            <div className={styles.centerState}>
                <div className={styles.loader} />
                <div>Loading analytics…</div>
            </div>
        );
    } else {
        content = (
            <>
                <div className={styles.header}>
                    <div>
                        <h1 className={styles.title}>Analytics</h1>
                        <p className={styles.subtitle}>MRR, churn, and risk trends.</p>
                        <p className={styles.subtitle}>
                            Last refreshed: {derived.isPro ? niceWhen(automation?.lastAutoUpdateAt) : niceWhen(lastRefreshedAt)}
                        </p>
                    </div>
                </div>

                {actionToast ? <div className={styles.toast}>{actionToast}</div> : null}

                <div className={styles.kpiGrid}>
                    <div className={styles.kpiCard}>
                        <div className={styles.kpiTop}>
                            <div className={styles.kpiLabel}>Total MRR</div>
                            <div className={styles.kpiIcon}>£</div>
                        </div>

                        <div className={styles.kpiValue}>
                            {formatGBPFromMinor(demoKpis.totalMrr)}
                        </div>

                        <div className={styles.kpiSub}>
                            {typeof mrrDeltaPct === "number" && previousMrrMinor !== null ? (
                                <>
                                    {renderDelta(mrrDeltaPct)}
                                    <span style={{ marginLeft: 6, color: "#64748b" }}>
                                        vs {formatGBPFromMinor(previousMrrMinor)} last month
                                    </span>
                                </>
                            ) : (
                                "From connected billing data"
                            )}
                        </div>
                    </div>

                    <div className={styles.kpiCard}>
                        <div className={styles.kpiTop}>
                            <div className={styles.kpiLabel}>MRR Protected</div>
                            <div className={styles.kpiIcon}>✓</div>
                        </div>

                        <div className={styles.kpiValue}>
                            {formatGBPFromMinor(demoKpis.mrrProtected)}
                        </div>

                        <div className={styles.kpiSub}>
                            {typeof protectedDeltaPct === "number" && previousMrrProtected !== null ? (
                                <>
                                    {renderDelta(protectedDeltaPct)}
                                    <span style={{ marginLeft: 6, color: "#64748b" }}>
                                        vs {formatGBPFromMinor(previousMrrProtected)} last month
                                    </span>
                                </>
                            ) : (
                                "Saved by interventions"
                            )}
                        </div>
                    </div>

                    <div className={styles.kpiCard}>
                        <div className={styles.kpiTop}>
                            <div className={styles.kpiLabel}>MRR At Risk</div>
                            <div className={styles.kpiIcon}>!</div>
                        </div>

                        <div className={styles.kpiValue}>
                            {formatGBPFromMinor(demoKpis.mrrAtRisk)}
                        </div>

                        <div className={styles.kpiSub}>
                            {typeof atRiskDeltaPct === "number" && previousMrrAtRisk !== null ? (
                                <>
                                    {renderDelta(atRiskDeltaPct, true)}
                                    <span style={{ marginLeft: 6, color: "#64748b" }}>
                                        vs {formatGBPFromMinor(previousMrrAtRisk)} last month
                                    </span>
                                </>
                            ) : (
                                "Revenue currently at risk"
                            )}
                        </div>
                    </div>

                    <div className={styles.kpiCard}>
                        <div className={styles.kpiTop}>
                            <div className={styles.kpiLabel}>Churn Proxy</div>
                            <div className={styles.kpiIcon}>↓</div>
                        </div>

                        <div className={styles.kpiValue}>
                            {formatPct(demoKpis.churnPct)}
                        </div>

                        <div className={styles.kpiSub}>
                            {typeof churnDeltaPp === "number" && previousChurnPct !== null ? (
                                <>
                                    {renderDeltaPp(churnDeltaPp, true)}
                                    <span style={{ marginLeft: 6, color: "#64748b" }}>
                                        vs {previousChurnPct.toFixed(1)}% last month
                                    </span>
                                </>
                            ) : (
                                "Based on customer activity"
                            )}
                        </div>
                    </div>
                </div>

                <div className={styles.chartStack} style={{ marginTop: 14 }}>
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                            gap: 14,
                            alignItems: "start",
                        }}
                    >
                        <div className={styles.chartCardXL}>
                            <div className={styles.chartHeader}>
                                <div>
                                    <div className={styles.chartTitle}>MRR Trend</div>
                                    <div className={styles.chartMeta}>{mrrRangeLabel} • Revenue over time</div>
                                </div>

                                <div className={styles.chartActions}>
                                    <button
                                        type="button"
                                        className={mrrRange === "auto" ? styles.segmentBtnActive : styles.segmentBtn}
                                        onClick={() => setMrrRange("auto")}
                                    >
                                        Auto
                                    </button>

                                    <button
                                        type="button"
                                        className={mrrRange === "ytd" ? styles.segmentBtnActive : styles.segmentBtn}
                                        onClick={() => setMrrRange("ytd")}
                                    >
                                        YTD
                                    </button>

                                    <button
                                        type="button"
                                        className={styles.linkBtn}
                                        onClick={() => openDrawer("mrr")}
                                    >
                                        View insights
                                    </button>
                                </div>
                            </div>

                            <div className={styles.chartBodyXL} style={{ height: 260 }}>
                                {mrrSeries.length ? (
                                    <EChart option={buildMetricBarOption("MRR", mrrSeries, "currency")} />
                                ) : (
                                    <div className={styles.emptyPanel}>
                                        <div className={styles.emptyTitle}>No MRR timeseries yet</div>
                                        <div className={styles.emptyText}>
                                            Connect Stripe to generate MRR trend automatically.
                                        </div>
                                        <button
                                            type="button"
                                            className={styles.primaryBtn}
                                            onClick={() => router.push("/dashboard/settings/integrations")}
                                        >
                                            Connect Stripe
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className={styles.chartCardXL}>
                            <div className={styles.chartHeader}>
                                <div>
                                    <div className={styles.chartTitle}>Churn Trend</div>
                                    <div className={styles.chartMeta}>
                                        {churnRangeLabel} • Customer churn over time
                                    </div>
                                </div>

                                <div className={styles.chartActions}>
                                    <button
                                        type="button"
                                        className={churnRange === "auto" ? styles.segmentBtnActive : styles.segmentBtn}
                                        onClick={() => setChurnRange("auto")}
                                    >
                                        Auto
                                    </button>

                                    <button
                                        type="button"
                                        className={churnRange === "ytd" ? styles.segmentBtnActive : styles.segmentBtn}
                                        onClick={() => setChurnRange("ytd")}
                                    >
                                        YTD
                                    </button>

                                    <button
                                        type="button"
                                        className={styles.linkBtn}
                                        onClick={() => openDrawer("churn")}
                                    >
                                        View Churn insights
                                    </button>
                                </div>
                            </div>

                            <div className={styles.chartBodyXL} style={{ height: 260 }}>
                                {churnSeries.length ? (
                                    <EChart option={buildMetricBarOption("Churn", churnSeries, "percent")} />
                                ) : (
                                    <div className={styles.emptyPanel}>
                                        <div className={styles.emptyTitle}>No churn timeseries yet</div>
                                        <div className={styles.emptyText}>
                                            Once Stripe is connected and invoices exist, churn trend will appear here.
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                            gap: 14,
                            alignItems: "start",
                            marginTop: 14,
                        }}
                    >
                        <div className={styles.chartCardXL}>
                            <div className={styles.chartHeader}>
                                <div>
                                    <div className={styles.chartTitle}>Customer Activity Trend</div>

                                    <div className={styles.chartMeta} >Track engagement levels across your customer base
                                    </div>
                                </div>

                                <div className={styles.chartActions}>
                                    <button
                                        type="button"
                                        className={mauRange === "auto" ? styles.segmentBtnActive : styles.segmentBtn}
                                        onClick={() => setMauRange("auto")}
                                    >
                                        Auto
                                    </button>

                                    <button
                                        type="button"
                                        className={mauRange === "ytd" ? styles.segmentBtnActive : styles.segmentBtn}
                                        onClick={() => setMauRange("ytd")}
                                    >
                                        YTD
                                    </button>
                                </div>
                            </div>

                            <div className={styles.chartBodyXL} style={{ height: 230 }}>
                                <EChart
                                    option={buildBarOption("MAU", mauSeries)}
                                    onEvents={mauChartEvents}
                                />
                            </div>

                            <div
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                                    gap: 16,
                                }}
                            >
                                {[
                                    {
                                        label: "Total subscribers",
                                        value:
                                            selectedMauActivity?.totalSubscribers ??
                                            selectedMauPoint?.y ??
                                            "—",
                                    },
                                    {
                                        label: "New",
                                        value: selectedMauActivity?.newSubscriptions ?? 0,
                                    },
                                    {
                                        label: "Trials",
                                        value: selectedMauActivity?.newTrials ?? 0,
                                    },
                                    {
                                        label: "Unsubscribes",
                                        value: selectedMauActivity?.unsubscribes ?? 0,
                                    },
                                ].map((item) => (
                                    <div
                                        key={item.label}
                                        style={{
                                            padding: "14px 16px",
                                            borderRadius: 14,
                                            background: "#ffffff",
                                            border: "1px solid #edf2f8",
                                        }}
                                    >
                                        <div style={{ fontSize: 11, color: "#7b8798", fontWeight: 700 }}>
                                            {item.label}
                                        </div>

                                        <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, marginTop: 2 }}>
                                            {selectedMauMonthLabel}
                                        </div>

                                        <div style={{ fontSize: 22, fontWeight: 900, color: "#0f172a", marginTop: 8 }}>
                                            {item.value}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className={styles.cardBodyXL}>
                            <div className={styles.aiInsightHero}>
                                <div className={styles.aiBadge}>AI Insight</div>

                                <div className={styles.aiInsightHeadline}>{aiInsightCard.headline}</div>
                                <div className={styles.aiInsightSub}>{aiInsightCard.summaryLine}</div>

                                {!derived.isPro ? (
                                    <div
                                        style={{
                                            marginTop: 8,
                                            fontSize: 13,
                                            color: "#6b7280",
                                            lineHeight: 1.5,
                                            fontWeight: 500,
                                        }}
                                    >
                                        Upgrade to Pro for unlimited AI insights.
                                    </div>
                                ) : null}

                                <div className={styles.aiInsightDivider} />

                                <div
                                    style={{
                                        display: "grid",
                                        gridTemplateColumns: "minmax(0, 220px) minmax(0, 1fr)",
                                        gap: 14,
                                        alignItems: "start",
                                        marginBottom: 14,
                                    }}
                                >
                                    <div
                                        style={{
                                            padding: 14,
                                            borderRadius: 14,
                                            border: "1px solid #eef2f7",
                                            background: "#ffffff",
                                        }}
                                    >
                                        <div
                                            style={{
                                                fontSize: 12,
                                                fontWeight: 700,
                                                color: "#64748b",
                                                marginBottom: 6,
                                                textTransform: "uppercase",
                                                letterSpacing: 0.3,
                                            }}
                                        >
                                            {aiInsightCard.primaryMetric.label}
                                        </div>

                                        <div
                                            style={{
                                                fontSize: 28,
                                                lineHeight: 1,
                                                fontWeight: 800,
                                                color: "#0f172a",
                                                marginBottom: 8,
                                            }}
                                        >
                                            {aiInsightCard.primaryMetric.value}
                                        </div>

                                        <div
                                            style={{
                                                fontSize: 13,
                                                color: "#64748b",
                                                fontWeight: 600,
                                                lineHeight: 1.4,
                                            }}
                                        >
                                            {aiInsightCard.primaryMetric.sub}
                                        </div>
                                    </div>

                                    <div>
                                        <div
                                            style={{
                                                fontSize: 12,
                                                fontWeight: 700,
                                                color: "#64748b",
                                                textTransform: "uppercase",
                                                letterSpacing: 0.3,
                                                marginBottom: 10,
                                            }}
                                        >
                                            Prioritised actions
                                        </div>

                                        <div className={styles.aiInsightPriorityList}>
                                            {aiInsightCard.actions.map((action, idx) => (
                                                <button
                                                    key={`${action.title}-${idx}`}
                                                    type="button"
                                                    className={styles.aiInsightPriorityItem}
                                                    onClick={() => {
                                                        if (!action.href) return;
                                                        router.push(action.href);
                                                    }}
                                                    style={{
                                                        width: "100%",
                                                        textAlign: "left",
                                                        background: "#fff",
                                                        cursor: action.href ? "pointer" : "default",
                                                    }}
                                                >
                                                    <div className={styles.aiInsightPriorityIndex}>{idx + 1}</div>

                                                    <div style={{ minWidth: 0, flex: 1 }}>
                                                        <div className={styles.aiInsightPriorityText}>
                                                            {action.title}
                                                        </div>
                                                        <div className={styles.aiInsightPriorityMeta}>
                                                            {action.meta}
                                                        </div>
                                                    </div>

                                                    <div
                                                        className={styles.aiImpact}
                                                        style={{
                                                            color:
                                                                action.tone === "danger"
                                                                    ? "#dc2626"
                                                                    : action.tone === "warn"
                                                                        ? "#d97706"
                                                                        : "#16a34a",
                                                        }}
                                                    >
                                                        {action.impact}
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <InsightDrawer
                    open={drawerOpen}
                    drawerView={drawerView}
                    onClose={closeDrawer}
                    onSwitchView={setDrawerView}
                    isDemoPreview={isDemoPreview}
                    drawerInsights={drawerInsights}
                    riskAccountRows={riskAccountRows}
                    expansionRows={expansionRows}
                    mrrDriverRows={mrrDriverRows}
                    mrrForecast={mrrForecast}
                    churnForecast={churnForecast}
                    aiMrr={aiMrr}
                    aiChurn={aiChurn}
                    aiActions={workspaceAi?.actions ?? []}
                    tier={summary?.tier ?? "free"}
                    trialEndsAt={summary?.trialEndsAt ?? null}
                />
            </>
        );
    }

    return <div className={styles.page}>{content}</div>;
}