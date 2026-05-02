"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { canAccessFeature, type PlanTier } from "@/lib/permissions";
import { getEmailRecommendation } from "@/lib/emailRecommendations";
import type { ActionFirstRecommendation } from "@/lib/ai/types";

type DrawerView = "mrr" | "churn";
type InsightTab = "drivers" | "forecast";
type ConfidenceLevel = "High" | "Medium" | "Low";

type DrawerInsights = {
    months: { current: string; previous: string | null };
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
};

type RiskAccountRow = {
    id: string;
    name: string;
    email: string | null;
    reason: string;
    mrrMinor: number | null;
    automation: string;
    lastEventAt: string | null;
};

type ExpansionRow = {
    id: string;
    name: string;
    email?: string | null;
    upsideMinor: number;
    action: string;
    reason?: string;
    confidence?: ConfidenceLevel;
};

type DriverRow = {
    id: string;
    accountName: string;
    email: string | null;
    label: string;
    valueMinor: number;
    tone: "positive" | "negative";
    lastEventAt: string | null;
};

type Forecast = {
    lastMonth: string;
    lastValue: number;
    prevMonth: string;
    prevValue: number;
    delta: number;
    projectedNext: number;
    confidencePct: number;
} | null;

type AiSummary = {
    headline: string;
    bullets: string[];
};

type EmailDraft = {
    accountName: string;
    email: string;
    subject: string;
    message: string;
};

type Props = {
    open: boolean;
    drawerView: DrawerView;
    onClose: () => void;
    onSwitchView: (view: DrawerView) => void;
    isDemoPreview: boolean;
    drawerInsights: DrawerInsights;
    riskAccountRows: RiskAccountRow[];
    expansionRows: ExpansionRow[];
    mrrDriverRows: DriverRow[];
    aiActions?: ActionFirstRecommendation[];
    mrrForecast: Forecast;
    churnForecast: Forecast;
    aiChurn: AiSummary;
    aiMrr?: AiSummary;
    tier: "free" | "starter" | "pro" | "scale";
    trialEndsAt?: string | null;
};

const PAGE_SIZE = 3;

function normalizePlanTier(tier?: "free" | "starter" | "pro" | "scale"): PlanTier {
    if (tier === "pro" || tier === "scale") return "pro";
    if (tier === "starter") return "starter";
    return "free";
}

function formatGBPFromMinor(value?: number | null) {
    const pounds = Number(value || 0) / 100;

    return new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "GBP",
        maximumFractionDigits: 0,
    }).format(pounds);
}

function formatCompactGBPFromMinor(value?: number | null) {
    const pounds = Number(value || 0) / 100;

    return new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "GBP",
        notation: "compact",
        maximumFractionDigits: 1,
    }).format(pounds);
}

function formatPct(value?: number | null) {
    if (typeof value !== "number" || !Number.isFinite(value)) return "—";
    return `${value.toFixed(1)}%`;
}

function formatPp(value?: number | null) {
    if (typeof value !== "number" || !Number.isFinite(value)) return "—";
    return `${value >= 0 ? "+" : ""}${value.toFixed(1)}pp`;
}

