"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase.client";
import styles from "./analytics.module.css";
import { hasFeatureAccess } from "@/lib/permissions";

type DrawerView = "mrr" | "churn";
type ConfidenceLevel = "High" | "Medium" | "Low";
type EmailKind = "billing" | "inactive" | "checkin" | "expansion";
type DrawerPlanTier = "starter" | "pro" | "scale";

type InsightItem = {
    id: string;
    createdAt: string;
    title: string;
    summary: string;
    impactLabel?: string;
    href?: string;
};

type DrawerInsights = {
    months: { current: string; previous: string | null };
    mrr: {
        currentMinor: number;
        prevMinor: number | null;
        deltaPct: number | null;
    };
    churn: {
        currentPct: number | null;
        deltaPp: number | null;
    };
};

type RiskAccountRow = {
    id: string;
    name: string;
    email?: string | null;
    reason: string;
    mrrMinor: number | null;
    automation: string;
    confidence?: ConfidenceLevel;
    lastEventAt?: string | null;
    lastActiveAt?: string;
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
    lastEventAt?: string | null;
    date?: string;
};

type Forecast = {
    projectedNext: number;
    confidencePct: number;
} | null;

type AiSummary = {
    headline: string;
    bullets: string[];
};

type AiInsightMetrics = {
    businessHealthScore: number;
    businessHealthLabel: string;
    businessHealthTone: string;
    confidenceScore: number;
    confidenceLabel: string;
    nextMonthMrr: number | null;
    nextMonthChurn: number | null;
};

type InsightsFeed = {
    ok?: boolean;
    items?: InsightItem[];
} | null;

type EmailModalState = {
    open: boolean;
    kind: EmailKind | null;
    to: string;
    accountId?: string;
    accountName: string;
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
    mrrForecast: Forecast;
    churnForecast: Forecast;
    aiMrr: AiSummary;
    aiChurn: AiSummary;
    aiInsightMetrics: AiInsightMetrics;
    insights: InsightsFeed;
    tier: DrawerPlanTier;
};

function formatGBPFromMinor(maybeMinor: number | null | undefined) {
    const minor = Number(maybeMinor || 0);
    const pounds = minor / 100;

    try {
        return new Intl.NumberFormat("en-GB", {
            style: "currency",
            currency: "GBP",
            maximumFractionDigits: 0,
        }).format(pounds);
    } catch {
        return `£${pounds.toFixed(0)}`;
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

function formatProjectedGBP(pounds: number | null | undefined) {
    if (typeof pounds !== "number") return "—";

    return new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "GBP",
        maximumFractionDigits: 0,
    }).format(pounds);
}

