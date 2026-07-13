"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Mail, X, ChevronRight, ChevronLeft } from "lucide-react";

import { getDemoCustomers } from "@/lib/demo/customers";
import { getEmailRecommendation } from "@/lib/emailRecommendations";
import { getFirebaseAuth } from "@/lib/firebase.client";

import styles from "./ai-action-queue.module.css";

type ActionType =
    | "critical"
    | "billing"
    | "engagement"
    | "success"
    | "expansion";

type ActionStatus =
    | "not_started"
    | "sent"
    | "started"
    | "pending"
    | "failed";

type RiskAccount = {
    id: string;
    company: string;
    email?: string;
    reason: string;
    risk: number;
    mrr: number;
    tags?: string[];
    updatedAt?: string;
    customerId?: string;
    stripeCustomerId?: string | null;
};

type AIActionQueueProps = {
    accounts?: RiskAccount[];
    isDemoMode?: boolean;
    canRetryPayment?: boolean;
    senderName?: string;
    currency?: string;
    locale?: string;
};

type ActionItem = {
    id: string;
    customerId?: string;
    accountId?: string;
    type: ActionType;
    customerName: string;
    customerEmail?: string;
    riskScore: number;
    mrr: number;
    reason: string;
    lastActive?: string;
    emailSubject: string;
    emailMessage: string;
    suggestedEmail: string;
    canRetry: boolean;
    status: ActionStatus;
    actionDate?: string;
};

const ITEMS_PER_PAGE = 4;

const REGION_CURRENCY: Record<string, string> = {
    GB: "GBP",
    US: "USD",
    CA: "CAD",
    AU: "AUD",
    NZ: "NZD",
    IE: "EUR",
    FR: "EUR",
    DE: "EUR",
    ES: "EUR",
    IT: "EUR",
    NL: "EUR",
    BE: "EUR",
    AT: "EUR",
    PT: "EUR",
    FI: "EUR",
    GR: "EUR",
    LU: "EUR",
    CY: "EUR",
    MT: "EUR",
    SK: "EUR",
    SI: "EUR",
    EE: "EUR",
    LV: "EUR",
    LT: "EUR",
    IN: "INR",
    AE: "AED",
    SA: "SAR",
    QA: "QAR",
    KW: "KWD",
    NG: "NGN",
    ZA: "ZAR",
    KE: "KES",
    JP: "JPY",
    CN: "CNY",
    SG: "SGD",
};

function getBrowserLocale() {
    if (typeof navigator !== "undefined" && navigator.language) {
        return navigator.language;
    }

    return "en";
}

function getCurrencyFromLocale(locale: string) {
    try {
        const region = new Intl.Locale(locale).region;

        if (region && REGION_CURRENCY[region]) {
            return REGION_CURRENCY[region];
        }
    } catch {
        return "USD";
    }

    return "USD";
}

function formatCurrency(value: number, currency: string, locale: string) {
    return new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
    }).format(Number(value || 0));
}

function formatLastActive(value?: string | null) {
    if (!value) return undefined;

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return undefined;

    const days = Math.max(
        0,
        Math.round((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24))
    );

    if (days <= 0) return "Last active today";
    if (days === 1) return "Last active 1 day ago";

    return `Last active ${days} days ago`;
}