function formatSignedPct(value?: number | null) {
    if (typeof value !== "number" || !Number.isFinite(value)) return "—";
    return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function niceWhen(iso?: string | null) {
    if (!iso) return "—";

    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";

    return d.toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
}

function accountHref(id?: string | null) {
    if (!id) return "/dashboard/accounts-at-risk";
    return `/dashboard/accounts-at-risk/${id}`;
}

function suggestedAction(reason?: string | null, automation?: string | null) {
    const recommendation = getEmailRecommendation({
        accountName: "this account",
        reason: `${reason || ""} ${automation || ""}`,
    });

    return recommendation.action;
}

function buildEmailDraft(acc: RiskAccountRow, mode?: "risk" | "retry"): EmailDraft {
    const recommendation = getEmailRecommendation({
        accountName: acc.name,
        reason: `${acc.reason || ""} ${acc.automation || ""} ${mode || ""}`,
    });

    return {
        accountName: acc.name,
        email: acc.email || "",
        subject: recommendation.subject,
        message: recommendation.message,
    };
}

type KeyDriver = {
    id: string;
    name: string;
    email: string | null;
    category: "New subscriber" | "Upgrade" | "Retained account" | "Churn risk";
    label: string;
    mrrMinor: number;
    date: string | null;
    tone: "positive" | "negative";
};

function getDriverCategory(label: string, tone: "positive" | "negative"): KeyDriver["category"] {
    const l = label.toLowerCase();

    if (tone === "negative") return "Churn risk";
    if (l.includes("upgrade") || l.includes("expansion") || l.includes("seat")) return "Upgrade";
    if (l.includes("retained") || l.includes("recovered") || l.includes("saved")) return "Retained account";
    return "New subscriber";
}

const demoKeyDrivers: KeyDriver[] = [
    {
        id: "brightops",
        name: "BrightOps",
        email: "ops@brightops.com",
        category: "Upgrade",
        label: "Annual plan upgrade",
        mrrMinor: 13300,
        date: "2026-04-05T10:30:00Z",
        tone: "positive",
    },
    {
        id: "kitecrm",
        name: "KiteCRM",
        email: "finance@kitecrm.com",
        category: "New subscriber",
        label: "New subscription started",
        mrrMinor: 12400,
        date: "2026-04-04T14:10:00Z",
        tone: "positive",
    },
    {
        id: "cedarworks",
        name: "CedarWorks",
        email: "hello@cedarworks.io",
        category: "Retained account",
        label: "Recovered failed payment",
        mrrMinor: 6800,
        date: "2026-04-03T09:20:00Z",
        tone: "positive",
    },
    {
        id: "northstar-labs",
        name: "Northstar Labs",
        email: "billing@northstarlabs.co",
        category: "Retained account",
        label: "Renewed after retention follow-up",
        mrrMinor: 9200,
        date: "2026-04-02T12:15:00Z",
        tone: "positive",
    },
    {
        id: "luma-studio",
        name: "Luma Studio",
        email: "team@lumastudio.io",
        category: "New subscriber",
        label: "Trial converted to paid",
        mrrMinor: 7400,
        date: "2026-04-01T09:05:00Z",
        tone: "positive",
    },
];

const demoHighRiskAccounts: RiskAccountRow[] = [
    {
        id: "bloompay",
        name: "BloomPay",
        email: "ops@bloompay.co",
        reason: "Low adoption of core feature",
        mrrMinor: 34900,
        automation: "Send re-engagement email",
        lastEventAt: null,
    },
    {
        id: "cedarworks",
        name: "CedarWorks",
        email: "hello@cedarworks.io",
        reason: "Usage dropped sharply in the last 14 days",
        mrrMinor: 21900,
        automation: "Send usage recovery email",
        lastEventAt: null,
    },
    {
        id: "kite-labs",
        name: "Kite Labs",
        email: "finance@kitelabs.co",
        reason: "Renewal window approaching with downgrade signals",
        mrrMinor: 12900,
        automation: "Book retention check-in",
        lastEventAt: null,
    },
    {
        id: "northstar-labs",
        name: "Northstar Labs",
        email: "billing@northstarlabs.co",
        reason: "Payment risk and reduced product activity",
        mrrMinor: 9200,
        automation: "Send payment recovery email",
        lastEventAt: null,
    },
    {
        id: "luma-studio",
        name: "Luma Studio",
        email: "team@lumastudio.io",
        reason: "Seats inactive after trial conversion",
        mrrMinor: 7400,
        automation: "Send onboarding support email",
        lastEventAt: null,
    },
];

export default function InsightDrawer({
    open,
    drawerView,
    onClose,
    onSwitchView,
    isDemoPreview,
    drawerInsights,
    riskAccountRows,
    mrrDriverRows,
    mrrForecast,
    churnForecast,
    aiChurn,
    aiMrr,
    aiActions = [],
    tier,
    trialEndsAt,
}: Props) {
    const router = useRouter();

    const [driverPage, setDriverPage] = useState(0);
    const [insightTab, setInsightTab] = useState<InsightTab>("drivers");
    const [emailDraft, setEmailDraft] = useState<EmailDraft | null>(null);

    const isMrr = drawerView === "mrr";
    const forecast = isMrr ? mrrForecast : churnForecast;

    useEffect(() => {
        setDriverPage(0);
        setInsightTab("drivers");
    }, [drawerView]);

    useEffect(() => {
        document.body.style.overflow = open ? "hidden" : "";

        return () => {
            document.body.style.overflow = "";
        };
    }, [open]);

    const hasProAccess = canAccessFeature({
        plan: normalizePlanTier(tier),
        feature: "forecasting",
        trialEndsAt: trialEndsAt ?? null,
        isDemoMode: isDemoPreview,
    });

    const keyDrivers = useMemo<KeyDriver[]>(() => {
        if (isMrr) {
            const liveRows = mrrDriverRows.map((row) => ({
                id: row.id,
                name: row.accountName,
                email: row.email,
                category: getDriverCategory(row.label, row.tone),
                label: row.label,
                mrrMinor: row.valueMinor,
                date: row.lastEventAt,
                tone: row.tone,
            }));

            return liveRows.length ? liveRows : demoKeyDrivers;
        }

        const churnRows = riskAccountRows.map((row) => ({
            id: row.id,
            name: row.name,
            email: row.email,
            category: "Churn risk" as const,
            label: row.reason,
            mrrMinor: row.mrrMinor ?? 0,
            date: row.lastEventAt,
            tone: "negative" as const,
        }));

        if (churnRows.length) return churnRows;

        return drawerInsights.churn.churnedAccounts.map((row) => ({
            id: row.id,
            name: row.name,
            email: row.email,
            category: "Churn risk" as const,
            label: "Recently churned or inactive account",
            mrrMinor: row.mrrMinor,
            date: row.lastEventAt ?? null,
            tone: "negative" as const,
        }));
    }, [isMrr, mrrDriverRows, riskAccountRows, drawerInsights.churn.churnedAccounts]);

    const highRiskAccounts = useMemo(() => {
        if (riskAccountRows.length) return riskAccountRows.slice(0, 5);

        if (drawerInsights.churn.churnedAccounts.length) {
            return drawerInsights.churn.churnedAccounts.slice(0, 5).map((row) => ({
                id: row.id,
                name: row.name,
                email: row.email,
                reason: "Recently churned or inactive account",
                mrrMinor: row.mrrMinor,
                automation: "Retention follow-up",
                lastEventAt: row.lastEventAt ?? null,
            }));
        }

        return demoHighRiskAccounts;
    }, [riskAccountRows, drawerInsights.churn.churnedAccounts]);

    const actionFirstAccounts = useMemo<RiskAccountRow[]>(() => {
        if (!aiActions.length) return [];

        return aiActions.slice(0, 5).map((action) => ({
            id: action.customerId,
            name: action.customerName,
            email: null,
            reason: action.reason,
            mrrMinor: action.mrrAtRiskMinor,
            automation: action.actionTitle,
            lastEventAt: null,
        }));
    }, [aiActions]);

    const totalPages = Math.max(1, Math.ceil(keyDrivers.length / PAGE_SIZE));
    const safePage = Math.min(driverPage, totalPages - 1);
    const visibleDrivers = keyDrivers.slice(
        safePage * PAGE_SIZE,
        safePage * PAGE_SIZE + PAGE_SIZE
    );

    const deltaValue = isMrr ? drawerInsights.mrr.deltaPct : drawerInsights.churn.deltaPp;
    const movementIsPositive = isMrr ? (deltaValue ?? 0) >= 0 : (deltaValue ?? 0) <= 0;

    const movementArrow =
        deltaValue === 0 || deltaValue === null || deltaValue === undefined
            ? "→"
            : movementIsPositive
                ? "↑"
                : "↓";

    const movementLabel = isMrr
        ? `${formatSignedPct(drawerInsights.mrr.deltaPct)} vs ${formatGBPFromMinor(
            drawerInsights.mrr.prevMinor
        )} previous month`
        : `${formatPp(drawerInsights.churn.deltaPp)} vs previous month`;

    const withoutChurnMinor = highRiskAccounts.reduce(
        (total, acc) => total + Math.max(0, acc.mrrMinor ?? 0),
        0
    );

    const kpis = [
        {
            label: isMrr ? "Total MRR" : "Current churn",
            value: isMrr
                ? formatGBPFromMinor(drawerInsights.mrr.currentMinor)
                : formatPct(drawerInsights.churn.currentPct),
            sub: `${movementArrow} ${movementLabel}`,
            tone: movementIsPositive ? "#15803d" : "#b91c1c",
        },
        {
            label: "Confidence",
            value: forecast ? `${forecast.confidencePct}%` : "—",
            sub: isMrr
                ? `MoM change: ${formatSignedPct(drawerInsights.mrr.deltaPct)}`
                : `MoM change: ${formatPp(drawerInsights.churn.deltaPp)}`,
            tone: "#64748b",
        },
    ];

    const defaultAiMrr: AiSummary = {
        headline:
            (drawerInsights.mrr.deltaPct ?? 0) >= 0
                ? "MRR is moving in the right direction."
                : "MRR fell mainly due to churn.",
        bullets: [
            `Current MRR is ${formatGBPFromMinor(drawerInsights.mrr.currentMinor)}.`,
            `MoM change: ${formatSignedPct(drawerInsights.mrr.deltaPct)}.`,
            "Review high-risk accounts before they become lost revenue.",
        ],
    };

    const ai = isMrr ? aiMrr ?? defaultAiMrr : aiChurn;

    if (!open) return null;

    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 80,
                display: "flex",
                justifyContent: "flex-end",
                background: "rgba(15,23,42,0.2)",
                backdropFilter: "blur(6px)",
            }}
            onMouseDown={onClose}
        >
            <aside
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                    width: "min(900px, 100%)",
                    height: "100%",
                    background: "#fbfbfc",
                    borderLeft: "1px solid #e5e7eb",
                    boxShadow: "-20px 0 60px rgba(15,23,42,0.13)",
                    padding: "18px 24px",
                    overflowY: "hidden",
                    color: "#0f172a",
                }}
            >
                <div
                    style={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: 14,
                        marginBottom: 12,
                    }}
                >
                    <div>
                        <h2
                            style={{
                                margin: 0,
                                fontSize: 19,
                                lineHeight: 1.1,
                                color: "#111827",
                                fontWeight: 650,
                                letterSpacing: "-0.02em",
                            }}
                        >
                            {isMrr ? "MRR insights" : "Churn insights"}
                        </h2>

                        <p
                            style={{
                                margin: "6px 0 0",
                                color: "#64748b",
                                fontSize: 13,
                                lineHeight: 1.4,
                                fontWeight: 400,
                            }}
                        >
                            {isMrr
                                ? "What changed revenue this month and where to act."
                                : "What changed churn this month and which accounts need action."}
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            width: 36,
                            height: 36,
                            borderRadius: 999,
                            border: "1px solid #e5e7eb",
                            background: "#ffffff",
                            color: "#111827",
                            fontSize: 18,
                            cursor: "pointer",
                        }}
                    >
                        ×
                    </button>
                </div>

                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 6,
                        padding: 4,
                        borderRadius: 999,
                        background: "#f6f8fb",
                        marginBottom: 12,
                        border: "1px solid #e5e7eb",
                    }}
                >
                    {(["mrr", "churn"] as DrawerView[]).map((view) => {
                        const active = drawerView === view;

                        return (
                            <button
                                key={view}
                                type="button"
                                onClick={() => {
                                    setDriverPage(0);
                                    setInsightTab("drivers");
                                    onSwitchView(view);
                                }}
                                style={{
                                    border: 0,
                                    borderRadius: 999,
                                    padding: "9px 12px",
                                    fontWeight: 550,
                                    cursor: "pointer",
                                    background: active ? "#ffffff" : "transparent",
                                    color: active ? "#111827" : "#64748b",
                                    boxShadow: active
                                        ? "0 8px 18px rgba(15,23,42,0.08)"
                                        : "none",
                                }}
                            >
                                {view === "mrr" ? "MRR" : "Churn"}
                            </button>
                        );
                    })}
                </div>

                <section
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                        gap: 12,
                        marginBottom: 12,
                    }}
                >
                    {kpis.map((kpi) => (
                        <div
                            key={kpi.label}
                            style={{
                                padding: "13px 15px",
                                borderRadius: 20,
                                background: "#ffffff",
                                border: "1px solid #e7ebf0",
                                boxShadow: "0 10px 28px rgba(15,23,42,0.04)",
                                minHeight: 92,
                                display: "flex",
                                flexDirection: "column",
                                justifyContent: "center",
                            }}
                        >
                            <div
                                style={{
                                    fontSize: 10.5,
                                    color: "#64748b",
                                    fontWeight: 500,
                                    textTransform: "uppercase",
                                    letterSpacing: 0.4,
                                    marginBottom: 7,
                                }}
                            >
                                {kpi.label}
                            </div>

                            <div
                                style={{
                                    fontSize: 26,
                                    lineHeight: 1,
                                    fontWeight: 650,
                                    color: "#111827",
                                    letterSpacing: "-0.045em",
                                    marginBottom: 8,
                                }}
                            >
                                {kpi.value}
                            </div>

                            <div
                                style={{
                                    fontSize: 12,
                                    color: kpi.tone,
                                    fontWeight: 500,
                                    lineHeight: 1.3,
                                }}
                            >
                                {kpi.sub}
                            </div>
                        </div>
                    ))}
                </section>

                <section
                    style={{
                        border: "1px solid #e5e7eb",
                        background: "#ffffff",
                        borderRadius: 22,
                        padding: 14,
                        boxShadow: "0 12px 34px rgba(15,23,42,0.045)",
                    }}
                >
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: 6,
                            padding: 4,
                            borderRadius: 999,
                            background: "#f8fafc",
                            border: "1px solid #e5e7eb",
                            marginBottom: 12,
                        }}
                    >
                        <button
                            type="button"
                            onClick={() => setInsightTab("drivers")}
                            style={{
                                border: 0,
                                borderRadius: 999,
                                padding: "8px 12px",
                                background: insightTab === "drivers" ? "#ffffff" : "transparent",
                                color: insightTab === "drivers" ? "#111827" : "#64748b",
                                boxShadow:
                                    insightTab === "drivers"
                                        ? "0 8px 18px rgba(15,23,42,0.07)"
                                        : "none",
                                fontSize: 13,
                                fontWeight: 550,
                                cursor: "pointer",
                            }}
                        >
                            Key drivers
                        </button>

                        <button
                            type="button"
                            onClick={() => setInsightTab("forecast")}
                            style={{
                                border: 0,
                                borderRadius: 999,
                                padding: "8px 12px",
                                background: insightTab === "forecast" ? "#ffffff" : "transparent",
                                color: insightTab === "forecast" ? "#111827" : "#64748b",
                                boxShadow:
                                    insightTab === "forecast"
                                        ? "0 8px 18px rgba(15,23,42,0.07)"
                                        : "none",
                                fontSize: 13,
                                fontWeight: 550,
                                cursor: "pointer",
                            }}
                        >
                            AI forecast
                        </button>
                    </div>

                    {insightTab === "drivers" ? (
                        <>
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    gap: 12,
                                    marginBottom: 10,
                                }}
                            >
                                <div>
                                    <h3
                                        style={{
                                            margin: 0,
                                            fontSize: 16,
                                            color: "#111827",
                                            letterSpacing: "-0.025em",
                                            fontWeight: 650,
                                        }}
                                    >
                                        Key drivers
                                    </h3>

                                    <p
                                        style={{
                                            margin: "4px 0 0",
                                            color: "#64748b",
                                            fontSize: 12.5,
                                            fontWeight: 400,
                                        }}
                                    >
                                        {isMrr
                                            ? "What drove revenue changes this month."
                                            : "What drove churn risk this month."}
                                    </p>
                                </div>

                                <div
                                    style={{
                                        fontSize: 12,
                                        fontWeight: 500,
                                        color: "#64748b",
                                    }}
                                >
                                    {safePage + 1}/{totalPages}
                                </div>
                            </div>

                            <div style={{ display: "grid", gap: 8 }}>
                                {visibleDrivers.map((row) => (
                                    <div
                                        key={`${row.id}-${row.name}`}
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => router.push(accountHref(row.id))}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") router.push(accountHref(row.id));
                                        }}
                                        style={{
                                            width: "100%",
                                            display: "grid",
                                            gridTemplateColumns: "minmax(0, 1fr) auto",
                                            gap: 12,
                                            alignItems: "center",
                                            padding: "9px 13px",
                                            borderRadius: 15,
                                            border: "1px solid #edf1f5",
                                            background: "#ffffff",
                                            cursor: "pointer",
                                            textAlign: "left",
                                            boxShadow: "0 6px 18px rgba(15,23,42,0.025)",
                                            transition: "all 0.18s ease",
                                        }}
                                    >
                                        <div style={{ minWidth: 0 }}>
                                            <div
                                                style={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: 8,
                                                    marginBottom: 4,
                                                }}
                                            >
                                                <span
                                                    style={{
                                                        padding: "4px 8px",
                                                        borderRadius: 999,
                                                        background:
                                                            row.category === "Churn risk"
                                                                ? "#fef2f2"
                                                                : row.category === "Upgrade"
                                                                    ? "#eff6ff"
                                                                    : row.category ===
                                                                        "Retained account"
                                                                        ? "#ecfdf5"
                                                                        : "#f8fafc",
                                                        color:
                                                            row.category === "Churn risk"
                                                                ? "#dc2626"
                                                                : row.category === "Upgrade"
                                                                    ? "#2563eb"
                                                                    : row.category ===
                                                                        "Retained account"
                                                                        ? "#15803d"
                                                                        : "#64748b",
                                                        fontSize: 10.5,
                                                        fontWeight: 550,
                                                        whiteSpace: "nowrap",
                                                    }}
                                                >
                                                    {row.category}
                                                </span>

                                                <span
                                                    style={{
                                                        fontSize: 13.5,
                                                        fontWeight: 650,
                                                        color: "#111827",
                                                        whiteSpace: "nowrap",
                                                        overflow: "hidden",
                                                        textOverflow: "ellipsis",
                                                    }}
                                                >
                                                    {row.name}
                                                </span>
                                            </div>

                                            <div
                                                style={{
                                                    fontSize: 11.5,
                                                    color: "#334155",
                                                    fontWeight: 500,
                                                    whiteSpace: "nowrap",
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                    marginBottom: 2,
                                                }}
                                            >
                                                {row.email || "No email"} • {niceWhen(row.date)}
                                            </div>

                                            <div
                                                style={{
                                                    fontSize: 11.5,
                                                    color: "#64748b",
                                                    fontWeight: 400,
                                                    whiteSpace: "nowrap",
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                }}
                                            >
                                                {row.label}
                                            </div>

                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setEmailDraft(
                                                        buildEmailDraft({
                                                            id: row.id,
                                                            name: row.name,
                                                            email: row.email,
                                                            reason: row.label,
                                                            mrrMinor: row.mrrMinor,
                                                            automation: row.category,
                                                            lastEventAt: row.date,
                                                        })
                                                    );
                                                }}
                                                style={{
                                                    width: "fit-content",
                                                    border: "1px solid #e5e7eb",
                                                    background: "#ffffff",
                                                    color: "#111827",
                                                    borderRadius: 999,
                                                    padding: "5px 9px",
                                                    fontSize: 10.8,
                                                    fontWeight: 550,
                                                    cursor: "pointer",
                                                    marginTop: 7,
                                                }}
                                            >
                                                Send email
                                            </button>
                                        </div>

                                        <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                                            <div
                                                style={{
                                                    fontSize: 13,
                                                    fontWeight: 650,
                                                    color:
                                                        row.tone === "positive"
                                                            ? "#15803d"
                                                            : "#dc2626",
                                                }}
                                            >
                                                {row.mrrMinor >= 0 ? "+" : "-"}
                                                {formatCompactGBPFromMinor(Math.abs(row.mrrMinor))}
                                            </div>

                                            <div
                                                style={{
                                                    fontSize: 9.5,
                                                    fontWeight: 550,
                                                    color: "#64748b",
                                                    marginTop: 2,
                                                    textTransform: "uppercase",
                                                    letterSpacing: 0.3,
                                                }}
                                            >
                                                MRR
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    gap: 10,
                                    marginTop: 10,
                                }}
                            >
                                <button
                                    type="button"
                                    disabled={safePage === 0}
                                    onClick={() => setDriverPage((p) => Math.max(0, p - 1))}
                                    style={{
                                        border: "1px solid #e5e7eb",
                                        background: "#ffffff",
                                        color: safePage === 0 ? "#cbd5e1" : "#111827",
                                        borderRadius: 999,
                                        padding: "7px 11px",
                                        fontSize: 12,
                                        fontWeight: 500,
                                        cursor: safePage === 0 ? "not-allowed" : "pointer",
                                    }}
                                >
                                    Previous
                                </button>

                                <button
                                    type="button"
                                    disabled={safePage >= totalPages - 1}
                                    onClick={() =>
                                        setDriverPage((p) => Math.min(totalPages - 1, p + 1))
                                    }
                                    style={{
                                        border: "1px solid #e5e7eb",
                                        background: "#ffffff",
                                        color:
                                            safePage >= totalPages - 1 ? "#cbd5e1" : "#111827",
                                        borderRadius: 999,
                                        padding: "7px 11px",
                                        fontSize: 12,
                                        fontWeight: 500,
                                        cursor:
                                            safePage >= totalPages - 1
                                                ? "not-allowed"
                                                : "pointer",
                                    }}
                                >
                                    Next
                                </button>
                            </div>
                        </>
                    ) : isMrr ? (
                        <ForecastMrrContent
                            hasProAccess={hasProAccess}
                            router={router}
                            ai={ai}
                            withoutChurnMinor={withoutChurnMinor}
                            highRiskAccounts={
                                actionFirstAccounts.length ? actionFirstAccounts : highRiskAccounts
                            }
                            onEmailClick={(acc) => setEmailDraft(buildEmailDraft(acc, "risk"))}
                        />
                    ) : (
                        <ForecastChurnContent
                            hasProAccess={hasProAccess}
                            router={router}
                            highRiskAccounts={
                                actionFirstAccounts.length ? actionFirstAccounts : highRiskAccounts
                            }
                            onEmailClick={(acc) => setEmailDraft(buildEmailDraft(acc, "retry"))}
                        />
                    )}
                </section>
            </aside>

            {emailDraft ? (
                <EmailComposeModal
                    draft={emailDraft}
                    onClose={() => setEmailDraft(null)}
                    onChange={setEmailDraft}
                />
            ) : null}
        </div>
    );
}

