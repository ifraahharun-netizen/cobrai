"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { ArrowRight, Check, CreditCard, Lock, RotateCcw, ShieldCheck, TriangleAlert } from "lucide-react";

import styles from "./TrialUpgradeGate.module.css";

type TrialImpact = {
    accountsMonitored: number;
    highRiskAccounts: number;
    aiActionsGenerated: number;
    customersRetained: number;
    revenueProtectedMinor: number;
    paymentsRecovered: number;
};

type TrialAtStake = {
    mrrTrackedMinor: number;
    atRiskMinor: number;
    atRiskAccounts: number;
    failedPaymentsMinor: number;
    failedPayments: number;
    topAccounts: Array<{ name: string; reason: string; riskScore: number; mrrMinor: number }>;
};

export type TrialStatus = {
    workspaceId: string;
    tier: string;
    trialStartedAt: string | null;
    trialEndsAt: string | null;
    trialExpired: boolean;
    trialActive: boolean;
    hasActiveSubscription: boolean;
    daysRemaining: number;
    impact: TrialImpact;
    atStake?: TrialAtStake;
    currency?: string;
    summary: string;
};

type Props = {
    user: User;
    status: TrialStatus;
};

type PaidTier = "starter" | "pro";

const PLANS: Record<PaidTier, { name: string; priceMinor: number; tagline: string; features: string[] }> = {
    starter: {
        name: "Starter",
        priceMinor: 9900,
        tagline: "See churn risk early and act on it yourself.",
        features: [
            "Accounts ranked by risk and revenue",
            "MRR, churn and retention analytics",
            "Customer health scores",
            "AI-written retention emails",
            "Claude summaries of your metrics",
        ],
    },
    pro: {
        name: "Pro",
        priceMinor: 29900,
        tagline: "Recover revenue automatically and forecast what's next.",
        features: [
            "Everything in Starter",
            "Automatic failed-payment recovery",
            "Retention automations and workflows",
            "Revenue forecasting and drivers",
            "Unlimited Ask Claude",
        ],
    },
};

const EMPTY_AT_STAKE: TrialAtStake = {
    mrrTrackedMinor: 0,
    atRiskMinor: 0,
    atRiskAccounts: 0,
    failedPaymentsMinor: 0,
    failedPayments: 0,
    topAccounts: [],
};

function money(minor: number, currency: string) {
    return new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
    }).format(Math.max(0, minor) / 100);
}

