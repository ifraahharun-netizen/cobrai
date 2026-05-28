import type { RecommendedActionType } from "@/lib/ai/types";

type ActionCopyItem = {
    title: string;
    description: string;
};

export const actionCopy = {
    send_billing_recovery_email: {
        title: "Send billing recovery email",
        description:
            "Recover failed payments before subscriptions cancel or revenue is lost.",
    },

    send_reactivation_email: {
        title: "Send reactivation email",
        description:
            "Reconnect with inactive customers showing churn or disengagement signals.",
    },

    assign_csm_outreach: {
        title: "Assign customer outreach",
        description:
            "Create a high-priority outreach task for customer success follow-up.",
    },

    view_failed_accounts: {
        title: "View failed accounts",
        description:
            "Open the failed accounts list to prioritise customers needing immediate action.",
    },

    trigger_winback_campaign: {
        title: "Trigger win-back campaign",
        description:
            "Launch a win-back flow for customers showing churn or inactivity signals.",
    },

    offer_expansion: {
        title: "Offer expansion",
        description:
            "Identify upsell or expansion opportunities based on engagement and growth signals.",
    },

    schedule_success_call: {
        title: "Schedule success call",
        description:
            "Book a proactive customer success call to reduce churn risk and improve retention.",
    },

    review_health_blockers: {
        title: "Review health blockers",
        description:
            "Review engagement, support, and usage blockers impacting customer health.",
    },

    retry_failed_payment: {
        title: "Retry failed payment",
        description:
            "Attempt to recover failed subscription payments before revenue is lost.",
    },

    monitor_account: {
        title: "Monitor account",
        description:
            "Continue monitoring this account for new churn or expansion signals.",
    },

    none: {
        title: "No action needed",
        description:
            "This account currently shows healthy retention and engagement signals.",
    },
} satisfies Record<RecommendedActionType, ActionCopyItem>;