function ForecastMrrContent({
    hasProAccess,
    router,
    ai,
    withoutChurnMinor,
    highRiskAccounts,
    onEmailClick,
}: {
    hasProAccess: boolean;
    router: ReturnType<typeof useRouter>;
    ai: AiSummary;
    withoutChurnMinor: number;
    highRiskAccounts: RiskAccountRow[];
    onEmailClick: (acc: RiskAccountRow) => void;
}) {
    return (
        <div style={{ position: "relative", overflow: "hidden" }}>
            {!hasProAccess ? <ForecastLockOverlay router={router} /> : null}

            <div style={{ display: "grid", gap: 10 }}>
                <h3
                    style={{
                        margin: 0,
                        fontSize: 16,
                        lineHeight: 1.2,
                        letterSpacing: "-0.025em",
                        color: "#111827",
                        fontWeight: 650,
                    }}
                >
                    {ai.headline}
                </h3>

                <div
                    style={{
                        padding: 12,
                        borderRadius: 15,
                        background: "#f8fafc",
                        border: "1px solid #e5e7eb",
                    }}
                >
                    <div
                        style={{
                            fontSize: 10,
                            fontWeight: 500,
                            color: "#64748b",
                            textTransform: "uppercase",
                            letterSpacing: 0.35,
                            marginBottom: 5,
                        }}
                    >
                        Without churn
                    </div>

                    <div
                        style={{
                            fontSize: 22,
                            fontWeight: 650,
                            color: "#111827",
                            letterSpacing: "-0.04em",
                            marginBottom: 4,
                        }}
                    >
                        +{formatGBPFromMinor(withoutChurnMinor)}
                    </div>

                    <div style={{ fontSize: 11.5, color: "#64748b", lineHeight: 1.3 }}>
                        MoM potential if these high-risk accounts are retained.
                    </div>
                </div>

                <RiskTable
                    title="High-risk accounts to address immediately"
                    buttonText="View full list"
                    buttonHref="/dashboard/accounts-at-risk"
                    columns={["Account", "Reason", "AI suggestion", "MRR"]}
                    rows={highRiskAccounts}
                    router={router}
                    mode="risk"
                    onEmailClick={onEmailClick}
                />
            </div>
        </div>
    );
}

