export type TimelineSeverity =
    | "info"
    | "success"
    | "warning"
    | "danger";

export type TimelineCategory =
    | "billing"
    | "automation"
    | "engagement"
    | "retention"
    | "ai_insight"
    | "customer";

export type TimelinePresentation = {
    title: string;
    description: string;
    severity: TimelineSeverity;
    category: TimelineCategory;
};

export function getTimelinePresentation(
    type: string,
    metadata?: Record<string, any>
): TimelinePresentation {
    switch (type) {

        // BILLING

        case "payment_failed":
            return {
                title: "Failed payment recorded",

                description:
                    "A subscription payment attempt failed and may require customer follow-up.",

                severity: "danger",
                category: "billing",
            };

        case "billing_issue_detected":
            return {
                title: "Billing issue detected",

                description:
                    "A failed renewal payment was detected for this account. Cobrai increased churn priority automatically.",

                severity: "warning",
                category: "billing",
            };

        case "billing_recovery_email_sent":
            return {
                title: "Retention email sent",

                description:
                    "A billing recovery email was automatically sent after a failed payment attempt was detected.",

                severity: "info",
                category: "automation",
            };

        case "billing_recovery_email_opened":
            return {
                title: "Customer opened retention email",

                description:
                    "The customer opened the recovery email shortly after delivery.",

                severity: "success",
                category: "engagement",
            };

        case "payment_recovered":
            return {
                title: "Payment successfully recovered",

                description:
                    "The failed invoice was recovered and the subscription returned to good standing.",

                severity: "success",
                category: "retention",
            };

        // ENGAGEMENT

        case "usage_dropped":
            return {
                title: "Product engagement declined",

                description:
                    "Cobrai detected a meaningful drop in product usage compared to the customer’s normal activity trend.",

                severity: "warning",
                category: "engagement",
            };

        case "inactivity_detected":
            return {
                title: "Customer inactivity detected",

                description:
                    "Customer activity levels dropped below their normal engagement baseline.",

                severity: "danger",
                category: "engagement",
            };

        case "reengagement_email_sent":
            return {
                title: "Re-engagement email sent",

                description:
                    "An outreach email was triggered after Cobrai detected reduced engagement patterns.",

                severity: "info",
                category: "automation",
            };

        case "reengagement_email_opened":
            return {
                title: "Customer opened outreach email",

                description:
                    "The customer opened the re-engagement email after a period of declining activity.",

                severity: "success",
                category: "engagement",
            };

        case "engagement_recovered":
            return {
                title: "Customer re-engaged",

                description:
                    "Customer engagement activity improved following recent retention outreach.",

                severity: "success",
                category: "retention",
            };

        // RISK

        case "risk_increased":
            return {
                title: "Risk score increased",

                description:
                    "Cobrai detected declining engagement activity and reduced product usage over the last 7 days.",

                severity: "danger",
                category: "ai_insight",
            };

        case "risk_decreased":
            return {
                title: "Risk score decreased",

                description:
                    "Customer engagement activity recovered after recent outreach and improved platform usage.",

                severity: "success",
                category: "retention",
            };

        case "risk_stabilized":
            return {
                title: "Risk score stabilized",

                description:
                    "Recent customer behaviour suggests churn probability is no longer increasing.",

                severity: "success",
                category: "retention",
            };

        // CUSTOMER ACTIONS

        case "checkin_email_sent":
            return {
                title: "Customer check-in email sent",

                description:
                    "A proactive follow-up email was sent to strengthen customer engagement and retention.",

                severity: "info",
                category: "customer",
            };

        case "plan_upgraded":
            return {
                title: metadata?.planName
                    ? `Customer upgraded to ${metadata.planName}`
                    : "Subscription upgraded",

                description:
                    "The customer expanded their subscription after increased product adoption.",

                severity: "success",
                category: "customer",
            };

        case "account_reviewed":
            return {
                title: "Retention health recalculated",

                description:
                    "Cobrai refreshed churn predictions using the latest billing and engagement activity.",

                severity: "info",
                category: "ai_insight",
            };

        case "customer_reengaged":
            return {
                title: "Customer re-engaged",

                description:
                    "The customer returned to the platform after a period of inactivity.",

                severity: "success",
                category: "retention",
            };

        // DEFAULT

        default:
            return {
                title: metadata?.rawLabel || "Retention activity recorded",

                description:
                    "Cobrai recorded a new customer retention activity event.",

                severity: "info",
                category: "customer",
            };
    }
}