"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";

import styles from "./TrialUpgradeGate.module.css";

type TrialImpact = {
    accountsMonitored: number;
    highRiskAccounts: number;
    aiActionsGenerated: number;
    customersRetained: number;
    revenueProtectedMinor: number;
    paymentsRecovered: number;
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
    summary: string;
};

type Props = {
    user: User;
    status: TrialStatus;
};

type MetricIconName = "shield" | "users" | "monitor" | "warning" | "spark";

function formatCurrencyMinor(value: number) {
    return new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "GBP",
        maximumFractionDigits: 0,
    }).format(Math.max(0, value) / 100);
}

function MetricIcon({ name }: { name: MetricIconName }) {
    if (name === "shield") {
        return (
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3.2 18.3 5.6v5.2c0 4.4-2.6 8.1-6.3 10-3.7-1.9-6.3-5.6-6.3-10V5.6L12 3.2Z" />
                <path d="M12 8v7M9.7 10.4h4.6" />
            </svg>
        );
    }

    if (name === "users") {
        return (
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="9" cy="8.1" r="2.7" />
                <path d="M4.6 17.6v-1.1c0-2 1.6-3.6 3.6-3.6h1.6c2 0 3.6 1.6 3.6 3.6v1.1" />
                <circle cx="16.7" cy="9.1" r="2.1" />
                <path d="M15.6 13.5h.9c1.7 0 3.1 1.4 3.1 3.1v1" />
            </svg>
        );
    }

    if (name === "monitor") {
        return (
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m4.4 15.9 4.1-4.3 3.1 2.9 6-7" />
                <path d="M14.8 7.5h3.1v3.1" />
            </svg>
        );
    }

    if (name === "warning") {
        return (
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m12 4 8.2 14.1H3.8L12 4Z" />
                <path d="M12 9v4.5M12 16.7h.01" />
            </svg>
        );
    }

    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m13.2 2.8-7 10.1h5.3l-.7 8.3 7-10.3h-5.2l.6-8.1Z" />
        </svg>
    );
}

function CheckIcon() {
    return (
        <span className={styles.checkIcon} aria-hidden="true">
            <svg viewBox="0 0 16 16">
                <path d="m4 8.2 2.4 2.4L12 5.4" />
            </svg>
        </span>
    );
}

function ExecutiveVisual() {
    return (
        <div className={styles.executiveVisual} aria-hidden="true">
            <div className={styles.visualSkeleton}>
                <span />
                <span />
            </div>

            <svg className={styles.visualChart} viewBox="0 0 172 92">
                <defs>
                    <linearGradient id="trial-chart-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.22" />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                    </linearGradient>
                </defs>
                <path className={styles.visualArea} d="M8 75 26 63 43 48 59 55 79 34 96 42 117 20 137 29 162 8V84H8Z" />
                <path className={styles.visualLine} d="M8 75 26 63 43 48 59 55 79 34 96 42 117 20 137 29 162 8" />
            </svg>

            <div className={styles.visualDonut}>
                <span />
            </div>

            <div className={styles.visualRows}>
                <i />
                <i />
                <i />
            </div>
        </div>
    );
}