function plural(n: number, one: string, many = `${one}s`) {
    return `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;
}

function formatDate(iso: string | null) {
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
        ? null
        : d.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
}

export default function TrialUpgradeGate({ user, status }: Props) {
    const [checkoutLoading, setCheckoutLoading] = useState<PaidTier | null>(null);
    const [checkoutError, setCheckoutError] = useState("");

    const currency = status.currency || "GBP";
    const stake = status.atStake ?? EMPTY_AT_STAKE;
    const impact = status.impact;

    // Monthly revenue Cobrai can help keep: at-risk accounts plus unpaid failed invoices.
    const recoverableMinor = stake.atRiskMinor + stake.failedPaymentsMinor;
    const hasData = stake.mrrTrackedMinor > 0 || recoverableMinor > 0 || impact.accountsMonitored > 0;

    // Pro when there's money to recover automatically or more at risk than Pro costs.
    const recommended: PaidTier =
        stake.failedPayments > 0 || recoverableMinor >= PLANS.pro.priceMinor ? "pro" : "starter";

    const recommendation = useMemo(() => {
        if (!hasData || recoverableMinor <= 0) {
            return recommended === "pro"
                ? "Pro adds automatic payment recovery and forecasting."
                : "Starter covers the essentials while you grow.";
        }
        const plan = PLANS[recommended];
        const multiple = recoverableMinor / plan.priceMinor;
        const atStake =
            multiple >= 1
                ? `${money(recoverableMinor, currency)} a month is at stake, about ${multiple >= 10 ? Math.round(multiple) : multiple.toFixed(1)}× what ${plan.name} costs`
                : `${money(recoverableMinor, currency)} a month is at stake`;
        return stake.failedPayments > 0 && recommended === "pro"
            ? `Pro is recommended: it retries your ${plural(stake.failedPayments, "failed payment")} automatically, and ${atStake}.`
            : `${plan.name} is recommended: ${atStake}.`;
    }, [hasData, recoverableMinor, recommended, stake.failedPayments, currency]);

    const trialActivity = [
        { label: "Accounts monitored", value: impact.accountsMonitored.toLocaleString("en-GB") },
        { label: "Risks flagged", value: impact.highRiskAccounts.toLocaleString("en-GB") },
        { label: "AI actions", value: impact.aiActionsGenerated.toLocaleString("en-GB") },
        { label: "Revenue protected", value: money(impact.revenueProtectedMinor, currency) },
    ];

    useEffect(() => {
        if (!status.trialExpired) return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [status.trialExpired]);

    async function continueWithPlan(tier: PaidTier) {
        if (checkoutLoading) return;
        setCheckoutLoading(tier);
        setCheckoutError("");

        try {
            const token = await user.getIdToken();
            const response = await fetch("/api/stripe/checkout", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ workspaceId: status.workspaceId, tier }),
            });
            const data = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;
            if (!response.ok || !data?.url) {
                throw new Error(data?.error || "Unable to open secure checkout.");
            }
            window.location.assign(data.url);
        } catch (error) {
            setCheckoutError(error instanceof Error ? error.message : "Unable to open secure checkout.");
            setCheckoutLoading(null);
        }
    }

    if (!status.trialExpired || status.hasActiveSubscription) {
        return null;
    }

    const endedOn = formatDate(status.trialEndsAt);
    const busy = checkoutLoading !== null;

    return (
        <div
            className={styles.overlay}
            role="dialog"
            aria-modal="true"
            aria-labelledby="trial-report-title"
            aria-describedby="trial-report-subtitle"
        >
            <div className={styles.page}>
                <header className={styles.topBar}>
                    <span className={styles.brand}>Cobrai</span>
                    <span className={styles.statusPill}>
                        <Lock size={12} strokeWidth={2} aria-hidden="true" />
                        {endedOn ? `Trial ended ${endedOn}` : "Trial ended"}
                    </span>
                </header>

                <section className={styles.hero}>
                    <span className={styles.eyebrow}>Retention report</span>
                    <h1 id="trial-report-title" className={styles.title}>
                        {hasData && recoverableMinor > 0
                            ? <>{money(recoverableMinor, currency)} a month needs your attention</>
                            : "Your free trial has ended"}
                    </h1>
                    <p id="trial-report-subtitle" className={styles.subtitle}>
                        {hasData
                            ? "Here's what Cobrai found in your business. Choose a plan to act on it. Your data and history are kept."
                            : "Choose a plan to keep using Cobrai. Your workspace and settings are kept."}
                    </p>
                </section>

                {hasData ? (
                    <>
                        <section className={styles.stakeStrip} aria-label="At stake right now">
                            <div className={styles.stakeCell}>
                                <span className={styles.stakeLabel}>Revenue at risk</span>
                                <strong className={styles.stakeValue}>{money(stake.atRiskMinor, currency)}</strong>
                                <span className={styles.stakeSub}>
                                    a month · {plural(stake.atRiskAccounts, "account")}
                                </span>
                            </div>
                            <div className={styles.stakeCell}>
                                <span className={styles.stakeLabel}>Failed payments to recover</span>
                                <strong className={styles.stakeValue}>{money(stake.failedPaymentsMinor, currency)}</strong>
                                <span className={styles.stakeSub}>{plural(stake.failedPayments, "unpaid invoice")}</span>
                            </div>
                            <div className={styles.stakeCell}>
                                <span className={styles.stakeLabel}>Recurring revenue tracked</span>
                                <strong className={styles.stakeValue}>{money(stake.mrrTrackedMinor, currency)}</strong>
                                <span className={styles.stakeSub}>a month, from your billing data</span>
                            </div>
                        </section>

                        {stake.topAccounts.length ? (
                            <section className={styles.card} aria-labelledby="trial-accounts-title">
                                <div className={styles.cardHead}>
                                    <h2 id="trial-accounts-title">Accounts that need action</h2>
                                    <span className={styles.cardHint}>Largest first</span>
                                </div>
                                <ul className={styles.accountList}>
                                    {stake.topAccounts.map((account) => (
                                        <li key={`${account.name}-${account.reason}`} className={styles.accountRow}>
                                            <span className={styles.accountIcon} aria-hidden="true">
                                                <TriangleAlert size={14} strokeWidth={1.8} />
                                            </span>
                                            <span className={styles.accountMain}>
                                                <strong>{account.name}</strong>
                                                <span>{account.reason} · risk {account.riskScore}/100</span>
                                            </span>
                                            <span className={styles.accountValue}>
                                                {money(account.mrrMinor, currency)}
                                                <small>/mo</small>
                                            </span>
                                            <span className={styles.accountLocked}>
                                                <Lock size={12} strokeWidth={2} aria-hidden="true" />
                                                Locked
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                                {stake.atRiskAccounts > stake.topAccounts.length ? (
                                    <p className={styles.cardFoot}>
                                        +{plural(stake.atRiskAccounts - stake.topAccounts.length, "more account")} with a suggested next step.
                                    </p>
                                ) : null}
                            </section>
                        ) : null}

                        <section className={styles.splitRow}>
                            <div className={styles.card}>
                                <div className={styles.cardHead}>
                                    <h2>During your trial</h2>
                                </div>
                                <dl className={styles.activityGrid}>
                                    {trialActivity.map((item) => (
                                        <div key={item.label}>
                                            <dt>{item.label}</dt>
                                            <dd>{item.value}</dd>
                                        </div>
                                    ))}
                                </dl>
                            </div>
                            <div className={styles.card}>
                                <div className={styles.cardHead}>
                                    <h2>Summary</h2>
                                </div>
                                <p className={styles.summaryText}>{status.summary}</p>
                            </div>
                        </section>
                    </>
                ) : null}

                <section className={styles.plansSection} aria-labelledby="trial-plans-title">
                    <div className={styles.plansHead}>
                        <h2 id="trial-plans-title">Choose a plan</h2>
                        <p className={styles.recommendation}>{recommendation}</p>
                    </div>

                    <div className={styles.planGrid}>
                        {(["starter", "pro"] as PaidTier[]).map((tier) => {
                            const plan = PLANS[tier];
                            const isRecommended = tier === recommended;
                            return (
                                <article
                                    key={tier}
                                    className={`${styles.planCard} ${isRecommended ? styles.planRecommended : ""}`}
                                >
                                    <div className={styles.planTop}>
                                        <span className={styles.planName}>{plan.name}</span>
                                        {isRecommended ? <span className={styles.planBadge}>Recommended</span> : null}
                                    </div>
                                    <div className={styles.planPrice}>
                                        <strong>{money(plan.priceMinor, "GBP")}</strong>
                                        <span>/ month</span>
                                    </div>
                                    <p className={styles.planTagline}>{plan.tagline}</p>
                                    <ul className={styles.planFeatures}>
                                        {plan.features.map((feature) => (
                                            <li key={feature}>
                                                <Check size={14} strokeWidth={2} aria-hidden="true" />
                                                {feature}
                                            </li>
                                        ))}
                                    </ul>
                                    <button
                                        type="button"
                                        className={isRecommended ? styles.primaryButton : styles.secondaryButton}
                                        onClick={() => continueWithPlan(tier)}
                                        disabled={busy}
                                    >
                                        {checkoutLoading === tier ? "Opening secure checkout…" : `Continue with ${plan.name}`}
                                        {checkoutLoading === tier ? null : <ArrowRight size={14} strokeWidth={2} aria-hidden="true" />}
                                    </button>
                                </article>
                            );
                        })}
                    </div>

                    {checkoutError ? (
                        <div className={styles.error} role="alert">
                            {checkoutError}
                        </div>
                    ) : null}
                </section>

                <footer className={styles.trustRow}>
                    <span><CreditCard size={14} strokeWidth={1.8} aria-hidden="true" /> Secure checkout by Stripe</span>
                    <span><RotateCcw size={14} strokeWidth={1.8} aria-hidden="true" /> Cancel anytime</span>
                    <span><ShieldCheck size={14} strokeWidth={1.8} aria-hidden="true" /> Access returns the moment you pay</span>
                </footer>
            </div>
        </div>
    );
}
