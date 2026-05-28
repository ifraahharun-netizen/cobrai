"use client";

import {
    useEffect,
    useMemo,
    useState,
    type Dispatch,
    type ReactNode,
    type SetStateAction,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { EChartsOption } from "echarts";
import {
    churnTrendOption,
    mrrProtectedOption,

} from "@/components/charts/options";

import { buildDemoSeries } from "@/lib/demo/analytics";

import { getEmailRecommendation } from "@/lib/emailRecommendations";

import { Users } from "lucide-react";

import * as echarts from "echarts";


import { canAccessFeature, type PlanTier } from "@/lib/permissions";

import { onAuthStateChanged, type User } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase.client";

import type { ActionFirstRecommendation, Insight } from "@/lib/ai/types";

import styles from "./analytics.module.css";
const EChart = dynamic(() => import("@/components/charts/EChart"), {
    ssr: false,
    loading: () => <div style={{ height: 390 }}>Loading chart...</div>,
});
/* ================= TYPES ================= */

type DashboardSummary = {
    ok: boolean;
    error?: string;
    tier?: "free" | "starter" | "pro";
    currency?: string;
    workspaceCurrency?: string;
    billingCurrency?: string;
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

type AiMonthlyInsight = {
    month: string;
    summary: string;
};


type MrrProtectedRes = {
    ok: boolean;
    mrrProtected?: number;
    error?: string;
};

type AiWorkspaceRes = {
    insights: Insight[];
    actions: ActionFirstRecommendation[];

    aiEffectiveness?: {
        score: number;
        label: string;
        summary: string;
        drivers: {
            label: string;
            value: string | number;
        }[];
    };

    operationalSummary?: {
        headline: string;
        summary: string;
        confidence: "Low" | "Medium" | "High";
    };

    businessNarrative?: {
        headline: string;
        summary: string;
        businessHealth: string;
        churnPrediction: string;
        engagementAnalysis: string;
        revenueForecast: string;
        forecastExplanation?: {
            mrr: string;
            churn: string;
        };

        health?: {
            overallScore: number;
            label: "Strong" | "Healthy" | "Watch" | "At Risk";
            summary: string;
        };

        forecast?: {
            nextMonthMrr: number;
            projectedGrowthPct: number;
            predictedChurnPct: number;
            confidence: "Low" | "Medium" | "High";
        };

        mrrDrivers?: Array<{
            label: string;
            impact: number;
            direction: "positive" | "negative";
            explanation: string;
        }>;

        riskAccounts?: Array<{
            customerId: string;
            customerName: string;
            churnRisk: number;
            mrrAtRiskMinor: number;
            reason: string;
            recommendedAction: string;
        }>;

        engagementScore?: number;
    };

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
    lastEventAt?: string | null;
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
        churned: number;
        retained: number;
        trials: number;
        totalSubscribers: number;
        newSubscribers: number;
        upgrades?: number;
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

function formatAiReason(reason?: string | null) {
    if (!reason) {
        return "Customer shows elevated churn risk.";
    }

    return reason
        .replaceAll("_", " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizePlanTier(tier?: string | null): PlanTier {
    if (tier === "pro") return "pro";
    if (tier === "starter") return "starter";
    return "free";
}

function getBrowserLocale() {
    if (typeof navigator !== "undefined" && navigator.language) {
        return navigator.language;
    }

    return "en-GB";
}

function getWorkspaceCurrency(summary?: DashboardSummary | null) {
    return (
        (summary as any)?.currency ||
        (summary as any)?.workspaceCurrency ||
        (summary as any)?.billingCurrency ||
        "GBP"
    ).toUpperCase();
}

function buildRiskAccountAction(customer: any) {
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

    if (
        flags.includes("renewal") ||
        flags.includes("contract")
    ) {
        return "Schedule renewal check-in with decision maker";
    }

    if (
        flags.includes("downgrade") ||
        flags.includes("plan")
    ) {
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

function buildRiskAccountReason(customer: any) {
    const flags = Array.isArray(customer.reasonFlags)
        ? customer.reasonFlags.filter(Boolean)
        : [];

    if (flags.length) {
        return flags.join(" + ");
    }

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

function formatCurrencyFromMinor(
    maybeMinor: number | null | undefined,
    currency = "GBP"
) {
    const minor = Number(maybeMinor || 0);
    const amount = minor / 100;

    try {
        return new Intl.NumberFormat(getBrowserLocale(), {
            style: "currency",
            currency,
        }).format(amount);
    } catch {
        return `${amount.toFixed(2)} ${currency}`;
    }
}

function formatMoneyAmount(
    amount: number | null | undefined,
    currency = "GBP"
) {
    const safeAmount = Number(amount || 0);

    try {
        return new Intl.NumberFormat(getBrowserLocale(), {
            style: "currency",
            currency,
        }).format(safeAmount);
    } catch {
        return `${safeAmount.toFixed(2)} ${currency}`;
    }
}

function formatExactDate(iso?: string | null) {
    if (!iso) return "This month";

    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "This month";

    return new Intl.DateTimeFormat(getBrowserLocale(), {
        day: "numeric",
        month: "long",
    }).format(d);
}

function formatCompactCurrencyFromMinor(
    minor: number,
    currency = "GBP"
) {
    const amount = Number(minor || 0) / 100;

    try {
        return new Intl.NumberFormat(getBrowserLocale(), {
            style: "currency",
            currency,
            maximumFractionDigits: 0,
            notation: "compact",
        }).format(amount);
    } catch {
        return `${amount.toFixed(0)} ${currency}`;
    }
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
    const token = await user.getIdToken();

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
    const token = await user.getIdToken();

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

    return new Intl.DateTimeFormat(getBrowserLocale(), {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
    }).format(d);
}
function formatSigned(n: number | null | undefined, digits = 0) {
    const value = Number(n);

    if (!Number.isFinite(value)) {
        return "—";
    }

    const sign = value > 0 ? "+" : "";

    return `${sign}${value.toFixed(digits)}`;
}

function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

function formatMonthLong(monthKey: string) {
    const d = new Date(`${monthKey}-01T00:00:00`);
    if (Number.isNaN(d.getTime())) return monthKey;

    return new Intl.DateTimeFormat(getBrowserLocale(), {
        month: "long",
    }).format(d);
}

function formatMonthLongYear(monthKey: string | null | undefined) {
    if (!monthKey) return "—";

    const [year, month] = monthKey.split("-").map(Number);
    if (!year || !month) return monthKey;

    const date = new Date(year, month - 1, 1);

    return new Intl.DateTimeFormat(getBrowserLocale(), {
        month: "long",
        year: "numeric",
    }).format(date);
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
                ? formatCurrencyFromMinor(Math.round(currentValue * 100))
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
            ? formatCurrencyFromMinor(Math.round(Math.abs(delta) * 100))
            : yMode === "percent"
                ? `${Math.abs(delta).toFixed(1)}pp`
                : `${Math.abs(Math.round(delta))}`;

    const previousText =
        yMode === "currency"
            ? formatCurrencyFromMinor(Math.round(safePrevious * 100))
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

function addMonths(monthKey: string, amount: number) {
    const [year, month] = monthKey.split("-").map(Number);
    const date = new Date(year, month - 1 + amount, 1);

    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function buildForecastPoints(
    series: Array<{ x: string; y: number | null }>,
    months = 3,
    inverse = false
) {
    const forecast = computeForecastFromSeries(series);
    if (!forecast) return [];

    const monthlyDelta = forecast.delta;

    return Array.from({ length: months }, (_, index) => {
        const nextValue = forecast.lastValue + monthlyDelta * (index + 1);

        return {
            x: addMonths(forecast.lastMonth, index + 1),
            y: inverse ? Math.max(0, nextValue) : Math.max(0, nextValue),
        };
    });
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
                ? `Downside: ${formatCompactCurrencyFromMinor(totalDown)} (churn ${formatCompactCurrencyFromMinor(
                    churned
                )}, contraction ${formatCompactCurrencyFromMinor(contraction)}).`
                : `Not enough history to decompose drivers yet.`,

            d
                ? `Upside: ${formatCompactCurrencyFromMinor(totalUp)} (new ${formatCompactCurrencyFromMinor(
                    newMinor
                )}, expansion ${formatCompactCurrencyFromMinor(expansion)}).`
                : null,

            d && churned > 0 && Number.isFinite(Number(withoutChurnPct))
                ? `Without churn, MoM would be ${withoutChurnDelta >= 0 ? "+" : "−"
                }${formatCompactCurrencyFromMinor(Math.abs(withoutChurnDelta))} (${formatSigned(
                    withoutChurnPct as number,
                    1
                )}%).`
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
            top ? `Largest churn impact: ${top.name} (${formatCurrencyFromMinor(top.mrrMinor)}).` : null,
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
            lastEventAt: row.lastEventAt ?? new Date().toISOString(),
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
                    riskScore: Number(row.risk || 0),
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

    if (fromAttention.length) return fromAttention;

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
                    riskScore: Number(row.risk || 0),
                    automation: "Trigger retention follow-up",
                    lastEventAt: new Date().toISOString(),
                }))
            : [];

    if (fromSummary.length) return fromSummary;

    return drawerInsights.churn.churnedAccounts.map((row, idx) => ({
        id: row.id || `${row.name}-${idx}`,
        name: row.name,
        email: row.email ?? null,
        reason: "Recently churned or inactive account",
        mrrMinor: row.mrrMinor,
        riskScore: 0,
        automation: "Draft win-back email",
        lastEventAt: row.lastEventAt ?? null,
    }));
}

const positiveMrrReasons = [
    "New subscription started",
    "Upgraded to Pro plan",
    "Upgraded to annual plan",
    "Payment retry succeeded",
    "Failed renewal recovered",
    "Subscription reactivated",
    "Added more paid seats",
    "Added new workspace",
    "Plan price increased",
    "Trial converted to paid",
    "Customer renewed subscription",
    "Discount expired",
    "Usage-based billing increased",
    "Add-on purchased",
    "Additional team invited",
    "Account expanded to higher tier",
    "Cancelled account recovered",
    "Past-due invoice paid",
    "Billing issue resolved",
    "Annual renewal completed",
];

function getDriverDate(row: { lastEventAt?: string | null }) {
    return formatExactDate(row.lastEventAt);
}

function getDynamicChurnAction(row: {
    reason?: string | null;
    automation?: string | null;
    recommendedAction?: string | null;
    riskScore?: number;
}) {
    const aiAction =
        row.recommendedAction?.trim() ||
        row.automation?.trim();

    if (aiAction && !aiAction.toLowerCase().includes("trigger retention follow-up")) {
        return aiAction;
    }

    const text = `${row.reason || ""}`.toLowerCase();

    if (
        text.includes("failed payment") ||
        text.includes("payment failed") ||
        text.includes("billing") ||
        text.includes("invoice") ||
        text.includes("past due")
    ) {
        return "Retry payment and send billing recovery email";
    }

    if (
        text.includes("low engagement") ||
        text.includes("usage dropped") ||
        text.includes("inactive") ||
        text.includes("engagement")
    ) {
        return "Send usage recovery email";
    }

    if (
        text.includes("renewal") ||
        text.includes("renewal window")
    ) {
        return "Schedule renewal check-in";
    }

    if (
        text.includes("downgrade") ||
        text.includes("plan downgrade")
    ) {
        return "Send downgrade prevention offer";
    }

    if (Number(row.riskScore || 0) >= 85) {
        return "Escalate to high-priority retention outreach";
    }

    return "Send personalised retention follow-up";
}

function getMrrDriverRiskScore(row: { valueMinor?: number; reason?: string | null }) {
    const value = Number(row.valueMinor || 0);
    const text = `${row.reason || ""}`.toLowerCase();

    let score = 42;

    if (value >= 3000000) score += 28;
    else if (value >= 1000000) score += 20;
    else if (value >= 500000) score += 14;
    else if (value >= 100000) score += 8;

    if (text.includes("new")) score -= 8;
    if (text.includes("upgrade") || text.includes("annual") || text.includes("expansion")) score -= 6;
    if (text.includes("payment") || text.includes("recovered")) score += 6;

    return clamp(Math.round(score), 1, 99);
}

function getExpansionRows(
    mrrSource: TimeseriesRes | null,
    drawerInsights: NonNullable<TimeseriesRes["insights"]>,
    attention: AttentionRes | null
): ExpansionRow[] {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();
    const positiveMrrEvents = positiveMrrReasons.map((reason, index) => ({
        action: reason,
        reason,
        lastEventAt: new Date(
            currentYear,
            currentMonth,
            Math.max(1, 22 - index),
            9 + (index % 5)
        ).toISOString(),
    }));

    if (mrrSource?.expansionRows?.length) {
        return mrrSource.expansionRows
            .map((row, index): ExpansionRow => {
                const selected = positiveMrrEvents[index % positiveMrrEvents.length];

                return {
                    id: row.id,
                    name: row.name,
                    email: row.email ?? null,
                    upsideMinor: row.upsideMinor,
                    action: selected.action,
                    reason: selected.reason,
                    confidence:
                        normalizeConfidence(row.confidence) ||
                        (row.upsideMinor > 20000
                            ? "High"
                            : row.upsideMinor > 8000
                                ? "Medium"
                                : "Low"),
                    lastEventAt: row.lastEventAt ?? selected.lastEventAt,
                };
            })
            .sort((a, b) => b.upsideMinor - a.upsideMinor)
            .slice(0, 5);
    }

    const movers: ExpansionRow[] = drawerInsights.mrr.topMovers
        .filter((m) => m.deltaMinor > 0)
        .sort((a, b) => b.deltaMinor - a.deltaMinor)
        .slice(0, 5)
        .map((m, index): ExpansionRow => {
            const selected = positiveMrrEvents[index % positiveMrrEvents.length];

            return {
                id: m.id || `${m.name}-${index}`,
                name: m.name,
                email: m.email ?? null,
                upsideMinor: m.deltaMinor,
                action: selected.action,
                reason: selected.reason,
                confidence: m.deltaMinor > 20000 ? "High" : "Medium",
                lastEventAt: selected.lastEventAt,
            };
        });

    if (movers.length) return movers;

    const fromAttention: ExpansionRow[] =
        attention?.ok && attention.rows?.length
            ? attention.rows
                .filter((row) => row.risk <= 60)
                .slice(0, 5)
                .map((row, index): ExpansionRow => {
                    const selected = positiveMrrEvents[index % positiveMrrEvents.length];

                    return {
                        id: row.id,
                        name: row.company,
                        email: null,
                        upsideMinor: row.mrrMinor ?? 0,
                        action: selected.action,
                        reason: selected.reason,
                        confidence: "Medium",
                        lastEventAt: selected.lastEventAt,
                    };
                })
            : [];

    return fromAttention;
}

function buildMiniChartPath(values: number[]) {
    const safe = values.filter((v) => Number.isFinite(v));

    if (safe.length < 2) {
        return {
            line: "M0 55 Q110 40 220 55",
            glow: "M0 55 Q110 40 220 55",
            area: "M0 55 Q110 40 220 55 L220 95 L0 95 Z",
            baselineY: 72,
            last: { x: 220, y: 55 },
        };
    }

    const width = 220;
    const height = 95;

    const topPad = 12;
    const bottomPad = 20;
    const sidePad = 4;

    const min = Math.min(...safe);
    const max = Math.max(...safe);

    const range = max - min || 1;

    const points = safe.map((value, index) => {
        const x =
            sidePad +
            (index / (safe.length - 1)) * (width - sidePad * 2);

        const normalized =
            (value - min) / range;

        const y =
            height -
            bottomPad -
            normalized * (height - topPad - bottomPad);

        return { x, y };
    });

    let line = `M ${points[0].x} ${points[0].y}`;

    for (let i = 0; i < points.length - 1; i++) {
        const current = points[i];
        const next = points[i + 1];

        const cx =
            (current.x + next.x) / 2;

        line += ` Q ${cx} ${current.y} ${next.x} ${next.y}`;
    }

    const baselineY = 74;

    const area =
        `${line} L ${width} ${baselineY} L 0 ${baselineY} Z`;

    return {
        line,
        glow: line,
        area,
        baselineY,
        last: points[points.length - 1],
    };
}

function EmailModalPortal({
    open,
    children,
}: {
    open: boolean;
    children: React.ReactNode;
}) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    if (!mounted || !open) return null;

    return createPortal(children, document.body);
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

    const [aiMrrInsights, setAiMrrInsights] = useState<AiMonthlyInsight[]>([]);


    const AI_ACCOUNTS_PER_PAGE = 3;
    const [aiAccountPage, setAiAccountPage] = useState(0);


    const [aiChurnInsights, setAiChurnInsights] = useState<AiMonthlyInsight[]>([]);

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
    const [upgradeOpen, setUpgradeOpen] = useState(false);

    const [emailDraftOpen, setEmailDraftOpen] = useState(false);
    const [emailDraft, setEmailDraft] = useState({
        to: "",
        subject: "",
        body: "",
    });

    const [drawerOpen, setDrawerOpen] = useState(false);
    const [drawerView, setDrawerView] = useState<DrawerView>("mrr");

    type AiRevenueTab = "mrr" | "churn";

    const [aiRevenueTab, setAiRevenueTab] = useState<AiRevenueTab>("mrr");

    useEffect(() => {
        setAiAccountPage(0);
    }, [aiRevenueTab]);

    const openDrawer = (view: DrawerView) => {
        setDrawerView(view);
        setDrawerOpen(true);
    };

    const handleRetryPayment = async (
        accountId: string,
        customerId?: string
    ) => {
        try {
            if (!user) return;

            const res = await authedPost(
                "/api/automation/retry-payment",
                user,
                {
                    accountId,
                    customerId,
                }
            );

            if (res?.url) {
                window.open(res.url, "_blank");
            }
        } catch (e) {
            console.error(e);
        }
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

                const [summaryRes, mrrRes] = await Promise.all([
                    authedGet("/api/dashboard/summary", user) as Promise<DashboardSummary>,
                    authedGet("/api/dashboard/metrics/mrr-protected", user) as Promise<MrrProtectedRes>,
                ]);

                if (!summaryRes.ok) throw new Error(summaryRes.error || "Summary failed");
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

        async function loadTimeseries() {
            try {
                if (!user) return;

                const res = (await authedGet(
                    `/api/dashboard/analytics/timeseries?range=${mrrRange}`,
                    user
                )) as TimeseriesRes;

                if (!res.ok) throw new Error(res.error || "Timeseries failed");

                if (!cancelled) {
                    setMrrTimeseries(res);
                    setChurnTimeseries(res);
                    setMauTimeseries(res);
                }
            } catch {
                if (!cancelled) {
                    setMrrTimeseries(null);
                    setChurnTimeseries(null);
                    setMauTimeseries(null);
                }
            }
        }

        if (status === "authed" && user) {
            void loadTimeseries();
        }

        return () => {
            cancelled = true;
        };
    }, [status, user, mrrRange]);

    useEffect(() => {
        let cancelled = false;

        const isDemoPreview = summary?.demoMode === true || mrrTimeseries?.mode === "demo";

        const isActiveTrial =
            !!summary?.trialEndsAt &&
            new Date(summary.trialEndsAt).getTime() > Date.now();

        const normalizedTier = normalizePlanTier(summary?.tier);

        const hasAiRevenueAccess =
            normalizedTier === "pro" ||
            normalizedTier === "free" ||
            isDemoPreview ||
            isActiveTrial;

        async function loadProPanels(s?: DashboardSummary | null) {
            try {
                if (!user) return;

                const isPro = hasAiRevenueAccess;
                if (!isPro) {
                    setAutomation(null);
                    setInsights(null);
                    setAttention(null);
                    setWorkspaceAi(null);
                    return;
                }

                const aiRes = await authedPost(
                    "/api/dashboard/ai/insights",
                    user,
                    {
                        timeframe: mrrRange === "ytd" ? "month" : "week",
                    }
                ) as AiWorkspaceRes;

                if (cancelled) return;

                setWorkspaceAi(aiRes);

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
    }, [status, user, summary, mrrRange, mrrTimeseries?.mode]);


    const mrrSource = mrrTimeseries;
    const churnSource = churnTimeseries;
    const mauSource = mauTimeseries;
    const demoAnalytics = useMemo(() => buildDemoSeries(), []);

    const isDemoMode =
        mrrSource?.mode === "demo" ||
        summary?.demoMode === true;

    const demoMrrSeries = demoAnalytics.mrr.map((p) => ({
        x: p.month,
        y: Number(p.valueMinor || 0) / 100,
    }));

    const demoChurnSeries = demoAnalytics.churn.map((p) => ({
        x: p.month,
        y: Number(p.valuePct || 0),
    }));

    const demoMauSeries = demoAnalytics.mau.map((p) => ({
        x: p.month,
        y: Number(p.activeUsers || 0),
    }));

    const mrrSeries = useMemo(() => {
        const fromApi =
            mrrSource?.mrr?.map((p) => ({
                x: p.month,
                y: Number(p.valueMinor || 0) / 100,
            })) ?? [];

        if (isDemoMode) return demoMrrSeries;

        return fromApi;
    }, [mrrSource, isDemoMode, demoMrrSeries]);

    const churnSeries = useMemo(() => {
        const fromApi =
            churnSource?.churn?.map((p) => ({
                x: p.month,
                y: Number(p.valuePct || 0),
            })) ?? [];

        if (isDemoMode) return demoChurnSeries;

        return fromApi;
    }, [churnSource, isDemoMode, demoChurnSeries]);

    const mauSeries = useMemo(() => {
        const fromApi =
            mauSource?.mau?.map((p) => ({
                x: p.month,
                y: Number(p.activeUsers || 0),
            })) ?? [];

        if (isDemoMode) return demoMauSeries;

        return fromApi;
    }, [mauSource, isDemoMode, demoMauSeries]);

    const fallbackDrawerInsights: NonNullable<TimeseriesRes["insights"]> = {
        mrr: {
            currentMinor: summary?.kpis?.totalMrr ?? 69700,
            prevMinor: 64200,
            deltaMinor: 5500,
            deltaPct: 8.6,
            drivers: {
                newMinor: 18000,
                expansionMinor: 12400,
                contractionMinor: 5200,
                churnedMinor: 9700,
                driverAccounts: [],
            },
            topMovers: [],
        },
        churn: {
            currentPct: summary?.kpis?.churnPct ?? 3.2,
            prevPct: 4.1,
            deltaPp: -0.9,
            churnedAccounts: [],
        },
        months: {
            current: "2026-05",
            previous: "2026-04",
        },
    };

    const drawerInsights: NonNullable<TimeseriesRes["insights"]> = {
        ...fallbackDrawerInsights,
        ...(mrrSource?.insights ?? {}),
        mrr: {
            ...fallbackDrawerInsights.mrr,
            ...(mrrSource?.insights?.mrr ?? {}),
        },
        churn: {
            ...fallbackDrawerInsights.churn,
            ...(mrrSource?.insights?.churn ?? {}),
        },
        months: {
            ...fallbackDrawerInsights.months,
            ...(mrrSource?.insights?.months ?? {}),
        },
    };


    const demoKpis = {
        totalMrr:
            summary?.kpis?.totalMrr &&
                summary.kpis.totalMrr > 0
                ? summary.kpis.totalMrr
                : isDemoMode
                    ? 223000
                    : 0,

        mrrProtected:
            mrrProtected && mrrProtected > 0
                ? mrrProtected
                : isDemoMode
                    ? 268000
                    : 0,

        mrrAtRisk:
            summary?.kpis?.mrrAtRisk &&
                summary.kpis.mrrAtRisk > 0
                ? summary.kpis.mrrAtRisk
                : isDemoMode
                    ? 43100
                    : 0,

        churnPct:
            typeof summary?.kpis?.churnPct === "number" &&
                summary.kpis.churnPct > 0
                ? summary.kpis.churnPct
                : isDemoMode
                    ? 2.6
                    : 0,

        atRiskAccounts:
            summary?.kpis?.atRiskAccounts &&
                summary.kpis.atRiskAccounts > 0
                ? summary.kpis.atRiskAccounts
                : isDemoMode
                    ? 8
                    : 0,
    };

    const workspaceCurrency = getWorkspaceCurrency(summary);

    const currencySymbol =
        formatCurrencyFromMinor(0, workspaceCurrency).replace(/[0-9.,\s]/g, "") ||
        workspaceCurrency;

    const mauCurrentPoint =
        mauSeries.length > 0
            ? mauSeries[mauSeries.length - 1]
            : null;

    const mauPrevPoint =
        mauSeries.length > 1
            ? mauSeries[mauSeries.length - 2]
            : null;

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
                    meta: `${r.riskBand} risk • ${r.mrrMinor ? formatCompactCurrencyFromMinor(r.mrrMinor, workspaceCurrency) : "—"} MRR`,
                    hint: r.recommendedAction || r.driver || "Review engagement + billing signals",
                }))
                : riskFromMovers.map((m) => {
                    const matched = accountLookup.get(m.name.trim().toLowerCase());
                    return {
                        id: matched?.id || "",
                        name: matched?.name || m.name,
                        meta: `MRR down • −${formatCompactCurrencyFromMinor(
                            Math.abs(m.deltaMinor),
                            workspaceCurrency
                        )}`,
                        hint: "Investigate usage + payment + plan changes",
                    };
                }),
            opp: oppFromMovers.map((m) => {
                const matched = accountLookup.get(m.name.trim().toLowerCase());
                return {
                    id: matched?.id || "",
                    name: matched?.name || m.name,
                    meta: `Upside • +${formatCompactCurrencyFromMinor(Math.abs(m.deltaMinor), workspaceCurrency)}`,
                    hint: "Target expansion / seat uplift / annual upgrade",
                };
            }),
        };
    }, [attention, drawerInsights.mrr.topMovers, accountLookup]);

    const isDemoPreview = summary?.demoMode === true || mrrSource?.mode === "demo";

    const isActiveTrial =
        !!summary?.trialEndsAt &&
        new Date(summary.trialEndsAt).getTime() > Date.now();

    const normalizedTier = normalizePlanTier(summary?.tier);

    const hasAiRevenueAccess =
        normalizedTier === "pro" ||
        normalizedTier === "free" ||
        isDemoPreview ||
        isActiveTrial;

    const hasForecastAccess = canAccessFeature({
        plan: normalizedTier,
        feature: "forecasting",
        trialEndsAt: summary?.trialEndsAt ?? null,
        isDemoMode: isDemoPreview,
    });
    const mrrForecastPoints = useMemo(
        () => (hasForecastAccess ? buildForecastPoints(mrrSeries, 3, false) : []),
        [hasForecastAccess, mrrSeries]
    );

    const churnForecastPoints = useMemo(
        () => (hasForecastAccess ? buildForecastPoints(churnSeries, 3, true) : []),
        [hasForecastAccess, churnSeries]
    );
    const hasAiInsightAccess = canAccessFeature({
        plan: normalizedTier,
        feature: "ai-insights",
        trialEndsAt: summary?.trialEndsAt ?? null,
        isDemoMode: isDemoPreview,
    });

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

    const mrrDriverRows = useMemo(() => getDriverRows(drawerInsights.mrr.drivers), [drawerInsights.mrr.drivers]);

    const riskAccountRows = useMemo(
        () => getRiskAccountRows(attention, summary, drawerInsights),
        [attention, summary, drawerInsights]
    );

    const pageCount = Math.max(
        1,
        Math.ceil(riskAccountRows.length / AI_ACCOUNTS_PER_PAGE)
    );
    const pagedRows = riskAccountRows.slice(
        aiAccountPage * AI_ACCOUNTS_PER_PAGE,
        (aiAccountPage + 1) * AI_ACCOUNTS_PER_PAGE
    );

    const expansionRows = useMemo(
        () => getExpansionRows(mrrTimeseries, drawerInsights, attention),
        [mrrTimeseries, drawerInsights, attention]
    );
    const topRiskFactorCards = useMemo(() => {
        const rows = riskAccountRows ?? [];

        const totalRiskMinor = rows.reduce(
            (sum, row) => sum + Number(row.mrrMinor || 0),
            0
        );

        const failedPaymentRows = rows.filter((row) => {
            const text = `${row.reason} ${row.automation}`.toLowerCase();
            return text.includes("payment") || text.includes("billing") || text.includes("failed");
        });

        const lowEngagementRows = rows.filter((row) => {
            const text = `${row.reason} ${row.automation}`.toLowerCase();
            return (
                text.includes("engagement") ||
                text.includes("inactive") ||
                text.includes("usage") ||
                text.includes("health")
            );
        });

        return [
            rows.length
                ? {
                    icon: "!",
                    title: "High churn exposure",
                    detail: `${rows.length} account${rows.length === 1 ? "" : "s"} represent ${formatCurrencyFromMinor(
                        totalRiskMinor,
                        workspaceCurrency
                    )} MRR at risk`,
                    impact: totalRiskMinor > 0 ? "High impact" : "Monitor",
                    tone: "red",
                }
                : null,

            lowEngagementRows.length
                ? {
                    icon: "↘",
                    title: "Low engagement trend",
                    detail: `${lowEngagementRows.length} account${lowEngagementRows.length === 1 ? "" : "s"
                        } show declining engagement`,
                    impact: lowEngagementRows.length >= 3 ? "Medium impact" : "Low impact",
                    tone: "amber",
                }
                : null,

            failedPaymentRows.length
                ? {
                    icon: "□",
                    title: "Payment failures",
                    detail: `${failedPaymentRows.length} recent payment issue${failedPaymentRows.length === 1 ? "" : "s"
                        } detected`,
                    impact: failedPaymentRows.length >= 2 ? "Medium impact" : "Low impact",
                    tone: "amber",
                }
                : null,
        ].filter(Boolean) as Array<{
            icon: string;
            title: string;
            detail: string;
            impact: string;
            tone: "red" | "amber";
        }>;
    }, [riskAccountRows, workspaceCurrency]);

    const hasFullAiDriverAccess =
        normalizedTier === "pro" || isDemoPreview || isActiveTrial;

    const mrrAiRows = useMemo(() => {
        const rows = (mrrDriverRows.length ? mrrDriverRows : expansionRows).map(
            (row: any) => {
                const isMrrDriver = "accountName" in row;

                const mapped = {
                    id: row.id,
                    name: isMrrDriver ? row.accountName : row.name,
                    valueMinor: isMrrDriver ? row.valueMinor : row.upsideMinor,
                    reason:
                        row.reason ||
                        row.action ||
                        row.label ||
                        "Revenue movement detected",
                    lastEventAt: row.lastEventAt ?? null,
                };

                return {
                    ...mapped,
                    riskScore: getMrrDriverRiskScore(mapped),
                };
            }
        );

        return rows;
    }, [mrrDriverRows, expansionRows]);

    const activeAiRows = aiRevenueTab === "mrr" ? mrrAiRows : riskAccountRows;

    const aiDriverPageCount = Math.max(
        1,
        Math.ceil(activeAiRows.length / AI_ACCOUNTS_PER_PAGE)
    );

    const visibleAiRows = hasFullAiDriverAccess
        ? activeAiRows.slice(
            aiAccountPage * AI_ACCOUNTS_PER_PAGE,
            (aiAccountPage + 1) * AI_ACCOUNTS_PER_PAGE
        )
        : activeAiRows.slice(0, AI_ACCOUNTS_PER_PAGE);

    const recommendedActionCards = useMemo(() => {
        const riskRows = riskAccountRows ?? [];

        const riskTotalMinor = riskRows.reduce(
            (sum, row) => sum + Number(row.mrrMinor || 0),
            0
        );

        const expansionTotalMinor = expansionRows.reduce(
            (sum, row) => sum + Number(row.upsideMinor || 0),
            0
        );

        const inactiveRows = riskRows.filter((row) => {
            const text = `${row.reason} ${row.automation}`.toLowerCase();
            return text.includes("inactive") || text.includes("engagement") || text.includes("usage");
        });

        const inactiveTotalMinor = inactiveRows.reduce(
            (sum, row) => sum + Number(row.mrrMinor || 0),
            0
        );

        return [
            riskRows.length
                ? {
                    icon: "↗",
                    title: "Engage at-risk accounts",
                    detail: `Reach out to ${riskRows.length} account${riskRows.length === 1 ? "" : "s"} with churn risk`,
                    value: formatCurrencyFromMinor(riskTotalMinor, workspaceCurrency),
                }
                : null,

            expansionRows.length
                ? {
                    icon: "↑",
                    title: "Drive expansion",
                    detail: `${expansionRows.length} account${expansionRows.length === 1 ? "" : "s"} ready for expansion`,
                    value: formatCurrencyFromMinor(expansionTotalMinor, workspaceCurrency),
                }
                : null,

            inactiveRows.length
                ? {
                    icon: "✉",
                    title: "Re-engage inactive users",
                    detail: `${inactiveRows.length} account${inactiveRows.length === 1 ? "" : "s"} need activation`,
                    value: formatCurrencyFromMinor(inactiveTotalMinor, workspaceCurrency),
                }
                : null,
        ].filter(Boolean) as Array<{
            icon: string;
            title: string;
            detail: string;
            value: string;
        }>;
    }, [riskAccountRows, expansionRows, workspaceCurrency]);

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

    const activityRows = useMemo(() => {
        return mrrSource?.activityByMonth ?? [];
    }, [mrrSource?.activityByMonth]);

    const subscriberChartRows = useMemo(() => {
        const rows = isDemoMode
            ? demoAnalytics.activityByMonth
            : mrrSource?.activityByMonth ?? [];

        return rows.filter((row) => row?.month).slice(-12);
    }, [isDemoMode, demoAnalytics.activityByMonth, mrrSource?.activityByMonth]);

    const subscriberMovementRows = subscriberChartRows;

    const aiInsightCard = useMemo(() => {
        const narrative = workspaceAi?.businessNarrative;

        const forecastMrr =
            typeof narrative?.forecast?.nextMonthMrr === "number"
                ? narrative.forecast.nextMonthMrr
                : typeof mrrForecast?.projectedNext === "number"
                    ? Math.round(mrrForecast.projectedNext * 100)
                    : demoKpis.totalMrr;

        const forecastChurn =
            typeof narrative?.forecast?.predictedChurnPct === "number"
                ? narrative.forecast.predictedChurnPct
                : typeof churnForecast?.projectedNext === "number"
                    ? churnForecast.projectedNext
                    : demoKpis.churnPct;

        const growthPct =
            typeof narrative?.forecast?.projectedGrowthPct === "number"
                ? narrative.forecast.projectedGrowthPct
                : demoKpis.totalMrr > 0
                    ? ((forecastMrr - demoKpis.totalMrr) / demoKpis.totalMrr) * 100
                    : 0;

        const latestActivity =
            subscriberMovementRows[subscriberMovementRows.length - 1] ?? null;

        const riskCount = Number(atRiskAccounts || 0);
        const inactiveCount = Number(latestActivity?.churned || 0);
        const engagementDelta = Number(mauLatestDeltaPct || 0);

        const healthScore = clamp(
            Math.round(
                narrative?.health?.overallScore ??
                100 -
                Number(forecastChurn || 0) * 7 -
                riskCount * 1.5 +
                Number(mrrDeltaPct || 0) * 2 +
                engagementDelta
            ),
            30,
            96
        );

        const healthLabel =
            narrative?.health?.label ??
            getBusinessHealthLabel(healthScore);

        const confidence =
            narrative?.forecast?.confidence ??
            getConfidenceLabel(healthScore);

        const isHealthy =
            healthScore >= 75 &&
            forecastChurn <= 3 &&
            engagementDelta >= -2 &&
            growthPct >= 0;

        const needsMonitoring =
            !isHealthy &&
            healthScore >= 55 &&
            forecastChurn <= 6;

        const isAtRisk =
            healthScore < 55 ||
            forecastChurn > 6 ||
            engagementDelta < -8 ||
            growthPct < -5;

        const headline =
            narrative?.headline ??
            (isHealthy
                ? "Retention performance remains healthy."
                : needsMonitoring
                    ? "Retention is stable, but risk signals need monitoring."
                    : isAtRisk
                        ? "Retention risk is rising across vulnerable accounts."
                        : "Customer retention needs attention.");

        const summary =
            narrative?.summary ??
            (isHealthy
                ? riskCount > 0
                    ? `Cobrai detected isolated customer risk signals, while overall engagement and revenue trends remain stable.`
                    : `Customer engagement, churn risk, and revenue trends remain stable across active accounts.`
                : needsMonitoring
                    ? `Cobrai identified ${riskCount} account${riskCount === 1 ? "" : "s"} requiring follow-up, with retention trends still within a manageable range.`
                    : `Cobrai detected elevated customer risk signals that may affect retention and revenue if left unresolved.`);

        const revenueForecast =
            narrative?.revenueForecast ??
            (growthPct >= 0
                ? `Next-month MRR is projected at ${formatCurrencyFromMinor(
                    forecastMrr,
                    workspaceCurrency
                )}, supported by stable engagement trends and continued revenue retention.`
                : `Next-month MRR is projected at ${formatCurrencyFromMinor(
                    forecastMrr,
                    workspaceCurrency
                )}, with a ${growthPct.toFixed(
                    1
                )}% movement due to churn exposure, weaker engagement, or billing-risk signals.`);

        const churnPrediction =
            narrative?.churnPrediction ??
            (forecastChurn <= 3
                ? `Projected churn risk remains low based on current customer health and account activity patterns.`
                : forecastChurn <= 6
                    ? `${formatPct(
                        forecastChurn
                    )} projected churn next month, with risk concentrated in a small number of accounts.`
                    : `${formatPct(
                        forecastChurn
                    )} projected churn next month, driven by elevated account risk and weaker customer health.`);

        const engagement =
            narrative?.engagementAnalysis ??
            (engagementDelta >= 0
                ? `Customer engagement remains stable with no significant inactivity trend detected this period.`
                : engagementDelta >= -5
                    ? `Engagement softened slightly this period. Review accounts showing reduced activity before risk increases.`
                    : `Engagement declined meaningfully this period, increasing the need for proactive retention follow-up.`);

        const businessHealth =
            narrative?.businessHealth ??
            narrative?.health?.summary ??
            (isHealthy
                ? "Overall customer health remains steady, with isolated risk signals being monitored."
                : needsMonitoring
                    ? "Customer health is stable but should be monitored for early churn movement."
                    : "Customer health needs attention due to churn exposure, weaker engagement, or unresolved risk signals.");

        const aiEffectiveness = workspaceAi?.aiEffectiveness ?? null;

        return {
            headline,
            summary,
            businessHealth,
            engagement,
            revenueForecast,
            churnPrediction,

            forecast: {
                mrr: formatCurrencyFromMinor(forecastMrr, workspaceCurrency),
                churn: formatPct(forecastChurn),
                growth: `${growthPct >= 0 ? "+" : ""}${growthPct.toFixed(1)}%`,
            },

            primaryMetric: {
                value: `${healthScore}/100`,
                sub: `${healthLabel} • ${confidence} confidence`,
            },

            healthScore,
            healthLabel,
            confidence,

            aiEffectiveness: aiEffectiveness
                ? {
                    score: aiEffectiveness.score,
                    label: aiEffectiveness.label,
                    summary: aiEffectiveness.summary,
                    drivers: aiEffectiveness.drivers,
                }
                : null,
        };
    }, [
        workspaceAi,
        mrrForecast,
        churnForecast,
        demoKpis.totalMrr,
        demoKpis.churnPct,
        atRiskAccounts,
        mrrDeltaPct,
        mauLatestDeltaPct,
        subscriberMovementRows,
        workspaceCurrency,
    ]);

    const insightMetricCards = useMemo(() => {
        const retainedSeries = subscriberMovementRows.map((row) =>
            Number(row.retained || 0)
        );

        const revenueSeries = mrrSeries.map((point) =>
            Number(point.y || 0)
        );

        const engagementSeries = subscriberMovementRows.map((row) =>
            Number(row.totalSubscribers || 0)
        );

        const retainedUsers =
            retainedSeries[retainedSeries.length - 1] ?? 0;

        const previousRetainedUsers =
            retainedSeries[retainedSeries.length - 2] ?? 0;

        const currentRevenueMinor = demoKpis.totalMrr ?? 0;
        const previousRevenueMinor = previousMrrMinor ?? 0;

        const currentEngagement =
            engagementSeries[engagementSeries.length - 1] ?? 0;

        const previousEngagement =
            engagementSeries[engagementSeries.length - 2] ?? 0;

        return [
            {
                title: "Retention progress",
                value: `${retainedUsers} users retained`,
                label: `vs previous month ${previousRetainedUsers}`,
                trend: churnDeltaPp !== null ? -churnDeltaPp : 0,
                chart: buildMiniChartPath(retainedSeries),
            },
            {
                title: "Revenue progress",
                value: formatCurrencyFromMinor(currentRevenueMinor, workspaceCurrency),
                label: `vs previous month ${formatCurrencyFromMinor(
                    previousRevenueMinor,
                    workspaceCurrency
                )}`,
                trend: mrrDeltaPct ?? 0,
                chart: buildMiniChartPath(revenueSeries),
            },
            {
                title: "Engagement health",
                value: `${currentEngagement} subscribers active`,
                label: `vs previous month ${previousEngagement}`,
                trend: mauLatestDeltaPct ?? 0,
                chart: buildMiniChartPath(engagementSeries),
            },
        ];
    }, [
        subscriberMovementRows,
        mrrSeries,
        demoKpis.totalMrr,
        previousMrrMinor,
        workspaceCurrency,
        churnDeltaPp,
        mrrDeltaPct,
        mauLatestDeltaPct,
    ]);

    const subscriberTotal =
        subscriberMovementRows[subscriberMovementRows.length - 1]?.totalSubscribers ??
        mauCurrentPoint?.y ??
        0;

    const latestMrrPoint = mrrSeries[mrrSeries.length - 1];
    const previousMrrPoint = mrrSeries[mrrSeries.length - 2];

    const latestChurnPoint = churnSeries[churnSeries.length - 1];
    const previousChurnPoint = churnSeries[churnSeries.length - 2];

    const latestSubscriberPoint =
        subscriberMovementRows[subscriberMovementRows.length - 1];

    const previousSubscriberPoint =
        subscriberMovementRows[subscriberMovementRows.length - 2];

    const demoLatestActivity =
        demoAnalytics.activityByMonth[
        demoAnalytics.activityByMonth.length - 1
        ];

    const demoPreviousActivity =
        demoAnalytics.activityByMonth[
        demoAnalytics.activityByMonth.length - 2
        ];

    const demoMrrDrivers = {
        newMinor:
            (demoLatestActivity?.newSubscribers ?? 0) * 1200,

        expansionMinor:
            (demoLatestActivity?.retained ?? 0) * 340,

        churnedMinor:
            (demoLatestActivity?.churned ?? 0) * 700,

        retainedPct:
            demoLatestActivity?.totalSubscribers
                ? Math.round(
                    (
                        (demoLatestActivity.totalSubscribers -
                            demoLatestActivity.churned) /
                        demoLatestActivity.totalSubscribers
                    ) * 100
                )
                : 0,
    };
    const mrrHoverData = {
        current: latestMrrPoint?.y ?? 0,

        previous: previousMrrPoint?.y ?? 0,

        delta:
            (latestMrrPoint?.y ?? 0) -
            (previousMrrPoint?.y ?? 0),

        newRevenue: isDemoMode
            ? demoMrrDrivers.newMinor / 100
            : latestSubscriberPoint?.newSubscribers
                ? latestSubscriberPoint.newSubscribers * 12
                : 0,

        expansion: isDemoMode
            ? demoMrrDrivers.expansionMinor / 100
            : latestSubscriberPoint?.retained
                ? latestSubscriberPoint.retained * 4
                : 0,

        churnLoss: isDemoMode
            ? demoMrrDrivers.churnedMinor / 100
            : latestSubscriberPoint?.churned
                ? latestSubscriberPoint.churned * -6
                : 0,

        retained: isDemoMode
            ? demoMrrDrivers.retainedPct
            : latestSubscriberPoint?.retained
                ? Math.round(
                    (
                        latestSubscriberPoint.retained /
                        Math.max(
                            latestSubscriberPoint.totalSubscribers,
                            1
                        )
                    ) * 100
                )
                : 0,
    };

    const churnHoverData = {
        current: latestChurnPoint?.y ?? 0,
        previous: previousChurnPoint?.y ?? 0,

        atRisk: atRiskAccounts ?? 0,

        failedPayments:
            summary?.activitySummary?.failedSubscriptions ?? 0,

        recovered:
            summary?.activitySummary?.reactivations ?? 0,

        revenueLoss:
            demoKpis.mrrAtRisk
                ? Math.round(demoKpis.mrrAtRisk / 100)
                : 0,
    };

    const subscriberHoverData = {
        activeUsers: latestSubscriberPoint?.totalSubscribers ?? 0,
        previousUsers: previousSubscriberPoint?.totalSubscribers ?? 0,
        newUsers: latestSubscriberPoint?.newSubscribers ?? 0,
        churned: latestSubscriberPoint?.churned ?? 0,
        trial: latestSubscriberPoint?.trials ?? 0,
        upgrades: latestSubscriberPoint?.upgrades ?? 0,
        engagement:
            latestSubscriberPoint?.totalSubscribers
                ? Math.round(
                    ((latestSubscriberPoint.totalSubscribers -
                        latestSubscriberPoint.churned) /
                        latestSubscriberPoint.totalSubscribers) *
                    100
                )
                : 0,
    };

    function getAccountHref(id: string) {
        return id
            ? `/dashboard/accounts-at-risk/${id}`
            : "/dashboard/accounts-at-risk";
    }
    function getAccountInitial(name: string) {
        const trimmed = name.trim();
        return trimmed ? trimmed.charAt(0).toUpperCase() : "?";
    }

    const currentMrr = demoKpis.totalMrr / 100;

    const projectedMrr = mrrForecast?.projectedNext ?? currentMrr;

    const currentChurn = demoKpis.churnPct;


    const projectedChurn =
        churnForecast?.projectedNext ?? currentChurn;

    const nextMonthLabel = new Intl.DateTimeFormat(getBrowserLocale(), {
        month: "short",
    }).format(
        new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)
    );


    const mrrForecastChart = useMemo(() => {
        const base = mrrSeries
            .filter((p) => typeof p.y === "number" && Number.isFinite(Number(p.y)))
            .slice(-5);

        const safeBase =
            base.length >= 2
                ? base
                : [
                    { x: "2026-02", y: currentMrr * 0.82 },
                    { x: "2026-03", y: currentMrr * 0.9 },
                    { x: "2026-04", y: currentMrr * 0.94 },
                    { x: "2026-05", y: currentMrr },
                ];

        const labels = [
            ...safeBase.map((p) => formatMonthLong(p.x).slice(0, 3)),
            nextMonthLabel,
        ];

        const values = safeBase.map((p) => Number(p.y || 0));
        const lastValue = values[values.length - 1] ?? currentMrr;

        return {
            labels,
            actual: [...values, null],
            forecast: [
                ...Array(Math.max(0, values.length - 1)).fill(null),
                lastValue,
                projectedMrr,
            ],
        };
    }, [mrrSeries, currentMrr, projectedMrr, nextMonthLabel]);

    const churnForecastChart = useMemo(() => {
        const base = churnSeries
            .filter((p) => typeof p.y === "number" && Number.isFinite(Number(p.y)))
            .slice(-5);

        const safeBase =
            base.length >= 2
                ? base
                : [
                    { x: "2026-02", y: currentChurn * 1.12 },
                    { x: "2026-03", y: currentChurn * 0.96 },
                    { x: "2026-04", y: currentChurn * 1.04 },
                    { x: "2026-05", y: currentChurn },
                ];

        const labels = [
            ...safeBase.map((p) => formatMonthLong(p.x).slice(0, 3)),
            nextMonthLabel,
        ];

        const values = safeBase.map((p) => Number(p.y || 0));
        const lastValue = values[values.length - 1] ?? currentChurn;

        return {
            labels,
            actual: [...values, null],
            forecast: [
                ...Array(Math.max(0, values.length - 1)).fill(null),
                lastValue,
                projectedChurn,
            ],
        };
    }, [churnSeries, currentChurn, projectedChurn, nextMonthLabel]);

    const mrrMiniForecastOption = useMemo<EChartsOption>(() => ({
        backgroundColor: "transparent",
        animation: false,
        tooltip: {
            trigger: "axis",
            backgroundColor: "#ffffff",
            borderColor: "#e8eef6",
            borderWidth: 1,
            padding: 8,
            textStyle: {
                color: "#0f172a",
                fontSize: 11,
                fontWeight: 600,
            },
            valueFormatter: (value: any) =>
                typeof value === "number"
                    ? formatMoneyAmount(value, workspaceCurrency)
                    : "—",
        },
        grid: {
            top: 6,
            right: 2,
            bottom: 2,
            left: 2,
            containLabel: false,
        },
        xAxis: {
            type: "category",
            boundaryGap: false,
            data: mrrForecastChart.labels,
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: { show: false },
        },
        yAxis: {
            type: "value",
            scale: true,
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: { show: false },
            splitLine: { show: false },
        },
        series: [
            {
                name: "Actual MRR",
                type: "line",
                smooth: true,
                showSymbol: false,
                data: mrrForecastChart.actual,
                lineStyle: {
                    width: 2,
                    color: "#2563eb",
                },
                areaStyle: {
                    opacity: 1,
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: "rgba(37,99,235,0.16)" },
                        { offset: 0.72, color: "rgba(37,99,235,0.045)" },
                        { offset: 1, color: "rgba(37,99,235,0)" },
                    ]),
                },
                emphasis: { disabled: true },
            },
            {
                name: "Forecast",
                type: "line",
                smooth: true,
                showSymbol: true,
                symbol: "circle",
                symbolSize: 4,
                data: mrrForecastChart.forecast,
                lineStyle: {
                    width: 2,
                    color: "#2563eb",
                    type: "dashed",
                },
                itemStyle: {
                    color: "#2563eb",
                    borderColor: "#ffffff",
                    borderWidth: 2,
                },
                emphasis: { disabled: true },
            },
        ],
    }), [mrrForecastChart, workspaceCurrency]);

    const churnMiniForecastOption = useMemo<EChartsOption>(() => ({
        backgroundColor: "transparent",
        animation: false,
        tooltip: {
            trigger: "axis",
            backgroundColor: "#ffffff",
            borderColor: "#e8eef6",
            borderWidth: 1,
            padding: 8,
            textStyle: {
                color: "#0f172a",
                fontSize: 11,
                fontWeight: 600,
            },
            valueFormatter: (value: any) =>
                typeof value === "number" ? `${value.toFixed(1)}%` : "—",
        },
        grid: {
            top: 6,
            right: 2,
            bottom: 2,
            left: 2,
            containLabel: false,
        },
        xAxis: {
            type: "category",
            boundaryGap: false,
            data: churnForecastChart.labels,
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: { show: false },
        },
        yAxis: {
            type: "value",
            scale: true,
            min: 0,
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: { show: false },
            splitLine: { show: false },
        },
        series: [
            {
                name: "Actual churn",
                type: "line",
                smooth: true,
                showSymbol: false,
                data: churnForecastChart.actual,
                lineStyle: {
                    width: 2,
                    color: "#be123c",
                },
                areaStyle: {
                    opacity: 1,
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: "rgba(190,18,60,0.14)" },
                        { offset: 0.72, color: "rgba(190,18,60,0.04)" },
                        { offset: 1, color: "rgba(190,18,60,0)" },
                    ]),
                },
                emphasis: { disabled: true },
            },
            {
                name: "Prediction",
                type: "line",
                smooth: true,
                showSymbol: true,
                symbol: "circle",
                symbolSize: 4,
                data: churnForecastChart.forecast,
                lineStyle: {
                    width: 2,
                    color: "#be123c",
                    type: "dashed",
                },
                itemStyle: {
                    color: "#be123c",
                    borderColor: "#ffffff",
                    borderWidth: 2,
                },
                emphasis: { disabled: true },
            },
        ],
    }), [churnForecastChart]);


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

                        <p className={styles.subtitle}>
                            MRR, churn, and risk trends.
                        </p>
                    </div>
                </div>

                {actionToast ? (
                    <div className={styles.toast}>{actionToast}</div>
                ) : null}

                {/* KPI GRID */}
                <div className={styles.kpiGrid}>
                    <div className={styles.kpiCard}>
                        <div className={styles.kpiTop}>
                            <div className={styles.kpiLabel}>Total Revenue</div>
                            <div className={styles.kpiIcon}>{currencySymbol}</div>
                        </div>

                        <div className={styles.kpiValue}>
                            {formatCurrencyFromMinor(demoKpis.totalMrr, workspaceCurrency)}
                        </div>

                        <div className={styles.kpiSub}>
                            {renderDelta(mrrDeltaPct)}
                            <span style={{ marginLeft: 6 }}>vs previous month</span>
                        </div>
                    </div>

                    <div className={styles.kpiCard}>
                        <div className={styles.kpiTop}>
                            <div className={styles.kpiLabel}>Revenue At Risk</div>
                            <div className={styles.kpiIcon}>!</div>
                        </div>

                        <div className={styles.kpiValue}>
                            {formatCurrencyFromMinor(demoKpis.mrrAtRisk)}
                        </div>

                        <div className={styles.kpiSub}>
                            {renderDelta(atRiskDeltaPct, true)}
                            <span style={{ marginLeft: 6 }}>vs previous month</span>
                        </div>
                    </div>

                    <div className={styles.kpiCard}>
                        <div className={styles.kpiTop}>
                            <div className={styles.kpiLabel}>Churn Proxy</div>
                            <div className={styles.kpiIcon}>↗</div>
                        </div>

                        <div className={styles.kpiValue}>
                            {formatPct(demoKpis.churnPct)}
                        </div>

                        <div className={styles.kpiSub}>
                            {renderDeltaPp(churnDeltaPp, true)}
                            <span style={{ marginLeft: 6 }}>vs previous month</span>
                        </div>
                    </div>

                    <div className={styles.kpiCard}>
                        <div className={styles.kpiTop}>
                            <div className={styles.kpiLabel}>Total Subscribers</div>

                            <div className={styles.kpiIcon}>
                                <Users size={16} strokeWidth={2.2} />
                            </div>
                        </div>

                        <div className={styles.kpiValue}>
                            {subscriberTotal}
                        </div>

                        <div className={styles.kpiSub}>
                            {renderDelta(mauLatestDeltaPct)}
                            <span style={{ marginLeft: 6 }}>vs previous month</span>
                        </div>
                    </div>
                </div>

                <div className={styles.analyticsLayout}>
                    <section className={styles.primaryGrid}>
                        {/* MRR */}
                        <div className={`${styles.heroChartCard} ${styles.mrrCard}`}>
                            <div className={styles.chartHeader}>
                                <div>
                                    <div className={styles.chartTitle}>MRR Trend</div>
                                    <div className={styles.chartMeta}>
                                        {hasForecastAccess
                                            ? "Last 12 months + AI forecast"
                                            : "Last 12 months • Revenue over time"}
                                    </div>
                                </div>
                            </div>

                            <div className={styles.heroRevenue}>
                                {formatCurrencyFromMinor(
                                    isDemoMode ? 223000 : drawerInsights.mrr.currentMinor,
                                    workspaceCurrency
                                )}
                            </div>

                            <div className={styles.heroChart} style={{ height: 350 }}>
                                <EChart
                                    option={{
                                        backgroundColor: "transparent",
                                        tooltip: {
                                            trigger: "axis",
                                            backgroundColor: "transparent",
                                            borderColor: "transparent",
                                            borderWidth: 0,
                                            padding: 0,
                                            extraCssText: "box-shadow:none;",
                                            axisPointer: {
                                                type: "line",
                                                lineStyle: {
                                                    color: "#cbd5e1",
                                                    width: 1.2,
                                                    type: "dashed",
                                                },
                                            },
                                            formatter: (params: any) => {
                                                const item = Array.isArray(params) ? params[0] : params;

                                                const index =
                                                    typeof item?.dataIndex === "number"
                                                        ? item.dataIndex
                                                        : mrrSeries.length - 1;

                                                const chartRows = [...mrrSeries, ...mrrForecastPoints];

                                                const current = chartRows[index];
                                                const previous = chartRows[index - 1];

                                                const isForecastPoint = index >= mrrSeries.length;

                                                const currentValue = Number(current?.y ?? 0);
                                                const previousValue = Number(previous?.y ?? 0);
                                                const delta = currentValue - previousValue;

                                                const row = subscriberChartRows?.[index];

                                                const newRevenueMinor = Number(row?.newSubscribers ?? 0) * 1200;
                                                const expansionMinor = Number(row?.upgrades ?? 0) * 950;
                                                const churnLossMinor = Number(row?.churned ?? 0) * 700;

                                                const retainedPct = row?.totalSubscribers
                                                    ? Math.round(
                                                        (Number(row.retained ?? 0) /
                                                            Math.max(Number(row.totalSubscribers), 1)) *
                                                        100
                                                    )
                                                    : null;

                                                return `
<div style="width:260px;max-width:260px;background:#ffffff;border:1px solid #e8eef6;border-radius:20px;padding:14px;box-sizing:border-box;box-shadow:0 18px 45px rgba(15,23,42,0.10);font-family:Inter,sans-serif;">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;">
        <div style="font-size:13px;font-weight:850;color:#0f172a;">
            ${formatMonthLong(current?.x ?? "")} MRR
        </div>

        ${isForecastPoint
                                                        ? `<span style="white-space:nowrap;font-size:10px;font-weight:900;color:#2563eb;background:#eff6ff;border:1px solid #dbeafe;border-radius:999px;padding:4px 8px;">AI forecast</span>`
                                                        : ``
                                                    }
    </div>

    <div style="font-size:30px;line-height:1;font-weight:900;letter-spacing:-0.06em;color:#0f172a;margin-bottom:8px;">
        ${formatMoneyAmount(currentValue, workspaceCurrency)}
    </div>

    <div style="font-size:12px;font-weight:800;color:${delta >= 0 ? "#15803d" : "#b91c1c"
                                                    };margin-bottom:12px;">
        ${delta >= 0 ? "↑" : "↓"} ${formatMoneyAmount(
                                                        Math.abs(delta),
                                                        workspaceCurrency
                                                    )} vs previous month
    </div>

    ${isForecastPoint
                                                        ? `
                <div style="padding:11px 0;border-top:1px solid #f1f5f9;border-bottom:1px solid #f1f5f9;margin-bottom:12px;">
                    <div style="font-size:10px;font-weight:900;color:#64748b;letter-spacing:0.08em;margin-bottom:6px;">
                        WHY THIS FORECAST
                    </div>

                    <div style="font-size:12px;line-height:1.45;font-weight:650;color:#334155;white-space:normal;word-break:normal;overflow-wrap:break-word;">
${workspaceAi?.businessNarrative?.forecastExplanation?.mrr ||
                                                        workspaceAi?.businessNarrative?.revenueForecast ||
                                                        "AI is reviewing revenue, retention, and customer health signals for this forecast."
                                                        }                    </div>
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 12px;margin-bottom:12px;">
                    <div>
                        <div style="font-size:10px;font-weight:800;color:#94a3b8;letter-spacing:0.08em;margin-bottom:4px;">SIGNAL</div>
                        <div style="font-size:13px;font-weight:900;color:#0f172a;">Revenue trend</div>
                    </div>

                    <div>
                        <div style="font-size:10px;font-weight:800;color:#94a3b8;letter-spacing:0.08em;margin-bottom:4px;">CONFIDENCE</div>
                        <div style="font-size:13px;font-weight:900;color:#2563eb;">${mrrForecast?.confidencePct ?? 68
                                                        }%</div>
                    </div>
                </div>
            `
                                                        : `
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 12px;margin-bottom:12px;">
                    <div>
                        <div style="font-size:10px;font-weight:800;color:#94a3b8;letter-spacing:0.08em;margin-bottom:4px;">NEW REVENUE</div>
                        <div style="font-size:14px;font-weight:900;color:#15803d;">+${formatCurrencyFromMinor(
                                                            newRevenueMinor,
                                                            workspaceCurrency
                                                        )}</div>
                    </div>

                    <div>
                        <div style="font-size:10px;font-weight:800;color:#94a3b8;letter-spacing:0.08em;margin-bottom:4px;">EXPANSION</div>
                        <div style="font-size:14px;font-weight:900;color:#15803d;">+${formatCurrencyFromMinor(
                                                            expansionMinor,
                                                            workspaceCurrency
                                                        )}</div>
                    </div>

                    <div>
                        <div style="font-size:10px;font-weight:800;color:#94a3b8;letter-spacing:0.08em;margin-bottom:4px;">CHURN LOSS</div>
                        <div style="font-size:14px;font-weight:900;color:#b91c1c;">-${formatCurrencyFromMinor(
                                                            churnLossMinor,
                                                            workspaceCurrency
                                                        )}</div>
                    </div>

                    <div>
                        <div style="font-size:10px;font-weight:800;color:#94a3b8;letter-spacing:0.08em;margin-bottom:4px;">RETAINED</div>
                        <div style="font-size:14px;font-weight:900;color:#0f172a;">${retainedPct !== null ? `${retainedPct}%` : "—"
                                                        }</div>
                    </div>
                </div>
            `
                                                    }

    <div style="display:flex;align-items:center;justify-content:space-between;padding-top:10px;border-top:1px solid #f1f5f9;">
        <span style="font-size:12px;font-weight:800;color:#64748b;">
            ${isForecastPoint ? "Forecast outlook" : "Revenue health"}
        </span>

        <strong style="font-size:13px;font-weight:900;color:${delta >= 0 ? "#15803d" : "#b91c1c"
                                                    };">
            ${delta >= 0 ? "Healthy" : "Declining"}
        </strong>
    </div>
</div>
`;
                                            },
                                        },
                                        grid: {
                                            top: 20,
                                            right: 10,
                                            bottom: 20,
                                            left: 10,
                                            containLabel: true,
                                        },
                                        xAxis: {
                                            type: "category",
                                            data: [...mrrSeries, ...mrrForecastPoints].map((p) =>
                                                formatMonthLong(p.x)
                                            ),
                                            boundaryGap: false,
                                            axisLine: { show: false },
                                            axisTick: { show: false },
                                            axisLabel: { color: "#64748b", fontSize: 11 },
                                        },
                                        yAxis: {
                                            type: "value",
                                            axisLine: { show: false },
                                            axisTick: { show: false },
                                            splitLine: {
                                                lineStyle: { color: "#eef2f7" },
                                            },
                                            axisLabel: {
                                                color: "#64748b",
                                                fontSize: 11,
                                                formatter: (value: number) => `£${Math.round(value)} `,
                                            },
                                        },
                                        series: [
                                            {
                                                name: "Actual MRR",
                                                type: "line",
                                                smooth: false,
                                                showSymbol: false,
                                                data: [
                                                    ...mrrSeries.map((p) => p.y),
                                                    ...mrrForecastPoints.map(() => null),
                                                ],
                                                lineStyle: {
                                                    width: 3,
                                                    color: "#3264ff",
                                                },
                                                itemStyle: {
                                                    color: "#3264ff",
                                                },
                                                areaStyle: {
                                                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                                                        { offset: 0, color: "rgba(50, 100, 255, 0.12)" },
                                                        { offset: 1, color: "rgba(50, 100, 255, 0.02)" },
                                                    ]),
                                                },
                                            },
                                            ...(hasForecastAccess
                                                ? [
                                                    {
                                                        name: "Forecast",
                                                        type: "line" as const,
                                                        smooth: true,
                                                        symbol: "circle",
                                                        symbolSize: 6,
                                                        data: [
                                                            ...Array(Math.max(0, mrrSeries.length - 1)).fill(
                                                                null
                                                            ),
                                                            mrrSeries[mrrSeries.length - 1]?.y ?? null,
                                                            ...mrrForecastPoints.map((p) => p.y),
                                                        ],
                                                        lineStyle: {
                                                            color: "#2563eb",
                                                            width: 2,
                                                            type: "dashed" as const,
                                                        },
                                                        itemStyle: {
                                                            color: "#2563eb",
                                                        },
                                                        areaStyle: {
                                                            color: new echarts.graphic.LinearGradient(
                                                                0,
                                                                0,
                                                                0,
                                                                1,
                                                                [
                                                                    {
                                                                        offset: 0,
                                                                        color: "rgba(37, 99, 235, 0.18)",
                                                                    },
                                                                    {
                                                                        offset: 1,
                                                                        color: "rgba(37, 99, 235, 0.03)",
                                                                    },
                                                                ]
                                                            ),
                                                        },
                                                    },
                                                ]
                                                : []),
                                        ],
                                    }}
                                />
                            </div>
                        </div>



                        {
                            hasAiRevenueAccess ? (
                                <div className={styles.bottomSide} >
                                    <div className={`${styles.sideCard} ${styles.aiRevenueCard}`}>
                                        <div className={styles.aiRevenueHeader}>

                                        </div>

                                        <div className={styles.aiTabs}>
                                            <button
                                                type="button"
                                                className={
                                                    aiRevenueTab === "mrr"
                                                        ? `${styles.aiTab} ${styles.aiTabActive}`
                                                        : styles.aiTab
                                                }
                                                onClick={() => setAiRevenueTab("mrr")}
                                            >
                                                MRR Drivers
                                            </button>

                                            <button
                                                type="button"
                                                className={
                                                    aiRevenueTab === "churn"
                                                        ? `${styles.aiTab} ${styles.aiTabActive}`
                                                        : styles.aiTab
                                                }
                                                onClick={() => setAiRevenueTab("churn")}
                                            >
                                                Churn Drivers
                                            </button>
                                        </div>

                                        {aiRevenueTab === "mrr" ? (
                                            <div className={styles.aiPanel}>
                                                <div className={styles.aiDriverTable}>
                                                    <div className={styles.aiDriverTableHead}>
                                                        <span>Account</span>
                                                        <span>Reason</span>
                                                        <span>Revenue</span>
                                                    </div>

                                                    {visibleAiRows.length ? (
                                                        visibleAiRows.map((row: any) => (
                                                            <button
                                                                key={row.id}
                                                                type="button"
                                                                className={styles.aiDriverRow}
                                                                onClick={() =>
                                                                    router.push(`/dashboard/accounts-at-risk/${row.id}`)
                                                                }
                                                            >
                                                                <div className={styles.aiDriverAccount}>
                                                                    <div className={styles.aiAccountInitial}>
                                                                        {row.name?.charAt(0)?.toUpperCase()}
                                                                    </div>

                                                                    <div>
                                                                        <strong>{row.name}</strong>
                                                                        <span>{getDriverDate(row)}</span>
                                                                    </div>
                                                                </div>

                                                                <div className={styles.aiDriverReason}>
                                                                    {formatAiReason(row.reason)}
                                                                </div>

                                                                <div className={styles.aiDriverValue}>
                                                                    +{formatCurrencyFromMinor(row.valueMinor, workspaceCurrency)}
                                                                </div>

                                                                <div className={styles.aiRiskScore}>
                                                                    <span>{row.riskScore || "—"}</span>
                                                                </div>
                                                            </button>
                                                        ))
                                                    ) : (
                                                        <div className={styles.aiEmpty}>
                                                            No MRR driver accounts yet.
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className={styles.aiPanel}>
                                                <div className={styles.aiChurnTable}>
                                                    <div className={styles.aiChurnTableHead}>
                                                        <span>Account</span>
                                                        <span>AI reasoning & recommended action</span>
                                                        <span>Revenue at risk</span>
                                                        <span>Risk score</span>
                                                    </div>

                                                    {visibleAiRows.length ? (
                                                        visibleAiRows.map((row: any) => {
                                                            const openAiRiskAccount =
                                                                workspaceAi?.businessNarrative?.riskAccounts?.find(
                                                                    (account) =>
                                                                        account.customerId === row.id ||
                                                                        account.customerName?.trim().toLowerCase() ===
                                                                        row.name?.trim().toLowerCase()
                                                                );
                                                            const aiReason =
                                                                openAiRiskAccount?.reason ||
                                                                row.reason ||
                                                                "Customer shows elevated churn risk.";

                                                            const aiRecommendation =
                                                                getDynamicChurnAction({
                                                                    reason: aiReason,
                                                                    automation: openAiRiskAccount?.recommendedAction,
                                                                    recommendedAction: openAiRiskAccount?.recommendedAction,
                                                                    riskScore: row.riskScore,
                                                                });


                                                            return (
                                                                <button
                                                                    key={row.id}
                                                                    type="button"
                                                                    className={styles.aiChurnRow}
                                                                    onClick={() =>
                                                                        router.push(`/dashboard/accounts-at-risk/${row.id}`)
                                                                    }
                                                                >
                                                                    <div className={styles.aiDriverAccount}>
                                                                        <div className={styles.aiAccountInitialRed}>
                                                                            {row.name?.charAt(0)?.toUpperCase()}
                                                                        </div>

                                                                        <div>
                                                                            <strong>{row.name}</strong>
                                                                            <span>{formatExactDate(row.lastEventAt)}</span>
                                                                        </div>
                                                                    </div>

                                                                    <div className={styles.aiReasonCell}>
                                                                        <p className={styles.aiReasonText}>
                                                                            {formatAiReason(aiReason)}
                                                                        </p>

                                                                        <div className={styles.aiActionButtons}>
                                                                            {aiRecommendation.toLowerCase().includes("retry") && (
                                                                                <button
                                                                                    type="button"
                                                                                    className={styles.aiActionButton}
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        handleRetryPayment(row.id, row.customerId);
                                                                                    }}
                                                                                >
                                                                                    Retry payment
                                                                                </button>
                                                                            )}

                                                                            <button
                                                                                type="button"
                                                                                className={styles.aiActionButton}
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();

                                                                                    const recommendation = getEmailRecommendation({
                                                                                        accountName: row.name,
                                                                                        reason: aiReason,
                                                                                    });

                                                                                    setEmailDraft({
                                                                                        to: row.email || "",
                                                                                        subject: recommendation.subject,
                                                                                        body: recommendation.message,
                                                                                    });

                                                                                    setEmailDraftOpen(true);
                                                                                }}
                                                                            >
                                                                                {aiRecommendation.toLowerCase().includes("retry")
                                                                                    ? "Send billing recovery email"
                                                                                    : formatAiReason(aiRecommendation)}
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                    <div className={styles.aiDriverValueRed}>
                                                                        {formatCurrencyFromMinor(row.mrrMinor, workspaceCurrency)}
                                                                    </div>

                                                                    <div className={styles.aiRiskScore}>
                                                                        <span>{row.riskScore || "—"}</span>
                                                                    </div>
                                                                </button>
                                                            );
                                                        })
                                                    ) : (
                                                        <div className={styles.aiEmpty}>
                                                            No churn driver accounts yet.
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {activeAiRows.length >= AI_ACCOUNTS_PER_PAGE ? (
                                            <div className={styles.aiPagination}>
                                                <button
                                                    type="button"
                                                    disabled={hasFullAiDriverAccess && aiAccountPage === 0}
                                                    onClick={() => {
                                                        if (!hasFullAiDriverAccess) {
                                                            setUpgradeOpen(true);
                                                            return;
                                                        }

                                                        setAiAccountPage((page) => Math.max(0, page - 1));
                                                    }}
                                                >
                                                    ←
                                                </button>

                                                <span>
                                                    {hasFullAiDriverAccess ? aiAccountPage + 1 : 1} of {aiDriverPageCount}
                                                </span>

                                                <button
                                                    type="button"
                                                    disabled={hasFullAiDriverAccess && aiAccountPage >= aiDriverPageCount - 1}
                                                    onClick={() => {
                                                        if (!hasFullAiDriverAccess) {
                                                            setUpgradeOpen(true);
                                                            return;
                                                        }

                                                        setAiAccountPage((page) =>
                                                            Math.min(aiDriverPageCount - 1, page + 1)
                                                        );
                                                    }}
                                                >
                                                    →
                                                </button>
                                            </div>
                                        ) : null}

                                        {upgradeOpen ? (
                                            <div className={styles.emailOverlay}>
                                                <div className={styles.emailModal}>
                                                    <h3>Upgrade to Pro</h3>

                                                    <p>
                                                        Upgrade to Pro to view the full monthly driver list, paginate through every account, and unlock complete AI retention actions.
                                                    </p>

                                                    <div className={styles.emailModalActions}>
                                                        <button type="button" onClick={() => setUpgradeOpen(false)}>
                                                            Not now
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setUpgradeOpen(false);
                                                                router.push("/dashboard/settings?tab=manage-plan");
                                                            }}
                                                        >
                                                            Upgrade to Pro
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            ) : null}
                    </section >


                    <section className={styles.secondaryGrid}>
                        {/* CHURN */}
                        <div className={`${styles.heroChartCard} ${styles.churnCard} `}>
                            <div className={styles.chartHeader}>
                                <div>
                                    <div className={styles.chartTitle}>Churn Trend</div>
                                    <div className={styles.chartMeta}>
                                        {hasForecastAccess
                                            ? "Last 12 months + AI forecast"
                                            : "Last 12 months • Customer churn over time"}
                                    </div>
                                </div>
                            </div>

                            <div className={styles.heroChart} style={{ height: 315 }}>
                                <EChart
                                    option={{
                                        backgroundColor: "transparent",

                                        tooltip: {
                                            trigger: "axis",
                                            backgroundColor: "transparent",
                                            borderColor: "transparent",
                                            borderWidth: 0,
                                            padding: 0,
                                            extraCssText: "box-shadow:none;",

                                            axisPointer: {
                                                type: "line",
                                                lineStyle: {
                                                    color: "#cbd5e1",
                                                    width: 1.2,
                                                    type: "dashed",
                                                },
                                            },

                                            formatter: (params: any) => {
                                                const item = Array.isArray(params) ? params[0] : params;

                                                const index =
                                                    typeof item?.dataIndex === "number"
                                                        ? item.dataIndex
                                                        : churnSeries.length - 1;

                                                const chartRows = [...churnSeries, ...churnForecastPoints];

                                                const current = chartRows[index];
                                                const previous = chartRows[index - 1];

                                                const isForecastPoint = index >= churnSeries.length;

                                                const currentValue = Number(current?.y ?? 0);
                                                const previousValue = Number(previous?.y ?? 0);
                                                const delta = currentValue - previousValue;

                                                const row = subscriberChartRows?.[index];

                                                const atRisk = Math.max(0, Math.round(Number(row?.churned ?? 0) * 0.4));
                                                const failed = Number(row?.churned ?? 0);
                                                const recovered = Number(row?.retained ?? 0);
                                                const revenueLossMinor = Number(row?.churned ?? 0) * 700;

                                                const forecastReason =
                                                    workspaceAi?.businessNarrative?.forecastExplanation?.churn ||
                                                    workspaceAi?.businessNarrative?.churnPrediction ||
                                                    "AI is reviewing churn, billing, customer health, and retention signals for this forecast.";

                                                return `
<div style="width:270px;max-width:270px;background:#ffffff;border:1px solid #e8eef6;border-radius:20px;padding:15px;box-sizing:border-box;box-shadow:0 18px 45px rgba(15,23,42,0.10);font-family:Inter,sans-serif;">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;">
        <div style="font-size:13px;font-weight:850;color:#0f172a;">
            ${formatMonthLong(current?.x ?? "")} Churn
        </div>

        ${isForecastPoint
                                                        ? `<span style="white-space:nowrap;font-size:10px;font-weight:900;color:#dc2626;background:#fff1f2;border:1px solid #ffe4e6;border-radius:999px;padding:4px 8px;">AI forecast</span>`
                                                        : ``
                                                    }
    </div>

    <div style="font-size:30px;line-height:1;font-weight:900;letter-spacing:-0.06em;color:#b91c1c;margin-bottom:8px;">
        ${currentValue.toFixed(1)}%
    </div>

    <div style="font-size:12px;font-weight:800;color:${delta <= 0 ? "#15803d" : "#b91c1c"};margin-bottom:12px;">
        ${delta > 0 ? "↑" : "↓"} ${Math.abs(delta).toFixed(1)}pp vs previous month
    </div>

    ${isForecastPoint
                                                        ? `
                <div style="padding:11px 0;border-top:1px solid #f1f5f9;border-bottom:1px solid #f1f5f9;margin-bottom:12px;">
                    <div style="font-size:10px;font-weight:900;color:#64748b;letter-spacing:0.08em;margin-bottom:6px;">
                        WHY THIS FORECAST
                    </div>

                    <div style="font-size:12px;line-height:1.45;font-weight:650;color:#334155;white-space:normal;word-break:normal;overflow-wrap:break-word;">
                        ${forecastReason}
                    </div>
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 12px;margin-bottom:12px;">
                    <div>
                        <div style="font-size:10px;font-weight:800;color:#94a3b8;letter-spacing:0.08em;margin-bottom:4px;">SIGNAL</div>
                        <div style="font-size:13px;font-weight:900;color:#0f172a;">Retention risk</div>
                    </div>

                    <div>
                        <div style="font-size:10px;font-weight:800;color:#94a3b8;letter-spacing:0.08em;margin-bottom:4px;">CONFIDENCE</div>
                        <div style="font-size:13px;font-weight:900;color:#dc2626;">${churnForecast?.confidencePct ?? 68}%</div>
                    </div>
                </div>
            `
                                                        : `
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 12px;margin-bottom:12px;">
                    <div>
                        <div style="font-size:10px;font-weight:800;color:#94a3b8;letter-spacing:0.08em;margin-bottom:4px;">AT RISK</div>
                        <div style="font-size:14px;font-weight:900;color:#0f172a;">${atRisk}</div>
                    </div>

                    <div>
                        <div style="font-size:10px;font-weight:800;color:#94a3b8;letter-spacing:0.08em;margin-bottom:4px;">FAILED</div>
                        <div style="font-size:14px;font-weight:900;color:#b91c1c;">${failed}</div>
                    </div>

                    <div>
                        <div style="font-size:10px;font-weight:800;color:#94a3b8;letter-spacing:0.08em;margin-bottom:4px;">RECOVERED</div>
                        <div style="font-size:14px;font-weight:900;color:#15803d;">${recovered}</div>
                    </div>

                    <div>
                        <div style="font-size:10px;font-weight:800;color:#94a3b8;letter-spacing:0.08em;margin-bottom:4px;">REV LOSS</div>
                        <div style="font-size:14px;font-weight:900;color:#b91c1c;">${formatCurrencyFromMinor(revenueLossMinor, workspaceCurrency)}</div>
                    </div>
                </div>
            `
                                                    }

    <div style="display:flex;align-items:center;justify-content:space-between;padding-top:10px;border-top:1px solid #f1f5f9;">
        <span style="font-size:12px;font-weight:800;color:#64748b;">
            ${isForecastPoint ? "Forecast outlook" : "Retention health"}
        </span>

        <strong style="font-size:13px;font-weight:900;color:${delta <= 0 ? "#15803d" : "#b91c1c"};">
            ${delta <= 0 ? "Improving" : "Rising risk"}
        </strong>
    </div>
</div>
`;
                                            },
                                        },

                                        grid: {
                                            top: 24,
                                            right: 10,
                                            bottom: 20,
                                            left: 10,
                                            containLabel: true,
                                        },

                                        xAxis: {
                                            type: "category",

                                            data: [...churnSeries, ...churnForecastPoints].map(
                                                (p) => formatMonthLong(p.x).slice(0, 3)
                                            ),

                                            boundaryGap: false,

                                            axisLine: { show: false },
                                            axisTick: { show: false },

                                            axisLabel: {
                                                color: "#64748b",
                                                fontSize: 11,
                                            },
                                        },

                                        yAxis: {
                                            type: "value",

                                            axisLine: { show: false },
                                            axisTick: { show: false },

                                            splitLine: {
                                                lineStyle: {
                                                    color: "#eef2f7",
                                                },
                                            },

                                            axisLabel: {
                                                color: "#64748b",
                                                fontSize: 11,
                                                formatter: (value: number) => `${value}% `,
                                            },
                                        },

                                        series: [
                                            {
                                                name: "Actual Churn",

                                                type: "line" as const,

                                                smooth: false,
                                                showSymbol: false,

                                                data: [
                                                    ...churnSeries.map((p) => p.y),
                                                    ...churnForecastPoints.map(() => null),
                                                ],

                                                lineStyle: {
                                                    width: 3,
                                                    color: "#f43f5e",
                                                },

                                                itemStyle: {
                                                    color: "#f43f5e",
                                                },

                                                areaStyle: {
                                                    color: new echarts.graphic.LinearGradient(
                                                        0,
                                                        0,
                                                        0,
                                                        1,
                                                        [
                                                            {
                                                                offset: 0,
                                                                color: "rgba(244,63,94,0.17)",
                                                            },
                                                            {
                                                                offset: 1,
                                                                color: "rgba(244,63,94,0.01)",
                                                            },
                                                        ]
                                                    ),
                                                },
                                            },

                                            ...(hasForecastAccess
                                                ? [
                                                    {
                                                        name: "Forecast",

                                                        type: "line" as const,

                                                        smooth: true,
                                                        symbol: "circle",
                                                        symbolSize: 6,

                                                        data: [
                                                            ...Array(
                                                                Math.max(
                                                                    0,
                                                                    churnSeries.length - 1
                                                                )
                                                            ).fill(null),

                                                            churnSeries[
                                                                churnSeries.length - 1
                                                            ]?.y ?? null,

                                                            ...churnForecastPoints.map(
                                                                (p) => p.y
                                                            ),
                                                        ],

                                                        lineStyle: {
                                                            color: "#dc2626",
                                                            width: 2,
                                                            type: "dashed" as const,
                                                        },

                                                        itemStyle: {
                                                            color: "#dc2626",
                                                        },

                                                        areaStyle: {
                                                            color:
                                                                new echarts.graphic.LinearGradient(
                                                                    0,
                                                                    0,
                                                                    0,
                                                                    1,
                                                                    [
                                                                        {
                                                                            offset: 0,
                                                                            color:
                                                                                "rgba(220, 38, 38, 0.15)",
                                                                        },
                                                                        {
                                                                            offset: 1,
                                                                            color:
                                                                                "rgba(220, 38, 38, 0.03)",
                                                                        },
                                                                    ]
                                                                ),
                                                        },
                                                    },
                                                ]
                                                : []),
                                        ],
                                    }}
                                />
                            </div>
                        </div>

                        {/* SUBSCRIBER MOVEMENT */}
                        <div className={`${styles.heroChartCard} ${styles.subscriberCard} `}>
                            <div className={styles.chartHeader}>
                                <div>
                                    <div className={styles.subscriberTitleRow}>
                                        <div className={styles.chartTitle}>Subscriber Movement</div>

                                        <div className={styles.subscriberTotalPill}>
                                            <Users size={13} />
                                            <strong>{subscriberTotal}</strong>
                                            <span>Subscribers</span>
                                        </div>
                                    </div>

                                    <div className={styles.chartMeta}>
                                        Last 12 months • Subscriber growth, retention and churn trends
                                    </div>
                                </div>
                            </div>

                            <div className={styles.heroChart} style={{ height: 370 }}>
                                <EChart
                                    option={{
                                        backgroundColor: "transparent",
                                        tooltip: {
                                            trigger: "axis",
                                            backgroundColor: "transparent",
                                            borderColor: "transparent",
                                            borderWidth: 0,
                                            padding: 0,
                                            extraCssText: "box-shadow:none;",
                                            axisPointer: {
                                                type: "line",
                                                lineStyle: {
                                                    color: "#cbd5e1",
                                                    width: 1.2,
                                                    type: "dashed",
                                                },
                                            },
                                            formatter: (params: any) => {
                                                const item = Array.isArray(params) ? params[0] : params;
                                                const index =
                                                    typeof item?.dataIndex === "number"
                                                        ? item.dataIndex
                                                        : subscriberChartRows.length - 1;

                                                const current = subscriberChartRows[index];
                                                const previous = subscriberChartRows[index - 1];

                                                const currentSubscribers = Number(current?.totalSubscribers ?? 0);
                                                const previousSubscribers = Number(previous?.totalSubscribers ?? 0);
                                                const delta = currentSubscribers - previousSubscribers;

                                                const newSubscribers = Number(current?.newSubscribers ?? 0);
                                                const retained = Number(current?.retained ?? 0);
                                                const churned = Number(current?.churned ?? 0);
                                                const trials = Number(current?.trials ?? 0);
                                                const upgrades = Number(current?.upgrades ?? 0);

                                                const retentionPct =
                                                    currentSubscribers > 0
                                                        ? Math.round((retained / currentSubscribers) * 100)
                                                        : null;

                                                const churnPct =
                                                    currentSubscribers > 0
                                                        ? ((churned / currentSubscribers) * 100).toFixed(1)
                                                        : null;

                                                const retentionRate =
                                                    currentSubscribers > 0
                                                        ? retained / currentSubscribers
                                                        : 0;

                                                const growthRate =
                                                    previousSubscribers > 0
                                                        ? delta / previousSubscribers
                                                        : 0;

                                                const churnRate =
                                                    currentSubscribers > 0
                                                        ? churned / currentSubscribers
                                                        : 0;

                                                const health =
                                                    growthRate >= 0.08 &&
                                                        churnRate <= 0.025 &&
                                                        retentionRate >= 0.22
                                                        ? "Healthy"
                                                        : growthRate < 0 ||
                                                            churnRate >= 0.06
                                                            ? "Declining"
                                                            : "Watch";
                                                const healthColor =
                                                    health === "Healthy"
                                                        ? "#15803d"
                                                        : health === "Watch"
                                                            ? "#d97706"
                                                            : "#b91c1c";

                                                return `
    <div style="
        width:190px;
        max-width:190px;
        background:#ffffff;
        border:1px solid #e8eef6;
        border-radius:18px;
        padding:12px;
        box-sizing:border-box;
        box-shadow:0 14px 34px rgba(15,23,42,0.08);
        font-family:Inter,sans-serif;
    ">
        <div style="
            font-size:11px;
            font-weight:850;
            color:#0f172a;
            margin-bottom:6px;
        ">
            ${formatMonthLong(current?.month ?? "")} Subscribers
        </div>

        <div style="
            font-size:28px;
            line-height:1;
            font-weight:900;
            letter-spacing:-0.06em;
            color:#0f172a;
            margin-bottom:6px;
        ">
            ${currentSubscribers}
        </div>

        <div style="
            font-size:11px;
            font-weight:800;
            color:${delta >= 0 ? "#15803d" : "#b91c1c"};
            margin-bottom:10px;
        ">
            ${delta >= 0 ? "↑" : "↓"} ${Math.abs(delta)} vs previous month
        </div>

        <div style="
            display:grid;
            grid-template-columns:1fr 1fr;
            gap:8px 10px;
            margin-bottom:10px;
        ">
            <div>
                <div style="
                    font-size:9px;
                    font-weight:800;
                    color:#94a3b8;
                    letter-spacing:0.08em;
                    margin-bottom:2px;
                ">
                    NEW
                </div>

                <div style="
                    font-size:13px;
                    font-weight:900;
                    color:#15803d;
                ">
                    +${newSubscribers}
                </div>
            </div>

            <div>
                <div style="
                    font-size:9px;
                    font-weight:800;
                    color:#94a3b8;
                    letter-spacing:0.08em;
                    margin-bottom:2px;
                ">
                    RETAINED
                </div>

                <div style="
                    font-size:13px;
                    font-weight:900;
                    color:#0f172a;
                ">
                    ${retained}
                </div>
            </div>

            <div>
                <div style="
                    font-size:9px;
                    font-weight:800;
                    color:#94a3b8;
                    letter-spacing:0.08em;
                    margin-bottom:2px;
                ">
                    CHURNED
                </div>

                <div style="
                    font-size:13px;
                    font-weight:900;
                    color:#b91c1c;
                ">
                    -${churned}
                </div>
            </div>

            <div>
                <div style="
                    font-size:9px;
                    font-weight:800;
                    color:#94a3b8;
                    letter-spacing:0.08em;
                    margin-bottom:2px;
                ">
                    TRIALS
                </div>

                <div style="
                    font-size:13px;
                    font-weight:900;
                    color:#2563eb;
                ">
                    ${trials}
                </div>
            </div>

            <div>
                <div style="
                    font-size:9px;
                    font-weight:800;
                    color:#94a3b8;
                    letter-spacing:0.08em;
                    margin-bottom:2px;
                ">
                    UPGRADES
                </div>

                <div style="
                    font-size:13px;
                    font-weight:900;
                    color:#15803d;
                ">
                    ${upgrades}
                </div>
            </div>

            <div>
                <div style="
                    font-size:9px;
                    font-weight:800;
                    color:#94a3b8;
                    letter-spacing:0.08em;
                    margin-bottom:2px;
                ">
                    CHURN
                </div>

                <div style="
                    font-size:13px;
                    font-weight:900;
                    color:#b91c1c;
                ">
                    ${churnPct !== null ? `${churnPct}%` : "—"}
                </div>
            </div>
        </div>

      <div style="
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:8px;
    padding-top:8px;
    border-top:1px solid #f1f5f9;
">
    <span style="
        font-size:11px;
        font-weight:700;
        color:#64748b;
    ">
        Health
    </span>

    <strong style="
        font-size:11px;
        font-weight:900;
        color:${healthColor};
        text-align:right;
    ">
        ${health}
    </strong>
</div>
    </div>
`;
                                            },
                                        },
                                        legend: { show: false },
                                        grid: {
                                            top: 20,
                                            right: 10,
                                            bottom: 22,
                                            left: 10,
                                            containLabel: true,
                                        },
                                        xAxis: {
                                            type: "category",
                                            data: subscriberChartRows.map((p) =>
                                                formatMonthLong(p.month).slice(0, 3)
                                            ),
                                            axisLine: { show: false },
                                            axisTick: { show: false },
                                            axisLabel: {
                                                color: "#64748b",
                                                fontSize: 11,
                                                interval: 0,
                                            },
                                        },
                                        yAxis: {
                                            type: "value",
                                            axisLine: { show: false },
                                            axisTick: { show: false },
                                            splitLine: {
                                                lineStyle: {
                                                    color: "#eef2f7",
                                                    type: "dashed",
                                                },
                                            },
                                            axisLabel: {
                                                color: "#64748b",
                                                fontSize: 11,
                                            },
                                        },
                                        series: [
                                            {
                                                name: "Subscribers",
                                                type: "bar",
                                                data: subscriberChartRows.map((p) =>
                                                    Number(p.totalSubscribers ?? 0)
                                                ),
                                                barWidth: 7,
                                                itemStyle: {
                                                    color: "#1D9BF0",
                                                    borderRadius: [999, 999, 0, 0],
                                                },
                                                emphasis: {
                                                    itemStyle: {
                                                        color: "#0f83d6",
                                                    },
                                                },
                                            },
                                        ],
                                    }}
                                />
                            </div>
                        </div>
                    </section>
                </div >

                {emailDraftOpen ? (
                    <EmailModalPortal open={emailDraftOpen}>
                        <div
                            className={styles.modalOverlay}
                            onClick={() => setEmailDraftOpen(false)}
                        >
                            <div
                                className={styles.emailModal}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className={styles.emailModalHeader}>
                                    <div className={styles.emailModalTitle}>
                                        Retention Outreach
                                    </div>

                                    <button
                                        className={styles.emailCloseBtn}
                                        onClick={() => setEmailDraftOpen(false)}
                                        type="button"
                                    >
                                        ×
                                    </button>
                                </div>

                                <div className={styles.emailShell}>
                                    <div className={styles.emailField}>
                                        <label className={styles.emailLabel}>To</label>

                                        <input
                                            className={styles.emailInput}
                                            value={emailDraft.to}
                                            onChange={(e) =>
                                                setEmailDraft((prev) => ({
                                                    ...prev,
                                                    to: e.target.value,
                                                }))
                                            }
                                        />
                                    </div>

                                    <div className={styles.emailField}>
                                        <label className={styles.emailLabel}>Subject</label>

                                        <input
                                            className={styles.emailInput}
                                            value={emailDraft.subject}
                                            onChange={(e) =>
                                                setEmailDraft((prev) => ({
                                                    ...prev,
                                                    subject: e.target.value,
                                                }))
                                            }
                                        />
                                    </div>

                                    <div className={styles.emailField}>
                                        <label className={styles.emailLabel}>Message</label>

                                        <textarea
                                            className={styles.emailTextarea}
                                            value={emailDraft.body}
                                            onChange={(e) =>
                                                setEmailDraft((prev) => ({
                                                    ...prev,
                                                    body: e.target.value,
                                                }))
                                            }
                                        />
                                    </div>

                                    <div className={styles.emailModalActions}>
                                        <button
                                            className={styles.emailCancelBtn}
                                            type="button"
                                            onClick={() => setEmailDraftOpen(false)}
                                        >
                                            Cancel
                                        </button>

                                        <button
                                            className={styles.emailSendBtn}
                                            type="button"
                                            onClick={() => {
                                                setEmailDraftOpen(false);
                                                setActionToast("Retention email ready to send.");
                                            }}
                                        >
                                            Send email
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </EmailModalPortal>
                ) : null}
            </>
        );
    }

    return <div className={styles.page}>{content}</div>;
}