function formatPeriod(months: { current: string; previous: string | null }) {
    if (!months.current) return "Current period";

    const current = new Date(`${months.current}-01T00:00:00`);
    if (Number.isNaN(current.getTime())) {
        return months.previous ? `${months.previous} → ${months.current}` : months.current;
    }

    const currentMonth = current.toLocaleString("en-GB", { month: "long" });
    const currentYear = current.getFullYear();

    if (!months.previous) {
        return `${currentMonth} ${currentYear}`;
    }

    const previous = new Date(`${months.previous}-01T00:00:00`);
    if (Number.isNaN(previous.getTime())) {
        return `${months.previous} → ${months.current}`;
    }

    const previousMonth = previous.toLocaleString("en-GB", { month: "long" });
    const previousYear = previous.getFullYear();

    if (previousYear === currentYear) {
        return `${previousMonth} → ${currentMonth} ${currentYear}`;
    }

    return `${previousMonth} ${previousYear} → ${currentMonth} ${currentYear}`;
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

function formatDeltaPct(deltaPct: number | null | undefined) {
    if (typeof deltaPct !== "number") return null;
    return `${deltaPct >= 0 ? "↑" : "↓"} ${Math.abs(deltaPct).toFixed(1)}%`;
}

function formatDeltaPp(deltaPp: number | null | undefined) {
    if (typeof deltaPp !== "number") return null;
    return `${deltaPp <= 0 ? "↓" : "↑"} ${Math.abs(deltaPp).toFixed(1)}pp`;
}

function buildMrrSummaryLine(
    forecast: Forecast,
    expansionRows: ExpansionRow[],
    riskAccountRows: RiskAccountRow[]
) {
    const topExpansion = expansionRows[0];
    const topRisk = riskAccountRows[0];

    if (topExpansion && topRisk) {
        return `MRR increased this month, supported by expansion in ${topExpansion.name}, but downside remains concentrated in ${riskAccountRows.length} at-risk accounts.`;
    }

    if (topExpansion) {
        return `MRR increased this month, driven by new subscriptions and expansion in ${topExpansion.name}.`;
    }

    if (topRisk) {
        return `MRR is holding, but revenue risk remains concentrated in a small number of at-risk accounts.`;
    }

    if (forecast) {
        return `MRR movement is stable this month, with the projection based on recent revenue trends.`;
    }

    return `MRR movement is stable this month based on the latest connected account and billing signals.`;
}

function buildChurnSummaryLine(riskAccountRows: RiskAccountRow[]) {
    if (riskAccountRows.length > 0) {
        return `Churn pressure increased this month, with the highest risk concentrated in accounts showing declining usage, weak engagement, or billing risk.`;
    }

    return `Churn signals are limited this month, but Cobrai is continuing to monitor account-level changes for early warning signs.`;
}

function getTopRiskReasons(riskAccountRows: RiskAccountRow[]) {
    const reasonMap = new Map<string, number>();

    for (const row of riskAccountRows) {
        const value = row.reason?.trim();
        if (!value) continue;
        reasonMap.set(value, (reasonMap.get(value) || 0) + 1);
    }

    return Array.from(reasonMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([reason]) => reason);
}

function getTotalAtRiskMinor(riskAccountRows: RiskAccountRow[]) {
    return riskAccountRows.reduce((sum, row) => sum + Number(row.mrrMinor || 0), 0);
}

function getTotalOpportunityMinor(expansionRows: ExpansionRow[]) {
    return expansionRows.reduce((sum, row) => sum + Number(row.upsideMinor || 0), 0);
}

function getTopGrowthSignals(mrrDriverRows: DriverRow[]) {
    const labelMap = new Map<string, number>();

    for (const row of mrrDriverRows) {
        if (Number(row.valueMinor || 0) <= 0) continue;
        const value = row.label?.trim();
        if (!value) continue;
        labelMap.set(value, (labelMap.get(value) || 0) + 1);
    }

    return Array.from(labelMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([label]) => label);
}

function cardStyle(): CSSProperties {
    return {
        border: "1px solid #eef2f7",
        borderRadius: 18,
        background: "#ffffff",
        padding: 16,
    };
}

function sectionTitleStyle(): CSSProperties {
    return {
        fontSize: 15,
        fontWeight: 800,
        color: "#0f172a",
        marginBottom: 6,
    };
}

function sectionSubStyle(): CSSProperties {
    return {
        fontSize: 12,
        color: "#64748b",
        marginBottom: 12,
        lineHeight: 1.45,
    };
}

function normalizeKey(value?: string | null) {
    return (value || "").trim().toLowerCase();
}

function isBadRouteValue(value?: string | null) {
    const v = (value || "").trim().toLowerCase();
    return !v || v === "undefined" || v === "/undefined" || v === "null" || v === "/null";
}

function isBadIdValue(value?: string | null) {
    const v = (value || "").trim().toLowerCase();
    return !v || v === "undefined" || v === "null";
}

function resolveRiskEmail(
    row: RiskAccountRow,
    driverRows: DriverRow[],
    expansionRows: ExpansionRow[]
) {
    if (row.email?.trim()) return row.email;

    const rowId = normalizeKey(row.id);
    const rowName = normalizeKey(row.name);

    const driverMatch = driverRows.find(
        (item) =>
            (item.email?.trim() || "") &&
            (normalizeKey(item.id) === rowId || normalizeKey(item.accountName) === rowName)
    );
    if (driverMatch?.email?.trim()) return driverMatch.email;

    const expansionMatch = expansionRows.find(
        (item) =>
            (item.email?.trim() || "") &&
            (normalizeKey(item.id) === rowId || normalizeKey(item.name) === rowName)
    );
    if (expansionMatch?.email?.trim()) return expansionMatch.email;

    return null;
}

function resolveExpansionEmail(row: ExpansionRow, driverRows: DriverRow[]) {
    if (row.email?.trim()) return row.email;

    const rowId = normalizeKey(row.id);
    const rowName = normalizeKey(row.name);

    const driverMatch = driverRows.find(
        (item) =>
            (item.email?.trim() || "") &&
            (normalizeKey(item.id) === rowId || normalizeKey(item.accountName) === rowName)
    );

    return driverMatch?.email?.trim() || null;
}

function resolveExpansionSignal(row: ExpansionRow, driverRows: DriverRow[]) {
    const rowId = normalizeKey(row.id);
    const rowName = normalizeKey(row.name);

    const driverMatch = driverRows.find(
        (item) => normalizeKey(item.id) === rowId || normalizeKey(item.accountName) === rowName
    );

    return driverMatch?.label?.trim() || "Expansion opportunity detected";
}

function resolveExpansionDate(
    row: ExpansionRow,
    driverRows: DriverRow[],
    monthKey?: string
) {
    const rowId = normalizeKey(row.id);
    const rowName = normalizeKey(row.name);

    const driverMatch = driverRows.find(
        (item) => normalizeKey(item.id) === rowId || normalizeKey(item.accountName) === rowName
    );

    return resolveDisplayDate(
        driverMatch?.lastEventAt,
        row.id || row.name || row.action,
        monthKey
    );
}

function buildDemoFallbackIso(seed: string, monthKey?: string) {
    const safeSeed = seed || "cobrai";
    let total = 0;
    for (let i = 0; i < safeSeed.length; i += 1) total += safeSeed.charCodeAt(i);

    const year = monthKey?.slice(0, 4) ? Number(monthKey.slice(0, 4)) : 2026;
    const monthFromKey = monthKey?.slice(5, 7) ? Number(monthKey.slice(5, 7)) : 4;
    const monthIndex = Number.isFinite(monthFromKey) && monthFromKey >= 1 ? monthFromKey - 1 : 3;

    const day = (total % 24) + 1;
    const hour = 9 + (total % 8);
    const minute = total % 60;

    return new Date(Date.UTC(year, monthIndex, day, hour, minute, 0)).toISOString();
}

function resolveDisplayDate(
    actualIso: string | null | undefined,
    seed: string,
    monthKey?: string
) {
    if (actualIso) return actualIso;
    return buildDemoFallbackIso(seed, monthKey);
}

function humanizeDriverLabel(label?: string | null) {
    const value = (label || "").trim();
    if (!value) return "";

    const lowered = value.toLowerCase();

    if (lowered.includes("new subscription")) return "new customers";
    if (lowered.includes("upgrade")) return "upgrades";
    if (lowered.includes("expansion")) return "expansion";
    if (lowered.includes("recovered failed payment")) return "recovered payments";
    if (lowered.includes("payment recovered")) return "recovered payments";
    if (lowered.includes("reactivation")) return "reactivations";
    if (lowered.includes("contraction")) return "contraction";
    if (lowered.includes("downgrade")) return "downgrades";
    if (lowered.includes("churn")) return "churn";

    return value.charAt(0).toLowerCase() + value.slice(1);
}

function joinDriverLabels(labels: string[]) {
    if (!labels.length) return "";
    if (labels.length === 1) return labels[0];
    if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
    return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

function buildForecastWhyLine(
    mrrDriverRows: DriverRow[],
    riskAccountRows: RiskAccountRow[]
) {
    const positiveLabels = Array.from(
        new Set(
            mrrDriverRows
                .filter((row) => row.valueMinor > 0)
                .sort((a, b) => Math.abs(b.valueMinor) - Math.abs(a.valueMinor))
                .slice(0, 3)
                .map((row) => humanizeDriverLabel(row.label))
                .filter(Boolean)
        )
    );

    const riskReasons = Array.from(
        new Set(
            riskAccountRows
                .map((row) => row.reason?.trim())
                .filter((reason): reason is string => Boolean(reason))
                .slice(0, 2)
        )
    );

    if (positiveLabels.length && riskReasons.length) {
        return `Projection is supported by ${joinDriverLabels(positiveLabels)}, with downside still concentrated in accounts showing ${joinDriverLabels(
            riskReasons.map((reason) => reason.toLowerCase())
        )}.`;
    }

    if (positiveLabels.length) {
        return `Projection is supported by ${joinDriverLabels(positiveLabels)}.`;
    }

    if (riskReasons.length) {
        return `Projection remains sensitive to accounts showing ${joinDriverLabels(
            riskReasons.map((reason) => reason.toLowerCase())
        )}.`;
    }

    return `Projection is based on the latest connected revenue, billing, and account-risk signals.`;
}

function inferRiskEmailKind(row: RiskAccountRow): EmailKind {
    const reason = (row.reason || "").toLowerCase();
    const action = (row.automation || "").toLowerCase();

    if (reason.includes("billing") || action.includes("billing")) return "billing";
    if (
        reason.includes("inactive") ||
        reason.includes("usage") ||
        reason.includes("engagement") ||
        action.includes("re-engagement") ||
        action.includes("reengagement")
    ) {
        return "inactive";
    }

    return "checkin";
}

function buildDrawerEmailTemplate(
    kind: EmailKind,
    accountName: string,
    contextLine?: string
) {
    const company = accountName || "there";
    const context = contextLine?.trim() || "recent account signals";

    if (kind === "billing") {
        return {
            subject: `Quick billing check-in — ${company}`,
            body:
                `Hi ${company} team,\n\n` +
                `We noticed a billing-related risk signal on your account (${context}).\n\n` +
                `Could you confirm the right billing contact and whether anything is blocking payment? Happy to help resolve this today.\n\n` +
                `Best,\nCobrai`,
        };
    }

    if (kind === "inactive") {
        return {
            subject: `Can we help you get value this week? — ${company}`,
            body:
                `Hi ${company} team,\n\n` +
                `We noticed usage has dropped recently (${context}).\n\n` +
                `Would you like a quick 10-minute walkthrough to get you back on track?\n\n` +
                `Best,\nCobrai`,
        };
    }

    if (kind === "expansion") {
        return {
            subject: `Opportunity to expand value — ${company}`,
            body:
                `Hi ${company} team,\n\n` +
                `We’ve spotted a positive growth signal on your account (${context}).\n\n` +
                `Would it be helpful to explore additional seats, an annual plan, or a broader rollout?\n\n` +
                `Best,\nCobrai`,
        };
    }

    return {
        subject: `Quick check-in — ${company}`,
        body:
            `Hi ${company} team,\n\n` +
            `Just checking in — we’re seeing ${context}.\n\n` +
            `If helpful, we can suggest the best next step for your team.\n\n` +
            `Best,\nCobrai`,
    };
}

const DRIVER_PAGE_SIZE = 3;
const RISK_PAGE_SIZE = 3;
const OPPORTUNITY_PAGE_SIZE = 3;

function blurLockStyle(): CSSProperties {
    return {
        position: "relative",
        overflow: "hidden",
    };
}

function blurredInnerStyle(): CSSProperties {
    return {
        filter: "blur(8px)",
        pointerEvents: "none",
        userSelect: "none",
    };
}

function overlayLockStyle(): CSSProperties {
    return {
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "rgba(255,255,255,0.72)",
        backdropFilter: "saturate(120%)",
        zIndex: 2,
    };
}

function lockCardStyle(): CSSProperties {
    return {
        width: "100%",
        maxWidth: 360,
        border: "1px solid rgba(15, 23, 42, 0.08)",
        borderRadius: 18,
        background: "#ffffff",
        boxShadow: "0 16px 40px rgba(15, 23, 42, 0.10)",
        padding: 18,
        textAlign: "center",
    };
}

export default function InsightDrawer({
    open,
    drawerView,
    onClose,
    onSwitchView,
    isDemoPreview,
    drawerInsights,
    riskAccountRows,
    expansionRows,
    mrrDriverRows,
    mrrForecast,
    churnForecast,
    aiMrr,
    aiChurn,
    aiInsightMetrics,
    insights,
    tier,
}: Props) {
    const router = useRouter();
    const isPro = tier === "pro" || tier === "scale";

    const [user, setUser] = useState<User | null>(null);
    const [driverPage, setDriverPage] = useState(0);
    const [riskPage, setRiskPage] = useState(0);
    const [opportunityPage, setOpportunityPage] = useState(0);

    const [emailModal, setEmailModal] = useState<EmailModalState>({
        open: false,
        kind: null,
        to: "",
        accountId: undefined,
        accountName: "",
    });
    const [sendingEmail, setSendingEmail] = useState(false);
    const [sendErr, setSendErr] = useState<string | null>(null);
    const [emailSubject, setEmailSubject] = useState("");
    const [emailBody, setEmailBody] = useState("");
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);

    useEffect(() => {
        const auth = getFirebaseAuth();
        const unsub = onAuthStateChanged(auth, (u) => setUser(u));
        return () => unsub();
    }, []);

    useEffect(() => {
        if (!open) return;

        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                if (emailModal.open) {
                    closeEmailModal();
                } else if (showUpgradeModal) {
                    setShowUpgradeModal(false);
                } else {
                    onClose();
                }
            }
        };

        document.addEventListener("keydown", onKey);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        return () => {
            document.removeEventListener("keydown", onKey);
            document.body.style.overflow = prevOverflow;
        };
    }, [open, onClose, emailModal.open, showUpgradeModal]);

    useEffect(() => {
        setDriverPage(0);
        setRiskPage(0);
        setOpportunityPage(0);
    }, [drawerView, open]);

    function safePush(path?: string | null) {
        if (isBadRouteValue(path)) return;
        onClose();
        router.push(path as string);
    }

    function closeEmailModal() {
        setEmailModal({
            open: false,
            kind: null,
            to: "",
            accountId: undefined,
            accountName: "",
        });
        setEmailSubject("");
        setEmailBody("");
        setSendErr(null);
        setSendingEmail(false);
    }

    function openUpgrade() {
        setShowUpgradeModal(true);
    }

    function openRiskEmailModal(row: RiskAccountRow, to: string) {
        const kind = inferRiskEmailKind(row);
        const template = buildDrawerEmailTemplate(kind, row.name, row.reason || row.automation);

        setEmailSubject(template.subject);
        setEmailBody(template.body);
        setSendErr(null);
        setEmailModal({
            open: true,
            kind,
            to,
            accountId: row.id,
            accountName: row.name,
        });
    }

    function openExpansionEmailModal(row: ExpansionRow, to: string, signal: string) {
        const template = buildDrawerEmailTemplate(
            "expansion",
            row.name,
            row.reason || signal || row.action
        );

        setEmailSubject(template.subject);
        setEmailBody(template.body);
        setSendErr(null);
        setEmailModal({
            open: true,
            kind: "expansion",
            to,
            accountId: row.id,
            accountName: row.name,
        });
    }

    async function authedFetch(url: string, init?: RequestInit) {
        const token = user ? await user.getIdToken() : null;
        return fetch(url, {
            cache: "no-store",
            ...(init || {}),
            headers: {
                ...(init?.headers || {}),
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
        });
    }

    async function sendEmail() {
        if (!emailModal.to) {
            setSendErr("No email on this account.");
            return;
        }

        setSendingEmail(true);
        setSendErr(null);

        try {
            const res = await authedFetch(`/api/automation/send-email`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    to: emailModal.to,
                    subject: emailSubject,
                    body: emailBody,
                    accountId: emailModal.accountId,
                }),
            });

            const json = await res.json();
            if (!res.ok || !json?.ok) {
                throw new Error(json?.error || "Failed to send");
            }

            closeEmailModal();
        } catch (e: any) {
            setSendErr(e?.message || "Couldn’t send email");
        } finally {
            setSendingEmail(false);
        }
    }

    const title = drawerView === "mrr" ? "MRR insights" : "Churn insights";
    const periodLabel = isDemoPreview
        ? "Demo preview — using sample signals until live billing and activity data are connected."
        : formatPeriod(drawerInsights.months);

    const mrrSummaryLine = buildMrrSummaryLine(mrrForecast, expansionRows, riskAccountRows);
    const churnSummaryLine = buildChurnSummaryLine(riskAccountRows);
    const topReasons = getTopRiskReasons(riskAccountRows);
    const topGrowthSignals = getTopGrowthSignals(mrrDriverRows);
    const totalAtRiskMinor = getTotalAtRiskMinor(riskAccountRows);
    const totalOpportunityMinor = getTotalOpportunityMinor(expansionRows);
    const mrrForecastWhyLine = buildForecastWhyLine(mrrDriverRows, riskAccountRows);

    const sortedRiskAccounts = [...riskAccountRows].sort(
        (a, b) => Number(b.mrrMinor || 0) - Number(a.mrrMinor || 0)
    );

    const sortedExpansionRows = [...expansionRows].sort(
        (a, b) => Number(b.upsideMinor || 0) - Number(a.upsideMinor || 0)
    );

    const positiveDriverRows = [...mrrDriverRows]
        .filter((row) => row.valueMinor > 0)
        .sort((a, b) => Math.abs(b.valueMinor) - Math.abs(a.valueMinor));

    const totalDriverPages = Math.max(1, Math.ceil(positiveDriverRows.length / DRIVER_PAGE_SIZE));
    const pagedDriverRows = positiveDriverRows.slice(
        driverPage * DRIVER_PAGE_SIZE,
        driverPage * DRIVER_PAGE_SIZE + DRIVER_PAGE_SIZE
    );

    const totalRiskPages = Math.max(1, Math.ceil(sortedRiskAccounts.length / RISK_PAGE_SIZE));
    const pagedRiskRows = sortedRiskAccounts.slice(
        riskPage * RISK_PAGE_SIZE,
        riskPage * RISK_PAGE_SIZE + RISK_PAGE_SIZE
    );

    const totalOpportunityPages = Math.max(
        1,
        Math.ceil(sortedExpansionRows.length / OPPORTUNITY_PAGE_SIZE)
    );
    const pagedOpportunityRows = sortedExpansionRows.slice(
        opportunityPage * OPPORTUNITY_PAGE_SIZE,
        opportunityPage * OPPORTUNITY_PAGE_SIZE + OPPORTUNITY_PAGE_SIZE
    );

    const openAccount = (id?: string) => {
        if (!isPro) {
            openUpgrade();
            return;
        }

        if (isBadIdValue(id)) {
            safePush("/dashboard/accounts-at-risk");
            return;
        }

        safePush(`/dashboard/customer/${id}`);
    };

    if (!open) return null;

    return (
        <>
            <div className={styles.slideoverOverlay} role="dialog" aria-modal="true">
                <div className={styles.slideoverBackdrop} onClick={onClose} />
                <div className={styles.slideoverPanel}>
                    <div className={styles.slideoverHeader}>
                        <div className={styles.slideoverTitle}>{title}</div>

                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                flexWrap: "wrap",
                                justifyContent: "flex-end",
                            }}
                        >
                            <button
                                type="button"
                                className={styles.linkBtn}
                                onClick={() => onSwitchView(drawerView === "mrr" ? "churn" : "mrr")}
                            >
                                {drawerView === "mrr" ? "Switch to churn insight" : "Switch to MRR insight"}
                            </button>

                            <button
                                type="button"
                                className={styles.linkBtn}
                                onClick={onClose}
                            >
                                Close ✕
                            </button>
                        </div>
                    </div>

                    <div className={styles.slideoverBody}>
                        {drawerView === "mrr" ? (
                            <>
                                <div style={{ ...cardStyle(), marginBottom: 14 }}>
                                    <div
                                        style={{
                                            fontSize: 12,
                                            fontWeight: 800,
                                            color: "#64748b",
                                            textTransform: "uppercase",
                                            letterSpacing: 0.3,
                                            marginBottom: 8,
                                        }}
                                    >
                                        MRR
                                    </div>

                                    <div style={{ fontSize: 13, color: "#64748b", marginBottom: 10 }}>
                                        {periodLabel}
                                    </div>

                                    <div
                                        style={{
                                            fontSize: 14,
                                            color: "#0f172a",
                                            lineHeight: 1.55,
                                            fontWeight: 600,
                                            marginBottom: 14,
                                        }}
                                    >
                                        {isDemoPreview
                                            ? "Previewing sample MRR signals until live data is connected."
                                            : mrrSummaryLine}
                                    </div>

                                    <div
                                        style={{
                                            display: "flex",
                                            alignItems: "end",
                                            justifyContent: "space-between",
                                            gap: 16,
                                            flexWrap: "wrap",
                                        }}
                                    >
                                        <div>
                                            <div
                                                style={{
                                                    display: "flex",
                                                    alignItems: "baseline",
                                                    gap: 10,
                                                    flexWrap: "wrap",
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        fontSize: 32,
                                                        fontWeight: 900,
                                                        color: "#0f172a",
                                                        lineHeight: 1,
                                                    }}
                                                >
                                                    {formatGBPFromMinor(drawerInsights.mrr.currentMinor)}
                                                </div>

                                                {typeof drawerInsights.mrr.deltaPct === "number" ? (
                                                    <div
                                                        style={{
                                                            fontSize: 14,
                                                            fontWeight: 800,
                                                            color:
                                                                drawerInsights.mrr.deltaPct >= 0
                                                                    ? "#16a34a"
                                                                    : "#dc2626",
                                                        }}
                                                    >
                                                        {formatDeltaPct(drawerInsights.mrr.deltaPct)}
                                                    </div>
                                                ) : null}
                                            </div>

                                            <div
                                                style={{
                                                    fontSize: 13,
                                                    color: "#64748b",
                                                    fontWeight: 600,
                                                    marginTop: 8,
                                                }}
                                            >
                                                {typeof drawerInsights.mrr.prevMinor === "number"
                                                    ? `vs ${formatGBPFromMinor(drawerInsights.mrr.prevMinor)} previous month`
                                                    : "vs previous month"}
                                            </div>
                                        </div>

                                        <div
                                            style={{
                                                minWidth: 120,
                                                textAlign: "right",
                                            }}
                                        >
                                            <div
                                                style={{
                                                    fontSize: 12,
                                                    color: "#64748b",
                                                    fontWeight: 700,
                                                    marginBottom: 4,
                                                }}
                                            >
                                                Confidence
                                            </div>
                                            <div
                                                style={{
                                                    fontSize: 22,
                                                    fontWeight: 900,
                                                    color: "#0f172a",
                                                    lineHeight: 1,
                                                }}
                                            >
                                                {mrrForecast
                                                    ? `${mrrForecast.confidencePct}%`
                                                    : `${aiInsightMetrics.confidenceScore}%`}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div
                                    style={{
                                        display: "grid",
                                        gridTemplateColumns: "0.95fr 1.05fr",
                                        gap: 14,
                                        marginBottom: 14,
                                        alignItems: "start",
                                    }}
                                >
                                    <div style={cardStyle()}>
                                        <div style={sectionTitleStyle()}>Key Drivers</div>
                                        <div style={sectionSubStyle()}>
                                            Positive MRR contributors this month only.
                                        </div>

                                        {pagedDriverRows.length ? (
                                            <div style={{ display: "grid", gap: 10 }}>
                                                {pagedDriverRows.map((row, idx) => {
                                                    const displayDate = resolveDisplayDate(
                                                        row.lastEventAt,
                                                        row.id || row.accountName || row.label,
                                                        drawerInsights.months.current
                                                    );

                                                    return (
                                                        <button
                                                            key={`${row.id || row.accountName || row.label}-${idx}`}
                                                            type="button"
                                                            onClick={() => openAccount(row.id)}
                                                            className={styles.drawerClickableCard}
                                                            style={{
                                                                border: "1px solid #eef2f7",
                                                                borderRadius: 14,
                                                                padding: 12,
                                                                background: "#fff",
                                                                cursor: "pointer",
                                                                textAlign: "left",
                                                                width: "100%",
                                                            }}
                                                        >
                                                            <div
                                                                style={{
                                                                    display: "flex",
                                                                    justifyContent: "space-between",
                                                                    gap: 12,
                                                                    alignItems: "start",
                                                                    marginBottom: 4,
                                                                }}
                                                            >
                                                                <div
                                                                    style={{
                                                                        fontSize: 14,
                                                                        fontWeight: 800,
                                                                        color: "#0f172a",
                                                                    }}
                                                                >
                                                                    {row.accountName || row.label}
                                                                </div>
                                                                <div
                                                                    style={{
                                                                        fontSize: 13,
                                                                        fontWeight: 900,
                                                                        color: "#16a34a",
                                                                        whiteSpace: "nowrap",
                                                                    }}
                                                                >
                                                                    +{formatCompactGBPFromMinor(Math.abs(row.valueMinor))}
                                                                </div>
                                                            </div>

                                                            <div
                                                                style={{
                                                                    fontSize: 12,
                                                                    color: "#64748b",
                                                                    marginBottom: 2,
                                                                }}
                                                            >
                                                                {row.email || "No email"}
                                                            </div>

                                                            <div
                                                                style={{
                                                                    fontSize: 11,
                                                                    color: "#94a3b8",
                                                                    marginBottom: 6,
                                                                }}
                                                            >
                                                                {niceWhen(displayDate)}
                                                            </div>

                                                            <div
                                                                style={{
                                                                    fontSize: 13,
                                                                    color: "#475569",
                                                                    lineHeight: 1.45,
                                                                }}
                                                            >
                                                                {row.label}
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div style={{ fontSize: 13, color: "#64748b" }}>
                                                No positive MRR drivers yet.
                                            </div>
                                        )}

                                        {positiveDriverRows.length > 0 ? (
                                            <div
                                                style={{
                                                    display: "flex",
                                                    justifyContent: "space-between",
                                                    alignItems: "center",
                                                    marginTop: 12,
                                                }}
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() => setDriverPage((p) => Math.max(0, p - 1))}
                                                    disabled={driverPage === 0}
                                                    style={{
                                                        border: "1px solid #e2e8f0",
                                                        background: driverPage === 0 ? "#f8fafc" : "#fff",
                                                        color: driverPage === 0 ? "#94a3b8" : "#0f172a",
                                                        borderRadius: 10,
                                                        padding: "8px 12px",
                                                        fontSize: 13,
                                                        fontWeight: 700,
                                                        cursor: driverPage === 0 ? "default" : "pointer",
                                                    }}
                                                >
                                                    Previous
                                                </button>

                                                <div
                                                    style={{
                                                        fontSize: 12,
                                                        fontWeight: 700,
                                                        color: "#64748b",
                                                    }}
                                                >
                                                    Page {driverPage + 1} of {totalDriverPages}
                                                </div>

                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setDriverPage((p) =>
                                                            Math.min(totalDriverPages - 1, p + 1)
                                                        )
                                                    }
                                                    disabled={driverPage >= totalDriverPages - 1}
                                                    style={{
                                                        border: "1px solid #e2e8f0",
                                                        background:
                                                            driverPage >= totalDriverPages - 1
                                                                ? "#f8fafc"
                                                                : "#fff",
                                                        color:
                                                            driverPage >= totalDriverPages - 1
                                                                ? "#94a3b8"
                                                                : "#0f172a",
                                                        borderRadius: 10,
                                                        padding: "8px 12px",
                                                        fontSize: 13,
                                                        fontWeight: 700,
                                                        cursor:
                                                            driverPage >= totalDriverPages - 1
                                                                ? "default"
                                                                : "pointer",
                                                    }}
                                                >
                                                    Next
                                                </button>
                                            </div>
                                        ) : null}
                                    </div>

                                    <div style={{ ...cardStyle(), ...(!isPro ? blurLockStyle() : {}) }}>
                                        <div style={!isPro ? blurredInnerStyle() : undefined}>
                                            <div style={sectionTitleStyle()}>Forecast (AI)</div>
                                            <div style={sectionSubStyle()}>
                                                Projected next month MRR based on current growth signals and risk concentration.
                                            </div>

                                            <div
                                                style={{
                                                    fontSize: 30,
                                                    fontWeight: 900,
                                                    color: "#0f172a",
                                                    lineHeight: 1.1,
                                                    marginBottom: 12,
                                                }}
                                            >
                                                {mrrForecast
                                                    ? formatProjectedGBP(mrrForecast.projectedNext)
                                                    : "—"}
                                            </div>

                                            <div
                                                style={{
                                                    display: "grid",
                                                    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                                                    gap: 10,
                                                    marginBottom: 12,
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        border: "1px solid #eef2f7",
                                                        borderRadius: 12,
                                                        padding: 12,
                                                        background: "#fff",
                                                    }}
                                                >
                                                    <div
                                                        style={{
                                                            fontSize: 11,
                                                            color: "#64748b",
                                                            fontWeight: 700,
                                                            marginBottom: 6,
                                                        }}
                                                    >
                                                        This month
                                                    </div>
                                                    <div
                                                        style={{
                                                            fontSize: 16,
                                                            fontWeight: 900,
                                                            color: "#0f172a",
                                                        }}
                                                    >
                                                        {formatGBPFromMinor(drawerInsights.mrr.currentMinor)}
                                                    </div>
                                                </div>

                                                <div
                                                    style={{
                                                        border: "1px solid #eef2f7",
                                                        borderRadius: 12,
                                                        padding: 12,
                                                        background: "#fff",
                                                    }}
                                                >
                                                    <div
                                                        style={{
                                                            fontSize: 11,
                                                            color: "#64748b",
                                                            fontWeight: 700,
                                                            marginBottom: 6,
                                                        }}
                                                    >
                                                        Previous month
                                                    </div>
                                                    <div
                                                        style={{
                                                            fontSize: 16,
                                                            fontWeight: 900,
                                                            color: "#0f172a",
                                                        }}
                                                    >
                                                        {typeof drawerInsights.mrr.prevMinor === "number"
                                                            ? formatGBPFromMinor(drawerInsights.mrr.prevMinor)
                                                            : "—"}
                                                    </div>
                                                </div>

                                                <div
                                                    style={{
                                                        border: "1px solid #eef2f7",
                                                        borderRadius: 12,
                                                        padding: 12,
                                                        background: "#fff",
                                                    }}
                                                >
                                                    <div
                                                        style={{
                                                            fontSize: 11,
                                                            color: "#64748b",
                                                            fontWeight: 700,
                                                            marginBottom: 6,
                                                        }}
                                                    >
                                                        Projected next
                                                    </div>
                                                    <div
                                                        style={{
                                                            fontSize: 16,
                                                            fontWeight: 900,
                                                            color: "#0f172a",
                                                        }}
                                                    >
                                                        {mrrForecast
                                                            ? formatProjectedGBP(mrrForecast.projectedNext)
                                                            : "—"}
                                                    </div>
                                                </div>

                                                <div
                                                    style={{
                                                        border: "1px solid #eef2f7",
                                                        borderRadius: 12,
                                                        padding: 12,
                                                        background: "#fff",
                                                    }}
                                                >
                                                    <div
                                                        style={{
                                                            fontSize: 11,
                                                            color: "#64748b",
                                                            fontWeight: 700,
                                                            marginBottom: 6,
                                                        }}
                                                    >
                                                        Confidence
                                                    </div>
                                                    <div
                                                        style={{
                                                            fontSize: 16,
                                                            fontWeight: 900,
                                                            color: "#0f172a",
                                                        }}
                                                    >
                                                        {mrrForecast
                                                            ? `${mrrForecast.confidencePct}%`
                                                            : `${aiInsightMetrics.confidenceScore}%`}
                                                    </div>
                                                </div>
                                            </div>

                                            <div
                                                style={{
                                                    fontSize: 13,
                                                    color: "#475569",
                                                    lineHeight: 1.55,
                                                    marginBottom: 12,
                                                    fontWeight: 600,
                                                }}
                                            >
                                                {isDemoPreview
                                                    ? "Projection is based on sample new customer, upgrade, and churn signals until live data is connected."
                                                    : mrrForecastWhyLine}
                                            </div>

                                            <div
                                                style={{
                                                    fontSize: 13,
                                                    color: "#475569",
                                                    lineHeight: 1.55,
                                                    marginBottom: 12,
                                                }}
                                            >
                                                {aiMrr.headline}
                                            </div>

                                            <div style={{ display: "grid", gap: 10 }}>
                                                {aiMrr.bullets?.slice(0, 3).map((bullet, idx) => (
                                                    <div
                                                        key={`${bullet}-${idx}`}
                                                        style={{
                                                            border: "1px solid #eef2f7",
                                                            borderRadius: 12,
                                                            padding: 12,
                                                            fontSize: 13,
                                                            color: "#475569",
                                                            lineHeight: 1.45,
                                                            fontWeight: 600,
                                                        }}
                                                    >
                                                        {bullet}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {!isPro ? (
                                            <div style={overlayLockStyle()}>
                                                <div style={lockCardStyle()}>
                                                    <div
                                                        style={{
                                                            fontSize: 11,
                                                            fontWeight: 800,
                                                            color: "#64748b",
                                                            textTransform: "uppercase",
                                                            letterSpacing: 0.4,
                                                            marginBottom: 8,
                                                        }}
                                                    >
                                                        Pro feature
                                                    </div>
                                                    <div
                                                        style={{
                                                            fontSize: 18,
                                                            fontWeight: 900,
                                                            color: "#0f172a",
                                                            marginBottom: 8,
                                                        }}
                                                    >
                                                        Unlock AI forecasts
                                                    </div>
                                                    <div
                                                        style={{
                                                            fontSize: 13,
                                                            color: "#64748b",
                                                            lineHeight: 1.55,
                                                            marginBottom: 14,
                                                        }}
                                                    >
                                                        Upgrade to Pro for unlimited AI insights, forecasts, and account-level prioritisation.
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setShowUpgradeModal(false);
                                                            onClose();
                                                            router.push("/dashboard/settings?tab=manage-plan");
                                                        }}
                                                        style={{
                                                            border: "none",
                                                            background: "#0f172a",
                                                            color: "#ffffff",
                                                            borderRadius: 999,
                                                            padding: "11px 18px",
                                                            fontSize: 14,
                                                            fontWeight: 600,
                                                            cursor: "pointer",
                                                        }}
                                                    >
                                                        Upgrade to Pro
                                                    </button>
                                                </div>
                                            </div>
                                        ) : null}
                                    </div>
                                </div>

                                <div style={{ ...cardStyle(), ...(!isPro ? blurLockStyle() : {}) }}>
                                    <div style={sectionTitleStyle()}>MRR Opportunities</div>
                                    <div style={sectionSubStyle()}>
                                        Accounts most likely to expand revenue this month. Open the account or send an email directly.
                                    </div>

                                    <div
                                        style={{
                                            display: "flex",
                                            justifyContent: "space-between",
                                            gap: 12,
                                            alignItems: "center",
                                            marginBottom: 12,
                                            flexWrap: "wrap",
                                        }}
                                    >
                                        <div
                                            style={{
                                                fontSize: 14,
                                                color: "#0f172a",
                                                fontWeight: 700,
                                            }}
                                        >
                                            {formatGBPFromMinor(totalOpportunityMinor)} potential upside across{" "}
                                            {sortedExpansionRows.length} account
                                            {sortedExpansionRows.length === 1 ? "" : "s"}
                                        </div>
                                    </div>

                                    {!isPro ? (
                                        <>
                                            <div style={{ display: "grid", gap: 12 }}>
                                                {pagedOpportunityRows.length ? (
                                                    pagedOpportunityRows.map((row) => (
                                                        <div
                                                            key={row.id}
                                                            style={{
                                                                border: "1px solid #eef2f7",
                                                                borderRadius: 14,
                                                                padding: 14,
                                                                background: "#fff",
                                                                display: "flex",
                                                                justifyContent: "space-between",
                                                                gap: 12,
                                                                alignItems: "center",
                                                            }}
                                                        >
                                                            <div style={{ minWidth: 0 }}>
                                                                <div
                                                                    style={{
                                                                        fontSize: 14,
                                                                        fontWeight: 800,
                                                                        color: "#0f172a",
                                                                        marginBottom: 4,
                                                                    }}
                                                                >
                                                                    {row.name}
                                                                </div>
                                                                <div
                                                                    style={{
                                                                        fontSize: 12,
                                                                        color: "#64748b",
                                                                    }}
                                                                >
                                                                    Upgrade to see full opportunity details
                                                                </div>
                                                            </div>

                                                            <div
                                                                style={{
                                                                    fontSize: 13,
                                                                    fontWeight: 900,
                                                                    color: "#16a34a",
                                                                    whiteSpace: "nowrap",
                                                                }}
                                                            >
                                                                {row.upsideMinor
                                                                    ? `+${formatGBPFromMinor(row.upsideMinor)}`
                                                                    : "—"}
                                                            </div>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <div style={{ fontSize: 13, color: "#64748b" }}>
                                                        No strong MRR opportunities found yet.
                                                    </div>
                                                )}
                                            </div>

                                            <div style={overlayLockStyle()}>
                                                <div style={lockCardStyle()}>
                                                    <div
                                                        style={{
                                                            fontSize: 11,
                                                            fontWeight: 800,
                                                            color: "#64748b",
                                                            textTransform: "uppercase",
                                                            letterSpacing: 0.4,
                                                            marginBottom: 8,
                                                        }}
                                                    >
                                                        Pro feature
                                                    </div>
                                                    <div
                                                        style={{
                                                            fontSize: 18,
                                                            fontWeight: 900,
                                                            color: "#0f172a",
                                                            marginBottom: 8,
                                                        }}
                                                    >
                                                        Unlock full MRR opportunities
                                                    </div>
                                                    <div
                                                        style={{
                                                            fontSize: 13,
                                                            color: "#64748b",
                                                            lineHeight: 1.55,
                                                            marginBottom: 14,
                                                        }}
                                                    >
                                                        See account names, growth signals, action suggestions, and send expansion emails with Pro.
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setShowUpgradeModal(false);
                                                            onClose();
                                                            router.push("/dashboard/settings?tab=manage-plan");
                                                        }}
                                                        style={{
                                                            border: "none",
                                                            background: "#0f172a",
                                                            color: "#ffffff",
                                                            borderRadius: 999,
                                                            padding: "11px 18px",
                                                            fontSize: 14,
                                                            fontWeight: 600,
                                                            cursor: "pointer",
                                                        }}
                                                    >
                                                        Upgrade to Pro
                                                    </button>
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            {topGrowthSignals.length ? (
                                                <div
                                                    style={{
                                                        display: "flex",
                                                        gap: 8,
                                                        flexWrap: "wrap",
                                                        marginBottom: 12,
                                                    }}
                                                >
                                                    {topGrowthSignals.map((signal) => (
                                                        <div
                                                            key={signal}
                                                            style={{
                                                                fontSize: 12,
                                                                fontWeight: 700,
                                                                color: "#475569",
                                                                background: "#f8fafc",
                                                                border: "1px solid #e2e8f0",
                                                                borderRadius: 999,
                                                                padding: "6px 10px",
                                                            }}
                                                        >
                                                            {signal}
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : null}

                                            {pagedOpportunityRows.length ? (
                                                <>
                                                    <div
                                                        style={{
                                                            border: "1px solid #eef2f7",
                                                            borderRadius: 14,
                                                            overflow: "hidden",
                                                            background: "#fff",
                                                        }}
                                                    >
                                                        <div
                                                            style={{
                                                                display: "grid",
                                                                gridTemplateColumns: "1.15fr 0.7fr 1.45fr 1fr",
                                                                padding: "10px 12px",
                                                                background: "#f8fafc",
                                                                borderBottom: "1px solid #eef2f7",
                                                                fontSize: 12,
                                                                fontWeight: 800,
                                                                color: "#64748b",
                                                                gap: 12,
                                                            }}
                                                        >
                                                            <div>Account</div>
                                                            <div>Potential upside</div>
                                                            <div>Growth signal</div>
                                                            <div>Action suggestion</div>
                                                        </div>

                                                        {pagedOpportunityRows.map((row, index) => {
                                                            const resolvedEmail = resolveExpansionEmail(
                                                                row,
                                                                mrrDriverRows
                                                            );
                                                            const signal = resolveExpansionSignal(
                                                                row,
                                                                mrrDriverRows
                                                            );
                                                            const displayDate = resolveExpansionDate(
                                                                row,
                                                                mrrDriverRows,
                                                                drawerInsights.months.current
                                                            );

                                                            return (
                                                                <div
                                                                    key={row.id}
                                                                    style={{
                                                                        display: "grid",
                                                                        gridTemplateColumns:
                                                                            "1.15fr 0.7fr 1.45fr 1fr",
                                                                        padding: "12px",
                                                                        gap: 12,
                                                                        alignItems: "center",
                                                                        borderBottom:
                                                                            index === pagedOpportunityRows.length - 1
                                                                                ? "none"
                                                                                : "1px solid #f1f5f9",
                                                                    }}
                                                                >
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => openAccount(row.id)}
                                                                        className={styles.drawerClickableCard}
                                                                        style={{
                                                                            border: "none",
                                                                            background: "transparent",
                                                                            padding: 0,
                                                                            textAlign: "left",
                                                                            cursor: "pointer",
                                                                            width: "100%",
                                                                        }}
                                                                    >
                                                                        <div
                                                                            style={{
                                                                                fontSize: 14,
                                                                                fontWeight: 800,
                                                                                color: "#0f172a",
                                                                            }}
                                                                        >
                                                                            {row.name}
                                                                        </div>
                                                                        <div
                                                                            style={{
                                                                                fontSize: 12,
                                                                                color: "#64748b",
                                                                                marginTop: 3,
                                                                            }}
                                                                        >
                                                                            {resolvedEmail || "No email"}
                                                                        </div>
                                                                        <div
                                                                            style={{
                                                                                fontSize: 11,
                                                                                color: "#94a3b8",
                                                                                marginTop: 2,
                                                                            }}
                                                                        >
                                                                            {niceWhen(displayDate)}
                                                                        </div>
                                                                    </button>

                                                                    <div
                                                                        style={{
                                                                            fontSize: 13,
                                                                            fontWeight: 900,
                                                                            color: "#16a34a",
                                                                            whiteSpace: "nowrap",
                                                                        }}
                                                                    >
                                                                        {row.upsideMinor
                                                                            ? `+${formatGBPFromMinor(
                                                                                row.upsideMinor
                                                                            )}`
                                                                            : "—"}
                                                                    </div>

                                                                    <div
                                                                        style={{
                                                                            fontSize: 13,
                                                                            color: "#475569",
                                                                            lineHeight: 1.45,
                                                                        }}
                                                                    >
                                                                        {signal}
                                                                    </div>

                                                                    <div>
                                                                        <div
                                                                            style={{
                                                                                fontSize: 12,
                                                                                color: "#64748b",
                                                                                lineHeight: 1.4,
                                                                                marginBottom: 8,
                                                                                fontWeight: 600,
                                                                            }}
                                                                        >
                                                                            {row.action ||
                                                                                "Send an expansion email"}
                                                                        </div>

                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                if (!resolvedEmail) return;
                                                                                openExpansionEmailModal(
                                                                                    row,
                                                                                    resolvedEmail,
                                                                                    signal
                                                                                );
                                                                            }}
                                                                            disabled={!resolvedEmail}
                                                                            style={{
                                                                                border: "1px solid #e2e8f0",
                                                                                background: resolvedEmail ? "#ffffff" : "#f8fafc",
                                                                                color: resolvedEmail ? "#0f172a" : "#94a3b8",
                                                                                borderRadius: 10,
                                                                                padding: "7px 12px",
                                                                                fontSize: 12,
                                                                                fontWeight: 700,
                                                                                cursor: resolvedEmail ? "pointer" : "default",
                                                                            }}
                                                                        >
                                                                            Send email
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>

                                                    {sortedExpansionRows.length > 0 ? (
                                                        <div
                                                            style={{
                                                                display: "flex",
                                                                justifyContent: "space-between",
                                                                alignItems: "center",
                                                                marginTop: 12,
                                                            }}
                                                        >
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    setOpportunityPage((p) =>
                                                                        Math.max(0, p - 1)
                                                                    )
                                                                }
                                                                disabled={opportunityPage === 0}
                                                                style={{
                                                                    border: "1px solid #e2e8f0",
                                                                    background:
                                                                        opportunityPage === 0
                                                                            ? "#f8fafc"
                                                                            : "#fff",
                                                                    color:
                                                                        opportunityPage === 0
                                                                            ? "#94a3b8"
                                                                            : "#0f172a",
                                                                    borderRadius: 10,
                                                                    padding: "8px 12px",
                                                                    fontSize: 13,
                                                                    fontWeight: 700,
                                                                    cursor:
                                                                        opportunityPage === 0
                                                                            ? "default"
                                                                            : "pointer",
                                                                }}
                                                            >
                                                                Previous
                                                            </button>

                                                            <div
                                                                style={{
                                                                    fontSize: 12,
                                                                    fontWeight: 700,
                                                                    color: "#64748b",
                                                                }}
                                                            >
                                                                Page {opportunityPage + 1} of{" "}
                                                                {totalOpportunityPages}
                                                            </div>

                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    setOpportunityPage((p) =>
                                                                        Math.min(
                                                                            totalOpportunityPages - 1,
                                                                            p + 1
                                                                        )
                                                                    )
                                                                }
                                                                disabled={
                                                                    opportunityPage >=
                                                                    totalOpportunityPages - 1
                                                                }
                                                                style={{
                                                                    border: "1px solid #e2e8f0",
                                                                    background:
                                                                        opportunityPage >=
                                                                            totalOpportunityPages - 1
                                                                            ? "#f8fafc"
                                                                            : "#fff",
                                                                    color:
                                                                        opportunityPage >=
                                                                            totalOpportunityPages - 1
                                                                            ? "#94a3b8"
                                                                            : "#0f172a",
                                                                    borderRadius: 10,
                                                                    padding: "8px 12px",
                                                                    fontSize: 13,
                                                                    fontWeight: 700,
                                                                    cursor:
                                                                        opportunityPage >=
                                                                            totalOpportunityPages - 1
                                                                            ? "default"
                                                                            : "pointer",
                                                                }}
                                                            >
                                                                Next
                                                            </button>
                                                        </div>
                                                    ) : null}
                                                </>
                                            ) : (
                                                <div style={{ fontSize: 13, color: "#64748b" }}>
                                                    No strong MRR opportunities found yet.
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            </>
                        ) : (
                            <>
                                <div style={{ ...cardStyle(), marginBottom: 14 }}>
                                    <div
                                        style={{
                                            fontSize: 12,
                                            fontWeight: 800,
                                            color: "#64748b",
                                            textTransform: "uppercase",
                                            letterSpacing: 0.3,
                                            marginBottom: 8,
                                        }}
                                    >
                                        Churn
                                    </div>

                                    <div style={{ fontSize: 13, color: "#64748b", marginBottom: 10 }}>
                                        {periodLabel}
                                    </div>

                                    <div
                                        style={{
                                            fontSize: 14,
                                            color: "#0f172a",
                                            lineHeight: 1.55,
                                            fontWeight: 600,
                                            marginBottom: 14,
                                        }}
                                    >
                                        {isDemoPreview
                                            ? "Previewing sample churn signals until live data is connected."
                                            : churnSummaryLine}
                                    </div>

                                    <div
                                        style={{
                                            display: "flex",
                                            alignItems: "end",
                                            justifyContent: "space-between",
                                            gap: 16,
                                            flexWrap: "wrap",
                                        }}
                                    >
                                        <div>
                                            <div
                                                style={{
                                                    display: "flex",
                                                    alignItems: "baseline",
                                                    gap: 10,
                                                    flexWrap: "wrap",
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        fontSize: 32,
                                                        fontWeight: 900,
                                                        color: "#0f172a",
                                                        lineHeight: 1,
                                                    }}
                                                >
                                                    {typeof drawerInsights.churn.currentPct === "number"
                                                        ? `${drawerInsights.churn.currentPct.toFixed(1)}%`
                                                        : "—"}
                                                </div>

                                                {typeof drawerInsights.churn.deltaPp === "number" ? (
                                                    <div
                                                        style={{
                                                            fontSize: 14,
                                                            fontWeight: 800,
                                                            color:
                                                                drawerInsights.churn.deltaPp <= 0
                                                                    ? "#16a34a"
                                                                    : "#dc2626",
                                                        }}
                                                    >
                                                        {formatDeltaPp(drawerInsights.churn.deltaPp)}
                                                    </div>
                                                ) : null}
                                            </div>

                                            <div
                                                style={{
                                                    fontSize: 13,
                                                    color: "#64748b",
                                                    fontWeight: 600,
                                                    marginTop: 8,
                                                }}
                                            >
                                                vs previous month
                                            </div>
                                        </div>

                                        <div
                                            style={{
                                                minWidth: 120,
                                                textAlign: "right",
                                            }}
                                        >
                                            <div
                                                style={{
                                                    fontSize: 12,
                                                    color: "#64748b",
                                                    fontWeight: 700,
                                                    marginBottom: 4,
                                                }}
                                            >
                                                Confidence
                                            </div>
                                            <div
                                                style={{
                                                    fontSize: 22,
                                                    fontWeight: 900,
                                                    color: "#0f172a",
                                                    lineHeight: 1,
                                                }}
                                            >
                                                {churnForecast
                                                    ? `${churnForecast.confidencePct}%`
                                                    : `${aiInsightMetrics.confidenceScore}%`}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div
                                    style={{
                                        display: "grid",
                                        gridTemplateColumns: "1fr",
                                        gap: 14,
                                        marginBottom: 14,
                                    }}
                                >
                                    <div style={{ ...cardStyle(), ...(!isPro ? blurLockStyle() : {}) }}>
                                        <div style={!isPro ? blurredInnerStyle() : undefined}>
                                            <div style={sectionTitleStyle()}>Forecast (AI)</div>
                                            <div style={sectionSubStyle()}>
                                                Projected next month churn based on recent movement and account-level risk signals.
                                            </div>

                                            <div
                                                style={{
                                                    fontSize: 30,
                                                    fontWeight: 900,
                                                    color: "#0f172a",
                                                    lineHeight: 1.1,
                                                    marginBottom: 10,
                                                }}
                                            >
                                                {churnForecast
                                                    ? `${churnForecast.projectedNext.toFixed(1)}%`
                                                    : "—"}
                                            </div>

                                            <div
                                                style={{
                                                    fontSize: 13,
                                                    color: "#475569",
                                                    lineHeight: 1.55,
                                                    marginBottom: 12,
                                                }}
                                            >
                                                {aiChurn.headline}
                                            </div>

                                            <div style={{ display: "grid", gap: 10 }}>
                                                {aiChurn.bullets?.slice(0, 3).map((bullet, idx) => (
                                                    <div
                                                        key={`${bullet}-${idx}`}
                                                        style={{
                                                            border: "1px solid #eef2f7",
                                                            borderRadius: 12,
                                                            padding: 12,
                                                            fontSize: 13,
                                                            color: "#475569",
                                                            lineHeight: 1.45,
                                                            fontWeight: 600,
                                                        }}
                                                    >
                                                        {bullet}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {!isPro ? (
                                            <div style={overlayLockStyle()}>
                                                <div style={lockCardStyle()}>
                                                    <div
                                                        style={{
                                                            fontSize: 11,
                                                            fontWeight: 800,
                                                            color: "#64748b",
                                                            textTransform: "uppercase",
                                                            letterSpacing: 0.4,
                                                            marginBottom: 8,
                                                        }}
                                                    >
                                                        Pro feature
                                                    </div>
                                                    <div
                                                        style={{
                                                            fontSize: 18,
                                                            fontWeight: 900,
                                                            color: "#0f172a",
                                                            marginBottom: 8,
                                                        }}
                                                    >
                                                        Unlock churn forecasts
                                                    </div>
                                                    <div
                                                        style={{
                                                            fontSize: 13,
                                                            color: "#64748b",
                                                            lineHeight: 1.55,
                                                            marginBottom: 14,
                                                        }}
                                                    >
                                                        Upgrade to Pro for unlimited AI insights, forecasts, and account-level prioritisation.
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setShowUpgradeModal(false);
                                                            onClose();
                                                            router.push("/dashboard/settings?tab=manage-plan");
                                                        }}
                                                        style={{
                                                            border: "none",
                                                            background: "#0f172a",
                                                            color: "#ffffff",
                                                            borderRadius: 999,
                                                            padding: "11px 18px",
                                                            fontSize: 14,
                                                            fontWeight: 600,
                                                            cursor: "pointer",
                                                        }}
                                                    >
                                                        Upgrade to Pro
                                                    </button>
                                                </div>
                                            </div>
                                        ) : null}
                                    </div>

                                    <div style={{ ...cardStyle(), ...(!isPro ? blurLockStyle() : {}) }}>
                                        <div style={sectionTitleStyle()}>Key Accounts at Risk</div>
                                        <div style={sectionSubStyle()}>
                                            Highest-MRR accounts currently most at risk of churn. Open the account or send an email directly.
                                        </div>

                                        <div
                                            style={{
                                                display: "flex",
                                                justifyContent: "space-between",
                                                gap: 12,
                                                alignItems: "center",
                                                marginBottom: 12,
                                                flexWrap: "wrap",
                                            }}
                                        >
                                            <div
                                                style={{
                                                    fontSize: 14,
                                                    color: "#0f172a",
                                                    fontWeight: 700,
                                                }}
                                            >
                                                {formatGBPFromMinor(totalAtRiskMinor)} across{" "}
                                                {sortedRiskAccounts.length} account
                                                {sortedRiskAccounts.length === 1 ? "" : "s"}
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (!isPro) {
                                                        openUpgrade();
                                                        return;
                                                    }
                                                    openAccount();
                                                }}
                                                style={{
                                                    border: "none",
                                                    background: "transparent",
                                                    padding: 0,
                                                    cursor: "pointer",
                                                    fontSize: 13,
                                                    fontWeight: 800,
                                                    color: "#1665c7ff",
                                                }}
                                            >
                                                Full at Risk Accounts
                                            </button>
                                        </div>

                                        {!isPro ? (
                                            <>
                                                <div style={{ display: "grid", gap: 12 }}>
                                                    {pagedRiskRows.length ? (
                                                        pagedRiskRows.map((row) => (
                                                            <div
                                                                key={row.id}
                                                                style={{
                                                                    border: "1px solid #eef2f7",
                                                                    borderRadius: 14,
                                                                    padding: 14,
                                                                    background: "#fff",
                                                                    display: "flex",
                                                                    justifyContent: "space-between",
                                                                    gap: 12,
                                                                    alignItems: "center",
                                                                }}
                                                            >
                                                                <div style={{ minWidth: 0 }}>
                                                                    <div
                                                                        style={{
                                                                            fontSize: 14,
                                                                            fontWeight: 800,
                                                                            color: "#0f172a",
                                                                            marginBottom: 4,
                                                                        }}
                                                                    >
                                                                        Account hidden
                                                                    </div>
                                                                    <div
                                                                        style={{
                                                                            fontSize: 12,
                                                                            color: "#64748b",
                                                                        }}
                                                                    >
                                                                        Upgrade to see account names, reasons, and actions
                                                                    </div>
                                                                </div>

                                                                <div
                                                                    style={{
                                                                        fontSize: 13,
                                                                        fontWeight: 900,
                                                                        color: "#dc2626",
                                                                        whiteSpace: "nowrap",
                                                                    }}
                                                                >
                                                                    {row.mrrMinor
                                                                        ? formatGBPFromMinor(row.mrrMinor)
                                                                        : "—"}
                                                                </div>
                                                            </div>
                                                        ))
                                                    ) : (
                                                        <div style={{ fontSize: 13, color: "#64748b" }}>
                                                            No at-risk accounts found.
                                                        </div>
                                                    )}
                                                </div>

                                                <div style={overlayLockStyle()}>
                                                    <div style={lockCardStyle()}>
                                                        <div
                                                            style={{
                                                                fontSize: 11,
                                                                fontWeight: 800,
                                                                color: "#64748b",
                                                                textTransform: "uppercase",
                                                                letterSpacing: 0.4,
                                                                marginBottom: 8,
                                                            }}
                                                        >
                                                            Pro feature
                                                        </div>
                                                        <div
                                                            style={{
                                                                fontSize: 18,
                                                                fontWeight: 900,
                                                                color: "#0f172a",
                                                                marginBottom: 8,
                                                            }}
                                                        >
                                                            Unlock key accounts at risk
                                                        </div>
                                                        <div
                                                            style={{
                                                                fontSize: 13,
                                                                color: "#64748b",
                                                                lineHeight: 1.55,
                                                                marginBottom: 14,
                                                            }}
                                                        >
                                                            See which accounts are driving churn risk, why they are at risk, and the best next action with Pro.
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setShowUpgradeModal(false);
                                                                onClose();
                                                                router.push("/dashboard/settings?tab=manage-plan");
                                                            }}
                                                            style={{
                                                                border: "none",
                                                                background: "#0f172a",
                                                                color: "#ffffff",
                                                                borderRadius: 999,
                                                                padding: "11px 18px",
                                                                fontSize: 14,
                                                                fontWeight: 600,
                                                                cursor: "pointer",
                                                            }}
                                                        >
                                                            Upgrade to Pro
                                                        </button>
                                                    </div>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                {topReasons.length ? (
                                                    <div
                                                        style={{
                                                            display: "flex",
                                                            gap: 8,
                                                            flexWrap: "wrap",
                                                            marginBottom: 12,
                                                        }}
                                                    >
                                                        {topReasons.map((reason) => (
                                                            <div
                                                                key={reason}
                                                                style={{
                                                                    fontSize: 12,
                                                                    fontWeight: 700,
                                                                    color: "#475569",
                                                                    background: "#f8fafc",
                                                                    border: "1px solid #e2e8f0",
                                                                    borderRadius: 999,
                                                                    padding: "6px 10px",
                                                                }}
                                                            >
                                                                {reason}
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : null}

                                                {pagedRiskRows.length ? (
                                                    <>
                                                        <div
                                                            style={{
                                                                border: "1px solid #eef2f7",
                                                                borderRadius: 14,
                                                                overflow: "hidden",
                                                                background: "#fff",
                                                            }}
                                                        >
                                                            <div
                                                                style={{
                                                                    display: "grid",
                                                                    gridTemplateColumns:
                                                                        "1.15fr 0.7fr 1.45fr 1fr",
                                                                    padding: "10px 12px",
                                                                    background: "#f8fafc",
                                                                    borderBottom: "1px solid #eef2f7",
                                                                    fontSize: 12,
                                                                    fontWeight: 800,
                                                                    color: "#64748b",
                                                                    gap: 12,
                                                                }}
                                                            >
                                                                <div>Account</div>
                                                                <div>MRR at risk</div>
                                                                <div>Reason</div>
                                                                <div>Action suggestion</div>
                                                            </div>

                                                            {pagedRiskRows.map((row, index) => {
                                                                const resolvedEmail = resolveRiskEmail(
                                                                    row,
                                                                    mrrDriverRows,
                                                                    expansionRows
                                                                );
                                                                const displayDate = resolveDisplayDate(
                                                                    row.lastEventAt,
                                                                    row.id || row.name || row.reason,
                                                                    drawerInsights.months.current
                                                                );

                                                                return (
                                                                    <div
                                                                        key={row.id}
                                                                        style={{
                                                                            display: "grid",
                                                                            gridTemplateColumns:
                                                                                "1.15fr 0.7fr 1.45fr 1fr",
                                                                            padding: "12px",
                                                                            gap: 12,
                                                                            alignItems: "center",
                                                                            borderBottom:
                                                                                index === pagedRiskRows.length - 1
                                                                                    ? "none"
                                                                                    : "1px solid #f1f5f9",
                                                                        }}
                                                                    >
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => openAccount(row.id)}
                                                                            className={styles.drawerClickableCard}
                                                                            style={{
                                                                                border: "none",
                                                                                background: "transparent",
                                                                                padding: 0,
                                                                                textAlign: "left",
                                                                                cursor: "pointer",
                                                                                width: "100%",
                                                                            }}
                                                                        >
                                                                            <div
                                                                                style={{
                                                                                    fontSize: 14,
                                                                                    fontWeight: 800,
                                                                                    color: "#0f172a",
                                                                                }}
                                                                            >
                                                                                {row.name}
                                                                            </div>
                                                                            <div
                                                                                style={{
                                                                                    fontSize: 12,
                                                                                    color: "#64748b",
                                                                                    marginTop: 3,
                                                                                }}
                                                                            >
                                                                                {resolvedEmail || "No email"}
                                                                            </div>
                                                                            <div
                                                                                style={{
                                                                                    fontSize: 11,
                                                                                    color: "#94a3b8",
                                                                                    marginTop: 2,
                                                                                }}
                                                                            >
                                                                                {niceWhen(displayDate)}
                                                                            </div>
                                                                        </button>

                                                                        <div
                                                                            style={{
                                                                                fontSize: 13,
                                                                                fontWeight: 900,
                                                                                color: "#dc2626",
                                                                                whiteSpace: "nowrap",
                                                                            }}
                                                                        >
                                                                            {row.mrrMinor
                                                                                ? formatGBPFromMinor(row.mrrMinor)
                                                                                : "—"}
                                                                        </div>

                                                                        <div
                                                                            style={{
                                                                                fontSize: 13,
                                                                                color: "#475569",
                                                                                lineHeight: 1.45,
                                                                            }}
                                                                        >
                                                                            {row.reason}
                                                                        </div>

                                                                        <div>
                                                                            <div
                                                                                style={{
                                                                                    display: "inline-flex",
                                                                                    alignItems: "center",
                                                                                    fontSize: 11,
                                                                                    fontWeight: 700,
                                                                                    padding: "4px 8px",
                                                                                    borderRadius: 999,
                                                                                    background:
                                                                                        row.confidence === "High"
                                                                                            ? "#dcfce7"
                                                                                            : row.confidence === "Medium"
                                                                                                ? "#fef3c7"
                                                                                                : "#f1f5f9",
                                                                                    color:
                                                                                        row.confidence === "High"
                                                                                            ? "#166534"
                                                                                            : row.confidence === "Medium"
                                                                                                ? "#92400e"
                                                                                                : "#475569",
                                                                                    marginBottom: 8,
                                                                                }}
                                                                            >
                                                                                {row.confidence || "Low"} confidence
                                                                            </div>

                                                                            <div
                                                                                style={{
                                                                                    fontSize: 12,
                                                                                    color: "#64748b",
                                                                                    lineHeight: 1.4,
                                                                                    marginBottom: 8,
                                                                                    fontWeight: 600,
                                                                                }}
                                                                            >
                                                                                {row.automation ||
                                                                                    "Send a retention email"}
                                                                            </div>

                                                                            <button
                                                                                type="button"
                                                                                onClick={() => {
                                                                                    if (!resolvedEmail) return;
                                                                                    openRiskEmailModal(
                                                                                        row,
                                                                                        resolvedEmail
                                                                                    );
                                                                                }}
                                                                                disabled={!resolvedEmail}
                                                                                style={{
                                                                                    border: "1px solid #e2e8f0",
                                                                                    background: resolvedEmail ? "#ffffff" : "#f8fafc",
                                                                                    color: resolvedEmail ? "#0f172a" : "#94a3b8",
                                                                                    borderRadius: 10,
                                                                                    padding: "7px 12px",
                                                                                    fontSize: 12,
                                                                                    fontWeight: 700,
                                                                                    cursor: resolvedEmail ? "pointer" : "default",
                                                                                }}
                                                                            >
                                                                                Send email
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>

                                                        {sortedRiskAccounts.length > 0 ? (
                                                            <div
                                                                style={{
                                                                    display: "flex",
                                                                    justifyContent: "space-between",
                                                                    alignItems: "center",
                                                                    marginTop: 12,
                                                                }}
                                                            >
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        setRiskPage((p) => Math.max(0, p - 1))
                                                                    }
                                                                    disabled={riskPage === 0}
                                                                    style={{
                                                                        border: "1px solid #e2e8f0",
                                                                        background:
                                                                            riskPage === 0
                                                                                ? "#f8fafc"
                                                                                : "#fff",
                                                                        color:
                                                                            riskPage === 0
                                                                                ? "#94a3b8"
                                                                                : "#0f172a",
                                                                        borderRadius: 10,
                                                                        padding: "8px 12px",
                                                                        fontSize: 13,
                                                                        fontWeight: 700,
                                                                        cursor:
                                                                            riskPage === 0
                                                                                ? "default"
                                                                                : "pointer",
                                                                    }}
                                                                >
                                                                    Previous
                                                                </button>

                                                                <div
                                                                    style={{
                                                                        fontSize: 12,
                                                                        fontWeight: 700,
                                                                        color: "#64748b",
                                                                    }}
                                                                >
                                                                    Page {riskPage + 1} of {totalRiskPages}
                                                                </div>

                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        setRiskPage((p) =>
                                                                            Math.min(
                                                                                totalRiskPages - 1,
                                                                                p + 1
                                                                            )
                                                                        )
                                                                    }
                                                                    disabled={
                                                                        riskPage >= totalRiskPages - 1
                                                                    }
                                                                    style={{
                                                                        border: "1px solid #e2e8f0",
                                                                        background:
                                                                            riskPage >= totalRiskPages - 1
                                                                                ? "#f8fafc"
                                                                                : "#fff",
                                                                        color:
                                                                            riskPage >= totalRiskPages - 1
                                                                                ? "#94a3b8"
                                                                                : "#0f172a",
                                                                        borderRadius: 10,
                                                                        padding: "8px 12px",
                                                                        fontSize: 13,
                                                                        fontWeight: 700,
                                                                        cursor:
                                                                            riskPage >= totalRiskPages - 1
                                                                                ? "default"
                                                                                : "pointer",
                                                                    }}
                                                                >
                                                                    Next
                                                                </button>
                                                            </div>
                                                        ) : null}
                                                    </>
                                                ) : (
                                                    <div style={{ fontSize: 13, color: "#64748b" }}>
                                                        No at-risk accounts found.
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            </>
                        )}

                        {insights?.ok && insights.items?.length ? (
                            <div className={styles.drawerCard}>
                                <div className={styles.drawerSubhead}>Recent automated insights</div>
                                <div className={styles.drawerInsightList}>
                                    {insights.items.slice(0, 6).map((it) => (
                                        <button
                                            key={it.id}
                                            type="button"
                                            className={styles.drawerInsightCard}
                                            onClick={() => {
                                                safePush(it.href);
                                            }}
                                        >
                                            <div className={styles.drawerInsightTop}>
                                                <div className={styles.drawerInsightTitle}>
                                                    {it.title}
                                                </div>
                                                <div className={styles.drawerInsightMeta}>
                                                    {niceWhen(it.createdAt)}
                                                </div>
                                            </div>
                                            <div className={styles.drawerInsightSummary}>
                                                {it.summary}
                                            </div>
                                            {it.impactLabel ? (
                                                <div className={styles.drawerInsightImpact}>
                                                    {it.impactLabel}
                                                </div>
                                            ) : null}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>

            {showUpgradeModal ? (
                <div
                    style={{
                        position: "fixed",
                        inset: 0,
                        background: "rgba(15, 23, 42, 0.45)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 20,
                        zIndex: 1100,
                    }}
                    onClick={() => setShowUpgradeModal(false)}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: "100%",
                            maxWidth: 460,
                            background: "#ffffff",
                            borderRadius: 24,
                            padding: 24,
                            boxShadow: "0 24px 80px rgba(15, 23, 42, 0.18)",
                            border: "1px solid rgba(15, 23, 42, 0.08)",
                        }}
                    >
                        <div
                            style={{
                                display: "inline-flex",
                                padding: "6px 12px",
                                borderRadius: 999,
                                background: "rgba(15, 23, 42, 0.06)",
                                fontSize: 12,
                                fontWeight: 700,
                                color: "#0f172a",
                                letterSpacing: "0.04em",
                                textTransform: "uppercase",
                                marginBottom: 14,
                            }}
                        >
                            Pro feature
                        </div>

                        <h3
                            style={{
                                margin: 0,
                                fontSize: 24,
                                lineHeight: 1.2,
                                color: "#0f172a",
                                fontWeight: 700,
                            }}
                        >
                            Upgrade to unlock deeper AI insights
                        </h3>

                        <p
                            style={{
                                margin: "12px 0 0",
                                fontSize: 15,
                                lineHeight: 1.65,
                                color: "#5f6b7a",
                            }}
                        >
                            Upgrade to Pro for unlimited AI insights, forecasts, key accounts at risk, and full expansion opportunities.
                        </p>

                        <div
                            style={{
                                display: "flex",
                                gap: 12,
                                marginTop: 22,
                                flexWrap: "wrap",
                            }}
                        >
                            <button
                                type="button"
                                onClick={() => setShowUpgradeModal(false)}
                                style={{
                                    border: "1px solid rgba(15, 23, 42, 0.12)",
                                    background: "#ffffff",
                                    color: "#0f172a",
                                    borderRadius: 999,
                                    padding: "11px 16px",
                                    fontSize: 14,
                                    fontWeight: 600,
                                    cursor: "pointer",
                                }}
                            >
                                Not now
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setShowUpgradeModal(false);
                                    onClose();
                                    router.push("/dashboard/settings?tab=manage-plan");
                                }}
                                style={{
                                    border: "none",
                                    background: "#0f172a",
                                    color: "#ffffff",
                                    borderRadius: 999,
                                    padding: "11px 18px",
                                    fontSize: 14,
                                    fontWeight: 600,
                                    cursor: "pointer",
                                }}
                            >
                                Upgrade to Pro
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {emailModal.open ? (
                <div
                    onClick={closeEmailModal}
                    style={{
                        position: "fixed",
                        inset: 0,
                        background: "rgba(15, 23, 42, 0.45)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 1000,
                        padding: 20,
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: "100%",
                            maxWidth: 720,
                            background: "#ffffff",
                            borderRadius: 20,
                            border: "1px solid #e5e7eb",
                            boxShadow: "0 24px 80px rgba(15, 23, 42, 0.2)",
                            overflow: "hidden",
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "start",
                                gap: 16,
                                padding: "20px 20px 14px",
                                borderBottom: "1px solid #eef2f7",
                            }}
                        >
                            <div>
                                <div
                                    style={{
                                        fontSize: 11,
                                        fontWeight: 800,
                                        color: "#64748b",
                                        textTransform: "uppercase",
                                        letterSpacing: 0.4,
                                        marginBottom: 6,
                                    }}
                                >
                                    Email automation
                                </div>
                                <div
                                    style={{
                                        fontSize: 22,
                                        fontWeight: 900,
                                        color: "#0f172a",
                                        lineHeight: 1.1,
                                        marginBottom: 4,
                                    }}
                                >
                                    Compose email
                                </div>
                                <div
                                    style={{
                                        fontSize: 13,
                                        color: "#64748b",
                                        fontWeight: 600,
                                    }}
                                >
                                    {emailModal.accountName}
                                    {emailModal.to ? ` • ${emailModal.to}` : ""}
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={closeEmailModal}
                                style={{
                                    border: "1px solid #e2e8f0",
                                    background: "#ffffff",
                                    color: "#0f172a",
                                    borderRadius: 10,
                                    width: 36,
                                    height: 36,
                                    fontSize: 20,
                                    lineHeight: 1,
                                    cursor: "pointer",
                                }}
                            >
                                ×
                            </button>
                        </div>

                        <div style={{ padding: 20 }}>
                            <div style={{ display: "grid", gap: 14 }}>
                                <div>
                                    <label
                                        style={{
                                            display: "block",
                                            fontSize: 12,
                                            fontWeight: 700,
                                            color: "#64748b",
                                            marginBottom: 6,
                                        }}
                                    >
                                        To
                                    </label>
                                    <input
                                        value={emailModal.to}
                                        readOnly
                                        style={{
                                            width: "100%",
                                            border: "1px solid #e2e8f0",
                                            borderRadius: 12,
                                            padding: "12px 14px",
                                            fontSize: 14,
                                            color: "#0f172a",
                                            background: "#f8fafc",
                                            outline: "none",
                                        }}
                                    />
                                </div>

                                <div>
                                    <label
                                        style={{
                                            display: "block",
                                            fontSize: 12,
                                            fontWeight: 700,
                                            color: "#64748b",
                                            marginBottom: 6,
                                        }}
                                    >
                                        Subject
                                    </label>
                                    <input
                                        value={emailSubject}
                                        onChange={(e) => setEmailSubject(e.target.value)}
                                        placeholder="Email subject"
                                        style={{
                                            width: "100%",
                                            border: "1px solid #e2e8f0",
                                            borderRadius: 12,
                                            padding: "12px 14px",
                                            fontSize: 14,
                                            color: "#0f172a",
                                            background: "#ffffff",
                                            outline: "none",
                                        }}
                                    />
                                </div>

                                <div>
                                    <label
                                        style={{
                                            display: "block",
                                            fontSize: 12,
                                            fontWeight: 700,
                                            color: "#64748b",
                                            marginBottom: 6,
                                        }}
                                    >
                                        Message
                                    </label>
                                    <textarea
                                        value={emailBody}
                                        onChange={(e) => setEmailBody(e.target.value)}
                                        placeholder="Write your email..."
                                        style={{
                                            width: "100%",
                                            minHeight: 240,
                                            resize: "vertical",
                                            border: "1px solid #e2e8f0",
                                            borderRadius: 12,
                                            padding: "14px 14px",
                                            fontSize: 14,
                                            lineHeight: 1.55,
                                            color: "#0f172a",
                                            background: "#ffffff",
                                            outline: "none",
                                            fontFamily: "inherit",
                                        }}
                                    />
                                </div>

                                {sendErr ? (
                                    <div
                                        style={{
                                            fontSize: 13,
                                            color: "#dc2626",
                                            fontWeight: 600,
                                        }}
                                    >
                                        {sendErr}
                                    </div>
                                ) : null}

                                <div
                                    style={{
                                        display: "flex",
                                        justifyContent: "flex-end",
                                        gap: 10,
                                        marginTop: 4,
                                    }}
                                >
                                    <button
                                        type="button"
                                        onClick={closeEmailModal}
                                        style={{
                                            border: "1px solid #e2e8f0",
                                            background: "#ffffff",
                                            color: "#0f172a",
                                            borderRadius: 12,
                                            padding: "10px 14px",
                                            fontSize: 14,
                                            fontWeight: 700,
                                            cursor: "pointer",
                                        }}
                                    >
                                        Cancel
                                    </button>

                                    <button
                                        type="button"
                                        onClick={sendEmail}
                                        disabled={sendingEmail}
                                        style={{
                                            border: "none",
                                            background: "#0f172a",
                                            color: "#ffffff",
                                            borderRadius: 12,
                                            padding: "10px 16px",
                                            fontSize: 14,
                                            fontWeight: 800,
                                            cursor: sendingEmail ? "default" : "pointer",
                                            opacity: sendingEmail ? 0.7 : 1,
                                        }}
                                    >
                                        {sendingEmail ? "Sending..." : "Send email"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}
        </>
    );
}