function ForecastChurnContent({
    hasProAccess,
    router,
    highRiskAccounts,
    onEmailClick,
}: {
    hasProAccess: boolean;
    router: ReturnType<typeof useRouter>;
    highRiskAccounts: RiskAccountRow[];
    onEmailClick: (acc: RiskAccountRow) => void;
}) {
    const retentionImpactMinor = highRiskAccounts.reduce(
        (total, acc) => total + Math.max(0, acc.mrrMinor ?? 0),
        0
    );

    return (
        <div style={{ position: "relative", overflow: "hidden" }}>
            {!hasProAccess ? <ForecastLockOverlay router={router} /> : null}

            <div style={{ display: "grid", gap: 10 }}>
                <h3
                    style={{
                        margin: 0,
                        fontSize: 16,
                        lineHeight: 1.2,
                        letterSpacing: "-0.025em",
                        color: "#111827",
                        fontWeight: 650,
                    }}
                >
                    Retention actions failed and need retry.
                </h3>

                <div
                    style={{
                        padding: 12,
                        borderRadius: 15,
                        background: "#f8fafc",
                        border: "1px solid #e5e7eb",
                    }}
                >
                    <div
                        style={{
                            fontSize: 10,
                            fontWeight: 500,
                            color: "#64748b",
                            textTransform: "uppercase",
                            letterSpacing: 0.35,
                            marginBottom: 5,
                        }}
                    >
                        Retention impact
                    </div>

                    <div
                        style={{
                            fontSize: 22,
                            fontWeight: 650,
                            color: "#111827",
                            letterSpacing: "-0.04em",
                            marginBottom: 4,
                        }}
                    >
                        {formatGBPFromMinor(retentionImpactMinor)}
                    </div>

                    <div style={{ fontSize: 11.5, color: "#64748b", lineHeight: 1.3 }}>
                        Revenue still at risk from failed or unresolved retention actions.
                    </div>
                </div>

                <RiskTable
                    title="Failed progress breakdown to retry immediately"
                    buttonText="View progress"
                    buttonHref="/dashboard/progress"
                    columns={["Account", "Failed progress", "Retry action", "MRR"]}
                    rows={highRiskAccounts}
                    router={router}
                    mode="retry"
                    onEmailClick={onEmailClick}
                />
            </div>
        </div>
    );
}