export default function TrialUpgradeGate({ user, status }: Props) {
    const [checkoutLoading, setCheckoutLoading] = useState(false);
    const [checkoutError, setCheckoutError] = useState("");

    const protectedRevenue = useMemo(
        () => formatCurrencyMinor(status.impact.revenueProtectedMinor),
        [status.impact.revenueProtectedMinor]
    );

    const metrics = useMemo(
        () => [
            { label: "Revenue Protected", value: protectedRevenue, description: "Estimated MRR protected from churn", icon: "shield" as const },
            { label: "Customers Saved", value: status.impact.customersRetained.toLocaleString("en-GB"), description: "Customers retained thanks to Cobrai", icon: "users" as const },
            { label: "Accounts Monitored", value: status.impact.accountsMonitored.toLocaleString("en-GB"), description: "Active accounts analysed by AI", icon: "monitor" as const },
            { label: "High-Risk Accounts", value: status.impact.highRiskAccounts.toLocaleString("en-GB"), description: "Accounts identified as high churn risk", icon: "warning" as const },
            { label: "AI Recommendations", value: status.impact.aiActionsGenerated.toLocaleString("en-GB"), description: "Retention actions generated by AI", icon: "spark" as const },
        ],
        [protectedRevenue, status.impact.accountsMonitored, status.impact.aiActionsGenerated, status.impact.customersRetained, status.impact.highRiskAccounts]
    );

    useEffect(() => {
        if (!status.trialExpired) return;

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [status.trialExpired]);

    async function continueWithPro() {
        if (checkoutLoading) return;

        setCheckoutLoading(true);
        setCheckoutError("");

        try {
            const token = await user.getIdToken();
            const response = await fetch("/api/stripe/checkout", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    workspaceId: status.workspaceId,
                    tier: "pro",
                }),
            });

            const data = (await response.json().catch(() => null)) as
                | { url?: string; error?: string }
                | null;

            if (!response.ok || !data?.url) {
                throw new Error(data?.error || "Unable to open secure checkout.");
            }

            window.location.assign(data.url);
        } catch (error) {
            setCheckoutError(
                error instanceof Error ? error.message : "Unable to open secure checkout."
            );
            setCheckoutLoading(false);
        }
    }

    if (!status.trialExpired || status.hasActiveSubscription) {
        return null;
    }

    return (
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="trial-upgrade-title" aria-describedby="trial-upgrade-summary">
            <div className={styles.backdrop} />

            <section className={styles.modal}>
                <header className={styles.header}>
                    <span className={styles.eyebrow}>
                        <span className={styles.eyebrowSpark} aria-hidden="true">✦</span>
                        AI Retention Report
                    </span>

                    <h1 id="trial-upgrade-title" className={styles.title}>
                        Your <span>AI Retention Report</span>
                    </h1>

                    <p id="trial-upgrade-summary" className={styles.subtitle}>
                        Insights from 14 days of AI-powered analysis across your customers, billing, support and product usage.
                    </p>
                </header>

                <div className={styles.statsGrid}>
                    {metrics.map((metric) => (
                        <article className={styles.statCard} key={metric.label}>
                            <span className={styles.statIcon}><MetricIcon name={metric.icon} /></span>
                            <strong>{metric.value}</strong>
                            <span className={styles.statLabel}>{metric.label}</span>
                            <p>{metric.description}</p>
                        </article>
                    ))}
                </div>

                <section className={styles.executiveCard}>
                    <div className={styles.executiveCopy}>
                        <div className={styles.executiveHeading}>
                            <span className={styles.executiveMark} aria-hidden="true">✦</span>
                            <h2>Cobrai Executive Summary</h2>
                        </div>
                        <p>{status.summary}</p>
                    </div>
                    <ExecutiveVisual />
                </section>

                <div className={styles.planHeading}>
                    <h2>Continue protecting your revenue</h2>
                    <p>Choose the plan that fits your business</p>
                </div>

                <section className={styles.planGrid}>
                    <article className={styles.starterCard}>
                        <div>
                            <span className={styles.planName}>Starter</span>
                            <div className={styles.priceRow}><strong>£99</strong><span>/ month</span></div>
                            <p className={styles.planDescription}>Everything you need to get started with AI-powered retention.</p>
                        </div>

                        <ul className={styles.features}>
                            <li><CheckIcon />AI-powered churn insights</li>
                            <li><CheckIcon />Customer list ranked by risk score and MRR</li>
                            <li><CheckIcon />Customer health scoring</li>
                            <li><CheckIcon />Limited AI-generated retention emails</li>
                            <li><CheckIcon />MRR and churn trend charts</li>
                            <li><CheckIcon />Limited visibility into MRR drivers</li>
                            <li><CheckIcon />Limited visibility into churn drivers</li>
                        </ul>

                        <button type="button" className={styles.secondaryButton} onClick={continueWithPro} disabled={checkoutLoading}>
                            Continue with Starter
                        </button>
                    </article>

                    <article className={styles.proCard}>
                        <div className={styles.popularBadge}><span aria-hidden="true">★</span>Most popular</div>

                        <div>
                            <span className={styles.proName}>Pro</span>
                            <div className={styles.priceRow}><strong>£149</strong><span>/ month</span></div>
                            <p className={styles.planDescription}>Advanced AI retention to automate recovery and protect more revenue.</p>
                        </div>

                        <ul className={styles.features}>
                            <li><CheckIcon />Everything in Starter</li>
                            <li><CheckIcon />Unlimited AI insights</li>
                            <li><CheckIcon />Advanced MRR forecasting</li>
                            <li><CheckIcon />Churn prediction and retention signals</li>
                            <li><CheckIcon />Unlimited AI retention emails</li>
                            <li><CheckIcon />Automated failed payment recovery</li>
                            <li><CheckIcon />Retention execution monitoring</li>
                            <li><CheckIcon />Full visibility into MRR and churn drivers</li>
                            <li><CheckIcon />Critical account prioritisation</li>
                            <li><CheckIcon />Advanced retention automations</li>
                        </ul>

                        <button type="button" className={styles.upgradeButton} onClick={continueWithPro} disabled={checkoutLoading}>
                            {checkoutLoading ? "Opening secure checkout..." : "Continue with Pro"}
                        </button>
                    </article>
                </section>

                {checkoutError ? <div className={styles.error} role="alert">{checkoutError}</div> : null}

                <section className={styles.trustRow}>
                    <div>
                        <span className={styles.trustIcon} aria-hidden="true"><MetricIcon name="shield" /></span>
                        <p><strong>Secure Stripe billing</strong>Your payment details are safe and encrypted.</p>
                    </div>
                    <div>
                        <span className={styles.trustIcon} aria-hidden="true">↻</span>
                        <p><strong>Cancel anytime</strong>No lock-in contracts. Cancel in seconds.</p>
                    </div>
                    <div>
                        <span className={styles.trustIcon} aria-hidden="true"><MetricIcon name="spark" /></span>
                        <p><strong>Instant activation</strong>Get full access immediately after checkout.</p>
                    </div>
                </section>

                <p className={styles.footerNote}>Have questions? Contact our support team anytime.</p>
            </section>
        </div>
    );
}
