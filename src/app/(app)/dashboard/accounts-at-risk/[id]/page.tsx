"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useParams, useRouter } from "next/navigation";
import styles from "./riskAccounts.module.css";

import { onAuthStateChanged, type User } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase.client";
import type { PlanTier } from "@/lib/permissions";

type RiskLevel = "critical" | "high" | "medium" | "low";

type Signal = { key: string; label: string };

type RiskRow = {
    id: string;
    companyName: string;
    email?: string;

    riskScore: number;
    riskLevel: RiskLevel;

    reasonKey: string;
    reasonLabel: string;

    riskTrend?: "up" | "down" | "flat";
    riskDelta?: number;

    status?: string;
    lastActiveAt?: string | null;

    signals?: Signal[];
    nextAction?: string;

    mrr: number;
    updatedAt: string;
};

type EmailUsageResponse = {
    ok?: boolean;
    tier?: PlanTier;
    emailUsage?: {
        used: number | null;
        limit: number | null;
        remaining: number | null;
        resetAt?: string | null;
    };
    error?: string;
};

type RecommendedAction = {
    key: "billing" | "inactive" | "checkin";
    label: string;
    reason: string;
    automationLabel: string;
};

type AIInsight = {
    headline: string;
    summary: string;
    drivers: string[];
    confidence: number;
    recommendedActions: RecommendedAction[];
    nextBestAction: string;
};

type RiskDetails = {
    ok: boolean;
    error?: string;
    customerId?: string | null;

    profile?: {
        companyName?: string;
        plan?: string;
        startDate?: string | null;
        paymentHistory?: { label: string; at?: string; amount?: number; status?: string }[];
        supportHistory?: { label: string; at?: string; channel?: string; status?: string }[];
    };

    ai?: {
        whyAtRisk?: string[];
        recommendation?: string;
        automationSuggestion?: string;

        headline?: string;
        summary?: string;
        drivers?: string[];
        confidence?: number;
        recommendedActions?: RecommendedAction[];
        nextBestAction?: string;
    };
};

type AccountsAtRiskListResponse = {
    ok: boolean;
    error?: string;
    rows?: RiskRow[];
};

type DashboardSummaryResponse = {
    ok?: boolean;
    tier?: PlanTier;
};

type TimelineEventType =
    | "payment_failed"
    | "payment_successful"
    | "billing_issue_detected"
    | "billing_recovery_email_sent"
    | "billing_recovery_email_opened"
    | "billing_recovery_email_not_opened"
    | "reengagement_email_sent"
    | "reengagement_email_opened"
    | "checkin_email_sent"
    | "followup_call_no_response"
    | "followup_call_connected"
    | "plan_upgraded"
    | "risk_increased"
    | "risk_decreased"
    | "inactivity_detected"
    | "usage_dropped"
    | "account_reviewed"
    | "generic";

type AccountTimelineEvent = {
    id: string;
    type: TimelineEventType;
    date: string;
    source: "demo" | "stripe" | "crm" | "email" | "app" | "system" | "manual";
    meta?: {
        riskScore?: number;
        inactiveDays?: number;
        planName?: string;
        amount?: number;
        rawLabel?: string;
    };
};

type EmailModalState = {
    open: boolean;
    kind: "billing" | "inactive" | "checkin" | null;
};

type OutcomeState = {
    label: "Saved" | "Recovering" | "At risk" | "Lost";
    tone: "good" | "medium" | "warning" | "danger";
    sub: string;
};

const STARTER_EMAIL_LIMIT = 5;