function ForecastLockOverlay({ router }: { router: ReturnType<typeof useRouter> }) {
    return (
        <div
            style={{
                position: "absolute",
                inset: 0,
                zIndex: 2,
                display: "grid",
                placeItems: "center",
                background: "rgba(255,255,255,0.76)",
                backdropFilter: "blur(8px)",
                padding: 20,
            }}
        >
            <div
                style={{
                    maxWidth: 320,
                    textAlign: "center",
                    background: "#ffffff",
                    border: "1px solid #e5e7eb",
                    borderRadius: 18,
                    padding: 18,
                    color: "#111827",
                    boxShadow: "0 18px 44px rgba(15,23,42,0.12)",
                }}
            >
                <div style={{ fontSize: 15, fontWeight: 650, marginBottom: 6 }}>
                    Pro AI forecast
                </div>

                <div
                    style={{
                        fontSize: 13,
                        color: "#64748b",
                        fontWeight: 400,
                        lineHeight: 1.5,
                        marginBottom: 12,
                    }}
                >
                    Upgrade to Pro to unlock forecasts, opportunities and AI next actions.
                </div>

                <button
                    type="button"
                    onClick={() => router.push("/dashboard/settings?tab=manage-plan")}
                    style={{
                        border: 0,
                        borderRadius: 999,
                        background: "#111827",
                        color: "#ffffff",
                        fontWeight: 550,
                        padding: "10px 14px",
                        cursor: "pointer",
                    }}
                >
                    Manage plan
                </button>
            </div>
        </div>
    );
}