function formatActionDate(value: string | undefined, locale: string) {
    if (!value) return "—";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleDateString(locale, {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
}

function actionStatusLabel(status?: ActionStatus) {
    if (status === "sent") return "Email sent";
    if (status === "started") return "Payment started";
    if (status === "pending") return "Pending";
    if (status === "failed") return "Failed";

    return "Not started";
}

function hasSignal(text: string, signals: string[]) {
    return signals.some((signal) => text.includes(signal));
}

function getActionType(reason: string, tags: string[] = [], risk = 0): ActionType {
    const text = `${reason} ${tags.join(" ")}`.toLowerCase();

    const billingSignals = [
        "payment",
        "billing",
        "invoice",
        "failed",
        "card",
        "past due",
        "overdue",
        "dunning",
        "recoverable",
    ];

    const engagementSignals = [
        "usage",
        "adoption",
        "inactive",
        "activity",
        "dropped",
        "drop",
        "login",
        "last seen",
        "low engagement",
        "declining",
        "decline",
        "feature",
        "onboarding",
    ];

    const expansionSignals = [
        "expansion",
        "upgrade",
        "upsell",
        "seat",
        "seats",
        "usage growth",
        "power user",
        "high usage",
        "plan limit",
    ];

    const successSignals = [
        "check-in",
        "check in",
        "success",
        "support",
        "ticket",
        "nps",
        "feedback",
        "relationship",
        "renewal",
        "proactive",
    ];

    if (risk >= 80) return "critical";
    if (hasSignal(text, billingSignals)) return "billing";
    if (hasSignal(text, expansionSignals)) return "expansion";
    if (hasSignal(text, engagementSignals)) return "engagement";
    if (hasSignal(text, successSignals)) return "success";

    return risk >= 65 ? "critical" : "success";
}

function getRiskClass(score: number) {
    if (score >= 80) return styles.riskCritical;
    if (score >= 65) return styles.riskHigh;
    if (score >= 45) return styles.riskMedium;

    return styles.riskLow;
}

function getMeta(type: ActionType) {
    const meta = {
        critical: {
            label: "Critical Churn Risks",
            shortLabel: "Critical risks",
            description: "Accounts showing the strongest churn signals.",
            valueLabel: "MRR at risk",
        },
        billing: {
            label: "Billing Recovery",
            shortLabel: "Billing recovery",
            description: "Failed, overdue, or recoverable payment actions.",
            valueLabel: "Recoverable",
        },
        engagement: {
            label: "Low Engagement",
            shortLabel: "Low engagement",
            description: "Customers showing usage decline or inactivity.",
            valueLabel: "MRR at risk",
        },
        success: {
            label: "Success Check-ins",
            shortLabel: "Success check-ins",
            description: "Customers who need proactive retention outreach.",
            valueLabel: "MRR to protect",
        },
        expansion: {
            label: "Expansion Opportunities",
            shortLabel: "Expansion",
            description: "Accounts showing upgrade or growth potential.",
            valueLabel: "Expansion MRR",
        },
    };

    return meta[type];
}


function EmailModalPortal({
    open,
    children,
}: {
    open: boolean;
    children: ReactNode;
}) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    if (!mounted || !open) return null;

    return createPortal(children, document.body);
}

export default function AIActionQueue({
    accounts = [],
    isDemoMode = false,
    canRetryPayment = false,
    senderName = "Team",
    currency,
    locale,
}: AIActionQueueProps) {
    const router = useRouter();

    const resolvedLocale = locale || getBrowserLocale();
    const resolvedCurrency = currency || getCurrencyFromLocale(resolvedLocale);

    const [selectedType, setSelectedType] = useState<ActionType | null>(null);
    const [page, setPage] = useState(0);
    const [retryingId, setRetryingId] = useState<string | null>(null);
    const [sendingEmail, setSendingEmail] = useState(false);
    const [emailModalItem, setEmailModalItem] = useState<ActionItem | null>(null);
    const [emailCtaEnabled, setEmailCtaEnabled] = useState(false);
    const [emailCtaText, setEmailCtaText] = useState("");
    const [emailCtaLink, setEmailCtaLink] = useState("");
    const [sendEmailError, setSendEmailError] = useState<string | null>(null);

    const [executedActions, setExecutedActions] = useState<
        Record<
            string,
            {
                status: ActionStatus;
                actionDate: string;
            }
        >
    >({});

    const [emailDraft, setEmailDraft] = useState({
        to: "",
        subject: "",
        message: "",
    });

    const actions = useMemo<ActionItem[]>(() => {
        const sourceAccounts: RiskAccount[] = isDemoMode
            ? getDemoCustomers().map((customer) => ({
                id: customer.id,
                customerId: customer.id,
                company: customer.name,
                email: customer.email ?? undefined,
                reason: customer.status || "Retention risk detected",
                risk: Number(customer.riskScore ?? customer.churnRisk ?? 0),
                mrr: Number(customer.mrr ?? 0),
                updatedAt: customer.lastActiveAt ?? undefined,
                stripeCustomerId: customer.stripeCustomerId ?? null,
                tags: [],
            }))
            : accounts;

        return sourceAccounts
            .filter((account) => Number(account.risk || 0) >= 25)
            .sort((a, b) => Number(b.risk || 0) - Number(a.risk || 0))
            .map((account) => {
                const type = getActionType(
                    account.reason,
                    account.tags,
                    Number(account.risk || 0)
                );

                const recommendation = getEmailRecommendation({
                    accountName: account.company,
                    reason: account.reason,
                    senderName,
                    companyName: "",
                });

                const cleanMessage = recommendation.message
                    .replace(/\n\s*$/g, "")
                    .replace(
                        new RegExp(`\\n${senderName}\\n\\s*$`),
                        `\n${senderName}`
                    );

                const isPayment =
                    recommendation.type === "payment_recovery" || type === "billing";

                const executed = executedActions[account.id];

                return {
                    id: account.id,
                    customerId: account.customerId,
                    accountId: account.id,
                    type: isPayment ? "billing" : type,
                    customerName: account.company,
                    customerEmail: account.email,
                    riskScore: Number(account.risk || 0),
                    mrr: Number(account.mrr || 0),
                    reason: account.reason,
                    lastActive: formatLastActive(account.updatedAt),
                    emailSubject: recommendation.subject,
                    emailMessage: cleanMessage,
                    suggestedEmail: recommendation.action,
                    canRetry: isPayment && canRetryPayment && !isDemoMode,
                    status: executed?.status || "not_started",
                    actionDate: executed?.actionDate,
                };
            });
    }, [accounts, canRetryPayment, executedActions, isDemoMode, senderName]);

    const groups = useMemo(() => {
        const groupOrder: ActionType[] = [
            "critical",
            "billing",
            "engagement",
            "success",
            "expansion",
        ];

        return groupOrder.map((type) => {
            const items = actions.filter((action) => action.type === type);
            const meta = getMeta(type);

            return {
                type,
                ...meta,
                items,
                count: items.length,
                totalMrr: items.reduce((sum, item) => sum + item.mrr, 0),
            };
        });
    }, [actions]);

    const selectedGroup = groups.find((group) => group.type === selectedType);
    const selectedItems = selectedGroup?.items ?? [];
    const pageCount = Math.max(1, Math.ceil(selectedItems.length / ITEMS_PER_PAGE));

    const visibleItems = selectedItems.slice(
        page * ITEMS_PER_PAGE,
        page * ITEMS_PER_PAGE + ITEMS_PER_PAGE
    );

    async function getAuthToken() {
        const auth = getFirebaseAuth();
        const token = await auth.currentUser?.getIdToken();

        if (!token) {
            throw new Error("You need to be signed in.");
        }

        return token;
    }

    async function handleRetryPayment(item: ActionItem) {
        if (!item.canRetry || retryingId) return;

        try {
            setRetryingId(item.id);

            const token = await getAuthToken();

            const res = await fetch("/api/automation/retry-payment", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    customerId: item.customerId,
                    accountId: item.accountId,
                }),
            });

            const data = await res.json().catch(() => null);

            if (!res.ok || !data?.url) {
                throw new Error(data?.error || "Could not start retry payment.");
            }

            setExecutedActions((current) => ({
                ...current,
                [item.id]: {
                    status: "started",
                    actionDate: new Date().toISOString(),
                },
            }));

            window.location.href = data.url;
        } catch (error) {
            console.error("[AIActionQueue] retry payment failed:", error);

            setExecutedActions((current) => ({
                ...current,
                [item.id]: {
                    status: "failed",
                    actionDate: new Date().toISOString(),
                },
            }));

            alert(error instanceof Error ? error.message : "Retry payment failed.");
        } finally {
            setRetryingId(null);
        }
    }

    async function handleSendEmail() {
        if (!emailModalItem || sendingEmail) return;

        if (!emailDraft.to.trim()) {
            setSendEmailError("No email on this account.");
            return;
        }

        if (!emailDraft.subject.trim()) {
            setSendEmailError("Add an email subject.");
            return;
        }

        if (!emailDraft.message.trim()) {
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

                if (!["http:", "https:"].includes(ctaUrl.protocol)) {
                    throw new Error("Invalid CTA URL protocol");
                }
            } catch {
                setSendEmailError(
                    "Enter a valid CTA link beginning with http:// or https://."
                );
                return;
            }
        }

        try {
            setSendingEmail(true);
            setSendEmailError(null);

            const token = await getAuthToken();

            const res = await fetch("/api/automation/send-email", {
                method: "POST",
                cache: "no-store",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    accountId: emailModalItem.accountId,
                    to: emailDraft.to.trim(),
                    subject: emailDraft.subject.trim(),
                    body: emailDraft.message.trim(),
                    cta: emailCtaEnabled
                        ? {
                            text: emailCtaText.trim(),
                            url: emailCtaLink.trim(),
                        }
                        : null,
                }),
            });

            const data = await res.json().catch(() => null);

            if (!res.ok || data?.ok === false) {
                throw new Error(data?.error || "Email could not be sent.");
            }

            setExecutedActions((current) => ({
                ...current,
                [emailModalItem.id]: {
                    status: data?.dryRun ? "pending" : "sent",
                    actionDate: new Date().toISOString(),
                },
            }));

            alert(
                data?.dryRun
                    ? "Email saved successfully in dry run mode."
                    : "Email sent successfully."
            );

            closeEmailModal();
        } catch (error) {
            console.error("[AIActionQueue] send email failed:", error);

            if (emailModalItem) {
                setExecutedActions((current) => ({
                    ...current,
                    [emailModalItem.id]: {
                        status: "failed",
                        actionDate: new Date().toISOString(),
                    },
                }));
            }

            setSendEmailError(
                error instanceof Error ? error.message : "Failed to send email."
            );
        } finally {
            setSendingEmail(false);
        }
    }

    function openPanel(type: ActionType) {
        setSelectedType(type);
        setPage(0);
    }

    function openAccountProfile(item: ActionItem) {
        router.push(`/dashboard/accounts-at-risk/${item.customerId || item.accountId || item.id}`);
    }

    function openEmailModal(item: ActionItem) {
        setEmailModalItem(item);
        setEmailDraft({
            to: item.customerEmail || "",
            subject: item.emailSubject,
            message: item.emailMessage,
        });
        setEmailCtaEnabled(true);
        setEmailCtaText("");
        setEmailCtaLink("");
        setSendEmailError(null);
    }

    function closeEmailModal() {
        if (sendingEmail) return;

        setEmailModalItem(null);
        setEmailCtaEnabled(false);
        setEmailCtaText("");
        setEmailCtaLink("");
        setSendEmailError(null);
    }

    return (
        <>
            <div className={styles.card}>
                <div className={styles.header}>
                    <div>
                        <div className={styles.title}>AI Action Queue</div>
                        <p>Churn prevention, billing recovery, and growth actions ready to use.</p>
                    </div>
                </div>

                <div className={styles.queueTable}>
                    <div className={styles.queueTableHead}>
                        <span>Queue</span>
                        <span>Accounts</span>
                        <span>Value</span>
                        <span />
                    </div>

                    <div className={styles.queueList}>
                        {groups.map((group) => (
                            <button
                                key={group.type}
                                type="button"
                                className={styles.queueItem}
                                onClick={() => openPanel(group.type)}
                            >
                                <span className={styles.queueContent}>
                                    <strong>{group.shortLabel}</strong>
                                    <small>{group.description}</small>
                                </span>

                                <span className={styles.queueCount}>
                                    {group.count}
                                </span>

                                <span className={styles.queueValue}>
                                    <strong>
                                        {formatCurrency(
                                            group.totalMrr,
                                            resolvedCurrency,
                                            resolvedLocale
                                        )}
                                    </strong>
                                    <small>{group.valueLabel}</small>
                                </span>

                                <span className={styles.queueOpen}>View</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {selectedGroup ? (
                <div className={styles.overlay} onClick={() => setSelectedType(null)}>
                    <aside className={styles.panel} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.panelHeader}>
                            <div>
                                <h3>{selectedGroup.label}</h3>
                                <p>{selectedGroup.description}</p>
                            </div>

                            <button
                                type="button"
                                className={styles.closeButton}
                                onClick={() => setSelectedType(null)}
                                aria-label="Close panel"
                            >
                                <X size={18} strokeWidth={1.8} />
                            </button>
                        </div>

                        <div className={styles.panelSummary}>
                            <span>Total {selectedGroup.valueLabel.toLowerCase()}</span>
                            <strong>
                                {formatCurrency(selectedGroup.totalMrr, resolvedCurrency, resolvedLocale)}
                            </strong>
                        </div>

                        <div className={styles.customerTable}>
                            <div className={styles.customerTableHead}>
                                <span>Account</span>
                                <span>Risk</span>
                                <span>MRR</span>
                                <span>Reason</span>
                                <span>Action</span>
                                <span>Status</span>
                                <span>Date</span>
                            </div>

                            {visibleItems.length > 0 ? (
                                visibleItems.map((item) => (
                                    <div key={item.id} className={styles.customerTableRow}>
                                        <button
                                            type="button"
                                            className={styles.accountCell}
                                            onClick={() => openAccountProfile(item)}
                                        >
                                            <div>
                                                <strong>{item.customerName}</strong>
                                                {item.customerEmail ? (
                                                    <small>{item.customerEmail}</small>
                                                ) : null}
                                            </div>
                                        </button>

                                        <div className={styles.riskCell}>
                                            <span className={getRiskClass(item.riskScore)}>
                                                {item.riskScore}
                                            </span>
                                        </div>

                                        <div className={styles.mrrCell}>
                                            <strong>
                                                {formatCurrency(item.mrr, resolvedCurrency, resolvedLocale)}
                                            </strong>
                                            <small>{selectedGroup.valueLabel}</small>
                                        </div>

                                        <div className={styles.reasonCell}>
                                            <p>{item.reason}</p>
                                            {item.lastActive ? <small>{item.lastActive}</small> : null}
                                        </div>

                                        <div className={styles.emailCell}>
                                            <strong>{item.emailSubject}</strong>
                                            <p>{item.suggestedEmail}</p>
                                        </div>

                                        <div className={styles.statusCell}>
                                            <span
                                                className={
                                                    item.status === "sent" ||
                                                        item.status === "started"
                                                        ? styles.statusSuccess
                                                        : item.status === "failed"
                                                            ? styles.statusFailed
                                                            : item.status === "pending"
                                                                ? styles.statusPending
                                                                : styles.statusNeutral
                                                }
                                            >
                                                {actionStatusLabel(item.status)}
                                            </span>
                                        </div>

                                        <div className={styles.dateCell}>
                                            {formatActionDate(item.actionDate, resolvedLocale)}
                                        </div>

                                        <div className={styles.actionCell}>
                                            <button
                                                type="button"
                                                onClick={() => openEmailModal(item)}
                                                disabled={item.status === "sent"}
                                            >
                                                {item.status === "sent" ? "Sent" : "Send email"}
                                            </button>

                                            {item.canRetry ? (
                                                <button
                                                    type="button"
                                                    onClick={() => void handleRetryPayment(item)}
                                                    disabled={
                                                        retryingId === item.id ||
                                                        item.status === "started"
                                                    }
                                                >
                                                    {retryingId === item.id
                                                        ? "Starting..."
                                                        : item.status === "started"
                                                            ? "Started"
                                                            : "Retry payment"}
                                                </button>
                                            ) : null}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className={styles.emptyState}>
                                    No actions in this queue yet.
                                </div>
                            )}
                        </div>

                        {selectedItems.length > ITEMS_PER_PAGE ? (
                            <div className={styles.pagination}>
                                <button
                                    type="button"
                                    onClick={() => setPage((value) => Math.max(0, value - 1))}
                                    disabled={page === 0}
                                >
                                    <ChevronLeft size={14} />
                                    Previous
                                </button>

                                <span>
                                    {page + 1} of {pageCount}
                                </span>

                                <button
                                    type="button"
                                    onClick={() =>
                                        setPage((value) =>
                                            Math.min(pageCount - 1, value + 1)
                                        )
                                    }
                                    disabled={page >= pageCount - 1}
                                >
                                    Next
                                    <ChevronRight size={14} />
                                </button>
                            </div>
                        ) : null}

                        <button
                            type="button"
                            className={styles.footerLink}
                            onClick={() => {
                                router.push("/dashboard/accounts-at-risk");
                            }}
                        >
                            View all at-risk accounts
                        </button>
                    </aside>
                </div>
            ) : null}

            <EmailModalPortal open={Boolean(emailModalItem)}>
                <div className={styles.modalOverlay} onClick={closeEmailModal}>
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
                                onClick={closeEmailModal}
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
                                        value={emailDraft.to}
                                        readOnly
                                    />
                                </div>

                                <div className={styles.emailField}>
                                    <label className={styles.emailLabel}>Subject</label>
                                    <input
                                        className={styles.emailInput}
                                        value={emailDraft.subject}
                                        onChange={(event) =>
                                            setEmailDraft((draft) => ({
                                                ...draft,
                                                subject: event.target.value,
                                            }))
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
                                        value={emailDraft.message}
                                        onChange={(event) =>
                                            setEmailDraft((draft) => ({
                                                ...draft,
                                                message: event.target.value,
                                            }))
                                        }
                                        disabled={sendingEmail}
                                        maxLength={2000}
                                    />

                                    <span className={styles.emailCharacterCount}>
                                        {emailDraft.message.length}/2000
                                    </span>
                                </div>
                            </div>

                            <section className={styles.emailCtaCard}>
                                <div className={styles.emailCtaHeader}>
                                    <div>
                                        <h3>
                                            Call to Action <span>(Optional)</span>
                                        </h3>
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
                                        <span className={styles.srOnly}>
                                            Enable call to action
                                        </span>
                                    </label>
                                </div>

                                {emailCtaEnabled ? (
                                    <div className={styles.emailCtaContent}>
                                        <div className={styles.emailCtaFields}>
                                            <div className={styles.emailField}>
                                                <label className={styles.emailLabel}>
                                                    Button Text
                                                </label>
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
                                                <label className={styles.emailLabel}>
                                                    Button Link
                                                </label>
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
                                    onClick={closeEmailModal}
                                    disabled={sendingEmail}
                                >
                                    Cancel
                                </button>

                                <button
                                    className={styles.emailSendBtn}
                                    type="button"
                                    onClick={() => void handleSendEmail()}
                                    disabled={sendingEmail}
                                >
                                    {sendingEmail ? "Sending..." : "Send email"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </EmailModalPortal>
        </>
    );
}