function formatMoney(value: number) {
    return `£${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatAnnualValue(value: number) {
    return formatMoney(Number(value || 0) * 12);
}

function niceDateTime(iso?: string | null) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function niceDate(iso?: string | null) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
}

function daysAgo(iso?: string | null) {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const diff = Date.now() - d.getTime();
    const days = Math.floor(diff / 86400000);
    return days < 0 ? 0 : days;
}

function isWithinLast30Days(iso?: string | null) {
    if (!iso) return false;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return false;
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    return Date.now() - d.getTime() <= THIRTY_DAYS;
}

function riskLabelFromScore(score: number) {
    if (score >= 85) return "Critical";
    if (score >= 70) return "High";
    if (score >= 50) return "Medium";
    return "Low";
}

function riskLevelFromScore(score: number): RiskLevel {
    if (score >= 85) return "critical";
    if (score >= 70) return "high";
    if (score >= 50) return "medium";
    return "low";
}

function lsKey(accountId: string) {
    return `cobrai:riskpage:${accountId}`;
}

function createId() {
    return (globalThis as any).crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function eventToLabel(event: AccountTimelineEvent) {
    switch (event.type) {
        case "payment_failed":
            return event.meta?.amount
                ? `Subscription payment failed (${formatMoney(event.meta.amount)})`
                : "Subscription payment failed";
        case "payment_successful":
            return event.meta?.amount
                ? `Subscription payment recovered (${formatMoney(event.meta.amount)})`
                : "Subscription payment successful";
        case "billing_issue_detected":
            return event.meta?.amount
                ? `Billing issue detected on ${formatMoney(event.meta.amount)} MRR`
                : "Billing issue detected";
        case "billing_recovery_email_sent":
            return event.meta?.amount
                ? `Billing recovery email sent for ${formatMoney(event.meta.amount)} at-risk MRR`
                : "Billing recovery email sent";
        case "billing_recovery_email_opened":
            return event.meta?.amount
                ? `Billing recovery email opened for ${formatMoney(event.meta.amount)} at-risk MRR`
                : "Billing recovery email opened";
        case "billing_recovery_email_not_opened":
            return "Billing recovery email not opened";
        case "reengagement_email_sent":
            return event.meta?.amount
                ? `Re-engagement email sent to protect ${formatMoney(event.meta.amount)} MRR`
                : "Re-engagement email sent";
        case "reengagement_email_opened":
            return "Re-engagement email opened";
        case "checkin_email_sent":
            return event.meta?.amount
                ? `Customer check-in email sent for ${formatMoney(event.meta.amount)} at-risk MRR`
                : "Customer check-in email sent";
        case "followup_call_no_response":
            return "Follow-up call had no response";
        case "followup_call_connected":
            return "Follow-up call connected";
        case "plan_upgraded":
            return event.meta?.planName
                ? `Upgraded subscription to ${event.meta.planName}`
                : "Upgraded subscription plan";
        case "risk_increased":
            return event.meta?.riskScore
                ? `Risk score increased to ${event.meta.riskScore}`
                : "Risk score increased";
        case "risk_decreased":
            return event.meta?.riskScore
                ? `Risk score decreased to ${event.meta.riskScore}`
                : "Risk score decreased";
        case "inactivity_detected":
            return event.meta?.inactiveDays
                ? `No activity detected for ${event.meta.inactiveDays} days`
                : "Account inactivity detected";
        case "usage_dropped":
            return "Usage dropped";
        case "account_reviewed":
            return "Account reviewed";
        default:
            return event.meta?.rawLabel || "Account activity updated";
    }
}

function dedupeEvents(events: AccountTimelineEvent[]) {
    return events.filter((item, index, arr) => {
        const sig = `${item.type}|${item.date}|${item.meta?.planName || ""}|${item.meta?.riskScore || ""}|${item.meta?.inactiveDays || ""}|${item.meta?.amount || ""}|${item.meta?.rawLabel || ""}`;
        return (
            arr.findIndex((x) => {
                const xSig = `${x.type}|${x.date}|${x.meta?.planName || ""}|${x.meta?.riskScore || ""}|${x.meta?.inactiveDays || ""}|${x.meta?.amount || ""}|${x.meta?.rawLabel || ""}`;
                return xSig === sig;
            }) === index
        );
    });
}

function loadPageState(accountId: string) {
    if (typeof window === "undefined") {
        return {
            manualEvents: [] as AccountTimelineEvent[],
        };
    }

    try {
        const raw = window.localStorage.getItem(lsKey(accountId));
        if (!raw) return { manualEvents: [] };

        const parsed = JSON.parse(raw);
        return {
            manualEvents: Array.isArray(parsed?.manualEvents) ? parsed.manualEvents : [],
        };
    } catch {
        return { manualEvents: [] };
    }
}

function savePageState(accountId: string, data: { manualEvents: AccountTimelineEvent[] }) {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(lsKey(accountId), JSON.stringify(data));
    } catch {
        // ignore
    }
}

function buildDemoTimeline(account: RiskRow | null): AccountTimelineEvent[] {
    if (!account) return [];

    const now = Date.now();
    const reason = (account.reasonLabel || "").toLowerCase();
    const items: AccountTimelineEvent[] = [];

    if (reason.includes("billing")) {
        items.push(
            {
                id: createId(),
                type: "billing_recovery_email_opened",
                date: new Date(now - 1000 * 60 * 35).toISOString(),
                source: "demo",
                meta: { amount: account.mrr },
            },
            {
                id: createId(),
                type: "followup_call_no_response",
                date: new Date(now - 1000 * 60 * 95).toISOString(),
                source: "demo",
            },
            {
                id: createId(),
                type: "billing_issue_detected",
                date: new Date(now - 1000 * 60 * 60 * 20).toISOString(),
                source: "demo",
                meta: { amount: account.mrr },
            },
            {
                id: createId(),
                type: "payment_failed",
                date: new Date(now - 1000 * 60 * 60 * 22).toISOString(),
                source: "demo",
                meta: { amount: account.mrr },
            },
            {
                id: createId(),
                type: "risk_increased",
                date: new Date(now - 1000 * 60 * 60 * 48).toISOString(),
                source: "demo",
                meta: { riskScore: account.riskScore },
            },
            {
                id: createId(),
                type: "inactivity_detected",
                date: new Date(now - 1000 * 60 * 60 * 24 * 30).toISOString(),
                source: "demo",
                meta: { inactiveDays: 30 },
            }
        );
    } else if (reason.includes("inactive")) {
        items.push(
            {
                id: createId(),
                type: "reengagement_email_sent",
                date: new Date(now - 1000 * 60 * 45).toISOString(),
                source: "demo",
                meta: { amount: account.mrr },
            },
            {
                id: createId(),
                type: "followup_call_no_response",
                date: new Date(now - 1000 * 60 * 60 * 12).toISOString(),
                source: "demo",
            },
            {
                id: createId(),
                type: "usage_dropped",
                date: new Date(now - 1000 * 60 * 60 * 24 * 5).toISOString(),
                source: "demo",
            },
            {
                id: createId(),
                type: "inactivity_detected",
                date: new Date(now - 1000 * 60 * 60 * 24 * 21).toISOString(),
                source: "demo",
                meta: { inactiveDays: 21 },
            }
        );
    } else {
        items.push(
            {
                id: createId(),
                type: "checkin_email_sent",
                date: new Date(now - 1000 * 60 * 60 * 8).toISOString(),
                source: "demo",
                meta: { amount: account.mrr },
            },
            {
                id: createId(),
                type: "account_reviewed",
                date: new Date(now - 1000 * 60 * 60 * 24 * 2).toISOString(),
                source: "demo",
            }
        );
    }

    return dedupeEvents(items)
        .filter((item) => isWithinLast30Days(item.date))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

function buildEmailTemplate(kind: "billing" | "inactive" | "checkin", r: RiskRow) {
    const company = r.companyName || "there";
    const reason = r.reasonLabel || "risk signals";
    const action = r.nextAction || "a quick check-in";

    if (kind === "billing") {
        return {
            subject: `Quick billing check-in — ${company}`,
            body:
                `Hi ${company} team,\n\n` +
                `We noticed a billing-related risk signal on your account (${reason}).\n\n` +
                `This is currently putting ${formatMoney(r.mrr)} in monthly revenue at risk.\n\n` +
                `Could you confirm the right billing contact and whether anything is blocking payment? Happy to help resolve this today.\n\n` +
                `Best,\nCobrai`,
        };
    }

    if (kind === "inactive") {
        return {
            subject: `Can we help you get value this week? — ${company}`,
            body:
                `Hi ${company} team,\n\n` +
                `We noticed usage has dropped recently (${reason}).\n\n` +
                `This account currently represents ${formatMoney(r.mrr)} in monthly revenue, so we’d love to help you get back on track quickly.\n\n` +
                `Would you like a quick 10-minute walkthrough to get you back on track?\n\n` +
                `Best,\nCobrai`,
        };
    }

    return {
        subject: `Quick check-in — ${company}`,
        body:
            `Hi ${company} team,\n\n` +
            `Just checking in — we’re seeing ${reason}.\n\n` +
            `This account currently has ${formatMoney(r.mrr)} in monthly revenue exposure.\n\n` +
            `Recommended next step: ${action}\n\n` +
            `Best,\nCobrai`,
    };
}

function getRiskTone(score: number) {
    if (score >= 85) return "danger";
    if (score >= 70) return "warning";
    if (score >= 50) return "medium";
    return "good";
}

function getRiskDeltaDisplay(trend?: "up" | "down" | "flat", delta?: number) {
    const value = Math.abs(Number(delta || 0)).toFixed(1);

    if (trend === "up") return `↑ ${value}% vs previous month`;
    if (trend === "down") return `↓ ${value}% vs previous month`;
    return "→ 0% vs previous month";
}

function getPlanDisplay(details: RiskDetails | null) {
    const rawPlan = details?.profile?.plan?.trim();

    if (rawPlan && rawPlan !== "—") {
        return {
            label: rawPlan,
            sub: details?.profile?.startDate ? `Since ${niceDate(details.profile.startDate)}` : "Active plan",
        };
    }

    return {
        label: "—",
        sub: details?.profile?.startDate ? `Since ${niceDate(details.profile.startDate)}` : "Demo account",
    };
}

function buildInsight(
    account: RiskRow,
    timeline: AccountTimelineEvent[],
    details: RiskDetails | null
): AIInsight {
    const inactiveDays = daysAgo(account.lastActiveAt) ?? 0;

    const hasPaymentFailed = timeline.some((e) => e.type === "payment_failed");
    const hasBillingIssue = timeline.some((e) => e.type === "billing_issue_detected");
    const hasBillingEmailOpened = timeline.some((e) => e.type === "billing_recovery_email_opened");
    const hasBillingEmailSent = timeline.some((e) => e.type === "billing_recovery_email_sent");
    const hasReengagementSent = timeline.some((e) => e.type === "reengagement_email_sent");
    const hasFollowupNoResponse = timeline.some((e) => e.type === "followup_call_no_response");
    const hasUsageDropped = timeline.some((e) => e.type === "usage_dropped");

    const drivers: string[] = [];
    const actions: RecommendedAction[] = [];

    if (hasPaymentFailed || hasBillingIssue || (account.status || "").toLowerCase().includes("past due")) {
        drivers.push("Recent billing failure or past-due status detected");

        actions.push({
            key: "billing",
            label: "Recover failed payment",
            reason: `Billing failure is the strongest churn driver on ${formatMoney(account.mrr)} MRR`,
            automationLabel: "Send billing recovery email",
        });
    }

    if (inactiveDays >= 14 || hasUsageDropped) {
        drivers.push(`No recent product activity for ${inactiveDays} days`);

        actions.push({
            key: "inactive",
            label: "Re-engage account",
            reason: `Low usage is putting ${formatMoney(account.mrr)} MRR at risk`,
            automationLabel: "Send re-engagement email",
        });
    }

    if (
        hasFollowupNoResponse ||
        (!hasBillingEmailOpened && hasBillingEmailSent) ||
        (!hasReengagementSent && inactiveDays >= 14)
    ) {
        actions.push({
            key: "checkin",
            label: "Schedule human check-in",
            reason: `Direct outreach is needed to protect ${formatMoney(account.mrr)} MRR`,
            automationLabel: "Send check-in email",
        });
    }

    const uniqueActions = actions.filter(
        (item, index, arr) => arr.findIndex((x) => x.key === item.key) === index
    );

    if (!drivers.length) {
        drivers.push("Multiple churn signals detected across billing, activity, or risk score");
    }

    const headline =
        account.riskScore >= 85
            ? "This account will likely churn without intervention"
            : account.riskScore >= 70
                ? "This account is showing strong churn risk"
                : "This account needs intervention";

    const summaryParts: string[] = [];

    if (hasPaymentFailed || hasBillingIssue) {
        summaryParts.push("a recent billing failure");
    }

    if (inactiveDays >= 14) {
        summaryParts.push(`no product activity for ${inactiveDays} days`);
    }

    if (hasFollowupNoResponse) {
        summaryParts.push("no response to follow-up outreach");
    }

    const summary =
        summaryParts.length > 0
            ? `${formatMoney(account.mrr)} in monthly revenue is currently exposed. This account is at ${riskLabelFromScore(account.riskScore).toLowerCase()} risk of churn due to ${summaryParts.join(" and ")}.`
            : details?.ai?.recommendation || `${formatMoney(account.mrr)} in monthly revenue is at elevated risk based on recent account signals.`;

    const confidenceBase =
        (hasPaymentFailed ? 30 : 0) +
        (hasBillingIssue ? 20 : 0) +
        (inactiveDays >= 14 ? 25 : 0) +
        (hasUsageDropped ? 10 : 0) +
        (hasFollowupNoResponse ? 10 : 0) +
        (account.riskScore >= 85 ? 10 : account.riskScore >= 70 ? 5 : 0);

    const confidence = Math.max(55, Math.min(97, confidenceBase));

    const nextBestAction =
        uniqueActions[0]?.label ||
        account.nextAction ||
        "Review this account and confirm the highest-risk signal";

    return {
        headline,
        summary,
        drivers,
        confidence,
        recommendedActions: uniqueActions,
        nextBestAction,
    };
}

function getLiveInsight(details: RiskDetails | null): AIInsight | null {
    if (!details?.ai?.headline || !details?.ai?.summary) return null;

    return {
        headline: details.ai.headline,
        summary: details.ai.summary,
        drivers: Array.isArray(details.ai.drivers) ? details.ai.drivers : details.ai.whyAtRisk || [],
        confidence: typeof details.ai.confidence === "number" ? details.ai.confidence : 72,
        recommendedActions: Array.isArray(details.ai.recommendedActions) ? details.ai.recommendedActions : [],
        nextBestAction:
            details.ai.nextBestAction ||
            details.ai.recommendation ||
            "Review this account and confirm the highest-risk signal",
    };
}

function getConfidenceTone(confidence: number) {
    if (confidence >= 85) return "high";
    if (confidence >= 70) return "medium";
    return "low";
}

function getOutcomeState(account: RiskRow, timeline: AccountTimelineEvent[]): OutcomeState {
    const rawStatus = (account.status || "").toLowerCase();

    const hasRecovery = timeline.some((e) => e.type === "payment_successful");
    const hasSavedSignal =
        hasRecovery ||
        timeline.some((e) => e.type === "risk_decreased" && (e.meta?.riskScore ?? account.riskScore) < 50);

    const hasRecoveryWork =
        timeline.some(
            (e) =>
                e.type === "billing_recovery_email_sent" ||
                e.type === "billing_recovery_email_opened" ||
                e.type === "reengagement_email_sent" ||
                e.type === "reengagement_email_opened" ||
                e.type === "checkin_email_sent" ||
                e.type === "followup_call_connected"
        );

    if (rawStatus.includes("churn") || rawStatus.includes("lost") || rawStatus.includes("cancel")) {
        return {
            label: "Lost",
            tone: "danger",
            sub: "Revenue was not recovered",
        };
    }

    if (hasSavedSignal) {
        return {
            label: "Saved",
            tone: "good",
            sub: "Revenue recovery signal detected",
        };
    }

    if (hasRecoveryWork) {
        return {
            label: "Recovering",
            tone: "medium",
            sub: "Interventions are active",
        };
    }

    return {
        label: "At risk",
        tone: "warning",
        sub: "Revenue still exposed",
    };
}

function getOutcomeToneClassName(tone: OutcomeState["tone"]) {
    if (tone === "good") return styles.kpiGood;
    if (tone === "danger") return styles.kpiDanger;
    if (tone === "medium") return styles.kpiMedium;
    return styles.kpiWarning;
}

function buildAccountFromDetails(id: string, details: RiskDetails): RiskRow {
    const latestPayment = Array.isArray(details.profile?.paymentHistory)
        ? details.profile?.paymentHistory?.[0]
        : undefined;

    const inferredMrr =
        typeof latestPayment?.amount === "number" && Number.isFinite(latestPayment.amount)
            ? latestPayment.amount
            : 0;

    const inferredBilling =
        Array.isArray(details.profile?.paymentHistory) &&
        details.profile.paymentHistory.some((item) => {
            const status = (item.status || "").toLowerCase();
            const label = (item.label || "").toLowerCase();
            return (
                status.includes("fail") ||
                status.includes("past_due") ||
                label.includes("fail") ||
                label.includes("past due") ||
                label.includes("billing")
            );
        });

    const inferredInactive = Array.isArray(details.ai?.drivers)
        ? details.ai.drivers.some((d) => {
            const t = d.toLowerCase();
            return t.includes("inactive") || t.includes("activity") || t.includes("usage");
        })
        : false;

    const riskScore =
        typeof details.ai?.confidence === "number"
            ? Math.max(50, Math.min(97, Math.round(details.ai.confidence)))
            : inferredBilling
                ? 78
                : inferredInactive
                    ? 71
                    : 64;

    const reasonLabel =
        details.ai?.drivers?.[0] ||
        details.ai?.whyAtRisk?.[0] ||
        details.ai?.recommendation ||
        "Risk signals detected";

    const reasonKey = inferredBilling
        ? "billing_risk"
        : inferredInactive
            ? "inactive_user"
            : "general_risk";

    return {
        id,
        companyName: details.profile?.companyName || "Unknown account",
        email: undefined,
        riskScore,
        riskLevel: riskLevelFromScore(riskScore),
        reasonKey,
        reasonLabel,
        riskTrend: "flat",
        riskDelta: 0,
        status: inferredBilling ? "past_due" : inferredInactive ? "at_risk" : "active",
        lastActiveAt: null,
        signals: inferredBilling
            ? [{ key: "billing_failed", label: "Payment failed" }]
            : inferredInactive
                ? [{ key: "inactive_14d", label: "Low recent activity" }]
                : [],
        nextAction: details.ai?.nextBestAction || "Send check-in email",
        mrr: inferredMrr,
        updatedAt: new Date().toISOString(),
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

export default function CustomerDetailPage() {
    const router = useRouter();
    const params = useParams();
    const id = String(params?.id || "");

    const [user, setUser] = useState<User | null>(null);
    const [account, setAccount] = useState<RiskRow | null>(null);
    const [details, setDetails] = useState<RiskDetails | null>(null);

    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    const [manualEvents, setManualEvents] = useState<AccountTimelineEvent[]>([]);

    const [emailModal, setEmailModal] = useState<EmailModalState>({
        open: false,
        kind: null,
    });

    const [runningRetryPayment, setRunningRetryPayment] = useState(false);
    const [runningNotification, setRunningNotification] = useState(false);

    const [emailSubject, setEmailSubject] = useState("");
    const [emailBody, setEmailBody] = useState("");
    const [sendingEmail, setSendingEmail] = useState(false);
    const [sendErr, setSendErr] = useState<string | null>(null);

    const [tier, setTier] = useState<PlanTier>("starter");
    const [emailUsageCount, setEmailUsageCount] = useState<number | null>(null);
    const [emailUsageLimit, setEmailUsageLimit] = useState<number | null>(null);
    const [emailUsageRemaining, setEmailUsageRemaining] = useState<number | null>(null);
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);
    const [upgradeContext, setUpgradeContext] = useState<"email" | "pro-feature">("email");

    useEffect(() => {
        const auth = getFirebaseAuth();
        const unsub = onAuthStateChanged(auth, (u) => setUser(u));
        return () => unsub();
    }, []);

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

    useEffect(() => {
        if (!user) return;

        let cancelled = false;

        async function loadTierAndUsage() {
            try {
                const [summaryRes, usageRes] = await Promise.all([
                    authedFetch("/api/dashboard/summary"),
                    authedFetch("/api/automation/email-usage"),
                ]);

                const summaryJson = (await summaryRes.json()) as DashboardSummaryResponse;
                const usageJson = (await usageRes.json()) as EmailUsageResponse;

                if (cancelled) return;

                const nextTier = summaryJson?.tier === "pro" ? "pro" : "starter";
                setTier(nextTier);

                if (usageJson?.ok && usageJson?.tier === "starter") {
                    setEmailUsageCount(
                        typeof usageJson.emailUsage?.used === "number" ? usageJson.emailUsage.used : 0
                    );
                    setEmailUsageLimit(
                        typeof usageJson.emailUsage?.limit === "number" ? usageJson.emailUsage.limit : 5
                    );
                    setEmailUsageRemaining(
                        typeof usageJson.emailUsage?.remaining === "number"
                            ? usageJson.emailUsage.remaining
                            : null
                    );
                } else {
                    setEmailUsageCount(null);
                    setEmailUsageLimit(null);
                    setEmailUsageRemaining(null);
                }
            } catch {
                if (!cancelled) {
                    setTier("starter");
                    setEmailUsageCount(null);
                    setEmailUsageLimit(null);
                    setEmailUsageRemaining(null);
                }
            }
        }

        loadTierAndUsage();

        return () => {
            cancelled = true;
        };
    }, [user]);

    useEffect(() => {
        if (!id || !user) return;

        let cancelled = false;

        async function load() {
            setLoading(true);
            setErr(null);
            setAccount(null);
            setDetails(null);

            try {
                const detailsRes = await authedFetch(`/api/dashboard/accounts-at-risk/${encodeURIComponent(id)}`);
                const detailsJson = (await detailsRes.json()) as RiskDetails;

                if (!detailsRes.ok) {
                    console.warn("Account not found in DB, attempting demo fallback...");
                    // Dont throw! Just let the code continue to the 'enrichedAccount' logic below 
                }

                if (cancelled) return;

                setDetails(detailsJson);

                let enrichedAccount: RiskRow | null = null;

                try {
                    const listRes = await authedFetch(
                        `/api/dashboard/accounts-at-risk?q=${encodeURIComponent(
                            detailsJson.profile?.companyName || ""
                        )}&sort=risk&dir=desc&page=1&pageSize=25`
                    );

                    const listJson = (await listRes.json()) as AccountsAtRiskListResponse;

                    if (listRes.ok && listJson?.ok && Array.isArray(listJson.rows)) {
                        enrichedAccount =
                            listJson.rows.find((r) => r.id === id) ||
                            listJson.rows.find(
                                (r) =>
                                    r.companyName === (detailsJson.profile?.companyName || "") ||
                                    (detailsJson.customerId && r.id === detailsJson.customerId)
                            ) ||
                            null;
                    }
                } catch {
                    enrichedAccount = null;
                }

                if (!cancelled) {
                    setAccount(enrichedAccount || buildAccountFromDetails(id, detailsJson));
                }
            } catch (e: any) {
                if (!cancelled) {
                    setErr(e?.message || "Something went wrong");
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        load();

        return () => {
            cancelled = true;
        };
    }, [id, user]);

    useEffect(() => {
        if (!id) return;
        const st = loadPageState(id);
        if (Array.isArray(st.manualEvents) && st.manualEvents.length) {
            setManualEvents(st.manualEvents.filter((item) => isWithinLast30Days(item.date)));
        } else {
            setManualEvents(buildDemoTimeline(account));
        }
    }, [id, account]);

    useEffect(() => {
        if (!id) return;
        savePageState(id, {
            manualEvents: manualEvents.filter((item) => isWithinLast30Days(item.date)),
        });
    }, [id, manualEvents]);

    function addManualEvent(event: Omit<AccountTimelineEvent, "id" | "date"> & { date?: string }) {
        setManualEvents((prev) => [
            {
                id: createId(),
                date: event.date || new Date().toISOString(),
                ...event,
            },
            ...prev,
        ]);
    }

    function openEmailModal(kind: "billing" | "inactive" | "checkin") {
        if (!account) return;

        const t = buildEmailTemplate(kind, account);
        setEmailSubject(t.subject);
        setEmailBody(t.body);
        setSendErr(null);
        setEmailModal({ open: true, kind });
    }

    function closeEmailModal() {
        setEmailModal({ open: false, kind: null });
        setSendErr(null);
    }

    async function sendEmail() {
        if (!account?.email) {
            setSendErr("No email on this account.");
            return;
        }

        setSendingEmail(true);
        setSendErr(null);

        try {
            const kind = emailModal.kind;

            const res = await authedFetch(`/api/automation/send-email`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    to: account.email,
                    subject: emailSubject,
                    body: emailBody,
                    accountId: account.id,
                }),
            });

            const json = await res.json();

            if (!res.ok || !json?.ok) {
                if (json?.code === "STARTER_EMAIL_LIMIT_REACHED") {
                    closeEmailModal();
                    setUpgradeContext("email");
                    setShowUpgradeModal(true);
                    return;
                }

                throw new Error(json?.error || "Failed to send");
            }

            if (json?.tier === "pro") {
                setTier("pro");
                setEmailUsageCount(null);
                setEmailUsageLimit(null);
                setEmailUsageRemaining(null);
            } else if (json?.emailUsage) {
                setTier("starter");
                setEmailUsageCount(
                    typeof json.emailUsage.used === "number" ? json.emailUsage.used : 0
                );
                setEmailUsageLimit(
                    typeof json.emailUsage.limit === "number" ? json.emailUsage.limit : 5
                );
                setEmailUsageRemaining(
                    typeof json.emailUsage.remaining === "number"
                        ? json.emailUsage.remaining
                        : null
                );
            }

            if (kind === "billing") {
                addManualEvent({
                    type: "billing_recovery_email_sent",
                    source: "manual",
                    meta: { amount: account.mrr },
                });
            } else if (kind === "inactive") {
                addManualEvent({
                    type: "reengagement_email_sent",
                    source: "manual",
                    meta: { amount: account.mrr },
                });
            } else {
                addManualEvent({
                    type: "checkin_email_sent",
                    source: "manual",
                    meta: { amount: account.mrr },
                });
            }

            closeEmailModal();
        } catch (e: any) {
            const message = e?.message || "Couldn’t send email";

            if (
                message.includes("Starter email limit reached") ||
                message.includes("Upgrade to Pro")
            ) {
                closeEmailModal();
                setUpgradeContext("email");
                setShowUpgradeModal(true);
                return;
            }

            setSendErr(message);
        } finally {
            setSendingEmail(false);
        }
    }

    async function runRetryPayment() {
        if (!account) return;

        setRunningRetryPayment(true);
        setSendErr(null);

        try {
            const res = await authedFetch(`/api/automation/retry-payment`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    accountId: account.id,
                    customerId: details?.customerId || null,
                }),
            });

            const json = await res.json();

            if (!res.ok || !json?.ok) {
                if (json?.code === "PRO_FEATURE_REQUIRED") {
                    setUpgradeContext("pro-feature");
                    setShowUpgradeModal(true);
                    return;
                }

                throw new Error(json?.error || "Failed to retry payment");
            }

            addManualEvent({
                type: "billing_issue_detected",
                source: "manual",
                meta: { amount: account.mrr, rawLabel: "Retry payment requested" },
            });
        } catch (e: any) {
            setSendErr(e?.message || "Couldn’t retry payment");
        } finally {
            setRunningRetryPayment(false);
        }
    }

    async function runSendNotification() {
        if (!account) return;

        setRunningNotification(true);
        setSendErr(null);

        try {
            const res = await authedFetch(`/api/automation/send-notification`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    accountId: account.id,
                    customerId: details?.customerId || null,
                    title: `Important update for ${account.companyName}`,
                    message: `We noticed an important account issue and wanted to notify you promptly. Please review your account or contact support if you need help.`,
                }),
            });

            const json = await res.json();

            if (!res.ok || !json?.ok) {
                if (json?.code === "PRO_FEATURE_REQUIRED") {
                    setUpgradeContext("pro-feature");
                    setShowUpgradeModal(true);
                    return;
                }

                throw new Error(json?.error || "Failed to send notification");
            }

            addManualEvent({
                type: "account_reviewed",
                source: "manual",
                meta: { rawLabel: "Notification sent to customer" },
            });
        } catch (e: any) {
            setSendErr(e?.message || "Couldn’t send notification");
        } finally {
            setRunningNotification(false);
        }
    }

    const computedEvents = useMemo<AccountTimelineEvent[]>(() => {
        if (!account) return [];

        const items: AccountTimelineEvent[] = [];

        if (Array.isArray(details?.profile?.paymentHistory)) {
            details.profile.paymentHistory.forEach((p) => {
                const status = (p.status || "").toLowerCase();
                const labelText = (p.label || "").toLowerCase();

                if (status.includes("fail") || labelText.includes("fail")) {
                    items.push({
                        id: createId(),
                        type: "payment_failed",
                        date: p.at || new Date().toISOString(),
                        source: "stripe",
                        meta: { amount: p.amount ?? account.mrr },
                    });
                    return;
                }

                if (labelText.includes("upgrade")) {
                    items.push({
                        id: createId(),
                        type: "plan_upgraded",
                        date: p.at || new Date().toISOString(),
                        source: "stripe",
                        meta: { planName: details?.profile?.plan || undefined },
                    });
                    return;
                }

                if (status.includes("success") || status.includes("paid")) {
                    items.push({
                        id: createId(),
                        type: "payment_successful",
                        date: p.at || new Date().toISOString(),
                        source: "stripe",
                        meta: { amount: p.amount ?? account.mrr },
                    });
                }
            });
        }

        if ((account.reasonLabel || "").toLowerCase().includes("billing")) {
            items.push({
                id: createId(),
                type: "billing_issue_detected",
                date: account.updatedAt || new Date().toISOString(),
                source: "system",
                meta: { amount: account.mrr },
            });
        }

        if (account.lastActiveAt) {
            const inactive = daysAgo(account.lastActiveAt) ?? 0;
            if (inactive >= 7) {
                items.push({
                    id: createId(),
                    type: "inactivity_detected",
                    date: account.lastActiveAt,
                    source: "app",
                    meta: { inactiveDays: inactive },
                });
            }
        }

        if (account.riskTrend === "up") {
            items.push({
                id: createId(),
                type: "risk_increased",
                date: account.updatedAt,
                source: "system",
                meta: { riskScore: account.riskScore },
            });
        } else if (account.riskTrend === "down") {
            items.push({
                id: createId(),
                type: "risk_decreased",
                date: account.updatedAt,
                source: "system",
                meta: { riskScore: account.riskScore },
            });
        }

        return dedupeEvents(items).filter((item) => isWithinLast30Days(item.date));
    }, [account, details]);

    const timeline = useMemo(() => {
        return dedupeEvents([...computedEvents, ...manualEvents])
            .filter((item) => isWithinLast30Days(item.date))
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 6);
    }, [computedEvents, manualEvents]);

    if (loading) {
        return (
            <div className={styles.page}>
                <div className={styles.empty}>Loading…</div>
            </div>
        );
    }

    if (err || !account) {
        return (
            <div className={styles.page}>
                <div className={styles.topBar}>
                    <button className={styles.backBtn} onClick={() => router.back()}>
                        Back
                    </button>
                </div>
                <div className={styles.empty}>{err || "Account not found."}</div>
            </div>
        );
    }

    const liveInsight = getLiveInsight(details);
    const insight = liveInsight || buildInsight(account, timeline, details);
    const confidenceTone = getConfidenceTone(insight.confidence);

    const actionToEmailKind = (key: RecommendedAction["key"]) => {
        if (key === "billing") return "billing";
        if (key === "inactive") return "inactive";
        return "checkin";
    };

    const planMeta = getPlanDisplay(details);
    const outcomeState = getOutcomeState(account, timeline);

    const recoveredRevenue =
        outcomeState.label === "Saved"
            ? account.mrr
            : timeline.some((e) => e.type === "payment_successful")
                ? account.mrr
                : 0;

    const exposedRevenue =
        outcomeState.label === "Saved" || outcomeState.label === "Lost" ? 0 : account.mrr;

    const lastIntervention =
        timeline.find(
            (e) =>
                e.type === "billing_recovery_email_sent" ||
                e.type === "billing_recovery_email_opened" ||
                e.type === "reengagement_email_sent" ||
                e.type === "reengagement_email_opened" ||
                e.type === "checkin_email_sent" ||
                e.type === "followup_call_connected" ||
                e.type === "followup_call_no_response"
        ) || null;

    return (
        <>
            <div className={styles.page}>
                <div className={styles.topBar}>
                    <button className={styles.backBtn} onClick={() => router.back()}>
                        Back
                    </button>
                </div>

                <div className={styles.header}>
                    <div>
                        <h1 className={styles.title}>{account.companyName}</h1>
                        {account.email ? <div className={styles.email}>{account.email}</div> : null}
                    </div>
                </div>

                <div className={styles.kpiRow}>
                    <div className={`${styles.kpiCard} ${styles.kpiNeutral}`}>
                        <div className={styles.kpiLabel}>MRR at risk</div>
                        <div className={styles.kpiValue}>{formatMoney(account.mrr)}</div>
                        <div className={styles.kpiSub}>{formatAnnualValue(account.mrr)} annualized exposure</div>
                    </div>

                    <div
                        className={`${styles.kpiCard} ${styles[`kpi${getRiskTone(account.riskScore).charAt(0).toUpperCase()}${getRiskTone(account.riskScore).slice(1)}`]}`}
                    >
                        <div className={styles.kpiLabel}>Risk</div>
                        <div className={styles.kpiValue}>{account.riskScore}</div>
                        <div className={styles.kpiSubStrong}>{riskLabelFromScore(account.riskScore)}</div>
                        <div className={styles.kpiSub}>{getRiskDeltaDisplay(account.riskTrend, account.riskDelta)}</div>
                    </div>

                    <div className={styles.kpiCard}>
                        <div className={styles.kpiLabel}>Plan</div>
                        <div className={styles.kpiValueSmall}>{planMeta.label}</div>
                        <div className={styles.kpiSub}>{planMeta.sub}</div>
                    </div>

                    <div className={`${styles.kpiCard} ${getOutcomeToneClassName(outcomeState.tone)}`}>
                        <div className={styles.kpiLabel}>Outcome</div>
                        <div className={styles.kpiValueSmall}>{outcomeState.label}</div>
                        <div className={styles.kpiSub}>{outcomeState.sub}</div>
                    </div>
                </div>

                <div className={styles.mainGrid}>
                    <section className={`${styles.card} ${styles.whatsHappeningCard}`}>
                        <div className={styles.sectionLabel}>What’s happening</div>

                        <div className={styles.aiHeadlineRow}>
                            <div className={styles.aiHeadlineWrap}>
                                <div className={styles.aiHeadline}>{insight.headline}</div>
                                <div className={styles.aiRevenue}>
                                    {formatMoney(account.mrr)} revenue at risk • {formatAnnualValue(account.mrr)} annualized
                                </div>
                                {tier !== "pro" ? (
                                    <div className={styles.kpiSub} style={{ marginTop: 8 }}>
                                        {typeof emailUsageRemaining === "number"
                                            ? emailUsageRemaining === 0
                                                ? "Starter email limit reached. Upgrade to Pro for unlimited email actions."
                                                : `${emailUsageRemaining} of ${emailUsageLimit ?? 5} email actions remaining on Starter.`
                                            : "Starter includes up to 5 email actions. Upgrade to Pro for unlimited email actions."}
                                    </div>
                                ) : null}
                            </div>

                            <div
                                className={`${styles.aiConfidenceBadge} ${confidenceTone === "high"
                                    ? styles.aiConfidenceHigh
                                    : confidenceTone === "medium"
                                        ? styles.aiConfidenceMedium
                                        : styles.aiConfidenceLow
                                    }`}
                            >
                                Confidence: {insight.confidence}%
                            </div>
                        </div>

                        <div className={styles.bodyText}>{insight.summary}</div>

                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                                gap: 12,
                                marginTop: 16,
                                marginBottom: 16,
                            }}
                        >
                            <div className={styles.nextActionCard}>
                                <div className={styles.nextActionLabel}>Revenue exposed</div>
                                <div className={styles.nextActionValue}>{formatMoney(exposedRevenue)}</div>
                            </div>

                            <div className={styles.nextActionCard}>
                                <div className={styles.nextActionLabel}>Revenue recovered</div>
                                <div className={styles.nextActionValue}>{formatMoney(recoveredRevenue)}</div>
                            </div>

                            <div className={styles.nextActionCard}>
                                <div className={styles.nextActionLabel}>Current outcome</div>
                                <div className={styles.nextActionValue}>{outcomeState.label}</div>
                            </div>

                            <div className={styles.nextActionCard}>
                                <div className={styles.nextActionLabel}>Last intervention</div>
                                <div className={styles.nextActionValue}>
                                    {lastIntervention ? eventToLabel(lastIntervention) : "No intervention yet"}
                                </div>
                            </div>
                        </div>

                        {insight.drivers.length ? (
                            <div className={styles.insightBlock}>
                                <div className={styles.inlineActionsTitle}>Why this account is at risk</div>
                                <ul className={styles.list}>
                                    {insight.drivers.map((item, i) => (
                                        <li key={i}>{item}</li>
                                    ))}
                                </ul>
                            </div>
                        ) : null}

                        <div className={styles.nextActionCard}>
                            <div className={styles.nextActionLabel}>Next best action</div>
                            <div className={styles.nextActionValue}>{insight.nextBestAction}</div>
                        </div>

                        <div className={styles.inlineActionsBlock}>
                            <div className={styles.inlineActionsTitle}>Recommended actions</div>

                            <div className={styles.actions}>
                                {insight.recommendedActions.map((action, index) => (
                                    <button
                                        key={action.key}
                                        className={index === 0 ? styles.actionBtnPrimary : styles.actionBtn}
                                        onClick={() => openEmailModal(actionToEmailKind(action.key))}
                                        type="button"
                                    >
                                        <span className={styles.actionBtnTitle}>{action.automationLabel}</span>
                                        <span className={styles.actionBtnSub}>{action.reason}</span>
                                    </button>
                                ))}

                                <button
                                    className={styles.actionBtn}
                                    onClick={runRetryPayment}
                                    type="button"
                                    disabled={runningRetryPayment}
                                >
                                    <span className={styles.actionBtnTitle}>
                                        {runningRetryPayment ? "Running..." : "Retry payment"}
                                    </span>
                                    <span className={styles.actionBtnSub}>
                                        Recover failed billing automatically
                                    </span>
                                </button>

                                <button
                                    className={styles.actionBtn}
                                    onClick={runSendNotification}
                                    type="button"
                                    disabled={runningNotification}
                                >
                                    <span className={styles.actionBtnTitle}>
                                        {runningNotification ? "Sending..." : "Send notification"}
                                    </span>
                                    <span className={styles.actionBtnSub}>
                                        Send an instant customer notification
                                    </span>
                                </button>
                            </div>
                        </div>
                    </section>

                    <section className={`${styles.card} ${styles.accountLogCard}`}>
                        <div className={styles.sectionLabel}>Recent risk activity</div>
                        <div className={styles.accountLogTitle}>Last 30 days</div>
                        <div className={styles.accountLogSub}>Signal → action → response → outcome</div>

                        <div className={styles.accountLogTable}>
                            <div className={styles.accountLogHead}>
                                <div>Event</div>
                                <div>Date</div>
                            </div>

                            {timeline.length ? (
                                timeline.map((event) => (
                                    <div key={event.id} className={styles.accountLogRow}>
                                        <div className={styles.accountLogActionText}>{eventToLabel(event)}</div>
                                        <div className={styles.accountLogDate}>{niceDateTime(event.date)}</div>
                                    </div>
                                ))
                            ) : (
                                <div className={styles.accountLogEmpty}>No recent account activity in the last 30 days.</div>
                            )}
                        </div>
                    </section>
                </div>

              
                 
              
            </div>

            <EmailModalPortal open={emailModal.open}>
                <div className={styles.modalOverlay} onClick={closeEmailModal}>
                    <div className={styles.emailModal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.emailModalHeader}>
                            <div>
                                <div className={styles.emailEyebrow}>Email automation</div>
                                <div className={styles.emailModalTitle}>Compose email</div>
                                <div className={styles.emailModalSub}>
                                    {account.companyName}
                                    {account.email ? ` • ${account.email}` : ""}
                                </div>
                            </div>

                            <button className={styles.emailCloseBtn} onClick={closeEmailModal} type="button">
                                ×
                            </button>
                        </div>

                        <div className={styles.emailShell}>
                            <div className={styles.emailField}>
                                <label className={styles.emailLabel}>To</label>
                                <input className={styles.emailInput} value={account.email || ""} readOnly />
                            </div>

                            <div className={styles.emailField}>
                                <label className={styles.emailLabel}>Subject</label>
                                <input
                                    className={styles.emailInput}
                                    value={emailSubject}
                                    onChange={(e) => setEmailSubject(e.target.value)}
                                    placeholder="Email subject"
                                />
                            </div>

                            <div className={styles.emailField}>
                                <label className={styles.emailLabel}>Message</label>
                                <textarea
                                    className={styles.emailTextarea}
                                    value={emailBody}
                                    onChange={(e) => setEmailBody(e.target.value)}
                                    placeholder="Write your email..."
                                />
                            </div>

                            {sendErr ? <div className={styles.emailError}>{sendErr}</div> : null}

                            {tier !== "pro" ? (
                                <div className={styles.kpiSub} style={{ marginBottom: 12 }}>
                                    {typeof emailUsageRemaining === "number"
                                        ? emailUsageRemaining === 0
                                            ? "Starter email limit reached. Upgrade to Pro for unlimited email actions."
                                            : `${emailUsageRemaining} of ${emailUsageLimit ?? 5} email actions remaining on Starter.`
                                        : "Starter includes up to 5 email actions. Upgrade to Pro for unlimited email actions."}
                                </div>
                            ) : null}

                            <div className={styles.emailModalActions}>
                                <button className={styles.emailCancelBtn} type="button" onClick={closeEmailModal}>
                                    Cancel
                                </button>
                                <button
                                    className={styles.emailSendBtn}
                                    type="button"
                                    onClick={sendEmail}
                                    disabled={sendingEmail}
                                >
                                    {sendingEmail ? "Sending..." : "Send email"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </EmailModalPortal>

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
                        zIndex: 1000,
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
                            {upgradeContext === "email"
                                ? "Upgrade for unlimited email actions"
                                : "Upgrade to access Pro automations"}
                        </h3>

                        <p
                            style={{
                                margin: "12px 0 0",
                                fontSize: 15,
                                lineHeight: 1.65,
                                color: "#5f6b7a",
                            }}
                        >
                            {upgradeContext === "email"
                                ? `You’ve used all ${STARTER_EMAIL_LIMIT} email actions included in Starter. Upgrade to Pro to keep sending recovery, re-engagement, and check-in emails without limits.`
                                : "Retry payment and send notification are available on Pro. Upgrade to unlock advanced retention actions and automations."}
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
        </>
    );
}