function RiskTable({
    title,
    buttonText,
    buttonHref,
    columns,
    rows,
    router,
    mode,
    onEmailClick,
}: {
    title: string;
    buttonText: string;
    buttonHref: string;
    columns: [string, string, string, string];
    rows: RiskAccountRow[];
    router: ReturnType<typeof useRouter>;
    mode: "risk" | "retry";
    onEmailClick: (acc: RiskAccountRow) => void;
}) {
    const uniqueRows = Array.from(new Map(rows.map((row) => [row.id, row])).values());

    return (
        <div>
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 7,
                }}
            >
                <div style={{ fontSize: 13, fontWeight: 650, color: "#111827" }}>{title}</div>

                <button
                    type="button"
                    onClick={() => router.push(buttonHref)}
                    style={{
                        border: "1px solid #e5e7eb",
                        background: "#ffffff",
                        color: "#111827",
                        borderRadius: 999,
                        padding: "6px 10px",
                        fontSize: 11.5,
                        fontWeight: 550,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                    }}
                >
                    {buttonText}
                </button>
            </div>

            <div
                style={{
                    border: "1px solid #eef2f7",
                    borderRadius: 15,
                    overflow: "hidden",
                    background: "#ffffff",
                }}
            >
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "1.05fr 1.25fr 1.25fr 0.45fr",
                        gap: 10,
                        padding: "8px 10px",
                        background: "#f8fafc",
                        borderBottom: "1px solid #eef2f7",
                        fontSize: 10.5,
                        fontWeight: 650,
                        color: "#64748b",
                        textTransform: "uppercase",
                        letterSpacing: 0.25,
                    }}
                >
                    <div>{columns[0]}</div>
                    <div>{columns[1]}</div>
                    <div>{columns[2]}</div>
                    <div style={{ textAlign: "right" }}>{columns[3]}</div>
                </div>

                {uniqueRows.length ? (
                    uniqueRows.map((acc) => (
                        <div
                            key={acc.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => router.push(accountHref(acc.id))}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") router.push(accountHref(acc.id));
                            }}
                            style={{
                                width: "100%",
                                display: "grid",
                                gridTemplateColumns: "1.05fr 1.25fr 1.25fr 0.45fr",
                                gap: 10,
                                alignItems: "center",
                                padding: "7px 10px",
                                borderBottom: "1px solid #f1f5f9",
                                background: "#ffffff",
                                cursor: "pointer",
                                textAlign: "left",
                            }}
                        >
                            <div style={{ minWidth: 0 }}>
                                <div
                                    style={{
                                        fontSize: 12.5,
                                        fontWeight: 650,
                                        color: "#111827",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                    }}
                                >
                                    {acc.name}
                                </div>

                                <div
                                    style={{
                                        fontSize: 10.8,
                                        color: "#64748b",
                                        marginTop: 2,
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                    }}
                                >
                                    {acc.email || "No email"}
                                </div>
                            </div>

                            <div
                                style={{
                                    minWidth: 0,
                                    fontSize: 11.2,
                                    color: "#475569",
                                    lineHeight: 1.25,
                                    whiteSpace: "normal",
                                }}
                            >
                                {acc.reason}
                            </div>

                            <div
                                style={{
                                    minWidth: 0,
                                    display: "grid",
                                    gap: 5,
                                    fontSize: 11.2,
                                    color: "#111827",
                                    fontWeight: 500,
                                    lineHeight: 1.25,
                                    whiteSpace: "normal",
                                }}
                            >
                                <span>
                                    {acc.automation || suggestedAction(acc.reason, acc.automation)}
                                </span>

                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onEmailClick(acc);
                                    }}
                                    style={{
                                        width: "fit-content",
                                        border: "1px solid #e5e7eb",
                                        background: "#ffffff",
                                        color: "#111827",
                                        borderRadius: 999,
                                        padding: "5px 9px",
                                        fontSize: 10.8,
                                        fontWeight: 550,
                                        cursor: "pointer",
                                    }}
                                >
                                    Send email
                                </button>
                            </div>

                            <div
                                style={{
                                    fontSize: 12,
                                    fontWeight: 650,
                                    color: mode === "retry" ? "#b91c1c" : "#dc2626",
                                    textAlign: "right",
                                    whiteSpace: "nowrap",
                                }}
                            >
                                {formatCompactGBPFromMinor(acc.mrrMinor)}
                            </div>
                        </div>
                    ))
                ) : (
                    <div style={{ padding: "10px 12px", fontSize: 12, color: "#64748b" }}>
                        No accounts need immediate action right now.
                    </div>
                )}
            </div>
        </div>
    );
}

