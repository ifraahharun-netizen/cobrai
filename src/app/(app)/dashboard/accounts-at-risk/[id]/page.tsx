"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useParams, useRouter } from "next/navigation";
import styles from "./riskAccounts.module.css";

import { onAuthStateChanged, type User } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase.client";
import type { PlanTier } from "@/lib/permissions";
import { getEmailRecommendation } from "@/lib/emailRecommendations";
import type { ActionFirstRecommendation, Insight } from "@/lib/ai/types";

type RiskLevel = "critical" | "high" | "medium" | "low";

type Signal = { key: string; label: string };

type TimelineEventType =
    | "payment_failed"
    | "payment_successful"
    | "billing_issue_detected"
    | "billing_recovery_email_sent"
    | "billing_recovery_email_opened"
    | "reengagement_email_sent"
    | "reengagement_email_opened"
    | "checkin_email_sent"
    | "plan_upgraded"
    | "risk_increased"
    | "risk_decreased"
    | "inactivity_detected"
    | "usage_dropped"
    | "account_reviewed"
    | "generic";

type AccountActivity = {
    id: string;
    type: TimelineEventType | string;
    label: string;
    date: string;
};

type AiWorkspaceRes = {
    insights: Insight[];
    actions: ActionFirstRecommendation[];
    cached: boolean;
    source: "ai" | "fallback" | "cache" | "fallback_after_error";
    timeframe: string;
    promptVersion: string;
};

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

type RecommendedAction = {
    key: "billing" | "inactive" | "checkin";
    label: string;
    reason: string;
    automationLabel: string;
};

