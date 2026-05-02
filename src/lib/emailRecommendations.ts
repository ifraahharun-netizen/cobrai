export type EmailRecommendation = {
    type:
    | "payment_recovery"
    | "usage_recovery"
    | "renewal_checkin"
    | "onboarding_help"
    | "downgrade_save"
    | "retention_followup";
    action: string;
    subject: string;
    message: string;
};

export function getEmailRecommendation({
    accountName,
    reason,
    senderName = "Team",
    companyName = "Your company",
}: {
    accountName: string;
    reason: string;
    senderName?: string;
    companyName?: string;
}): EmailRecommendation {
    const text = reason.toLowerCase();
    const signOff = `Best,\n${senderName}\n${companyName}`;

    if (
        text.includes("payment") ||
        text.includes("billing") ||
        text.includes("invoice") ||
        text.includes("failed")
    ) {
        return {
            type: "payment_recovery",
            action: "Send payment recovery email",
            subject: `Quick billing check — ${accountName}`,
            message: `Hi ${accountName} team,

We noticed there may be a billing issue affecting your account.

Would it be helpful if we reviewed this quickly so everything continues smoothly?

${signOff}`,
        };
    }

    if (
        text.includes("usage") ||
        text.includes("adoption") ||
        text.includes("inactive") ||
        text.includes("activity dropped") ||
        text.includes("dropped")
    ) {
        return {
            type: "usage_recovery",
            action: "Send re-engagement email",
            subject: `Can we help you get more value from ${accountName}?`,
            message: `Hi ${accountName} team,

We noticed usage has dropped recently, so I wanted to check in.

Would it be useful if we shared a few quick ways your team can get more value this week?

${signOff}`,
        };
    }

    if (
        text.includes("renewal") ||
        text.includes("downgrade") ||
        text.includes("cancel") ||
        text.includes("churn")
    ) {
        return {
            type: "renewal_checkin",
            action: "Book retention check-in",
            subject: `Quick renewal check-in — ${accountName}`,
            message: `Hi ${accountName} team,

I wanted to check in ahead of your renewal.

We’ve seen a few signals that suggest your team may be reviewing the plan. Happy to align on what’s working and what we can improve.

${signOff}`,
        };
    }

    if (
        text.includes("trial") ||
        text.includes("onboarding") ||
        text.includes("setup") ||
        text.includes("seats inactive")
    ) {
        return {
            type: "onboarding_help",
            action: "Send onboarding support email",
            subject: `Need help getting set up?`,
            message: `Hi ${accountName} team,

I noticed your team may still be early in setup.

Would it help if we walked through the fastest way to get fully onboarded and seeing value?

${signOff}`,
        };
    }

    return {
        type: "retention_followup",
        action: "Send retention follow-up",
        subject: `Quick check-in — ${accountName}`,
        message: `Hi ${accountName} team,

Just wanted to check in and see how things are going.

Is there anything we can help with to make sure you're getting the value you expected?

${signOff}`,
    };
}