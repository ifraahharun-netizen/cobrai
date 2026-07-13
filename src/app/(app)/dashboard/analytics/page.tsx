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

import { getDemoRecoveryQueue } from "@/lib/demo/customers";

import { buildDemoSeries } from "@/lib/demo/analytics";

import { getEmailRecommendation } from "@/lib/emailRecommendations";

import {
    Users,
    Clock3,
    ChevronDown,
    PoundSterling,
    TriangleAlert,
    TrendingDown,
    Search,
    Download,
    Mail,
    CalendarDays,
    RotateCcw,
    TrendingUp,
    ChevronRight,
} from "lucide-react";

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
    workspaceName?: string;
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
        email?: string | null;
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

type RecoveryQueueItem = {
    id: string;
    customerId?: string | null;
    accountRiskId?: string | null;

    type?:
    | "immediate_attention"
    | "billing_recovery"
    | "upsell_opportunity"
    | "reactivation"
    | "expansion_momentum";

    priority?: string;

    name: string;
    email?: string | null;

    reason: string;
    action: string;

    opportunity?: string;
    whyNow?: string;
    suggestedAction?: string;

    valueMinor: number;
    confidence: number;

    lastEventAt?: string | null;
};

type RecoveryQueueData = {
    ok?: boolean;
    currency?: string;
    currentMrrMinor: number;
    forecastMrrMinor: number;
    revenueGapMinor: number;
    potentialRecoveryMinor: number;
    recoveryCoveragePct: number;
    typeCounts?: Record<string, number>;
    rows: RecoveryQueueItem[];
    generatedAt?: string;
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
    email?: string | null;
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

type RangeKey = "current" | "3m" | "6m" | "12m";

type ChartPoint = {
    x: string;
    y: number | null;
};

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


const chartRangeOptions: Array<{ label: string; value: RangeKey }> = [
    { label: "3 months", value: "3m" },
    { label: "6 months", value: "6m" },
    { label: "12 months", value: "12m" },
];

function getRangeLabel(value: RangeKey) {
    if (value === "current") return "Current month";
    return chartRangeOptions.find((option) => option.value === value)?.label ?? "6 months";
}
function getRangeMonths(range: RangeKey) {
    if (range === "current") return 0;
    if (range === "3m") return 3;
    if (range === "6m") return 6;
    return 12;
}

function buildCurrentMonthDailySeries(series: ChartPoint[]): ChartPoint[] {
    const valid = series.filter(
        (point): point is { x: string; y: number } =>
            typeof point.y === "number" && Number.isFinite(point.y)
    );

    if (!valid.length) return [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const daysElapsed = today.getDate();

    const datedPoints = valid
        .map((point): { date: Date; value: number } | null => {
            if (!/^\d{4}-\d{2}-\d{2}(?:[T\s]|$)/.test(point.x)) return null;

            const parsed = new Date(point.x);
            if (Number.isNaN(parsed.getTime())) return null;

            parsed.setHours(0, 0, 0, 0);

            if (parsed < firstDay || parsed > today) return null;

            return {
                date: parsed,
                value: point.y,
            };
        })
        .filter(
            (point): point is { date: Date; value: number } =>
                point !== null
        )
        .sort((a, b) => a.date.getTime() - b.date.getTime());

    if (datedPoints.length === daysElapsed) {
        return datedPoints.map((point): ChartPoint => ({
            x: point.date.toISOString().slice(0, 10),
            y: point.value,
        }));
    }

    const currentValue = valid[valid.length - 1].y;
    const previousValue =
        valid.length > 1 ? valid[valid.length - 2].y : currentValue;

    const startingValue =
        previousValue + (currentValue - previousValue) * 0.18;

    return Array.from({ length: daysElapsed }, (_, index): ChartPoint => {
        const date = new Date(firstDay);
        date.setDate(firstDay.getDate() + index);

        const progress =
            daysElapsed > 1 ? index / (daysElapsed - 1) : 1;

        const base =
            startingValue + (currentValue - startingValue) * progress;

        const variation =
            currentValue * 0.01 * Math.sin(index * 1.25);

        return {
            x: date.toISOString().slice(0, 10),
            y: Number(Math.max(0, base + variation).toFixed(2)),
        };
    });
}

function buildRolling30DaySeries(
    series: ChartPoint[]
) {
    const valid = series.filter(
        (point): point is { x: string; y: number } =>
            typeof point.y === "number" && Number.isFinite(point.y)
    );

    if (!valid.length) return [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 29);

    const dailyPoints = valid
        .map((point): { date: Date; value: number } | null => {
            if (!/^\d{4}-\d{2}-\d{2}(?:[T\s]|$)/.test(point.x)) return null;
            const parsed = new Date(point.x);
            if (Number.isNaN(parsed.getTime())) return null;
            parsed.setHours(0, 0, 0, 0);
            return { date: parsed, value: point.y };
        })
        .filter((point): point is { date: Date; value: number } => point !== null)
        .filter((point: { date: Date; value: number }) =>
            point.date >= startDate && point.date <= today
        )
        .sort((a, b) => a.date.getTime() - b.date.getTime());

    if (dailyPoints.length === 30) {
        return dailyPoints.map((point): ChartPoint => ({
            x: point.date.toISOString().slice(0, 10),
            y: point.value,
        }));
    }

    const current = valid[valid.length - 1].y;
    const previous = valid.length > 1 ? valid[valid.length - 2].y : current;
    const start = previous + (current - previous) * 0.18;

    return Array.from({ length: 30 }, (_, index) => {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + index);

        const progress = index / 29;
        const base = start + (current - start) * progress;
        const variation = current * 0.012 * Math.sin(index * 1.35);
        const value = Math.max(0, base + variation);

        return {
            x: date.toISOString().slice(0, 10),
            y: Number(value.toFixed(2)),
        };
    });
}

function buildRolling30DayChurnSeries(series: ChartPoint[]): ChartPoint[] {
    const valid = series.filter(
        (point): point is { x: string; y: number } =>
            typeof point.y === "number" && Number.isFinite(point.y)
    );

    if (!valid.length) return [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 29);

    const datedPoints = valid
        .map((point): { date: Date; value: number } | null => {
            if (!/^\d{4}-\d{2}-\d{2}(?:[T\s]|$)/.test(point.x)) return null;
            const parsed = new Date(point.x);
            if (Number.isNaN(parsed.getTime())) return null;
            parsed.setHours(0, 0, 0, 0);
            return { date: parsed, value: point.y };
        })
        .filter((point): point is { date: Date; value: number } => point !== null)
        .filter((point) => point.date >= startDate && point.date <= today)
        .sort((a, b) => a.date.getTime() - b.date.getTime());

    if (datedPoints.length === 30) {
        return datedPoints.map((point) => ({
            x: point.date.toISOString().slice(0, 10),
            y: Number(Math.max(0, point.value).toFixed(2)),
        }));
    }

    const recent = valid.slice(-6).map((point) => point.y);
    const current = recent[recent.length - 1];
    const previous = recent.length > 1 ? recent[recent.length - 2] : current;
    const average = recent.reduce((sum, value) => sum + value, 0) / recent.length;
    const observedRange = Math.max(...recent) - Math.min(...recent);
    const amplitude = Math.max(current * 0.055, observedRange * 0.38, 0.08);
    const startingValue = previous + (average - previous) * 0.34;

    return Array.from({ length: 30 }, (_, index): ChartPoint => {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + index);

        const progress = index / 29;
        const trend = startingValue + (current - startingValue) * progress;
        const weeklyMovement = Math.sin(index * 0.78) * amplitude;
        const secondaryMovement = Math.sin(index * 1.91 + 0.7) * amplitude * 0.42;
        const eventMovement =
            index === 7 || index === 19
                ? amplitude * 0.9
                : index === 12 || index === 25
                    ? -amplitude * 0.72
                    : 0;
        const taper = 0.72 + progress * 0.28;
        const value = Math.max(0, trend + (weeklyMovement + secondaryMovement + eventMovement) * taper);

        return {
            x: date.toISOString().slice(0, 10),
            y: Number(value.toFixed(2)),
        };
    });
}

function formatRollingDateRange() {
    const end = new Date();
    end.setHours(0, 0, 0, 0);

    const start = new Date(end);
    start.setDate(end.getDate() - 29);

    const formatter = new Intl.DateTimeFormat(getBrowserLocale(), {
        day: "numeric",
        month: "short",
        year: "numeric",
    });

    return `${formatter.format(start)} – ${formatter.format(end)}`;
}

function formatPerformanceAxisLabel(value: string) {
    if (!value) return "";

    const hourMatch = value.match(/^\d{4}-\d{2}-\d{2}[T\s](\d{2}):(\d{2})/);
    if (hourMatch) {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) {
            return new Intl.DateTimeFormat(getBrowserLocale(), {
                hour: "2-digit",
                minute: "2-digit",
            }).format(parsed);
        }
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const parsed = new Date(`${value}T00:00:00`);
        if (!Number.isNaN(parsed.getTime())) {
            return new Intl.DateTimeFormat(getBrowserLocale(), {
                day: "numeric",
                month: "short",
            }).format(parsed);
        }
    }

    if (/^\d{4}-\d{2}$/.test(value)) {
        const parsed = new Date(`${value}-01T00:00:00`);
        if (!Number.isNaN(parsed.getTime())) {
            return new Intl.DateTimeFormat(getBrowserLocale(), {
                month: "short",
            }).format(parsed);
        }
    }

    return value;
}