type RiskDetails = {
    ok: boolean;
    error?: string;
    customerId?: string | null;
    activity?: AccountActivity[];
    profile?: {
        companyName?: string;
        email?: string;
        plan?: string;
        startDate?: string | null;
        createdAt?: string | null;
        nextBillingAt?: string | null;
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

type EmailSender = {
    companyName: string;
    senderName: string;
    senderEmail: string | null;
    replyTo: string | null;
    sendingDomain?: string | null;
    verified: boolean;
};

type AccountTimelineEvent = {
    id: string;
    type: TimelineEventType;
    date: string;
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

type AccountNote = {
    id: string;
    text: string;
    createdAt: string;
    updatedAt: string;
};

const STARTER_EMAIL_LIMIT = 5;
const ACTIVITY_PAGE_SIZE = 3;

function formatMoney(value: number) {
    return `£${Number(value || 0).toLocaleString(undefined, {
        maximumFractionDigits: 0,
    })}`;
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

    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    return days < 0 ? 0 : days;
}

function isCurrentMonth(iso?: string | null) {
    if (!iso) return false;

    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return false;

    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

function riskLevelFromScore(score: number): RiskLevel {
    if (score >= 85) return "critical";
    if (score >= 70) return "high";
    if (score >= 50) return "medium";
    return "low";
}

function riskLabelFromScore(score: number) {
    if (score >= 85) return "Critical risk";
    if (score >= 70) return "High risk";
    if (score >= 50) return "Medium risk";
    return "Low risk";
}

function isDemoAccount(id: string) {
    return id.startsWith("demo-");
}

function createId() {
    return (
        globalThis.crypto?.randomUUID?.() ??
        `${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
}

function eventToLabel(event: AccountTimelineEvent) {
    switch (event.type) {
        case "payment_failed":
            return event.meta?.amount
                ? `Payment failed for ${formatMoney(event.meta.amount)}`
                : event.meta?.rawLabel || "Payment failed";

        case "payment_successful":
            return event.meta?.amount
                ? `Payment successful for ${formatMoney(event.meta.amount)}`
                : event.meta?.rawLabel || "Payment successful";

        case "billing_issue_detected":
            return event.meta?.rawLabel || "Billing issue detected";

        case "billing_recovery_email_sent":
            return event.meta?.rawLabel || "Billing recovery email sent";

        case "billing_recovery_email_opened":
            return event.meta?.rawLabel || "Billing recovery email opened";

        case "reengagement_email_sent":
            return event.meta?.rawLabel || "Re-engagement email sent";

        case "reengagement_email_opened":
            return event.meta?.rawLabel || "Re-engagement email opened";

        case "checkin_email_sent":
            return event.meta?.rawLabel || "Customer check-in email sent";

        case "plan_upgraded":
            return event.meta?.planName
                ? `Plan upgraded to ${event.meta.planName}`
                : event.meta?.rawLabel || "Plan upgraded";

        case "risk_increased":
            return event.meta?.riskScore
                ? `Risk score increased to ${event.meta.riskScore}`
                : event.meta?.rawLabel || "Risk score increased";

        case "risk_decreased":
            return event.meta?.riskScore
                ? `Risk score decreased to ${event.meta.riskScore}`
                : event.meta?.rawLabel || "Risk score decreased";

        case "inactivity_detected":
            return event.meta?.inactiveDays
                ? `No activity for ${event.meta.inactiveDays} days`
                : event.meta?.rawLabel || "Account inactivity detected";

        case "usage_dropped":
            return event.meta?.rawLabel || "Usage dropped";

        case "account_reviewed":
            return event.meta?.rawLabel || "Customer health reviewed by Cobrai";

        default:
            return event.meta?.rawLabel || "Account activity updated";
    }
}

function eventTone(event: AccountTimelineEvent) {
    const type = String(event.type).toLowerCase();
    const label = String(event.meta?.rawLabel || "").toLowerCase();

    if (type.includes("failed") || label.includes("failed") || label.includes("past due")) {
        return "Needs attention";
    }

    if (type.includes("payment_successful") || label.includes("successful") || label.includes("paid")) {
        return "Positive";
    }

    if (type.includes("email") || label.includes("email")) {
        return "Action sent";
    }

    if (type.includes("risk") || label.includes("risk")) {
        return "Risk update";
    }

    return "Activity";
}

function buildAiSummaryFromTimeline(account: RiskRow, timeline: AccountTimelineEvent[]) {
    const latest = timeline[0];

    const hasFailedPayment = timeline.some((e) => {
        const label = eventToLabel(e).toLowerCase();
        return label.includes("failed") || label.includes("past due");
    });

    const hasEmailSent = timeline.some((e) => {
        const label = eventToLabel(e).toLowerCase();
        return label.includes("email sent") || label.includes("email");
    });

    if (hasFailedPayment && !hasEmailSent) {
        return "Payment risk is the strongest signal for this account. A failed or unresolved billing event was recorded, but no recovery email appears to have been sent yet. Recommended action: send a billing recovery email today.";
    }

    if (hasFailedPayment && hasEmailSent) {
        return "This account has billing risk, but a recovery action has already been sent. Recommended action: monitor for payment recovery and follow up manually if there is no response.";
    }

    if (latest) {
        return `Latest signal: ${eventToLabel(latest)}. Cobrai recommends reviewing this account because it currently has a ${riskLabelFromScore(account.riskScore).toLowerCase()} score of ${account.riskScore}/100.`;
    }

    return `${riskLabelFromScore(account.riskScore)} detected from ${account.reasonLabel.toLowerCase()}. Recommended action: ${account.nextAction || "send a check-in email"}.`;
}

function dedupeEvents(events: AccountTimelineEvent[]) {
    return events.filter((item, index, arr) => {
        const sig = `${item.type}|${item.date}|${item.meta?.rawLabel || ""}|${item.meta?.planName || ""}|${item.meta?.riskScore || ""}|${item.meta?.inactiveDays || ""}|${item.meta?.amount || ""}`;

        return (
            arr.findIndex((x) => {
                const xSig = `${x.type}|${x.date}|${x.meta?.rawLabel || ""}|${x.meta?.planName || ""}|${x.meta?.riskScore || ""}|${x.meta?.inactiveDays || ""}|${x.meta?.amount || ""}`;
                return xSig === sig;
            }) === index
        );
    });
}

function buildDemoTimeline(account: RiskRow | null): AccountTimelineEvent[] {
    if (!account) return [];

    const now = Date.now();
    const reason = (account.reasonLabel || "").toLowerCase();

    const items: AccountTimelineEvent[] = [
        {
            id: createId(),
            type: "account_reviewed",
            date: new Date(now - 1000 * 60 * 60 * 3).toISOString(),
        },
    ];

    if (reason.includes("billing")) {
        items.push(
            {
                id: createId(),
                type: "billing_issue_detected",
                date: new Date(now - 1000 * 60 * 60 * 22).toISOString(),
                meta: { amount: account.mrr },
            },
            {
                id: createId(),
                type: "billing_recovery_email_sent",
                date: new Date(now - 1000 * 60 * 60 * 5).toISOString(),
                meta: { amount: account.mrr },
            }
        );
    } else if (reason.includes("inactive") || reason.includes("usage")) {
        items.push(
            {
                id: createId(),
                type: "usage_dropped",
                date: new Date(now - 1000 * 60 * 60 * 24 * 5).toISOString(),
            },
            {
                id: createId(),
                type: "reengagement_email_sent",
                date: new Date(now - 1000 * 60 * 60 * 6).toISOString(),
                meta: { amount: account.mrr },
            }
        );
    } else {
        items.push({
            id: createId(),
            type: "checkin_email_sent",
            date: new Date(now - 1000 * 60 * 60 * 8).toISOString(),
            meta: { amount: account.mrr },
        });
    }

    return dedupeEvents(items).sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
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

    return {
        id,
        companyName: details.profile?.companyName || "Unknown account",
        email: details.profile?.email || undefined,
        riskScore,
        riskLevel: riskLevelFromScore(riskScore),
        reasonKey: inferredBilling ? "billing_risk" : inferredInactive ? "inactive_user" : "general_risk",
        reasonLabel,
        riskTrend: "flat",
        riskDelta: 0,
        status: inferredBilling ? "invoice open" : inferredInactive ? "at risk" : "active",
        lastActiveAt: null,
        signals: [],
        nextAction: details.ai?.nextBestAction || "Send check-in email",
        mrr: inferredMrr,
        updatedAt: new Date().toISOString(),
    };
}

function getPlanDisplay(details: RiskDetails | null) {
    const rawPlan = details?.profile?.plan?.trim();
    return rawPlan && rawPlan !== "—" ? rawPlan : "—";
}

function getCreatedAt(account: RiskRow, details: RiskDetails | null) {
    return details?.profile?.createdAt || details?.profile?.startDate || account.updatedAt || null;
}

function getNextBilling(account: RiskRow, details: RiskDetails | null) {
    if (details?.profile?.nextBillingAt) return details.profile.nextBillingAt;

    const latestPayment = Array.isArray(details?.profile?.paymentHistory)
        ? details?.profile?.paymentHistory?.[0]
        : null;

    if (latestPayment?.at) {
        const d = new Date(latestPayment.at);
        if (!Number.isNaN(d.getTime())) {
            d.setMonth(d.getMonth() + 1);
            return d.toISOString();
        }
    }

    if (account.updatedAt) {
        const d = new Date(account.updatedAt);
        if (!Number.isNaN(d.getTime())) {
            d.setMonth(d.getMonth() + 1);
            return d.toISOString();
        }
    }

    return null;
}

function getRecommendedActions(account: RiskRow, details: RiskDetails | null): RecommendedAction[] {
    if (Array.isArray(details?.ai?.recommendedActions) && details.ai.recommendedActions.length) {
        return details.ai.recommendedActions;
    }

    const reason = `${account.reasonLabel} ${account.status || ""}`.toLowerCase();

    if (reason.includes("billing") || reason.includes("invoice") || reason.includes("payment")) {
        return [
            {
                key: "billing",
                label: "Recover payment",
                reason: "Billing issue is increasing churn risk.",
                automationLabel: "Send billing email",
            },
            {
                key: "checkin",
                label: "Human check-in",
                reason: "A personal check-in can help prevent cancellation.",
                automationLabel: "Send check-in email",
            },
        ];
    }

    if (reason.includes("inactive") || reason.includes("usage") || reason.includes("activity")) {
        return [
            {
                key: "inactive",
                label: "Re-engage account",
                reason: "Low activity suggests the customer may not be getting enough value.",
                automationLabel: "Send re-engagement email",
            },
            {
                key: "checkin",
                label: "Offer walkthrough",
                reason: "A walkthrough can help the customer return to value faster.",
                automationLabel: "Send check-in email",
            },
        ];
    }

    return [
        {
            key: "checkin",
            label: "Check in",
            reason: "This account has elevated churn risk and needs a personal touch.",
            automationLabel: "Send check-in email",
        },
    ];
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
    const [workspaceAi, setWorkspaceAi] = useState<AiWorkspaceRes | null>(null);

    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    const [tier, setTier] = useState<PlanTier>("starter");
    const [emailUsageLimit, setEmailUsageLimit] = useState<number | null>(null);
    const [emailUsageRemaining, setEmailUsageRemaining] = useState<number | null>(null);
    const [emailSender, setEmailSender] = useState<EmailSender | null>(null);

    const [emailModal, setEmailModal] = useState<EmailModalState>({ open: false, kind: null });
    const [emailSubject, setEmailSubject] = useState("");
    const [emailBody, setEmailBody] = useState("");
    const [sendingEmail, setSendingEmail] = useState(false);
    const [sendErr, setSendErr] = useState<string | null>(null);
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);

    const [activityPage, setActivityPage] = useState(1);
    const [notes, setNotes] = useState<AccountNote[]>([]);
    const [noteText, setNoteText] = useState("");
    const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
    const [instantActivity, setInstantActivity] = useState<AccountActivity[]>([]);

    useEffect(() => {
        const auth = getFirebaseAuth();
        const unsub = onAuthStateChanged(auth, (u) => setUser(u));
        return () => unsub();
    }, []);

    useEffect(() => {
        setInstantActivity([]);
        setWorkspaceAi(null);
    }, [id]);

    useEffect(() => {
        if (!id) return;

        try {
            const stored = window.localStorage.getItem(`cobrai-account-notes-${id}`);
            setNotes(stored ? JSON.parse(stored) : []);
        } catch {
            setNotes([]);
        }
    }, [id]);

  

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

    async function authedPost(url: string, body?: unknown) {
        const token = user ? await user.getIdToken() : null;

        return fetch(url, {
            method: "POST",
            cache: "no-store",
            headers: {
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body ?? {}),
        });
    }

    useEffect(() => {
        if (!user) return;

        let cancelled = false;

        async function loadTierUsageAndSender() {
            try {
                const [summaryRes, usageRes, senderRes] = await Promise.all([
                    authedFetch("/api/dashboard/summary"),
                    authedFetch("/api/automation/email-usage"),
                    authedFetch("/api/automation/send-email"),
                ]);

                const summaryJson = (await summaryRes.json()) as DashboardSummaryResponse;
                const usageJson = (await usageRes.json()) as EmailUsageResponse;
                const senderJson = await senderRes.json();

                if (cancelled) return;

                setTier(summaryJson?.tier === "pro" ? "pro" : "starter");

                if (usageJson?.ok && usageJson?.tier === "starter") {
                    setEmailUsageLimit(
                        typeof usageJson.emailUsage?.limit === "number"
                            ? usageJson.emailUsage.limit
                            : STARTER_EMAIL_LIMIT
                    );
                    setEmailUsageRemaining(
                        typeof usageJson.emailUsage?.remaining === "number"
                            ? usageJson.emailUsage.remaining
                            : null
                    );
                }

                if (senderJson?.ok && senderJson.sender) {
                    setEmailSender(senderJson.sender);
                }
            } catch {
                if (!cancelled) setTier("starter");
            }
        }

        loadTierUsageAndSender();

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
                const [detailsRes, aiRes] = await Promise.allSettled([
                    authedFetch(`/api/dashboard/accounts-at-risk/${encodeURIComponent(id)}`),
                    authedPost("/api/dashboard/ai/insights", { timeframe: "week" }),
                ]);

                if (aiRes.status === "fulfilled" && aiRes.value.ok) {
                    const aiJson = (await aiRes.value.json()) as AiWorkspaceRes;
                    if (!cancelled) setWorkspaceAi(aiJson);
                } else if (!cancelled) {
                    setWorkspaceAi(null);
                }

                if (detailsRes.status !== "fulfilled") {
                    throw new Error("Failed to load account");
                }

                const detailsJson = (await detailsRes.value.json()) as RiskDetails;

                if (!detailsRes.value.ok || !detailsJson?.ok) {
                    throw new Error(detailsJson?.error || "Failed to load account");
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
                    setWorkspaceAi(null);
                    setErr(e?.message || "Something went wrong");
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        load();

        return () => {
            cancelled = true;
        };
    }, [id, user]);

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
                        meta: { amount: p.amount ?? account.mrr, rawLabel: p.label },
                    });
                    return;
                }

                if (labelText.includes("upgrade")) {
                    items.push({
                        id: createId(),
                        type: "plan_upgraded",
                        date: p.at || new Date().toISOString(),
                        meta: { planName: details?.profile?.plan || undefined, rawLabel: p.label },
                    });
                    return;
                }

                if (
                    status.includes("success") ||
                    status.includes("paid") ||
                    labelText.includes("payment")
                ) {
                    items.push({
                        id: createId(),
                        type: "payment_successful",
                        date: p.at || new Date().toISOString(),
                        meta: { amount: p.amount ?? account.mrr, rawLabel: p.label },
                    });
                }
            });
        }

        if (Array.isArray(details?.profile?.supportHistory)) {
            details.profile.supportHistory.forEach((item) => {
                items.push({
                    id: createId(),
                    type: "generic",
                    date: item.at || new Date().toISOString(),
                    meta: { rawLabel: item.label || "Customer activity recorded" },
                });
            });
        }

        if ((account.reasonLabel || "").toLowerCase().includes("billing")) {
            items.push({
                id: createId(),
                type: "billing_issue_detected",
                date: account.updatedAt || new Date().toISOString(),
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
                    meta: { inactiveDays: inactive },
                });
            }
        }

        if (account.riskTrend === "up") {
            items.push({
                id: createId(),
                type: "risk_increased",
                date: account.updatedAt,
                meta: { riskScore: account.riskScore },
            });
        } else if (account.riskTrend === "down") {
            items.push({
                id: createId(),
                type: "risk_decreased",
                date: account.updatedAt,
                meta: { riskScore: account.riskScore },
            });
        }

        return dedupeEvents(items).filter((item) => isCurrentMonth(item.date));
    }, [account, details]);

    const timeline = useMemo(() => {
        const apiActivity =
            Array.isArray(details?.activity) && details.activity.length > 0
                ? details.activity.map((item) => ({
                    id: item.id,
                    type: item.type as TimelineEventType,
                    date: item.date,
                    meta: { rawLabel: item.label },
                }))
                : [];

        const instantEvents = instantActivity.map((item) => ({
            id: item.id,
            type: item.type as TimelineEventType,
            date: item.date,
            meta: { rawLabel: item.label },
        }));

        const mergedApiEvents = dedupeEvents([...instantEvents, ...apiActivity])
            .filter((item) => isCurrentMonth(item.date))
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        if (mergedApiEvents.length > 0) return mergedApiEvents;

        const realEvents = dedupeEvents(computedEvents)
            .filter((item) => isCurrentMonth(item.date))
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        if (realEvents.length > 0) return realEvents;

        if (isDemoAccount(id) && account) {
            return buildDemoTimeline(account)
                .filter((item) => isCurrentMonth(item.date))
                .slice(0, 12);
        }

        return [];
    }, [details?.activity, instantActivity, computedEvents, account, id]);

    const accountAiAction = useMemo(() => {
        if (!account || !workspaceAi?.actions?.length) return null;

        return (
            workspaceAi.actions.find((action) => action.customerId === account.id) ||
            workspaceAi.actions.find((action) => action.customerName === account.companyName) ||
            null
        );
    }, [account, workspaceAi?.actions]);

    useEffect(() => {
        setActivityPage(1);
    }, [id, timeline.length]);

    const totalActivityPages = Math.max(1, Math.ceil(timeline.length / ACTIVITY_PAGE_SIZE));

    const paginatedTimeline = useMemo(() => {
        const start = (activityPage - 1) * ACTIVITY_PAGE_SIZE;
        return timeline.slice(start, start + ACTIVITY_PAGE_SIZE);
    }, [activityPage, timeline]);

    function persistNotes(nextNotes: AccountNote[]) {
        if (!id) return;
        window.localStorage.setItem(`cobrai-account-notes-${id}`, JSON.stringify(nextNotes));
    }

    function saveNote() {
        const trimmed = noteText.trim();
        if (!trimmed) return;

        if (editingNoteId) {
            const nextNotes = notes.map((note) =>
                note.id === editingNoteId
                    ? { ...note, text: trimmed, updatedAt: new Date().toISOString() }
                    : note
            );

            setNotes(nextNotes);
            persistNotes(nextNotes);
            setEditingNoteId(null);
            setNoteText("");
            return;
        }

        const nextNotes = [
            {
                id: createId(),
                text: trimmed,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            },
            ...notes,
        ];

        setNotes(nextNotes);
        persistNotes(nextNotes);
        setNoteText("");
    }

    function deleteNote(noteId: string) {
        const nextNotes = notes.filter((note) => note.id !== noteId);

        setNotes(nextNotes);
        persistNotes(nextNotes);

        if (editingNoteId === noteId) {
            setEditingNoteId(null);
            setNoteText("");
        }
    }
    function startEditNote(note: AccountNote) {
        setEditingNoteId(note.id);
        setNoteText(note.text);
    }

    function cancelEditNote() {
        setEditingNoteId(null);
        setNoteText("");
    }

    function openEmailModal(kind: "billing" | "inactive" | "checkin") {
        if (!account) return;

        const reasonText =
            kind === "billing"
                ? `${account.reasonLabel} billing invoice payment failed`
                : kind === "inactive"
                    ? `${account.reasonLabel} usage inactive activity dropped`
                    : account.reasonLabel || "retention follow-up";

        const recommendation = getEmailRecommendation({
            accountName: account.companyName,
            reason: accountAiAction
                ? `${accountAiAction.actionTitle} ${accountAiAction.reason}`
                : reasonText,
            senderName: emailSender?.senderName || user?.displayName || "Team",
            companyName: emailSender?.companyName || "Your company",
        });

        setEmailSubject(recommendation.subject);
        setEmailBody(recommendation.message);
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

        if (!emailSender?.verified) {
            setSendErr("Your sending domain is not verified yet. Check Settings → Support & Compliance.");
            return;
        }

        setSendingEmail(true);
        setSendErr(null);

        try {
            const res = await authedFetch("/api/automation/send-email", {
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
                    setShowUpgradeModal(true);
                    return;
                }

                throw new Error(json?.error || "Failed to send email");
            }

            const instantLabel =
                emailModal.kind === "billing"
                    ? "Billing recovery email sent"
                    : emailModal.kind === "inactive"
                        ? "Re-engagement email sent"
                        : "Customer check-in email sent";

            const instantType =
                emailModal.kind === "billing"
                    ? "billing_recovery_email_sent"
                    : emailModal.kind === "inactive"
                        ? "reengagement_email_sent"
                        : "checkin_email_sent";

            setInstantActivity((prev) => [
                {
                    id: `instant-email-${json?.actionExecutionId || Date.now()}`,
                    type: instantType,
                    label: instantLabel,
                    date: new Date().toISOString(),
                },
                ...prev,
            ]);

            if (json?.tier === "pro") {
                setTier("pro");
                setEmailUsageLimit(null);
                setEmailUsageRemaining(null);
            } else if (json?.emailUsage) {
                setTier("starter");
                setEmailUsageLimit(
                    typeof json.emailUsage.limit === "number"
                        ? json.emailUsage.limit
                        : STARTER_EMAIL_LIMIT
                );
                setEmailUsageRemaining(
                    typeof json.emailUsage.remaining === "number"
                        ? json.emailUsage.remaining
                        : null
                );
            }

            closeEmailModal();
        } catch (e: any) {
            setSendErr(e?.message || "Couldn’t send email");
        } finally {
            setSendingEmail(false);
        }
    }

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

    const plan = getPlanDisplay(details);
    const createdAt = getCreatedAt(account, details);
    const nextBilling = getNextBilling(account, details);
    const lastActive = account.lastActiveAt ? niceDateTime(account.lastActiveAt) : "—";

    const recommendedActions = accountAiAction
        ? [
            {
                key:
                    accountAiAction.actionType === "send_billing_recovery_email"
                        ? "billing"
                        : accountAiAction.actionType === "send_reactivation_email"
                            ? "inactive"
                            : "checkin",
                label: accountAiAction.actionTitle,
                reason: accountAiAction.reason,
                automationLabel: accountAiAction.actionTitle,
            } satisfies RecommendedAction,
        ]
        : getRecommendedActions(account, details);

    const aiSummary = accountAiAction
        ? `${accountAiAction.actionTitle}: ${accountAiAction.reason}`
        : buildAiSummaryFromTimeline(account, timeline) ||
        details?.ai?.summary ||
        details?.ai?.recommendation ||
        `${riskLabelFromScore(account.riskScore)} detected from ${account.reasonLabel.toLowerCase()}. Recommended action: ${account.nextAction || "send a check-in email"}.`;

    function downloadAccountCsv() {
        if (!account) return;

        const rows = [
            ["Account", "Email", "Plan", "MRR", "Risk Score", "Status", "Created At", "Next Billing", "Last Active"],
            [
                account.companyName,
                account.email || "",
                plan,
                String(account.mrr),
                String(account.riskScore),
                account.status || "Active",
                niceDate(createdAt),
                niceDate(nextBilling),
                lastActive,
            ],
            [],
            ["This Month Activity"],
            ["Activity", "Date"],
            ...timeline.map((event) => [eventToLabel(event), niceDateTime(event.date)]),
            [],
            ["Notes"],
            ["Note", "Updated At"],
            ...notes.map((note) => [note.text, niceDateTime(note.updatedAt)]),
        ];

        const csv = rows
            .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
            .join("\n");

        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = `${account.companyName.replaceAll(" ", "-").toLowerCase()}-profile.csv`;
        a.click();

        URL.revokeObjectURL(url);
    }

    return (
        <>
            <div className={styles.page}>
                <div className={styles.topBar}>
                    <button className={styles.backBtn} onClick={() => router.back()}>
                        Back
                    </button>

                    <div className={styles.topRightActions}>
                        <button className={styles.downloadBtn} onClick={downloadAccountCsv} type="button">
                            Download CSV
                        </button>
                    </div>
                </div>

                <div className={styles.mainGrid}>
                    <section className={`${styles.card} ${styles.cleanOverviewCard}`}>
                        <div className={styles.sectionLabel}>Account overview</div>

                        <div className={styles.cleanProfileHeader}>
                            <div>
                                <h1 className={styles.cleanProfileName}>{account.companyName}</h1>
                                {account.email ? (
                                    <p className={styles.cleanProfileEmail}>{account.email}</p>
                                ) : null}
                            </div>

                            <span
                                className={`${styles.cleanRiskBadge} ${account.riskScore >= 85
                                    ? styles.cleanRiskDanger
                                    : account.riskScore >= 70
                                        ? styles.cleanRiskWarning
                                        : account.riskScore >= 50
                                            ? styles.cleanRiskMedium
                                            : styles.cleanRiskGood
                                    }`}
                            >
                                {riskLabelFromScore(account.riskScore)} · {account.riskScore}/100
                            </span>
                        </div>

                        <div className={styles.cleanProfileGrid}>
                            <div className={styles.cleanProfileItem}>
                                <span>Plan</span>
                                <strong>{plan}</strong>
                            </div>

                            <div className={styles.cleanProfileItem}>
                                <span>MRR</span>
                                <strong>{formatMoney(account.mrr)}</strong>
                            </div>

                            <div className={styles.cleanProfileItem}>
                                <span>Created at</span>
                                <strong>{niceDate(createdAt)}</strong>
                            </div>

                            <div className={styles.cleanProfileItem}>
                                <span>Next billing</span>
                                <strong>{niceDate(nextBilling)}</strong>
                            </div>

                            <div className={styles.cleanProfileItem}>
                                <span>Status</span>
                                <strong>{account.status || "Active"}</strong>
                            </div>

                            <div className={styles.cleanProfileItem}>
                                <span>Last active</span>
                                <strong>{lastActive}</strong>
                            </div>
                        </div>
                    </section>

                    <div className={styles.sideStack}>
                        <section className={`${styles.card} ${styles.cleanAiCard}`}>
                            <div className={styles.sectionLabel}>AI insight</div>

                            <div className={styles.cleanAiContent}>
                                <strong>Recommended action</strong>
                                <p>{aiSummary}</p>
                            </div>

                            <div className={styles.cleanAiContent}>
                                <strong>Automation</strong>

                                <div className={styles.cleanActionButtons}>
                                    {recommendedActions.map((action) => (
                                        <button
                                            key={action.key}
                                            type="button"
                                            className={styles.cleanActionBtn}
                                            onClick={() => openEmailModal(action.key)}
                                        >
                                            {action.automationLabel}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {!emailSender?.verified ? (
                                <p className={styles.cleanEmailLimitText}>
                                    Sending domain is not verified yet. Configure it in Settings before sending.
                                </p>
                            ) : tier !== "pro" ? (
                                <p className={styles.cleanEmailLimitText}>
                                    {typeof emailUsageRemaining === "number"
                                        ? `${emailUsageRemaining} of ${emailUsageLimit ?? STARTER_EMAIL_LIMIT
                                        } email actions remaining.`
                                        : `Starter includes ${STARTER_EMAIL_LIMIT} email actions.`}
                                </p>
                            ) : null}
                        </section>

                        <section className={`${styles.card} ${styles.notesCard}`}>
                            <div className={styles.sectionLabel}>Account notes</div>
                            <div className={styles.accountLogTitle}>Private notes</div>
                            <div className={styles.accountLogSub}>
                                Notes for your team on this account
                            </div>

                            <textarea
                                className={styles.notesTextarea}
                                value={noteText}
                                onChange={(e) => setNoteText(e.target.value)}
                                placeholder="Write a note for this account..."
                            />

                            <div className={styles.notesActions}>
                                {editingNoteId ? (
                                    <button className={styles.noteSecondaryBtn} type="button" onClick={cancelEditNote}>
                                        Cancel edit
                                    </button>
                                ) : null}

                                <button className={styles.notePrimaryBtn} type="button" onClick={saveNote}>
                                    {editingNoteId ? "Save note" : "Add note"}
                                </button>
                            </div>

                            <div className={styles.notesList}>
                                {notes.length ? (
                                    notes.map((note: AccountNote) => (
                                        <div key={note.id} className={styles.noteItem}>
                                            <p>{note.text}</p>
                                            <span>Updated {niceDateTime(note.updatedAt)}</span>

                                            <div className={styles.noteItemActions}>
                                                <button type="button" onClick={() => startEditNote(note)}>
                                                    Edit
                                                </button>
                                                <button type="button" onClick={() => deleteNote(note.id)}>
                                                    Delete
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className={styles.accountLogEmpty}>No notes yet.</div>
                                )}
                            </div>
                        </section>
                    </div>

                    <section className={`${styles.card} ${styles.accountLogCard}`}>
                        <div className={styles.sectionLabel}>Account Log</div>
                        <div className={styles.accountLogTitle}>Activity Timeline</div>
                        <div className={styles.accountLogSub}>
                            Payments, emails, and risk events.
                        </div>

                        <div className={styles.cleanActivityList}>
                            {paginatedTimeline.length ? (
                                paginatedTimeline.map((event) => (
                                    <div key={event.id} className={styles.cleanActivityRow}>
                                        <div className={styles.activityRowTop}>
                                            <strong>{eventToLabel(event)}</strong>
                                            <em>{eventTone(event)}</em>
                                        </div>
                                        <span>{niceDateTime(event.date)}</span>
                                    </div>
                                ))
                            ) : (
                                <div className={styles.accountLogEmpty}>
                                    No activity has been recorded this month.
                                </div>
                            )}
                        </div>

                        {timeline.length > ACTIVITY_PAGE_SIZE ? (
                            <div className={styles.pagination}>
                                <button
                                    type="button"
                                    onClick={() => setActivityPage((p) => Math.max(1, p - 1))}
                                    disabled={activityPage === 1}
                                >
                                    Previous
                                </button>

                                <span>
                                    Page {activityPage} of {totalActivityPages}
                                </span>

                                <button
                                    type="button"
                                    onClick={() =>
                                        setActivityPage((p) => Math.min(totalActivityPages, p + 1))
                                    }
                                    disabled={activityPage === totalActivityPages}
                                >
                                    Next
                                </button>
                            </div>
                        ) : null}
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
                                    From{" "}
                                    {emailSender?.senderEmail
                                        ? `${emailSender.senderName} <${emailSender.senderEmail}>`
                                        : emailSender?.senderName || "Team"}
                                    {account.email ? ` → ${account.email}` : ""}
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
                                />
                            </div>

                            <div className={styles.emailField}>
                                <label className={styles.emailLabel}>Message</label>
                                <textarea
                                    className={styles.emailTextarea}
                                    value={emailBody}
                                    onChange={(e) => setEmailBody(e.target.value)}
                                />
                            </div>

                            {sendErr ? <div className={styles.emailError}>{sendErr}</div> : null}

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
                <div className={styles.modalOverlay} onClick={() => setShowUpgradeModal(false)}>
                    <div className={styles.emailModal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.emailModalHeader}>
                            <div>
                                <div className={styles.emailEyebrow}>Upgrade</div>
                                <div className={styles.emailModalTitle}>Email limit reached</div>
                                <div className={styles.emailModalSub}>
                                    Upgrade to Pro to keep sending retention emails.
                                </div>
                            </div>

                            <button
                                className={styles.emailCloseBtn}
                                onClick={() => setShowUpgradeModal(false)}
                                type="button"
                            >
                                ×
                            </button>
                        </div>

                        <div className={styles.emailModalActions}>
                            <button
                                className={styles.emailCancelBtn}
                                type="button"
                                onClick={() => setShowUpgradeModal(false)}
                            >
                                Not now
                            </button>
                            <button
                                className={styles.emailSendBtn}
                                type="button"
                                onClick={() => {
                                    setShowUpgradeModal(false);
                                    router.push("/dashboard/settings?tab=manage-plan");
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