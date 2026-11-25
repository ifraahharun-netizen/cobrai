"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { ArrowRight, Clock, X } from "lucide-react";

import { firstTimeThisSession, trackConversionEvent } from "@/lib/billing/trackClient";
import type { TrialStatus } from "./TrialUpgradeGate";
import styles from "./TrialEndingBanner.module.css";

/** Days before the trial ends when the banner starts showing (day 11 of 14). */
export const TRIAL_BANNER_DAYS = 4;

export function shouldShowTrialBanner(status: TrialStatus | null): boolean {
    return Boolean(
        status &&
        status.trialActive &&
        !status.hasActiveSubscription &&
        !status.accessExempt &&
        status.daysRemaining > 0 &&
        status.daysRemaining <= TRIAL_BANNER_DAYS
    );
}

function money(minor: number, currency: string) {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(
        Math.max(0, minor) / 100
    );
}

const DISMISS_KEY = "cobrai:trial-banner-dismissed";

export default function TrialEndingBanner({
    user,
    status,
    onOpenReport,
}: {
    user: User;
    status: TrialStatus;
    onOpenReport: () => void;
}) {
    // Dismissing hides it for the rest of the day; it comes back tomorrow.
    const [dismissed, setDismissed] = useState(true);

    useEffect(() => {
        let hidden = false;
        try {
            hidden = window.localStorage.getItem(DISMISS_KEY) === new Date().toISOString().slice(0, 10);
        } catch {
            hidden = false;
        }
        setDismissed(hidden);
        if (!hidden && firstTimeThisSession(`cobrai:banner_viewed:${status.workspaceId}`, true)) {
            trackConversionEvent(user, "banner_viewed", { daysRemaining: status.daysRemaining });
        }
    }, [user, status.workspaceId, status.daysRemaining]);

    if (dismissed) return null;

    const currency = status.currency || "GBP";
    const stake = status.atStake;
    const atStakeMinor = (stake?.atRiskMinor ?? 0) + (stake?.failedPaymentsMinor ?? 0);
    const days = status.daysRemaining;
    const when = days === 1 ? "tomorrow" : `in ${days} days`;

    const message =
        atStakeMinor > 0
            ? `${money(atStakeMinor, currency)} a month needs attention, and Cobrai has a next step ready for each account.`
            : "Choose a plan now and nothing changes when your trial ends.";

    function dismiss() {
        try {
            window.localStorage.setItem(DISMISS_KEY, new Date().toISOString().slice(0, 10));
        } catch {
            // Ignore: it will simply show again.
        }
        setDismissed(true);
    }

    return (
        <div className={styles.banner} role="region" aria-label="Trial ending soon">
            <span className={styles.icon} aria-hidden="true">
                <Clock size={15} strokeWidth={1.8} />
            </span>
            <p className={styles.text}>
                <strong>Your trial ends {when}.</strong> {message}
            </p>
            <button
                type="button"
                className={styles.cta}
                onClick={() => {
                    trackConversionEvent(user, "banner_clicked", { daysRemaining: days });
                    onOpenReport();
                }}
            >
                See your report
                <ArrowRight size={14} strokeWidth={2} aria-hidden="true" />
            </button>
            <button type="button" className={styles.dismiss} onClick={dismiss} aria-label="Hide until tomorrow">
                <X size={15} strokeWidth={2} aria-hidden="true" />
            </button>
        </div>
    );
}