function EmailComposeModal({
    draft,
    onClose,
    onChange,
}: {
    draft: EmailDraft;
    onClose: () => void;
    onChange: (draft: EmailDraft) => void;
}) {
    return (
        <div
            onMouseDown={(e) => {
                e.stopPropagation();
                onClose();
            }}
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 120,
                display: "grid",
                placeItems: "center",
                background: "rgba(15,23,42,0.22)",
                backdropFilter: "blur(7px)",
                padding: 14,
            }}
        >
            <div
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                    width: "min(560px, calc(100vw - 28px))",
                    maxHeight: "calc(100vh - 36px)",
                    overflow: "hidden",
                    borderRadius: 22,
                    background: "#ffffff",
                    border: "1px solid #e5e7eb",
                    boxShadow: "0 28px 80px rgba(15,23,42,0.22)",
                    padding: 0,
                    color: "#111827",
                }}
            >
                <div
                    style={{
                        padding: 18,
                        maxHeight: "calc(100vh - 36px)",
                        overflowY: "auto",
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            alignItems: "flex-start",
                            justifyContent: "space-between",
                            gap: 14,
                            marginBottom: 14,
                        }}
                    >
                        <div>
                            <div
                                style={{
                                    fontSize: 10,
                                    fontWeight: 650,
                                    letterSpacing: 0.45,
                                    textTransform: "uppercase",
                                    color: "#64748b",
                                    marginBottom: 5,
                                }}
                            >
                                Email automation
                            </div>

                            <h3
                                style={{
                                    margin: 0,
                                    fontSize: 20,
                                    lineHeight: 1.1,
                                    fontWeight: 650,
                                    letterSpacing: "-0.03em",
                                    color: "#111827",
                                }}
                            >
                                Compose email
                            </h3>

                            <p
                                style={{
                                    margin: "4px 0 0",
                                    fontSize: 12.5,
                                    color: "#64748b",
                                }}
                            >
                                {draft.accountName} • {draft.email || "No email"}
                            </p>
                        </div>

                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                width: 34,
                                height: 34,
                                borderRadius: 999,
                                border: "1px solid #e5e7eb",
                                background: "#ffffff",
                                color: "#64748b",
                                cursor: "pointer",
                                fontSize: 18,
                                lineHeight: 1,
                                flexShrink: 0,
                            }}
                        >
                            ×
                        </button>
                    </div>

                    <div style={{ display: "grid", gap: 10 }}>
                        <label style={{ display: "grid", gap: 5 }}>
                            <span style={{ fontSize: 11.5, fontWeight: 550, color: "#64748b" }}>
                                To
                            </span>
                            <input
                                value={draft.email}
                                onChange={(e) => onChange({ ...draft, email: e.target.value })}
                                placeholder="customer@email.com"
                                style={{
                                    width: "100%",
                                    border: "1px solid #e5e7eb",
                                    borderRadius: 12,
                                    padding: "10px 12px",
                                    outline: "none",
                                    fontSize: 13,
                                    color: "#111827",
                                    background: "#fbfdff",
                                }}
                            />
                        </label>

                        <label style={{ display: "grid", gap: 5 }}>
                            <span style={{ fontSize: 11.5, fontWeight: 550, color: "#64748b" }}>
                                Subject
                            </span>
                            <input
                                value={draft.subject}
                                onChange={(e) => onChange({ ...draft, subject: e.target.value })}
                                style={{
                                    width: "100%",
                                    border: "1px solid #e5e7eb",
                                    borderRadius: 12,
                                    padding: "10px 12px",
                                    outline: "none",
                                    fontSize: 13,
                                    color: "#111827",
                                    background: "#fbfdff",
                                }}
                            />
                        </label>

                        <label style={{ display: "grid", gap: 5 }}>
                            <span style={{ fontSize: 11.5, fontWeight: 550, color: "#64748b" }}>
                                Message
                            </span>
                            <textarea
                                value={draft.message}
                                onChange={(e) => onChange({ ...draft, message: e.target.value })}
                                rows={6}
                                style={{
                                    width: "100%",
                                    border: "1px solid #e5e7eb",
                                    borderRadius: 12,
                                    padding: "11px 12px",
                                    outline: "none",
                                    fontSize: 13,
                                    lineHeight: 1.5,
                                    color: "#111827",
                                    background: "#fbfdff",
                                    resize: "vertical",
                                    fontFamily: "inherit",
                                    minHeight: 130,
                                    maxHeight: 190,
                                }}
                            />
                        </label>
                    </div>

                    <div
                        style={{
                            display: "flex",
                            justifyContent: "flex-end",
                            alignItems: "center",
                            gap: 10,
                            marginTop: 14,
                        }}
                    >
                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                border: "1px solid #e5e7eb",
                                background: "#ffffff",
                                color: "#111827",
                                borderRadius: 999,
                                padding: "9px 14px",
                                fontSize: 12.5,
                                fontWeight: 550,
                                cursor: "pointer",
                            }}
                        >
                            Cancel
                        </button>

                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                border: 0,
                                background: "#111827",
                                color: "#ffffff",
                                borderRadius: 999,
                                padding: "10px 15px",
                                fontSize: 12.5,
                                fontWeight: 650,
                                cursor: "pointer",
                                boxShadow: "0 10px 22px rgba(15,23,42,0.18)",
                            }}
                        >
                            Send email
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}