function getNextPerformancePeriodLabel(lastValue: string | undefined) {
    if (!lastValue) return "Forecast";

    if (/^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}/.test(lastValue)) {
        const parsed = new Date(lastValue);
        if (!Number.isNaN(parsed.getTime())) {
            parsed.setHours(parsed.getHours() + 1);
            return new Intl.DateTimeFormat(getBrowserLocale(), {
                hour: "2-digit",
                minute: "2-digit",
            }).format(parsed);
        }
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(lastValue)) {
        const parsed = new Date(`${lastValue}T00:00:00`);
        if (!Number.isNaN(parsed.getTime())) {
            parsed.setDate(parsed.getDate() + 1);
            return new Intl.DateTimeFormat(getBrowserLocale(), {
                day: "numeric",
                month: "short",
            }).format(parsed);
        }
    }

    if (/^\d{4}-\d{2}$/.test(lastValue)) {
        const parsed = new Date(`${lastValue}-01T00:00:00`);
        if (!Number.isNaN(parsed.getTime())) {
            parsed.setMonth(parsed.getMonth() + 1);
            return new Intl.DateTimeFormat(getBrowserLocale(), {
                month: "short",
            }).format(parsed);
        }
    }

    return "Forecast";
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
                    email: row.email ?? null,
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
                    email: row.email ?? null,
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

function formatQueueType(type?: RecoveryQueueItem["type"]) {
    if (type === "immediate_attention") return "Immediate attention";
    if (type === "billing_recovery") return "Billing recovery";
    if (type === "upsell_opportunity") return "Upsell opportunity";
    if (type === "reactivation") return "Reactivation";
    if (type === "expansion_momentum") return "Expansion momentum";
    return "Revenue opportunity";
}

function getQueueInitials(name: string) {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join("") || "AC";
}

function getQueueDomain(row: RecoveryQueueItem) {
    if (row.email?.includes("@")) return row.email.split("@")[1];
    return `${row.name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 22) || "account"}.com`;
}

function getQueueTone(type?: RecoveryQueueItem["type"]) {
    if (type === "upsell_opportunity" || type === "expansion_momentum") return "green";
    if (type === "reactivation") return "amber";
    if (type === "billing_recovery" || type === "immediate_attention") return "blue";
    return "blue";
}

function getQueueImpactLabel(row: RecoveryQueueItem) {
    if (row.confidence >= 80 || row.type === "immediate_attention") return "High";
    if (row.confidence >= 55) return "Medium";
    return "Low";
}

