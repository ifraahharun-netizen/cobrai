"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import ui from "./accountDetail.module.css";
import { getTimelinePresentation } from "@/lib/timeline/presenters";
import { onAuthStateChanged, type User } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase.client";
import type { PlanTier } from "@/lib/permissions";
import { getEmailRecommendation } from "@/lib/emailRecommendations";
import type { ActionFirstRecommendation, Insight } from "@/lib/ai/types";
import { Inter } from "next/font/google";
import { ChevronLeft, ChevronRight, Download, Sparkles } from "lucide-react";

const inter = Inter({ subsets: ["latin"], display: "swap" });

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
const ACTIVITY_PAGE_SIZE = 12;

function formatMoney(value: number) {
    return `£${Number(value || 0).toLocaleString(undefined, {
        maximumFractionDigits: 0,
    })}`;
}

function niceDateTime(iso?: string | null) {
    if (!iso) return "—";

    const d = new Date(iso);

    if (Number.isNaN(d.getTime())) return "—";

    const now = new Date();

    const diffMs = now.getTime() - d.getTime();

    const minutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMs / 3600000);

    // FUTURE SAFE
    if (diffMs < 0) {
        return d.toLocaleString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    // UNDER 1 MIN
    if (minutes < 1) {
        return "Just now";
    }

    // UNDER 60 MINS
    if (minutes < 60) {
        return `${minutes} min${minutes === 1 ? "" : "s"} ago`;
    }

    // UNDER 24 HOURS
    if (hours < 24) {
        return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    }

    // YESTERDAY
    if (hours < 48) {
        return `Yesterday at ${d.toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
        })}`;
    }

    // DEFAULT FULL DATE
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
    return getTimelinePresentation(event.type, event.meta).title;
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

    const items: AccountTimelineEvent[] = [];

    // Always begin with AI review
    items.push({
        id: createId(),
        type: "account_reviewed",
        date: new Date(now - 1000 * 60 * 20).toISOString(),
        meta: {
            rawLabel: `Customer health reviewed by Cobrai`,
        },
    });

    // BILLING RISK FLOW
    if (
        reason.includes("billing") ||
        reason.includes("invoice") ||
        reason.includes("payment")
    ) {
        items.push(
            {
                id: createId(),
                type: "payment_failed",
                date: new Date(now - 1000 * 60 * 60 * 30).toISOString(),
                meta: {
                    amount: account.mrr,
                },
            },

            {
                id: createId(),
                type: "billing_issue_detected",
                date: new Date(now - 1000 * 60 * 60 * 26).toISOString(),
                meta: {
                    amount: account.mrr,
                },
            },

            {
                id: createId(),
                type: "risk_increased",
                date: new Date(now - 1000 * 60 * 60 * 22).toISOString(),
                meta: {
                    riskScore: account.riskScore,
                },
            },

            {
                id: createId(),
                type: "billing_recovery_email_sent",
                date: new Date(now - 1000 * 60 * 60 * 18).toISOString(),
            },

            {
                id: createId(),
                type: "billing_recovery_email_opened",
                date: new Date(now - 1000 * 60 * 60 * 12).toISOString(),
            }
        );
    }

    // INACTIVE / LOW USAGE FLOW
    else if (
        reason.includes("inactive") ||
        reason.includes("usage") ||
        reason.includes("engagement") ||
        reason.includes("activity")
    ) {
        items.push(
            {
                id: createId(),
                type: "usage_dropped",
                date: new Date(now - 1000 * 60 * 60 * 24 * 8).toISOString(),
            },

            {
                id: createId(),
                type: "inactivity_detected",
                date: new Date(now - 1000 * 60 * 60 * 24 * 6).toISOString(),
                meta: {
                    inactiveDays: 14,
                },
            },

            {
                id: createId(),
                type: "risk_increased",
                date: new Date(now - 1000 * 60 * 60 * 24 * 5).toISOString(),
                meta: {
                    riskScore: account.riskScore,
                },
            },

            {
                id: createId(),
                type: "reengagement_email_sent",
                date: new Date(now - 1000 * 60 * 60 * 24 * 2).toISOString(),
            },

            {
                id: createId(),
                type: "reengagement_email_opened",
                date: new Date(now - 1000 * 60 * 60 * 12).toISOString(),
            }
        );
    }

    // HEALTHY / EXPANSION FLOW
    else {
        items.push(
            {
                id: createId(),
                type: "payment_successful",
                date: new Date(now - 1000 * 60 * 60 * 48).toISOString(),
                meta: {
                    amount: account.mrr,
                },
            },

            {
                id: createId(),
                type: "risk_decreased",
                date: new Date(now - 1000 * 60 * 60 * 30).toISOString(),
                meta: {
                    riskScore: Math.max(18, account.riskScore - 22),
                },
            },

            {
                id: createId(),
                type: "checkin_email_sent",
                date: new Date(now - 1000 * 60 * 60 * 18).toISOString(),
            },

            {
                id: createId(),
                type: "plan_upgraded",
                date: new Date(now - 1000 * 60 * 60 * 10).toISOString(),
                meta: {
                    planName: "Pro",
                },
            }
        );
    }

    return dedupeEvents(items)
        .sort(
            (a, b) =>
                new Date(b.date).getTime() -
                new Date(a.date).getTime()
        )
        .slice(0, 12);
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
    const [retryingPayment, setRetryingPayment] = useState(false);
    const [retryPaymentErr, setRetryPaymentErr] = useState<string | null>(null);
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
    const [detailTab, setDetailTab] = useState<"overview" | "activity" | "notes">("overview");
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

        async function loadAiLater() {
            try {
                const aiRes = await authedPost("/api/dashboard/ai/insights", {
                    timeframe: "week",
                });

                if (!aiRes.ok) {
                    if (!cancelled) setWorkspaceAi(null);
                    return;
                }

                const aiJson = (await aiRes.json()) as AiWorkspaceRes;

                if (!cancelled) {
                    setWorkspaceAi(aiJson);
                }
            } catch {
                if (!cancelled) setWorkspaceAi(null);
            }
        }

        async function load() {
            setLoading(true);
            setErr(null);
            setAccount(null);
            setDetails(null);
            setWorkspaceAi(null);

            try {
                const detailsRes = await authedFetch(
                    `/api/dashboard/accounts-at-risk/${encodeURIComponent(id)}`
                );

                const detailsJson = (await detailsRes.json()) as RiskDetails;

                if (!detailsRes.ok || !detailsJson?.ok) {
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
                    setLoading(false);
                }

                const aiTimer = setTimeout(() => {
                    if (!cancelled) {
                        void loadAiLater();
                    }
                }, 800);

                return () => clearTimeout(aiTimer);
            } catch (e: any) {
                if (!cancelled) {
                    setWorkspaceAi(null);
                    setErr(e?.message || "Something went wrong");
                    setLoading(false);
                }
            }
        }

        void load();

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

    async function handleRetryPayment() {
        if (!account) return;

        setRetryingPayment(true);
        setRetryPaymentErr(null);

        try {
            const res = await authedPost("/api/automation/retry-payment", {
                customerId: details?.customerId || undefined,
                accountId: account.id,
            });

            const json = await res.json();

            if (!res.ok || !json?.ok) {
                if (json?.code === "PRO_FEATURE_REQUIRED") {
                    setShowUpgradeModal(true);
                    return;
                }

                throw new Error(json?.error || "Failed to create retry payment link");
            }

            if (json?.url) {
                window.location.href = json.url;
                return;
            }

            throw new Error("No Stripe payment link returned.");
        } catch (e: any) {
            setRetryPaymentErr(e?.message || "Couldn’t start payment retry.");
        } finally {
            setRetryingPayment(false);
        }
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

    useEffect(() => {
        if (!emailModal.open && !showUpgradeModal) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            if (emailModal.open && !sendingEmail) closeEmailModal();
            setShowUpgradeModal(false);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [emailModal.open, showUpgradeModal, sendingEmail]);

    if (loading) {
        return (
            <div className={`${ui.page} ${inter.className}`}>
                <p className={ui.empty}>Loading account…</p>
            </div>
        );
    }

    if (err || !account) {
        return (
            <div className={`${ui.page} ${inter.className}`}>
                <nav className={ui.crumbs} aria-label="Breadcrumb">
                    <Link href="/dashboard/accounts-at-risk" className={ui.crumbLink}>
                        <ChevronLeft size={14} strokeWidth={2} aria-hidden="true" />
                        Accounts
                    </Link>
                </nav>
                <p className={ui.empty}>{err || "Account not found."}</p>
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

    const riskLevel = riskLevelFromScore(account.riskScore);
    const riskDelta = Math.round(account.riskDelta ?? 0);
    const primaryAction = recommendedActions[0] ?? null;
    const whyAtRisk = Array.from(
        new Set(
            (details?.ai?.whyAtRisk?.length
                ? details.ai.whyAtRisk
                : (account.signals || []).map((signal) => signal.label)
            ).filter(Boolean)
        )
    ).slice(0, 4);

    function actionLabel(action: RecommendedAction) {
        if (action.key === "billing") return retryingPayment ? "Opening Stripe…" : "Retry payment";
        return action.automationLabel || action.label;
    }

    function runAction(action: RecommendedAction) {
        if (action.key === "billing") void handleRetryPayment();
        else openEmailModal(action.key);
    }

    function renderActivityTable(events: AccountTimelineEvent[]) {
        if (!events.length) return <p className={ui.empty}>No activity yet.</p>;
        return (
            <div className={ui.tableWrap}>
                <table className={ui.table}>
                    <thead>
                        <tr>
                            <th scope="col">Event</th>
                            <th scope="col">Details</th>
                            <th scope="col" className={ui.cellTime}>When</th>
                        </tr>
                    </thead>
                    <tbody>
                        {events.map((event) => {
                            const presentation = getTimelinePresentation(event.type, event.meta);
                            return (
                                <tr key={event.id}>
                                    <td className={ui.cellStrong}>{presentation.title}</td>
                                    <td className={ui.cellMuted}>{presentation.description || "—"}</td>
                                    <td className={ui.cellTime}>
                                        <time dateTime={event.date}>{niceDateTime(event.date)}</time>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        );
    }

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
            <div className={`${ui.page} ${inter.className}`}>
                <nav className={ui.crumbs} aria-label="Breadcrumb">
                    <Link href="/dashboard/accounts-at-risk" className={ui.crumbLink}>
                        Accounts
                    </Link>
                    <ChevronRight size={13} strokeWidth={2} aria-hidden="true" />
                    <span className={ui.crumbCurrent}>{account.companyName}</span>
                </nav>

                <header className={ui.header}>
                    <div className={ui.headerText}>
                        <div className={ui.titleRow}>
                            <h1 className={ui.title}>{account.companyName}</h1>
                            <span className={`${ui.riskBadge} ${ui[`risk_${riskLevel}`]}`}>
                                <i aria-hidden="true" />
                                {riskLabelFromScore(account.riskScore)}
                            </span>
                        </div>
                        <dl className={ui.metaRow}>
                            <div>
                                <dt>Email</dt>
                                <dd>{account.email || "—"}</dd>
                            </div>
                            <div>
                                <dt>Plan</dt>
                                <dd>{plan}</dd>
                            </div>
                            <div>
                                <dt>Customer since</dt>
                                <dd>{niceDate(createdAt)}</dd>
                            </div>
                        </dl>
                    </div>

                    <div className={ui.headerActions}>
                        <button type="button" className={ui.btnGhost} onClick={downloadAccountCsv}>
                            <Download size={14} strokeWidth={1.8} aria-hidden="true" />
                            Export
                        </button>
                        {primaryAction ? (
                            <button
                                type="button"
                                className={ui.btnPrimary}
                                onClick={() => runAction(primaryAction)}
                                disabled={primaryAction.key === "billing" && retryingPayment}
                            >
                                {actionLabel(primaryAction)}
                            </button>
                        ) : null}
                    </div>
                </header>

                <div className={ui.tabs} role="tablist" aria-label="Account sections">
                    {(
                        [
                            ["overview", "Overview", null],
                            ["activity", "Activity", timeline.length],
                            ["notes", "Notes", notes.length],
                        ] as const
                    ).map(([key, label, count]) => (
                        <button
                            key={key}
                            type="button"
                            role="tab"
                            id={`tab-${key}`}
                            aria-selected={detailTab === key}
                            aria-controls={`panel-${key}`}
                            className={ui.tab}
                            onClick={() => setDetailTab(key)}
                        >
                            {label}
                            {count ? <span className={ui.tabCount}>{count}</span> : null}
                        </button>
                    ))}
                </div>

                {detailTab === "overview" ? (
                    <div id="panel-overview" role="tabpanel" aria-labelledby="tab-overview" className={ui.panel}>
                        <section className={ui.stats} aria-label="Key figures">
                            <div className={ui.stat}>
                                <span className={ui.statLabel}>MRR</span>
                                <strong className={ui.statValue}>{formatMoney(account.mrr)}</strong>
                            </div>
                            <div className={ui.stat}>
                                <span className={ui.statLabel}>Risk score</span>
                                <strong className={ui.statValue}>
                                    {account.riskScore}
                                    <small>/100</small>
                                </strong>
                                <span
                                    className={`${ui.statFoot} ${
                                        riskDelta > 0 ? ui.statWorse : riskDelta < 0 ? ui.statBetter : ""
                                    }`}
                                >
                                    {riskDelta === 0
                                        ? "No change this month"
                                        : `${riskDelta > 0 ? "+" : "−"}${Math.abs(riskDelta)} pts this month`}
                                </span>
                            </div>
                            <div className={ui.stat}>
                                <span className={ui.statLabel}>Last active</span>
                                <strong className={ui.statValue}>{lastActive === "—" ? "—" : lastActive}</strong>
                                {lastActive === "—" ? <span className={ui.statFoot}>Not tracked yet</span> : null}
                            </div>
                            <div className={ui.stat}>
                                <span className={ui.statLabel}>Next billing</span>
                                <strong className={ui.statValue}>{niceDate(nextBilling)}</strong>
                            </div>
                        </section>

                        <div className={ui.grid}>
                            <section aria-labelledby="claude-read">
                                <div className={ui.sectionHead}>
                                    <h2 id="claude-read" className={ui.sectionTitle}>
                                        <Sparkles size={14} strokeWidth={1.8} aria-hidden="true" />
                                        Claude&apos;s read
                                    </h2>
                                </div>
                                <div className={ui.box}>
                                    <p className={ui.summary}>{aiSummary}</p>
                                    {whyAtRisk.length ? (
                                        <ul className={ui.reasons}>
                                            {whyAtRisk.map((reason) => (
                                                <li key={reason}>{reason}</li>
                                            ))}
                                        </ul>
                                    ) : null}
                                </div>

                                <div className={ui.sectionHead}>
                                    <h2 className={ui.sectionTitle}>Suggested actions</h2>
                                </div>
                                <div className={ui.tableWrap}>
                                    <table className={ui.table}>
                                        <thead>
                                            <tr>
                                                <th scope="col">Action</th>
                                                <th scope="col">Why</th>
                                                <th scope="col"><span className={ui.srOnly}>Run</span></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {recommendedActions.map((action) => (
                                                <tr key={action.key}>
                                                    <td className={ui.cellStrong}>{actionLabel(action)}</td>
                                                    <td className={ui.cellMuted}>{action.reason || "—"}</td>
                                                    <td className={ui.cellAction}>
                                                        <button
                                                            type="button"
                                                            className={ui.btnGhostSm}
                                                            onClick={() => runAction(action)}
                                                            disabled={action.key === "billing" && retryingPayment}
                                                        >
                                                            {action.key === "billing" ? "Retry" : "Compose"}
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {retryPaymentErr ? <p className={ui.noteError}>{retryPaymentErr}</p> : null}

                                {!emailSender?.verified ? (
                                    <p className={ui.notice}>
                                        Emails can&apos;t be sent until your sending domain is verified.{" "}
                                        <Link href="/dashboard/settings?tab=Integration">Verify domain</Link>
                                    </p>
                                ) : tier !== "pro" ? (
                                    <p className={ui.notice}>
                                        {typeof emailUsageRemaining === "number"
                                            ? `${emailUsageRemaining} of ${emailUsageLimit ?? STARTER_EMAIL_LIMIT} email actions left this month.`
                                            : `Starter includes ${STARTER_EMAIL_LIMIT} email actions.`}
                                    </p>
                                ) : null}
                            </section>

                            <section aria-labelledby="details-heading">
                                <div className={ui.sectionHead}>
                                    <h2 id="details-heading" className={ui.sectionTitle}>Details</h2>
                                </div>
                                <dl className={ui.kv}>
                                    <div>
                                        <dt>Account</dt>
                                        <dd>{account.companyName}</dd>
                                    </div>
                                    <div>
                                        <dt>Email</dt>
                                        <dd>{account.email || "—"}</dd>
                                    </div>
                                    <div>
                                        <dt>Plan</dt>
                                        <dd>{plan}</dd>
                                    </div>
                                    <div>
                                        <dt>MRR</dt>
                                        <dd>{formatMoney(account.mrr)}</dd>
                                    </div>
                                    <div>
                                        <dt>Main risk</dt>
                                        <dd>{account.reasonLabel || "—"}</dd>
                                    </div>
                                    <div>
                                        <dt>Customer since</dt>
                                        <dd>{niceDate(createdAt)}</dd>
                                    </div>
                                    <div>
                                        <dt>Next billing</dt>
                                        <dd>{niceDate(nextBilling)}</dd>
                                    </div>
                                    <div>
                                        <dt>Score updated</dt>
                                        <dd>{niceDateTime(account.updatedAt)}</dd>
                                    </div>
                                </dl>
                            </section>
                        </div>

                        <section aria-labelledby="recent-heading">
                            <div className={`${ui.sectionHead} ${ui.sectionHeadRow}`}>
                                <h2 id="recent-heading" className={ui.sectionTitle}>Recent activity</h2>
                                {timeline.length > 3 ? (
                                    <button type="button" className={ui.linkBtn} onClick={() => setDetailTab("activity")}>
                                        View all {timeline.length}
                                    </button>
                                ) : null}
                            </div>
                            {renderActivityTable(timeline.slice(0, 3))}
                        </section>
                    </div>
                ) : null}

                {detailTab === "activity" ? (
                    <div id="panel-activity" role="tabpanel" aria-labelledby="tab-activity" className={ui.panel}>
                        {renderActivityTable(paginatedTimeline)}
                        {timeline.length > ACTIVITY_PAGE_SIZE ? (
                            <div className={ui.pager}>
                                <span>
                                    Page {activityPage} of {totalActivityPages}
                                </span>
                                <div>
                                    <button
                                        type="button"
                                        className={ui.btnGhostSm}
                                        onClick={() => setActivityPage((p) => Math.max(1, p - 1))}
                                        disabled={activityPage === 1}
                                    >
                                        Previous
                                    </button>
                                    <button
                                        type="button"
                                        className={ui.btnGhostSm}
                                        onClick={() => setActivityPage((p) => Math.min(totalActivityPages, p + 1))}
                                        disabled={activityPage === totalActivityPages}
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        ) : null}
                    </div>
                ) : null}

                {detailTab === "notes" ? (
                    <div id="panel-notes" role="tabpanel" aria-labelledby="tab-notes" className={`${ui.panel} ${ui.notesPanel}`}>
                        <p className={ui.panelIntro}>Private to your team. Customers never see these.</p>
                        <label htmlFor="account-note" className={ui.srOnly}>
                            Note
                        </label>
                        <textarea
                            id="account-note"
                            className={ui.textarea}
                            value={noteText}
                            onChange={(e) => setNoteText(e.target.value)}
                            placeholder="Add a note…"
                            rows={3}
                        />
                        <div className={ui.noteActions}>
                            {editingNoteId ? (
                                <button type="button" className={ui.btnGhost} onClick={cancelEditNote}>
                                    Cancel
                                </button>
                            ) : null}
                            <button type="button" className={ui.btnPrimary} onClick={saveNote} disabled={!noteText.trim()}>
                                {editingNoteId ? "Save note" : "Add note"}
                            </button>
                        </div>

                        {notes.length ? (
                            <div className={ui.tableWrap}>
                                <table className={ui.table}>
                                    <thead>
                                        <tr>
                                            <th scope="col">Note</th>
                                            <th scope="col">Updated</th>
                                            <th scope="col"><span className={ui.srOnly}>Actions</span></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {notes.map((note: AccountNote) => (
                                            <tr key={note.id}>
                                                <td className={ui.cellNote}>{note.text}</td>
                                                <td className={ui.cellTime}>{niceDateTime(note.updatedAt)}</td>
                                                <td className={ui.cellAction}>
                                                    <span className={ui.rowLinks}>
                                                        <button type="button" onClick={() => startEditNote(note)}>
                                                            Edit
                                                        </button>
                                                        <button type="button" onClick={() => deleteNote(note.id)}>
                                                            Delete
                                                        </button>
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <p className={ui.empty}>No notes yet.</p>
                        )}
                    </div>
                ) : null}
            </div>

            <EmailModalPortal open={emailModal.open}>
                <div className={`${ui.modalOverlay} ${inter.className}`} onClick={closeEmailModal}>
                    <div className={ui.emailModal} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
                        <div className={ui.emailModalHeader}>
                            <div>

                                <div className={ui.emailModalTitle}>Email {account.companyName}</div>
                                <div className={ui.emailModalSub}>Sent from your verified domain. Replies land in your Inbox.</div>

                            </div>

                            <button className={ui.emailCloseBtn} onClick={closeEmailModal} type="button" aria-label="Close">
                                ×
                            </button>
                        </div>

                        <div className={ui.emailShell}>
                            <div className={ui.emailField}>
                                <label className={ui.emailLabel} htmlFor="email-to">To</label>
                                <input id="email-to" className={ui.emailInput} value={account.email || ""} readOnly />
                            </div>

                            <div className={ui.emailField}>
                                <label className={ui.emailLabel} htmlFor="email-subject">Subject</label>
                                <input
                                    id="email-subject"
                                    className={ui.emailInput}
                                    value={emailSubject}
                                    onChange={(e) => setEmailSubject(e.target.value)}
                                />
                            </div>

                            <div className={ui.emailField}>
                                <label className={ui.emailLabel} htmlFor="email-body">Message</label>
                                <textarea
                                    id="email-body"
                                    className={ui.emailTextarea}
                                    value={emailBody}
                                    onChange={(e) => setEmailBody(e.target.value)}
                                />
                            </div>

                            {sendErr ? <div className={ui.emailError}>{sendErr}</div> : null}

                            <div className={ui.emailModalActions}>
                                <button className={ui.emailCancelBtn} type="button" onClick={closeEmailModal}>
                                    Cancel
                                </button>
                                <button
                                    className={ui.emailSendBtn}
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
                <div className={`${ui.modalOverlay} ${inter.className}`} onClick={() => setShowUpgradeModal(false)}>
                    <div className={ui.emailModal} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
                        <div className={ui.emailModalHeader}>
                            <div>
                                <div className={ui.emailEyebrow}>Upgrade</div>
                                <div className={ui.emailModalTitle}>Email limit reached</div>
                                <div className={ui.emailModalSub}>
                                    Upgrade to Pro to keep sending retention emails.
                                </div>
                            </div>

                            <button
                                className={ui.emailCloseBtn}
                                onClick={() => setShowUpgradeModal(false)}
                                type="button"
                            >
                                ×
                            </button>
                        </div>

                        <div className={ui.emailModalActions}>
                            <button
                                className={ui.emailCancelBtn}
                                type="button"
                                onClick={() => setShowUpgradeModal(false)}
                            >
                                Not now
                            </button>
                            <button
                                className={ui.emailSendBtn}
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