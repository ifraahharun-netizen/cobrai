// src/lib/ai/actionCopy.ts

import type { RecommendedActionType } from "./types";

export type ActionCopyItem = {
    title: string;
    description: string;
};

export const actionCopy = {
    send_billing_recovery_email: {
        title: "Recover payment",
        description:
            "Send a billing recovery email to resolve the failed payment and retain this customer.",
    },

    send_reactivation_email: {
        title: "Re-engage customer",
        description:
            "Send a reactivation email to bring the customer back and restore engagement.",
    },

    assign_csm_outreach: {
        title: "Manual outreach",
        description:
            "Reach out to this customer directly to prevent churn and understand concerns.",
    },

    review_health_blockers: {
        title: "Review account issues",
        description:
            "Investigate what is causing low engagement or friction in this account.",
    },

    retry_failed_payment: {
        title: "Retry failed payment",
        description:
            "Attempt to recover revenue by retrying a failed payment for this account.",
    },

    view_failed_accounts: {
        title: "Review failed accounts",
        description:
            "Open the failed accounts list to prioritise customers that need immediate follow-up.",
    },

    monitor_account: {
        title: "Monitor account",
        description:
            "No immediate action required. Continue tracking this account for changes.",
    },

    none: {
        title: "No action needed",
        description: "This account is stable and requires no action.",
    },
} satisfies Record<RecommendedActionType, ActionCopyItem>;