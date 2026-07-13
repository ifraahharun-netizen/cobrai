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

function formatCurrencyMinor(value: number) {
    return new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "GBP",
        maximumFractionDigits: 0,
    }).format(Math.max(0, value) / 100);
}

export default function TrialUpgradeGate({ user, status }: Props) {
    const [checkoutLoading, setCheckoutLoading] = useState(false);
    const [checkoutError, setCheckoutError] = useState("");

    const protectedRevenue = useMemo(
        () => formatCurrencyMinor(status.impact.revenueProtectedMinor),
        [status.impact.revenueProtectedMinor]
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
                throw new Error(
                    data?.error || "Unable to open secure checkout."
                );
            }

            window.location.assign(data.url);
        } catch (error) {
            setCheckoutError(
                error instanceof Error
                    ? error.message
                    : "Unable to open secure checkout."
            );
            setCheckoutLoading(false);
        }
    }

    if (!status.trialExpired || status.hasActiveSubscription) {
        return null;
    }

    return (
        <div
            className={styles.overlay}
            role="dialog"
            aria-modal="true"
            aria-labelledby="trial-upgrade-title"
            aria-describedby="trial-upgrade-summary"
        >
            <div className={styles.backdrop} />

            <section className={styles.modal}>
                <header className={styles.header}>
                    <span className={styles.eyebrow}>
                        Your 14-day Pro trial results
                    </span>

                    <h1 id="trial-upgrade-title" className={styles.title}>
                        Keep protecting your revenue
                    </h1>

                    <p id="trial-upgrade-summary" className={styles.subtitle}>
                        Cobrai found and acted on customer risk during your
                        trial. Choose Pro to keep monitoring, predicting and
                        preventing churn.
                    </p>
                </header>

                <div className={styles.statsGrid}>
                    <article className={styles.statCard}>
                        <span>Revenue protected</span>
                        <strong>{protectedRevenue}</strong>
                    </article>

                    <article className={styles.statCard}>
                        <span>Customers retained</span>
                        <strong>
                            {status.impact.customersRetained.toLocaleString(
                                "en-GB"
                            )}
                        </strong>
                    </article>

                    <article className={styles.statCard}>
                        <span>High-risk accounts found</span>
                        <strong>
                            {status.impact.highRiskAccounts.toLocaleString(
                                "en-GB"
                            )}
                        </strong>
                    </article>

                    <article className={styles.statCard}>
                        <span>AI actions generated</span>
                        <strong>
                            {status.impact.aiActionsGenerated.toLocaleString(
                                "en-GB"
                            )}
                        </strong>
                    </article>
                </div>

                <div className={styles.insight}>
                    <div className={styles.insightHeading}>
                        <span className={styles.insightMark}>AI</span>
                        <h2>OpenAI outcome summary</h2>
                    </div>

                    <p>{status.summary}</p>
                </div>

                <div className={styles.plan}>
                    <div>
                        <span className={styles.planLabel}>Cobrai Pro</span>
                        <div className={styles.priceRow}>
                            <strong>£149</strong>
                            <span>/ month</span>
                        </div>
                        <p>
                            Continue with every feature and all the intelligence
                            already working across your workspace.
                        </p>
                    </div>

                    <ul className={styles.features}>
                        <li>AI retention intelligence</li>
                        <li>Revenue recovery actions</li>
                        <li>Risk forecasting and analytics</li>
                        <li>Customer integrations and automations</li>
                    </ul>
                </div>

                {checkoutError ? (
                    <div className={styles.error} role="alert">
                        {checkoutError}
                    </div>
                ) : null}

                <button
                    type="button"
                    className={styles.upgradeButton}
                    onClick={continueWithPro}
                    disabled={checkoutLoading}
                >
                    {checkoutLoading
                        ? "Opening secure checkout..."
                        : "Continue with Pro"}
                </button>

                <p className={styles.footerNote}>
                    Secure billing through Stripe. Cancel anytime.
                </p>
            </section>
        </div>
    );
}