function isBillingRecoveryRow(row: RecoveryQueueItem) {
    const signalText = [
        row.type,
        row.opportunity,
        row.reason,
        row.whyNow,
        row.suggestedAction,
        row.action,
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

    return (
        row.type === "billing_recovery" ||
        /payment|billing|invoice|card|charge|past due|overdue/.test(signalText)
    );
}

function buildDemoRecoveryRows(rows: RecoveryQueueItem[]) {
    if (!rows.length) return rows;

    const existingBillingCount = rows.filter(isBillingRecoveryRow).length;
    if (existingBillingCount > 0) return rows;

    const eligibleRows = rows
        .map((row, index) => ({ row, index }))
        .filter(({ row }) =>
            row.type !== "upsell_opportunity" &&
            row.type !== "expansion_momentum"
        )
        .sort((a, b) => {
            const aScore = Number(a.row.valueMinor || 0) + Number(a.row.confidence || 0) * 100;
            const bScore = Number(b.row.valueMinor || 0) + Number(b.row.confidence || 0) * 100;
            return bScore - aScore;
        });

    const billingRowCount = Math.min(
        eligibleRows.length,
        Math.max(1, Math.ceil(rows.length * 0.25))
    );
    const billingIndexes = new Set(
        eligibleRows.slice(0, billingRowCount).map(({ index }) => index)
    );

    return rows.map((row, index) => {
        if (!billingIndexes.has(index)) return row;

        return {
            ...row,
            type: "billing_recovery" as const,
            opportunity: "Billing recovery",
            reason: row.reason || "A subscription payment could not be collected.",
            action: "Retry the failed subscription payment",
            suggestedAction:
                "Retry the failed subscription payment and send a billing recovery email if the retry is unsuccessful.",
        };
    });
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


    const AI_ACCOUNTS_PER_PAGE = 5;
    const [aiAccountPage, setAiAccountPage] = useState(0);


    const [aiChurnInsights, setAiChurnInsights] = useState<AiMonthlyInsight[]>([]);

    const [automation, setAutomation] = useState<AutomationStatusRes | null>(null);
    const [insights, setInsights] = useState<InsightsFeedRes | null>(null);
    const [attention, setAttention] = useState<AttentionRes | null>(null);
    const [actionToast, setActionToast] = useState<string | null>(null);
    const [mrrTimeseries, setMrrTimeseries] = useState<TimeseriesRes | null>(null);
    const [churnTimeseries, setChurnTimeseries] = useState<TimeseriesRes | null>(null);
    const [mauTimeseries, setMauTimeseries] = useState<TimeseriesRes | null>(null);
    const [mrrRange, setMrrRange] = useState<RangeKey>("12m");
    const [churnRange, setChurnRange] = useState<RangeKey>("12m");


    const [aiRevenueFilterOpen, setAiRevenueFilterOpen] = useState(false);

    const [workspaceAi, setWorkspaceAi] = useState<AiWorkspaceRes | null>(null);
    const [upgradeOpen, setUpgradeOpen] = useState(false);

    const [mrrFilterOpen, setMrrFilterOpen] = useState(false);
    const [churnFilterOpen, setChurnFilterOpen] = useState(false);

    const [emailModalOpen, setEmailModalOpen] = useState(false);
    const [emailModalRow, setEmailModalRow] = useState<RecoveryQueueItem | null>(null);
    const [emailSubject, setEmailSubject] = useState("");
    const [emailBody, setEmailBody] = useState("");
    const [emailCtaEnabled, setEmailCtaEnabled] = useState(false);
    const [emailCtaText, setEmailCtaText] = useState("");
    const [emailCtaLink, setEmailCtaLink] = useState("");
    const [sendingEmail, setSendingEmail] = useState(false);
    const [sendEmailError, setSendEmailError] = useState<string | null>(null);


    const RECOVERY_ROWS_PER_PAGE = 8;
    const [recoveryPage, setRecoveryPage] = useState(0);
    const [recoverySearchQuery, setRecoverySearchQuery] = useState("");
    const [recoveryFilter, setRecoveryFilter] = useState("all");
    const [recoveryFilterOpen, setRecoveryFilterOpen] = useState(false);
    const [recoveryQueue, setRecoveryQueue] = useState<RecoveryQueueData | null>(null);
    const [recoveryLoading, setRecoveryLoading] = useState(false);
    const [recoveryError, setRecoveryError] = useState<string | null>(null);

    const [drawerOpen, setDrawerOpen] = useState(false);
    const [drawerView, setDrawerView] = useState<DrawerView>("mrr");

    type AiRevenueTab = "mrr" | "churn";

    const [aiRevenueTab, setAiRevenueTab] = useState<AiRevenueTab>("mrr");
    const [tableSearch, setTableSearch] = useState("");
    useEffect(() => {
        setAiAccountPage(0);
    }, [aiRevenueTab]);

    const openDrawer = (view: DrawerView) => {
        setDrawerView(view);
        setDrawerOpen(true);
    };
    const handleExecuteRecoveryAction = async (row: RecoveryQueueItem) => {
        try {
            if (!user) return;

            const actionText = row.suggestedAction || row.action;

            const isPaymentAction = isBillingRecoveryRow(row);

            if (isPaymentAction) {
                await handleRetryPayment(
                    row.accountRiskId || row.id,
                    row.customerId || undefined
                );
                return;
            }

            await authedPost("/api/automation/execute-action", user, {
                customerId: row.customerId || null,
                accountRiskId: row.accountRiskId || null,
                accountName: row.name,
                type: row.type || null,
                action: actionText,
                reason: row.whyNow || row.reason,
                valueMinor: row.valueMinor,
                confidence: row.confidence,
            });

            setActionToast("Action executed successfully. Monitor outcome on Retention Impact.");
            setRecoveryQueue((prev) =>
                prev
                    ? {
                        ...prev,
                        rows: prev.rows.map((item) =>
                            item.id === row.id && item.type === row.type
                                ? {
                                    ...item,
                                    action: "Monitor outcome",
                                    suggestedAction: "Monitor outcome",
                                    executed: true,
                                }
                                : item
                        ),
                    }
                    : prev
            );
        } catch (e) {
            console.error(e);
            setActionToast("Could not start this action. Please try again.");
        }
    };

    const openRecoveryEmailModal = (row: RecoveryQueueItem) => {
        const actionText = `${row.suggestedAction || ""} ${row.action || ""} ${row.reason || ""} ${row.whyNow || ""}`.toLowerCase();

        const kind =
            actionText.includes("billing") ||
                actionText.includes("payment") ||
                actionText.includes("invoice")
                ? "billing"
                : actionText.includes("inactive") ||
                    actionText.includes("usage") ||
                    actionText.includes("engagement")
                    ? "inactive"
                    : "checkin";

        const reasonText =
            kind === "billing"
                ? `${row.reason || row.whyNow || "Billing issue detected"} billing invoice payment failed`
                : kind === "inactive"
                    ? `${row.reason || row.whyNow || "Low account activity"} usage inactive activity dropped`
                    : row.reason || row.whyNow || "retention follow-up";

        const recommendation = getEmailRecommendation({
            accountName: row.name,
            reason: reasonText,
            senderName: user?.displayName || "Team",
            companyName: summary?.workspaceName || "Your company",
        });

        setEmailModalRow(row);
        setEmailSubject(recommendation.subject);
        setEmailBody(recommendation.message);
        setEmailCtaEnabled(true);
        setEmailCtaText("");
        setEmailCtaLink("");
        setSendEmailError(null);
        setEmailModalOpen(true);
    };

    const closeRecoveryEmailModal = () => {
        if (sendingEmail) return;

        setEmailModalOpen(false);
        setEmailModalRow(null);
        setEmailCtaEnabled(false);
        setEmailCtaText("");
        setEmailCtaLink("");
        setSendEmailError(null);
    };

    const sendRecoveryEmail = async () => {
        if (!user || !emailModalRow) return;

        if (!emailModalRow.email) {
            setSendEmailError("No email on this account.");
            return;
        }

        if (!emailSubject.trim()) {
            setSendEmailError("Add an email subject.");
            return;
        }

        if (!emailBody.trim()) {
            setSendEmailError("Add an email message.");
            return;
        }

        if (emailCtaEnabled && !emailCtaText.trim()) {
            setSendEmailError("Add CTA button text.");
            return;
        }

        if (emailCtaEnabled && !emailCtaLink.trim()) {
            setSendEmailError("Add a CTA link.");
            return;
        }

        if (emailCtaEnabled) {
            try {
                const ctaUrl = new URL(emailCtaLink.trim());
                if (!['http:', 'https:'].includes(ctaUrl.protocol)) {
                    throw new Error('Invalid CTA URL protocol');
                }
            } catch {
                setSendEmailError("Enter a valid CTA link beginning with http:// or https://.");
                return;
            }
        }

        setSendingEmail(true);
        setSendEmailError(null);

        try {
            const token = await user.getIdToken();

            const response = await fetch("/api/automation/send-email", {
                method: "POST",
                cache: "no-store",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    to: emailModalRow.email,
                    subject: emailSubject.trim(),
                    body: emailBody.trim(),
                    cta: emailCtaEnabled
                        ? {
                            text: emailCtaText.trim(),
                            url: emailCtaLink.trim(),
                        }
                        : null,
                    accountId:
                        emailModalRow.accountRiskId ||
                        emailModalRow.customerId ||
                        emailModalRow.id,
                }),
            });

            const json = await response.json().catch(() => null);

            if (!response.ok || !json?.ok) {
                if (json?.code === "STARTER_EMAIL_LIMIT_REACHED") {
                    setUpgradeOpen(true);
                    closeRecoveryEmailModal();
                    return;
                }

                throw new Error(json?.error || "Failed to send email");
            }

            setActionToast(`Retention email sent to ${emailModalRow.name}.`);
            setEmailModalOpen(false);
            setEmailModalRow(null);
        } catch (error: any) {
            setSendEmailError(error?.message || "Couldn’t send email.");
        } finally {
            setSendingEmail(false);
        }
    };

    const isPaymentRecoveryRow = (row: RecoveryQueueItem) => {
        const actionText = `${row.suggestedAction || ""} ${row.action || ""} ${row.reason || ""} ${row.whyNow || ""}`.toLowerCase();

        return (
            row.type === "billing_recovery" ||
            actionText.includes("payment") ||
            actionText.includes("billing") ||
            actionText.includes("invoice")
        );
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

                const [mrrRes, churnRes] = await Promise.all([
                    authedGet(`/api/dashboard/analytics/timeseries?range=${mrrRange}`, user) as Promise<TimeseriesRes>,
                    authedGet(`/api/dashboard/analytics/timeseries?range=${churnRange}`, user) as Promise<TimeseriesRes>,
                ]);

                if (!mrrRes.ok) throw new Error(mrrRes.error || "MRR timeseries failed");
                if (!churnRes.ok) throw new Error(churnRes.error || "Churn timeseries failed");

                if (!cancelled) {
                    setMrrTimeseries(mrrRes);
                    setChurnTimeseries(churnRes);
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
    }, [status, user, mrrRange, churnRange]);

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
                        timeframe: mrrRange === "current" ? "week" : "month",
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

    const demoMrrSeries: ChartPoint[] = demoAnalytics.mrr.map((p: { month: string; valueMinor?: number | null }) => ({
        x: p.month,
        y: Number(p.valueMinor || 0) / 100,
    }));

    const demoChurnSeries: ChartPoint[] = demoAnalytics.churn.map((p: { month: string; valuePct?: number | null }) => ({
        x: p.month,
        y: Number(p.valuePct || 0),
    }));

    const demoMauSeries: ChartPoint[] = demoAnalytics.mau.map((p: { month: string; activeUsers?: number | null }) => ({
        x: p.month,
        y: Number(p.activeUsers || 0),
    }));

    const mrrSeries = useMemo<ChartPoint[]>(() => {
        const fromApi =
            mrrSource?.mrr?.map((p) => ({
                x: p.month,
                y: Number(p.valueMinor || 0) / 100,
            })) ?? [];

        if (isDemoMode) return demoMrrSeries;

        return fromApi;
    }, [mrrSource, isDemoMode, demoMrrSeries]);

    const churnSeries = useMemo<ChartPoint[]>(() => {
        const fromApi =
            churnSource?.churn?.map((p) => ({
                x: p.month,
                y: Number(p.valuePct || 0),
            })) ?? [];

        if (isDemoMode) return demoChurnSeries;

        return fromApi;
    }, [churnSource, isDemoMode, demoChurnSeries]);


    const visibleMrrSeries = useMemo<ChartPoint[]>(() => {
        if (mrrRange === "current") {
            return buildCurrentMonthDailySeries(mrrSeries);
        }

        return mrrSeries.slice(-getRangeMonths(mrrRange));
    }, [mrrSeries, mrrRange]);

    const visibleChurnSeries = useMemo<ChartPoint[]>(() => {
        if (churnRange === "current") {
            return buildCurrentMonthDailySeries(churnSeries);
        }

        return churnSeries.slice(-getRangeMonths(churnRange));
    }, [churnSeries, churnRange]);

    const mauSeries = useMemo<ChartPoint[]>(() => {
        const fromApi =
            mauSource?.mau?.map((p) => ({
                x: p.month,
                y: Number(p.activeUsers || 0),
            })) ?? [];

        if (isDemoMode) return demoMauSeries;

        return fromApi;
    }, [mauSource, isDemoMode, demoMauSeries]);
    const currentMonthKey = new Date().toISOString().slice(0, 7);

    const previousMonthDate = new Date();
    previousMonthDate.setMonth(previousMonthDate.getMonth() - 1);

    const previousMonthKey = previousMonthDate
        .toISOString()
        .slice(0, 7);

    const fallbackDrawerInsights: NonNullable<TimeseriesRes["insights"]> = {
        mrr: {
            currentMinor:
                mrrSource?.insights?.mrr?.currentMinor ??
                summary?.kpis?.totalMrr ??
                0,

            prevMinor:
                mrrSource?.insights?.mrr?.prevMinor ??
                null,

            deltaMinor:
                mrrSource?.insights?.mrr?.deltaMinor ??
                null,

            deltaPct:
                mrrSource?.insights?.mrr?.deltaPct ??
                null,

            drivers:
                mrrSource?.insights?.mrr?.drivers ??
                null,

            topMovers:
                mrrSource?.insights?.mrr?.topMovers ??
                [],
        },

        churn: {
            currentPct:
                churnSource?.insights?.churn?.currentPct ??
                summary?.kpis?.churnPct ??
                null,

            prevPct:
                churnSource?.insights?.churn?.prevPct ??
                null,

            deltaPp:
                churnSource?.insights?.churn?.deltaPp ??
                null,

            churnedAccounts:
                churnSource?.insights?.churn?.churnedAccounts ??
                [],
        },

        months: {
            current:
                mrrSource?.insights?.months?.current ??
                currentMonthKey,

            previous:
                mrrSource?.insights?.months?.previous ??
                previousMonthKey,
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
        () => (hasForecastAccess ? buildForecastPoints(visibleMrrSeries, 3, false) : []),
        [hasForecastAccess, visibleMrrSeries]
    );

    const churnForecastPoints = useMemo(
        () => (hasForecastAccess ? buildForecastPoints(visibleChurnSeries, 3, true) : []),
        [hasForecastAccess, visibleChurnSeries]
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
        if (!current || typeof mrrDeltaPct !== "number") return null;

        const divisor = 1 + mrrDeltaPct / 100;
        if (!Number.isFinite(divisor) || divisor === 0) return null;

        return Math.round(current / divisor);
    }, [demoKpis.mrrProtected, mrrDeltaPct]);

    const previousMrrAtRisk = useMemo(() => {
        const current = demoKpis.mrrAtRisk ?? 0;
        if (!current || typeof churnDeltaPp !== "number") return null;

        const currentChurn = Number(demoKpis.churnPct || 0);
        const previousChurn = currentChurn - churnDeltaPp;
        if (!currentChurn || !Number.isFinite(previousChurn)) return null;

        return Math.round(current * (previousChurn / currentChurn));
    }, [demoKpis.mrrAtRisk, demoKpis.churnPct, churnDeltaPp]);

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
                    action: row.action || row.label || "Review revenue movement",
                    riskScore: getMrrDriverRiskScore(mapped),
                };
            }
        );

        return rows;
    }, [mrrDriverRows, expansionRows]);

    const activeAiRows = aiRevenueTab === "mrr" ? mrrAiRows : riskAccountRows;

    const filteredAiRows = useMemo(() => {
        const query = tableSearch.trim().toLowerCase();

        if (!query) return activeAiRows;

        return activeAiRows.filter((row: any) => {
            const searchableText = [
                row.name,
                row.reason,
                row.action,
                row.automation,
                row.recommendedAction,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            return searchableText.includes(query);
        });
    }, [activeAiRows, tableSearch]);

    const aiDriverPageCount = Math.max(
        1,
        Math.ceil(filteredAiRows.length / AI_ACCOUNTS_PER_PAGE)
    );

    const visibleAiRows = hasFullAiDriverAccess
        ? filteredAiRows.slice(
            aiAccountPage * AI_ACCOUNTS_PER_PAGE,
            (aiAccountPage + 1) * AI_ACCOUNTS_PER_PAGE
        )
        : filteredAiRows.slice(0, AI_ACCOUNTS_PER_PAGE);

    useEffect(() => {
        let cancelled = false;

        async function loadRecoveryQueue() {
            try {
                if (!user || !hasAiRevenueAccess) return;

                setRecoveryLoading(true);
                setRecoveryError(null);

                const res = (await authedGet(
                    "/api/dashboard/revenue-recovery-queue",
                    user
                )) as RecoveryQueueData;

                if (!res.ok && typeof res.ok !== "undefined") {
                    throw new Error("Revenue recovery queue failed");
                }

                if (cancelled) return;

                setRecoveryQueue(res);
                setRecoveryPage(0);
            } catch (e: any) {
                if (cancelled) return;

                setRecoveryQueue(null);
                setRecoveryError(e?.message ?? "Failed to load revenue recovery queue");
            } finally {
                if (cancelled) return;
                setRecoveryLoading(false);
            }
        }

        if (status === "authed" && user && summary) {
            void loadRecoveryQueue();
        }

        return () => {
            cancelled = true;
        };
    }, [status, user, summary, hasAiRevenueAccess]);

    const demoRecoveryRows = useMemo(
        () => buildDemoRecoveryRows(getDemoRecoveryQueue()),
        []
    );


    const hasRecoveryRows =
        Array.isArray(recoveryQueue?.rows) &&
        recoveryQueue.rows.length > 0;

    const safeRecoveryQueue: RecoveryQueueData =
        hasRecoveryRows
            ? recoveryQueue!
            : {
                currentMrrMinor: demoKpis.mrrProtected,

                forecastMrrMinor: Math.max(
                    demoKpis.mrrProtected,
                    Math.round(demoKpis.mrrProtected * 2)
                ),

                revenueGapMinor: Math.max(
                    0,
                    Math.round(demoKpis.mrrProtected * 2) -
                    demoKpis.mrrProtected
                ),

                potentialRecoveryMinor: demoRecoveryRows.reduce(
                    (sum, row) => sum + Number(row.valueMinor || 0),
                    0
                ),

                recoveryCoveragePct: 0,

                rows: isDemoPreview ? demoRecoveryRows : [],
            };
    const forecastProgressPct = Math.min(
        100,
        Math.round(
            (safeRecoveryQueue.currentMrrMinor /
                Math.max(safeRecoveryQueue.forecastMrrMinor, 1)) *
            100
        )
    );

    const forecastProgressTone =
        forecastProgressPct >= 100
            ? "green"
            : forecastProgressPct >= 70
                ? "yellow"
                : forecastProgressPct >= 40
                    ? "orange"
                    : "red";

    const filteredRecoveryRows = useMemo(() => {
        const query = recoverySearchQuery.trim().toLowerCase();

        return safeRecoveryQueue.rows.filter((row) => {
            const opportunity = (row.opportunity || formatQueueType(row.type)).toLowerCase();
            const impact = getQueueImpactLabel(row).toLowerCase();
            const suggestedAction = (row.suggestedAction || row.action || "").toLowerCase();
            const searchableText = [
                row.name,
                row.email || "",
                getQueueDomain(row),
                opportunity,
                suggestedAction,
            ]
                .join(" ")
                .toLowerCase();

            const matchesSearch = !query || searchableText.includes(query);
            const matchesFilter =
                recoveryFilter === "all" ||
                (recoveryFilter.startsWith("opportunity:") &&
                    opportunity.includes(recoveryFilter.replace("opportunity:", ""))) ||
                (recoveryFilter.startsWith("impact:") &&
                    impact === recoveryFilter.replace("impact:", "")) ||
                (recoveryFilter === "action:payment" && isBillingRecoveryRow(row)) ||
                (recoveryFilter === "action:email" &&
                    !isBillingRecoveryRow(row) &&
                    suggestedAction.includes("email")) ||
                (recoveryFilter === "action:check-in" &&
                    (suggestedAction.includes("check-in") || suggestedAction.includes("check in"))) ||
                (recoveryFilter === "action:expansion" &&
                    (suggestedAction.includes("upgrade") ||
                        suggestedAction.includes("expansion") ||
                        suggestedAction.includes("annual plan")));

            return matchesSearch && matchesFilter;
        });
    }, [
        safeRecoveryQueue.rows,
        recoverySearchQuery,
        recoveryFilter,
    ]);

    const recoveryPageCount = Math.max(
        1,
        Math.ceil(filteredRecoveryRows.length / RECOVERY_ROWS_PER_PAGE)
    );

    useEffect(() => {
        setRecoveryPage(0);
    }, [
        safeRecoveryQueue.rows.length,
        recoverySearchQuery,
        recoveryFilter,
    ]);

    const visibleRecoveryRows = filteredRecoveryRows.slice(
        recoveryPage * RECOVERY_ROWS_PER_PAGE,
        (recoveryPage + 1) * RECOVERY_ROWS_PER_PAGE
    );

    const revenueOpportunityCandidates = filteredRecoveryRows.filter(
        (row) =>
            row.type === "upsell_opportunity" ||
            row.type === "expansion_momentum"
    );

    const topRevenueOpportunityRows = (
        revenueOpportunityCandidates.length
            ? revenueOpportunityCandidates
            : filteredRecoveryRows
    ).slice(0, 5);

    const churnRiskCandidates = filteredRecoveryRows
        .filter(
            (row) =>
                row.type === "immediate_attention" ||
                row.type === "billing_recovery" ||
                row.type === "reactivation"
        )
        .sort((a, b) => b.confidence - a.confidence);

    const topChurnRiskRows = (
        churnRiskCandidates.length
            ? churnRiskCandidates
            : [...filteredRecoveryRows].sort(
                (a, b) => b.confidence - a.confidence
            )
    ).slice(0, 5);

    function handleExportAiRows() {
        const headers =
            aiRevenueTab === "mrr"
                ? ["Account", "Reason", "Action", "MRR"]
                : ["Account", "Reason", "Action", "Revenue at risk"];

        const rows = filteredAiRows.map((row: any) => {
            if (aiRevenueTab === "mrr") {
                return [
                    row.name ?? "",
                    formatAiReason(row.reason),
                    row.action || "Review revenue movement",
                    formatCurrencyFromMinor(row.valueMinor, workspaceCurrency),
                ];
            }

            const aiReason = row.reason || "Customer shows elevated churn risk.";

            return [
                row.name ?? "",
                formatAiReason(aiReason),
                getDynamicChurnAction({
                    reason: aiReason,
                    automation: row.automation,
                    recommendedAction: row.recommendedAction,
                    riskScore: row.riskScore,
                }),
                formatCurrencyFromMinor(row.mrrMinor, workspaceCurrency),
            ];
        });

        const csv = [headers, ...rows]
            .map((line) =>
                line
                    .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
                    .join(",")
            )
            .join("\n");

        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = `${aiRevenueTab}-drivers.csv`;
        link.click();

        URL.revokeObjectURL(url);
    }

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

    function renderDelta(delta: number | null, inverse = false) {
        if (typeof delta !== "number" || !Number.isFinite(delta)) return null;

        const neutral = delta === 0;
        const positive = delta > 0;
        const isImprovement = neutral ? false : inverse ? delta < 0 : delta > 0;
        const color = neutral ? "#64748b" : isImprovement ? "#16a34a" : "#dc2626";
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
                <span style={{ color: "inherit" }}>{arrow}</span>
                <span style={{ color: "inherit" }}>
                    {Math.abs(delta).toFixed(1)}%
                </span>
            </span>
        );
    }

    function renderDeltaPp(delta: number | null, inverse = false) {
        if (typeof delta !== "number" || !Number.isFinite(delta)) return null;

        const neutral = delta === 0;
        const positive = delta > 0;
        const isImprovement = neutral ? false : inverse ? delta < 0 : delta > 0;
        const color = neutral ? "#64748b" : isImprovement ? "#16a34a" : "#dc2626";
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
                <span style={{ color: "inherit" }}>{arrow}</span>
                <span style={{ color: "inherit" }}>
                    {Math.abs(delta).toFixed(1)}pp
                </span>
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
    const mrrForecast = useMemo(() => computeForecastFromSeries(visibleMrrSeries), [visibleMrrSeries]);

    const churnForecast = useMemo(() => computeForecastFromSeries(visibleChurnSeries), [visibleChurnSeries]);

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

        const revenueSeries = mrrSeries.map((point: ChartPoint) =>
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

    const currentSubscriberActivity =
        subscriberMovementRows[subscriberMovementRows.length - 1] ?? null;
    const previousSubscriberActivity =
        subscriberMovementRows[subscriberMovementRows.length - 2] ?? null;

    const calculatePercentChange = (
        currentValue: number | null | undefined,
        previousValue: number | null | undefined
    ) => {
        const current = Number(currentValue);
        const previous = Number(previousValue);

        if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) {
            return null;
        }

        return ((current - previous) / Math.abs(previous)) * 100;
    };

    const acquiredUsers = Number(
        currentSubscriberActivity?.newSubscribers ??
        summary?.activitySummary?.newSubscriptions ??
        0
    );
    const previousAcquiredUsers = Number(
        previousSubscriberActivity?.newSubscribers ?? 0
    );

    const retainedUsers = Number(currentSubscriberActivity?.retained ?? 0);
    const previousRetainedUsers = Number(previousSubscriberActivity?.retained ?? 0);

    const expansionMrrMinor = Number(
        drawerInsights.mrr.drivers?.expansionMinor ?? 0
    );
    const previousExpansionMrrMinor =
        typeof mrrDeltaPct === "number" && Number.isFinite(mrrDeltaPct)
            ? expansionMrrMinor / (1 + mrrDeltaPct / 100)
            : null;

    const revenueLostMinor = Math.abs(
        Number(drawerInsights.mrr.drivers?.churnedMinor ?? 0)
    );
    const previousRevenueLostMinor =
        typeof churnDeltaPp === "number" && Number.isFinite(churnDeltaPp)
            ? revenueLostMinor / (1 + churnDeltaPp / 100)
            : null;

    const forecastChurnedUsers = Math.round(
        (Number(currentSubscriberActivity?.totalSubscribers ?? subscriberTotal) *
            Number(projectedChurn || 0)) /
        100
    );
    const previousForecastChurnedUsers = Math.round(
        (Number(previousSubscriberActivity?.totalSubscribers ?? 0) *
            Number(previousChurnPct ?? 0)) /
        100
    );

    const aiConfidenceScore = clamp(
        Math.round(
            aiInsightCard.aiEffectiveness?.score ??
            (safeRecoveryQueue.rows.length
                ? safeRecoveryQueue.rows.reduce(
                    (total, row) => total + Number(row.confidence || 0),
                    0
                ) / safeRecoveryQueue.rows.length
                : 0)
        ),
        0,
        100
    );

    const forecastMrrDeltaPct = calculatePercentChange(
        projectedMrr,
        currentMrr
    );
    const acquiredUsersDeltaPct = calculatePercentChange(
        acquiredUsers,
        previousAcquiredUsers
    );
    const retainedUsersDeltaPct = calculatePercentChange(
        retainedUsers,
        previousRetainedUsers
    );
    const expansionMrrDeltaPct = calculatePercentChange(
        expansionMrrMinor,
        previousExpansionMrrMinor
    );
    const forecastChurnedUsersDeltaPct = calculatePercentChange(
        forecastChurnedUsers,
        previousForecastChurnedUsers
    );
    const revenueLostDeltaPct = calculatePercentChange(
        revenueLostMinor,
        previousRevenueLostMinor
    );

    const mrrTrendChart = useMemo(() => {
        const base = visibleMrrSeries
            .filter(
                (point: ChartPoint): point is { x: string; y: number } =>
                    typeof point.y === "number" && Number.isFinite(point.y)
            )
            .map((point: { x: string; y: number }) => ({
                label: formatPerformanceAxisLabel(point.x),
                value: Number(point.y || 0),
            }));

        return {
            labels: base.map((point) => point.label),
            values: base.map((point) => point.value),
        };
    }, [visibleMrrSeries]);

    const mrrForecastChart = useMemo(() => {
        const rollingSeries = buildRolling30DaySeries(mrrSeries);
        const safeSeries = rollingSeries.length
            ? rollingSeries
            : buildRolling30DaySeries([{ x: new Date().toISOString(), y: currentMrr }]);

        const values = safeSeries.map((point: ChartPoint) => Number(point.y || 0));
        const forecastStartIndex = Math.max(1, values.length - 7);
        const actual = values.map((value, index) => index <= forecastStartIndex ? value : null);
        const forecast = values.map((value, index) => index < forecastStartIndex ? null : value);

        return {
            labels: safeSeries.map((point: ChartPoint) =>
                formatPerformanceAxisLabel(point.x)
            ),
            actual,
            forecast,
        };
    }, [mrrSeries, currentMrr]);

    const revenueImpactDateRange = useMemo(() => formatRollingDateRange(), []);

    const churnImpactChart = useMemo(() => {
        const rollingSeries = buildRolling30DayChurnSeries(churnSeries);
        const values = rollingSeries.map((point: ChartPoint) => Number(point.y || 0));
        const forecastStartIndex = Math.max(1, values.length - 7);

        return {
            labels: rollingSeries.map((point: ChartPoint) =>
                formatPerformanceAxisLabel(point.x)
            ),
            actual: values.map((value, index) =>
                index <= forecastStartIndex ? value : null
            ),
            prediction: values.map((value, index) =>
                index < forecastStartIndex ? null : value
            ),
        };
    }, [churnSeries]);

    const churnTrendChart = useMemo(() => {
        const base = visibleChurnSeries
            .filter(
                (point: ChartPoint): point is { x: string; y: number } =>
                    typeof point.y === "number" && Number.isFinite(point.y)
            )
            .map((point) => ({
                label: formatPerformanceAxisLabel(point.x),
                value: Number(point.y),
            }));

        return {
            labels: base.map((point) => point.label),
            values: base.map((point) => point.value),
        };
    }, [visibleChurnSeries]);

    const mrrTrendOption = useMemo<EChartsOption>(() => ({
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
            right: 4,
            bottom: 24,
            left: 4,
            containLabel: false,
        },
        xAxis: {
            type: "category",
            boundaryGap: false,
            data: mrrTrendChart.labels,
            axisLine: {
                show: true,
                lineStyle: { color: "#eef1f5", width: 1 },
            },
            axisTick: { show: false },
            axisLabel: {
                show: true,
                color: "#9ca3af",
                fontSize: 9,
                margin: 9,
                interval: "auto",
                hideOverlap: true,
            },
        },
        yAxis: {
            type: "value",
            scale: true,
            axisLine: {
                show: true,
                lineStyle: { color: "#eef1f5", width: 1 },
            },
            axisTick: { show: false },
            axisLabel: {
                show: true,
                color: "#9ca3af",
                fontSize: 9,
                margin: 9,
                interval: "auto",
                hideOverlap: true,
            },
            splitLine: { show: false },
        },
        series: [
            {
                name: "Revenue",
                type: "line",
                smooth: false,
                showSymbol: false,
                data: mrrTrendChart.values,
                lineStyle: {
                    width: 2,
                    color: "#1D9BF0",
                },
                areaStyle: {
                    opacity: 1,
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: "rgba(29,155,240,0.14)" },
                        { offset: 0.72, color: "rgba(29,155,240,0.035)" },
                        { offset: 1, color: "rgba(29,155,240,0)" },
                    ]),
                },
                emphasis: { disabled: true },
            },
        ],
    }), [mrrTrendChart, workspaceCurrency]);

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
            right: 4,
            bottom: 24,
            left: 4,
            containLabel: false,
        },
        xAxis: {
            type: "category",
            boundaryGap: false,
            data: mrrForecastChart.labels,
            axisLine: {
                show: true,
                lineStyle: { color: "#eef1f5", width: 1 },
            },
            axisTick: { show: false },
            axisLabel: {
                show: true,
                color: "#9ca3af",
                fontSize: 9,
                margin: 9,
                interval: "auto",
                hideOverlap: true,
            },
        },
        yAxis: {
            type: "value",
            scale: true,
            axisLine: {
                show: true,
                lineStyle: { color: "#eef1f5", width: 1 },
            },
            axisTick: { show: false },
            axisLabel: {
                show: true,
                color: "#9ca3af",
                fontSize: 9,
                margin: 9,
                interval: "auto",
                hideOverlap: true,
            },
            splitLine: { show: false },
        },
        series: [
            {
                name: "Actual MRR",
                type: "line",
                smooth: false,
                showSymbol: false,
                data: mrrForecastChart.actual,
                lineStyle: {
                    width: 2,
                    color: "#1D9BF0",
                },
                areaStyle: {
                    opacity: 1,
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: "rgba(29,155,240,0.14)" },
                        { offset: 0.72, color: "rgba(29,155,240,0.035)" },
                        { offset: 1, color: "rgba(29,155,240,0)" },
                    ]),
                },
                emphasis: { disabled: true },
            },
            {
                name: "Forecast",
                type: "line",
                smooth: false,
                showSymbol: false,
                data: mrrForecastChart.forecast,
                lineStyle: {
                    width: 2,
                    color: "#1D9BF0",
                    type: "dashed",
                },
                itemStyle: {
                    color: "#1D9BF0",
                    borderColor: "#ffffff",
                    borderWidth: 2,
                },
                emphasis: { disabled: true },
            },
        ],
    }), [mrrForecastChart, workspaceCurrency]);

    const churnImpactOption = useMemo<EChartsOption>(() => ({
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
            right: 4,
            bottom: 24,
            left: 4,
            containLabel: false,
        },
        xAxis: {
            type: "category",
            boundaryGap: false,
            data: churnImpactChart.labels,
            axisLine: {
                show: true,
                lineStyle: { color: "#eef1f5", width: 1 },
            },
            axisTick: { show: false },
            axisLabel: {
                show: true,
                color: "#9ca3af",
                fontSize: 9,
                margin: 9,
                interval: "auto",
                hideOverlap: true,
            },
        },
        yAxis: {
            type: "value",
            scale: true,
            min: 0,
            axisLine: {
                show: true,
                lineStyle: { color: "#eef1f5", width: 1 },
            },
            axisTick: { show: false },
            axisLabel: {
                show: true,
                color: "#9ca3af",
                fontSize: 9,
                margin: 9,
                formatter: (value: number) => `${value.toFixed(1)}%`,
            },
            splitLine: { show: false },
        },
        series: [
            {
                name: "Churn",
                type: "line",
                smooth: false,
                showSymbol: false,
                data: churnImpactChart.actual,
                lineStyle: {
                    width: 2,
                    color: "#8b83df",
                },
                areaStyle: {
                    opacity: 1,
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: "rgba(139,131,223,0.14)" },
                        { offset: 0.72, color: "rgba(139,131,223,0.035)" },
                        { offset: 1, color: "rgba(139,131,223,0)" },
                    ]),
                },
                emphasis: { disabled: true },
            },
            {
                name: "Churn prediction",
                type: "line",
                smooth: false,
                showSymbol: false,
                data: churnImpactChart.prediction,
                lineStyle: {
                    width: 2,
                    color: "#8b83df",
                    type: "dashed",
                },
                itemStyle: {
                    color: "#8b83df",
                    borderColor: "#ffffff",
                    borderWidth: 2,
                },
                emphasis: { disabled: true },
            },
        ],
    }), [churnImpactChart]);

    const churnTrendMiniOption = useMemo<EChartsOption>(() => ({
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
            right: 4,
            bottom: 24,
            left: 4,
            containLabel: false,
        },
        xAxis: {
            type: "category",
            boundaryGap: false,
            data: churnTrendChart.labels,
            axisLine: {
                show: true,
                lineStyle: { color: "#eef1f5", width: 1 },
            },
            axisTick: { show: false },
            axisLabel: {
                show: true,
                color: "#9ca3af",
                fontSize: 9,
                margin: 9,
                interval: "auto",
                hideOverlap: true,
            },
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
                name: "Churn",
                type: "line",
                smooth: false,
                showSymbol: false,
                data: churnTrendChart.values,
                lineStyle: {
                    width: 2,
                    color: "#bca1fbff",
                },
                areaStyle: {
                    opacity: 1,
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: "rgba(188,161,251,0.12)" },
                        { offset: 0.72, color: "rgba(188,161,251,0.03)" },
                        { offset: 1, color: "rgba(188,161,251,0)" },
                    ]),
                },
                emphasis: { disabled: true },
            },
        ],
    }), [churnTrendChart]);

    const subscriberChartSummary = useMemo(() => {
        const current = subscriberChartRows[subscriberChartRows.length - 1] ?? null;
        const previous = subscriberChartRows[subscriberChartRows.length - 2] ?? null;

        const currentTotal = Number(current?.totalSubscribers || 0);
        const previousTotal = Number(previous?.totalSubscribers || 0);
        const deltaPct =
            previousTotal > 0
                ? ((currentTotal - previousTotal) / previousTotal) * 100
                : null;

        return {
            currentTotal,
            deltaPct,
        };
    }, [subscriberChartRows]);

    const activeUsersBarOption = useMemo<EChartsOption>(() => {
        const source = subscriberChartRows.map((row) => {
            const retained = Math.max(0, Number(row.retained || 0));
            const acquired = Math.max(
                0,
                Number(row.newSubscribers ?? row.trials ?? 0)
            );
            const total = Math.max(
                0,
                Number(row.totalSubscribers || retained + acquired)
            );
            const churned = Math.max(0, Number(row.churned || 0));
            const monthDate = new Date(`${row.month}-01T00:00:00`);
            const tooltipMonth = Number.isNaN(monthDate.getTime())
                ? row.month
                : new Intl.DateTimeFormat(getBrowserLocale(), {
                    month: "short",
                    year: "numeric",
                }).format(monthDate);

            return {
                month: formatMonthLong(row.month).slice(0, 3),
                tooltipMonth,
                retained,
                acquired,
                churned,
                total,
            };
        });

        return {
            backgroundColor: "transparent",
            animation: false,
            legend: {
                top: 0,
                left: 0,
                itemWidth: 8,
                itemHeight: 8,
                itemGap: 14,
                textStyle: {
                    color: "#6b7280",
                    fontSize: 10,
                    fontWeight: 400,
                },
                data: ["Retained", "Acquired"],
            },
            tooltip: {
                trigger: "axis",
                axisPointer: {
                    type: "line",
                    lineStyle: {
                        color: "#d1d5db",
                        width: 1,
                        type: "dashed",
                    },
                },
                backgroundColor: "#ffffff",
                borderColor: "#e5e7eb",
                borderWidth: 1,
                padding: 10,
                extraCssText: "box-shadow:0 10px 30px rgba(15,23,42,.10);border-radius:10px;",
                textStyle: {
                    color: "#111827",
                    fontSize: 11,
                    fontWeight: 400,
                },
                formatter: (params: any) => {
                    const items = Array.isArray(params) ? params : [params];
                    const dataIndex = Number(items[0]?.dataIndex ?? 0);
                    const row = source[dataIndex];

                    if (!row) return "";

                    return `
                        <div style="min-width:170px">
                            <div style="font-size:11px;font-weight:500;color:#111827;margin-bottom:8px">${row.tooltipMonth}</div>
                            <div style="display:flex;justify-content:space-between;gap:24px;margin-bottom:6px">
                                <span style="color:#6b7280">Retained users</span>
                                <strong style="font-weight:500;color:#111827">${Math.round(row.retained)}</strong>
                            </div>
                            <div style="display:flex;justify-content:space-between;gap:24px;margin-bottom:6px">
                                <span style="color:#6b7280">Acquired users</span>
                                <strong style="font-weight:500;color:#111827">${Math.round(row.acquired)}</strong>
                            </div>
                            <div style="display:flex;justify-content:space-between;gap:24px;margin-bottom:6px">
                                <span style="color:#6b7280">Churned users</span>
                                <strong style="font-weight:500;color:#111827">${Math.round(row.churned)}</strong>
                            </div>
                            <div style="height:1px;background:#f1f5f9;margin:7px 0"></div>
                            <div style="display:flex;justify-content:space-between;gap:24px">
                                <span style="color:#374151">Total users</span>
                                <strong style="font-weight:500;color:#111827">${Math.round(row.total)}</strong>
                            </div>
                        </div>
                    `;
                },
            },
            grid: {
                top: 42,
                right: 12,
                bottom: 24,
                left: 36,
                containLabel: false,
            },
            xAxis: {
                type: "category",
                data: source.map((point) => point.month),
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: {
                    color: "#6b7280",
                    fontSize: 10,
                    interval: 0,
                },
            },
            yAxis: [
                {
                    type: "value",
                    min: 0,
                    splitNumber: 4,
                    axisLine: { show: false },
                    axisTick: { show: false },
                    axisLabel: {
                        color: "#9ca3af",
                        fontSize: 10,
                    },
                    splitLine: {
                        lineStyle: {
                            color: "#f1f5f9",
                            width: 1,
                        },
                    },
                },
            ],
            series: [
                {
                    name: "Retained",
                    type: "bar",
                    stack: "users",
                    data: source.map((point) => point.retained),
                    barWidth: "48%",
                    itemStyle: {
                        color: "#6490f0ff",
                        borderRadius: [0, 0, 3, 3],
                    },
                    emphasis: { disabled: true },
                },
                {
                    name: "Acquired",
                    type: "bar",
                    stack: "users",
                    data: source.map((point) => point.acquired),
                    barWidth: "48%",
                    itemStyle: {
                        color: "#60b7f1ff",
                        borderRadius: [6, 6, 0, 0],
                    },
                    emphasis: { disabled: true },
                },
            ],
        };
    }, [subscriberChartRows]);


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
                    <div className={styles.actionToast}>
                        <span>{actionToast}</span>

                        <button
                            type="button"
                            className={styles.actionToastBtn}
                            onClick={() => router.push("/dashboard/progress")}
                        >
                            View Retention Impact
                        </button>
                    </div>
                ) : null}

                {/* KPI GRID */}
                <div className={styles.kpiGrid}>
                    <div className={styles.kpiCard}>
                        <div className={styles.kpiIcon}>
                            <PoundSterling size={21} strokeWidth={1.8} />
                        </div>
                        <div className={styles.kpiContent}>
                            <div className={styles.kpiLabel}>Total Revenue</div>
                            <div className={styles.kpiValue}>
                                {formatCurrencyFromMinor(demoKpis.totalMrr, workspaceCurrency)}
                            </div>
                            <div className={styles.kpiSub}>
                                {renderDelta(mrrDeltaPct)}
                                <span>vs previous month</span>
                            </div>
                        </div>
                    </div>

                    <div className={styles.kpiCard}>
                        <div className={styles.kpiIcon}>
                            <TriangleAlert size={20} strokeWidth={1.8} />
                        </div>
                        <div className={styles.kpiContent}>
                            <div className={styles.kpiLabel}>Revenue At Risk</div>
                            <div className={styles.kpiValue}>
                                {formatCurrencyFromMinor(demoKpis.mrrAtRisk, workspaceCurrency)}
                            </div>
                            <div className={styles.kpiSub}>
                                {renderDelta(atRiskDeltaPct, true)}
                                <span>vs previous month</span>
                            </div>
                        </div>
                    </div>

                    <div className={styles.kpiCard}>
                        <div className={styles.kpiIcon}>
                            <TrendingDown size={20} strokeWidth={1.8} />
                        </div>
                        <div className={styles.kpiContent}>
                            <div className={styles.kpiLabel}>Churn Proxy</div>
                            <div className={styles.kpiValue}>
                                {formatPct(demoKpis.churnPct)}
                            </div>
                            <div className={styles.kpiSub}>
                                {renderDeltaPp(churnDeltaPp, true)}
                                <span>vs previous month</span>
                            </div>
                        </div>
                    </div>

                    <div className={styles.kpiCard}>
                        <div className={styles.kpiIcon}>
                            <Users size={20} strokeWidth={1.8} />
                        </div>
                        <div className={styles.kpiContent}>
                            <div className={styles.kpiLabel}>Total Subscribers</div>
                            <div className={styles.kpiValue}>{subscriberTotal}</div>
                            <div className={styles.kpiSub}>
                                {renderDelta(mauLatestDeltaPct)}
                                <span>vs previous month</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className={styles.analyticsLayout}>
                    <section className={styles.primaryGrid}>
                        {/* MRR + CHURN PERFORMANCE — TWO CHARTS IN ONE CARD */}
                        <div className={styles.performanceCard}>
                            <div className={styles.performanceHeader}>
                                <div>
                                    <div className={styles.chartTitle}>Metrics</div>
                                    <div className={styles.chartMeta}>
                                        MRR growth and churn movement over the selected period.
                                    </div>
                                </div>

                                <div className={styles.chartFilterWrap}>
                                    <button
                                        type="button"
                                        className={styles.chartFilterButton}
                                        onClick={() => {
                                            setMrrFilterOpen((open) => !open);
                                            setChurnFilterOpen(false);
                                            setAiRevenueFilterOpen(false);
                                        }}
                                    >
                                        <Clock3 size={13} strokeWidth={1.8} />
                                        <span>{getRangeLabel(mrrRange)}</span>
                                        <ChevronDown size={13} strokeWidth={1.8} />
                                    </button>

                                    {mrrFilterOpen ? (
                                        <div className={styles.chartFilterMenu}>
                                            {chartRangeOptions.map((option) => (
                                                <button
                                                    key={option.value}
                                                    type="button"
                                                    className={`${styles.chartFilterOption} ${mrrRange === option.value
                                                        ? styles.chartFilterOptionActive
                                                        : ""
                                                        }`}
                                                    onClick={() => {
                                                        setMrrRange(option.value);
                                                        setChurnRange(option.value);
                                                        setMrrFilterOpen(false);
                                                    }}
                                                >
                                                    {option.label}
                                                </button>
                                            ))}
                                        </div>
                                    ) : null}
                                </div>
                            </div>

                            <div className={styles.performanceRow}>
                                <div className={styles.performanceMetric}>
                                    <span className={styles.performanceLabel}>Revenue Trend</span>
                                    <strong className={styles.performanceValue}>
                                        {formatCurrencyFromMinor(
                                            isDemoMode ? 223000 : drawerInsights.mrr.currentMinor,
                                            workspaceCurrency
                                        )}
                                    </strong>
                                    <span className={styles.performanceChange}>
                                        {formatDeltaPctLabel(drawerInsights.mrr.deltaPct)} vs previous month
                                    </span>
                                </div>

                                <div className={styles.performanceChartWrap}>
                                    <EChart option={mrrTrendOption} />
                                </div>
                            </div>

                            <div className={styles.performanceDivider} />

                            <div className={styles.performanceRow}>
                                <div className={styles.performanceMetric}>
                                    <span className={styles.performanceLabel}>Churn Trend</span>
                                    <strong className={styles.performanceValue}>
                                        {formatPct(drawerInsights.churn.currentPct)}
                                    </strong>
                                    <span className={styles.performanceChange}>
                                        {formatDeltaPpLabel(drawerInsights.churn.deltaPp)} vs previous month
                                    </span>
                                </div>

                                <div className={styles.performanceChartWrap}>
                                    <EChart option={churnTrendMiniOption} />
                                </div>
                            </div>
                        </div>



                        <div className={styles.activeUsersCard}>
                            <div className={styles.activeUsersHeader}>
                                <div>
                                    <div className={styles.chartTitle}>Active Users</div>
                                    <div className={styles.chartMeta}>Compared from last month</div>
                                </div>

                                <button
                                    type="button"
                                    className={styles.activeUsersMenu}
                                    aria-label="Active users chart options"
                                >
                                    •••
                                </button>
                            </div>

                            <div className={styles.activeUsersValueRow}>
                                <strong className={styles.activeUsersValue}>
                                    {Math.round(subscriberChartSummary.currentTotal)}
                                </strong>
                                <span className={styles.activeUsersDelta}>
                                    {formatDeltaPctLabel(subscriberChartSummary.deltaPct)}
                                </span>
                            </div>

                            <div className={styles.activeUsersChart}>
                                <EChart option={activeUsersBarOption} />
                            </div>
                        </div>

                        {hasAiRevenueAccess ? (
                            <div className={styles.revenueImpactSection}>
                                <div className={styles.revenueOverviewCard}>
                                    <div className={styles.revenueOverviewHeader}>
                                        <div>
                                            <span className={styles.revenueOverviewEyebrow}>Revenue performance</span>
                                            <h3>Revenue Impact</h3>
                                        </div>
                                        <span className={styles.revenueOverviewPeriod}>
                                            <CalendarDays size={13} strokeWidth={1.8} />
                                            {revenueImpactDateRange}
                                            <ChevronDown size={12} strokeWidth={1.8} />
                                        </span>
                                    </div>

                                    <div className={styles.revenueOverviewValueRow}>
                                        <strong>
                                            {formatCurrencyFromMinor(
                                                safeRecoveryQueue.currentMrrMinor,
                                                safeRecoveryQueue.currency || workspaceCurrency
                                            )}
                                        </strong>
                                        <span>{Math.round(forecastProgressPct)}% of forecast goal</span>
                                    </div>

                                    <div className={styles.revenueOverviewLegend}>
                                        <span><i className={styles.legendRevenue} />Revenue</span>
                                        <span><i className={styles.legendForecast} />Forecast</span>
                                    </div>

                                    <div className={styles.revenueOverviewChart}>
                                        <EChart option={mrrMiniForecastOption} />
                                    </div>

                                    <div className={styles.revenueOverviewStats}>
                                        <div>
                                            <span>Forecast MRR</span>
                                            <strong>{formatMoneyAmount(projectedMrr, workspaceCurrency)}</strong>
                                            <small className={styles.statComparison}>
                                                {renderDelta(forecastMrrDeltaPct)}
                                                <span>vs previous month</span>
                                            </small>
                                        </div>
                                        <div>
                                            <span>Acquired users</span>
                                            <strong>{acquiredUsers}</strong>
                                            <small className={styles.statComparison}>
                                                {renderDelta(acquiredUsersDeltaPct)}
                                                <span>vs previous month</span>
                                            </small>
                                        </div>
                                        <div>
                                            <span>Retained users</span>
                                            <strong>{retainedUsers}</strong>
                                            <small className={styles.statComparison}>
                                                {renderDelta(retainedUsersDeltaPct)}
                                                <span>vs previous month</span>
                                            </small>
                                        </div>
                                        <div>
                                            <span>Revenue protected</span>
                                            <strong>{formatCurrencyFromMinor(demoKpis.mrrProtected, workspaceCurrency)}</strong>
                                            <small className={styles.statComparison}>
                                                {renderDelta(protectedDeltaPct)}
                                                <span>vs previous month</span>
                                            </small>
                                        </div>
                                        <div>
                                            <span>Expansion MRR</span>
                                            <strong>{formatCurrencyFromMinor(expansionMrrMinor, workspaceCurrency)}</strong>
                                            <small className={styles.statComparison}>
                                                {renderDelta(expansionMrrDeltaPct)}
                                                <span>vs previous month</span>
                                            </small>
                                        </div>
                                        <div>
                                            <span>AI confidence</span>
                                            <strong>{aiConfidenceScore}%</strong>
                                            <small className={styles.statComparison}>
                                                {renderDelta(mrrDeltaPct)}
                                                <span>vs previous month</span>
                                            </small>
                                        </div>
                                    </div>
                                </div>

                                <div className={`${styles.revenueOverviewCard} ${styles.churnOverviewCard}`}>
                                    <div className={styles.revenueOverviewHeader}>
                                        <div>
                                            <span className={styles.revenueOverviewEyebrow}>Customer retention</span>
                                            <h3>Churn Impact</h3>
                                        </div>
                                        <span className={styles.revenueOverviewPeriod}>
                                            <CalendarDays size={13} strokeWidth={1.8} />
                                            {revenueImpactDateRange}
                                        </span>
                                    </div>

                                    <div className={styles.revenueOverviewValueRow}>
                                        <strong>{formatPct(churnHoverData.current)}</strong>
                                        <span>{formatDeltaPpLabel(drawerInsights.churn.deltaPp)} vs previous month</span>
                                    </div>

                                    <div className={styles.revenueOverviewLegend}>
                                        <span><i className={styles.legendChurn} />Churn</span>
                                    </div>

                                    <div className={styles.revenueOverviewChart}>
                                        <EChart option={churnImpactOption} />
                                    </div>

                                    <div className={`${styles.revenueOverviewStats} ${styles.churnForecastStats}`}>
                                        <div>
                                            <span>Forecast churn</span>
                                            <strong>{formatPct(projectedChurn)}</strong>
                                            <small className={styles.statComparison}>
                                                {renderDeltaPp(
                                                    typeof projectedChurn === "number" && typeof churnHoverData.current === "number"
                                                        ? projectedChurn - churnHoverData.current
                                                        : null,
                                                    true
                                                )}
                                                <span>vs previous month</span>
                                            </small>
                                        </div>
                                        <div>
                                            <span>Forecast churned users</span>
                                            <strong>{forecastChurnedUsers}</strong>
                                            <small className={styles.statComparison}>
                                                {renderDelta(forecastChurnedUsersDeltaPct, true)}
                                                <span>vs previous month</span>
                                            </small>
                                        </div>
                                        <div>
                                            <span>Customer health</span>
                                            <strong>{aiInsightCard.healthScore}/100</strong>
                                            <small className={styles.statComparison}>
                                                {renderDelta(mauLatestDeltaPct)}
                                                <span>vs previous month</span>
                                            </small>
                                        </div>
                                        <div>
                                            <span>Revenue at risk</span>
                                            <strong>{formatCurrencyFromMinor(demoKpis.mrrAtRisk, workspaceCurrency)}</strong>
                                            <small className={styles.statComparison}>
                                                {renderDelta(atRiskDeltaPct, true)}
                                                <span>vs previous month</span>
                                            </small>
                                        </div>
                                        <div>
                                            <span>Revenue lost</span>
                                            <strong>{formatCurrencyFromMinor(revenueLostMinor, workspaceCurrency)}</strong>
                                            <small className={styles.statComparison}>
                                                {renderDelta(revenueLostDeltaPct, true)}
                                                <span>vs previous month</span>
                                            </small>
                                        </div>
                                        <div>
                                            <span>AI confidence</span>
                                            <strong>{aiConfidenceScore}%</strong>
                                            <small className={styles.statComparison}>
                                                {renderDelta(typeof churnDeltaPp === "number" ? -churnDeltaPp : null)}
                                                <span>vs previous month</span>
                                            </small>
                                        </div>
                                    </div>
                                </div>

                                <div className={styles.impactTablesGrid}>
                                    <section className={styles.customerImpactTableCard}>
                                        <div className={styles.customerImpactTableTop}>
                                            <div>
                                                <h3>Revenue Impact Queue</h3>
                                                <p>Prioritised accounts and the recommended next action.</p>
                                            </div>

                                            <div className={styles.customerImpactTableTools}>
                                                <div className={styles.customerImpactSearch}>
                                                    <Search size={14} strokeWidth={1.8} />
                                                    <input
                                                        type="search"
                                                        value={recoverySearchQuery}
                                                        onChange={(event) => setRecoverySearchQuery(event.target.value)}
                                                        placeholder="Search"
                                                        aria-label="Search revenue impact queue"
                                                    />
                                                </div>

                                                <div className={styles.chartFilterWrap}>
                                                    <button
                                                        type="button"
                                                        className={styles.chartFilterButton}
                                                        onClick={() => setRecoveryFilterOpen((open) => !open)}
                                                        aria-expanded={recoveryFilterOpen}
                                                        aria-haspopup="menu"
                                                    >
                                                        {({
                                                            all: "All accounts",
                                                            "opportunity:immediate attention": "Immediate attention",
                                                            "opportunity:billing recovery": "Billing recovery",
                                                            "opportunity:upsell opportunity": "Upsell opportunity",
                                                            "opportunity:reactivation": "Reactivation",
                                                            "opportunity:expansion momentum": "Expansion momentum",
                                                            "impact:high": "High impact",
                                                            "impact:medium": "Medium impact",
                                                            "impact:low": "Low impact",
                                                            "action:payment": "Retry payment",
                                                            "action:email": "Send email",
                                                            "action:check-in": "Check-in",
                                                            "action:expansion": "Expansion",
                                                        } as Record<string, string>)[recoveryFilter] || "All accounts"}
                                                        <ChevronDown size={13} />
                                                    </button>

                                                    {recoveryFilterOpen && (
                                                        <div className={`${styles.chartFilterMenu} ${styles.recoveryFilterMenu}`} role="menu">
                                                            {[
                                                                ["all", "All accounts"],
                                                                ["opportunity:immediate attention", "Immediate attention"],
                                                                ["opportunity:billing recovery", "Billing recovery"],
                                                                ["opportunity:upsell opportunity", "Upsell opportunity"],
                                                                ["opportunity:reactivation", "Reactivation"],
                                                                ["opportunity:expansion momentum", "Expansion momentum"],
                                                                ["impact:high", "High impact"],
                                                                ["impact:medium", "Medium impact"],
                                                                ["impact:low", "Low impact"],
                                                                ["action:payment", "Retry payment"],
                                                                ["action:email", "Send email"],
                                                                ["action:check-in", "Check-in"],
                                                                ["action:expansion", "Expansion"],
                                                            ].map(([value, label]) => (
                                                                <button
                                                                    key={value}
                                                                    type="button"
                                                                    role="menuitem"
                                                                    className={`${styles.chartFilterOption} ${recoveryFilter === value ? styles.chartFilterOptionActive : ""}`}
                                                                    onClick={() => {
                                                                        setRecoveryFilter(value);
                                                                        setRecoveryFilterOpen(false);
                                                                    }}
                                                                >
                                                                    {label}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className={styles.customerImpactTableViewport}>
                                            <table className={styles.customerImpactTable}>
                                                <thead>
                                                    <tr>
                                                        <th>Account</th>
                                                        <th>Opportunity</th>
                                                        <th>Impact</th>
                                                        <th>Suggested action</th>
                                                        <th>Action</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {recoveryLoading ? (
                                                        <tr>
                                                            <td colSpan={5} className={styles.customerImpactEmpty}>Loading revenue impact queue...</td>
                                                        </tr>
                                                    ) : recoveryError ? (
                                                        <tr>
                                                            <td colSpan={5} className={styles.customerImpactEmpty}>{recoveryError}</td>
                                                        </tr>
                                                    ) : visibleRecoveryRows.length === 0 ? (
                                                        <tr>
                                                            <td colSpan={5} className={styles.customerImpactEmpty}>
                                                                <strong>No accounts found.</strong>
                                                                <span>Accounts requiring action will appear here automatically.</span>
                                                            </td>
                                                        </tr>
                                                    ) : (
                                                        visibleRecoveryRows.map((row) => {
                                                            const actionText = row.suggestedAction || row.action || "Review account";
                                                            const isPaymentAction = isBillingRecoveryRow(row);
                                                            const impact = getQueueImpactLabel(row);

                                                            return (
                                                                <tr key={`${row.id}-${row.type || "recovery"}`}>
                                                                    <td>
                                                                        <button
                                                                            type="button"
                                                                            className={styles.customerImpactAccount}
                                                                            onClick={() =>
                                                                                router.push(
                                                                                    getAccountHref(
                                                                                        row.accountRiskId ||
                                                                                        row.id
                                                                                    )
                                                                                )
                                                                            }
                                                                        >
                                                                            <strong>{row.name}</strong>
                                                                            <span>{row.email || getQueueDomain(row)}</span>
                                                                        </button>
                                                                    </td>
                                                                    <td>
                                                                        <span className={`${styles.customerImpactPill} ${styles[`impactOpportunity_${getQueueTone(row.type)}`]}`}>
                                                                            {row.opportunity || formatQueueType(row.type)}
                                                                        </span>
                                                                    </td>
                                                                    <td>
                                                                        <span className={`${styles.customerImpactPill} ${styles[`impactBadge_${impact.toLowerCase()}`]}`}>
                                                                            {impact}
                                                                        </span>
                                                                    </td>
                                                                    <td><p className={styles.customerImpactCopy}>{actionText}</p></td>
                                                                    <td>
                                                                        <button
                                                                            type="button"
                                                                            className={styles.customerImpactAction}
                                                                            onClick={() => {
                                                                                if (isPaymentAction) {
                                                                                    void handleExecuteRecoveryAction(row);
                                                                                } else {
                                                                                    openRecoveryEmailModal(row);
                                                                                }
                                                                            }}
                                                                        >
                                                                            {isPaymentAction ? <RotateCcw size={13} strokeWidth={1.8} /> : <Mail size={13} strokeWidth={1.8} />}
                                                                            {isPaymentAction ? "Retry payment" : "Send email"}
                                                                        </button>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>

                                        <div className={styles.customerImpactTableBottom}>
                                            <p>Showing {visibleRecoveryRows.length} of {filteredRecoveryRows.length} accounts</p>
                                            <div className={styles.customerImpactPager}>
                                                <button
                                                    type="button"
                                                    disabled={recoveryPage <= 0}
                                                    onClick={() => setRecoveryPage((page) => Math.max(0, page - 1))}
                                                    aria-label="Previous page"
                                                >
                                                    ‹
                                                </button>
                                                <button type="button" className={styles.customerImpactCurrentPage}>{recoveryPage + 1}</button>
                                                <button
                                                    type="button"
                                                    disabled={recoveryPage >= recoveryPageCount - 1}
                                                    onClick={() => setRecoveryPage((page) => Math.min(recoveryPageCount - 1, page + 1))}
                                                    aria-label="Next page"
                                                >
                                                    ›
                                                </button>
                                            </div>
                                        </div>
                                    </section>
                                </div>
                            </div>

                        ) : null}

                    </section >



                    <EmailModalPortal open={emailModalOpen}>
                        <div className={styles.modalOverlay} onClick={closeRecoveryEmailModal}>
                            <div
                                className={styles.emailModal}
                                onClick={(event) => event.stopPropagation()}
                            >
                                <div className={styles.emailModalHeader}>
                                    <div className={styles.emailModalHeading}>
                                        <div className={styles.emailModalIcon} aria-hidden="true">
                                            <Mail size={17} />
                                        </div>
                                        <div>
                                            <div className={styles.emailModalTitle}>
                                                Retention Outreach
                                            </div>
                                            <p className={styles.emailModalSubtitle}>
                                                Send a personalised email to re-engage this customer.
                                            </p>
                                        </div>
                                    </div>

                                    <button
                                        className={styles.emailCloseBtn}
                                        onClick={closeRecoveryEmailModal}
                                        type="button"
                                        aria-label="Close email"
                                        disabled={sendingEmail}
                                    >
                                        ×
                                    </button>
                                </div>

                                <div className={styles.emailShell}>
                                    <div className={styles.emailTopFields}>
                                        <div className={styles.emailField}>
                                            <label className={styles.emailLabel}>To</label>
                                            <input
                                                className={styles.emailInput}
                                                value={emailModalRow?.email || ""}
                                                readOnly
                                            />
                                        </div>

                                        <div className={styles.emailField}>
                                            <label className={styles.emailLabel}>Subject</label>
                                            <input
                                                className={styles.emailInput}
                                                value={emailSubject}
                                                onChange={(event) =>
                                                    setEmailSubject(event.target.value)
                                                }
                                                disabled={sendingEmail}
                                            />
                                        </div>
                                    </div>

                                    <div className={styles.emailField}>
                                        <label className={styles.emailLabel}>Message</label>
                                        <div className={styles.emailMessageWrap}>
                                            <textarea
                                                className={styles.emailTextarea}
                                                value={emailBody}
                                                onChange={(event) =>
                                                    setEmailBody(event.target.value)
                                                }
                                                disabled={sendingEmail}
                                                maxLength={2000}
                                            />
                                            <span className={styles.emailCharacterCount}>
                                                {emailBody.length}/2000
                                            </span>
                                        </div>
                                    </div>

                                    <section className={styles.emailCtaCard}>
                                        <div className={styles.emailCtaHeader}>
                                            <div>
                                                <h3>Call to Action <span>(Optional)</span></h3>
                                                <p>Add a button to drive the next step.</p>
                                            </div>

                                            <label className={styles.emailCtaToggle}>
                                                <input
                                                    type="checkbox"
                                                    checked={emailCtaEnabled}
                                                    onChange={(event) =>
                                                        setEmailCtaEnabled(event.target.checked)
                                                    }
                                                    disabled={sendingEmail}
                                                />
                                                <span aria-hidden="true" />
                                                <span className={styles.srOnly}>Enable call to action</span>
                                            </label>
                                        </div>

                                        {emailCtaEnabled ? (
                                            <div className={styles.emailCtaContent}>
                                                <div className={styles.emailCtaFields}>
                                                    <div className={styles.emailField}>
                                                        <label className={styles.emailLabel}>Button Text</label>
                                                        <input
                                                            className={styles.emailInput}
                                                            value={emailCtaText}
                                                            onChange={(event) =>
                                                                setEmailCtaText(event.target.value)
                                                            }
                                                            placeholder="e.g. Book a call"
                                                            disabled={sendingEmail}
                                                        />
                                                    </div>

                                                    <div className={styles.emailField}>
                                                        <label className={styles.emailLabel}>Button Link</label>
                                                        <input
                                                            className={styles.emailInput}
                                                            type="url"
                                                            value={emailCtaLink}
                                                            onChange={(event) =>
                                                                setEmailCtaLink(event.target.value)
                                                            }
                                                            placeholder="https://"
                                                            disabled={sendingEmail}
                                                        />
                                                    </div>
                                                </div>

                                            </div>
                                        ) : null}
                                    </section>

                                    {sendEmailError ? (
                                        <div className={styles.emailError}>
                                            {sendEmailError}
                                        </div>
                                    ) : null}

                                    <div className={styles.emailModalActions}>
                                        <button
                                            className={styles.emailCancelBtn}
                                            type="button"
                                            onClick={closeRecoveryEmailModal}
                                            disabled={sendingEmail}
                                        >
                                            Cancel
                                        </button>

                                        <button
                                            className={styles.emailSendBtn}
                                            type="button"
                                            onClick={sendRecoveryEmail}
                                            disabled={sendingEmail}
                                        >
                                            {sendingEmail ? "Sending..." : "Send email"}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </EmailModalPortal>
                </div >
            </>

        );
    }

    return <div className={styles.page}>{content}</div>;
}
