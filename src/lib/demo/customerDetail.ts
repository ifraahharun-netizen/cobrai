import { getDemoCustomers } from "./customers";

export type ActivityItem = {
    type:
    | "billing"
    | "usage"
    | "email"
    | "plan"
    | "support"
    | "automation"
    | "ai"
    | "engagement";

    label: string;

    description?: string;

    at: string;

    severity?: "info" | "warn" | "risk" | "success";

    status?: "completed" | "ongoing" | "failed";
};

export type EmailSuggestion = {
    key: string;
    title: string;
    subject: string;
    preview: string;
};

export type CobraiCustomerDetail = {
    id: string;
    name: string;
    email: string | null;
    plan: string | null;
    seats: number | null;
    mrr: number | null;
    churnRisk: number | null;
    riskScore: number | null;
    healthScore: number | null;
    lastActiveAt: string | null;
    createdAt: string;
    status: string | null;
    stripeCustomerId: string | null;
    hubspotCompanyId: string | null;

    activity: ActivityItem[];

    emailSuggestions: EmailSuggestion[];

    mode: "demo" | "live";

    workspaceTier?: string;

    scenario?: string;

    aiReasons?: string[];

    confidence?: "high" | "medium" | "low";

    protectedMrr?: number | null;

    riskDelta?: number;

    riskTrend?: "increasing" | "stable" | "recovering";
};


type ScenarioType =
    | "billing_risk"
    | "usage_drop"
    | "support_risk"
    | "expansion";

function minutesAgo(minutes: number) {
    return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

const scenarioTimelineMap: Record<ScenarioType, ActivityItem[]> = {
    billing_risk: [
        {
            type: "billing",
            label: "Invoice payment failed",
            description:
                "Stripe failed to collect latest invoice payment.",
            at: minutesAgo(320),
            severity: "risk",
            status: "failed",
        },

        {
            type: "ai",
            label: "Cobrai detected billing churn risk",
            description:
                "AI identified elevated churn probability from failed billing activity.",
            at: minutesAgo(300),
            severity: "warn",
            status: "completed",
        },

        {
            type: "automation",
            label: "Retry payment automation executed",
            description:
                "Secure payment recovery flow launched automatically.",
            at: minutesAgo(290),
            severity: "info",
            status: "completed",
        },

        {
            type: "email",
            label: "Billing recovery email delivered",
            description:
                "AI-generated payment recovery sequence sent successfully.",
            at: minutesAgo(280),
            severity: "success",
            status: "completed",
        },

        {
            type: "engagement",
            label: "Customer reopened billing portal",
            description:
                "Customer re-engaged with payment recovery workflow.",
            at: minutesAgo(90),
            severity: "success",
            status: "ongoing",
        },
    ],

    usage_drop: [
        {
            type: "usage",
            label: "Weekly usage dropped 43%",
            description:
                "Workspace engagement significantly decreased this week.",
            at: minutesAgo(720),
            severity: "risk",
            status: "ongoing",
        },

        {
            type: "ai",
            label: "Cobrai increased churn risk score",
            description:
                "Risk score increased from 58 → 81 based on engagement decline.",
            at: minutesAgo(680),
            severity: "warn",
            status: "completed",
        },

        {
            type: "automation",
            label: "Re-engagement workflow launched",
            description:
                "Automated customer retention sequence initiated.",
            at: minutesAgo(650),
            severity: "info",
            status: "completed",
        },

        {
            type: "email",
            label: "AI-generated check-in email sent",
            description:
                "Personalized outreach delivered to customer stakeholders.",
            at: minutesAgo(620),
            severity: "success",
            status: "completed",
        },

        {
            type: "engagement",
            label: "Customer reopened platform",
            description:
                "Login activity resumed after re-engagement outreach.",
            at: minutesAgo(120),
            severity: "success",
            status: "ongoing",
        },
    ],

    support_risk: [
        {
            type: "support",
            label: "Support backlog increased",
            description:
                "Customer has unresolved tickets impacting satisfaction.",
            at: minutesAgo(900),
            severity: "warn",
            status: "ongoing",
        },

        {
            type: "ai",
            label: "Executive disengagement detected",
            description:
                "No admin activity detected in 16 days.",
            at: minutesAgo(840),
            severity: "risk",
            status: "completed",
        },

        {
            type: "email",
            label: "Customer success outreach sent",
            description:
                "Retention-focused support escalation initiated.",
            at: minutesAgo(780),
            severity: "info",
            status: "completed",
        },

        {
            type: "engagement",
            label: "Customer replied to support outreach",
            description:
                "Stakeholder acknowledged support recovery plan.",
            at: minutesAgo(220),
            severity: "success",
            status: "ongoing",
        },
    ],

    expansion: [
        {
            type: "engagement",
            label: "Team usage increased 31%",
            description:
                "Platform engagement expanding across customer workspace.",
            at: minutesAgo(500),
            severity: "success",
            status: "completed",
        },

        {
            type: "ai",
            label: "Expansion opportunity detected",
            description:
                "AI identified strong upgrade likelihood.",
            at: minutesAgo(470),
            severity: "success",
            status: "completed",
        },

        {
            type: "email",
            label: "Upgrade opportunity email sent",
            description:
                "Expansion recommendation delivered successfully.",
            at: minutesAgo(420),
            severity: "success",
            status: "completed",
        },

        {
            type: "engagement",
            label: "Customer viewed pricing page",
            description:
                "Expansion-related product interest detected.",
            at: minutesAgo(180),
            severity: "success",
            status: "ongoing",
        },
    ],
};

const scenarioReasons: Record<ScenarioType, string[]> = {
    billing_risk: [
        "2 failed invoice payment attempts",
        "Billing owner inactive for 8 days",
        "Subscription marked past_due",
        "High MRR account requires urgent recovery",
    ],

    usage_drop: [
        "Weekly usage declined 43%",
        "No admin login detected in 12 days",
        "Team engagement trend decreasing",
        "Core feature adoption slowing",
    ],

    support_risk: [
        "Support ticket backlog increased",
        "Customer sentiment declining",
        "Delayed support resolution times",
        "Executive stakeholder disengaged",
    ],

    expansion: [
        "Workspace usage increased 31%",
        "Additional team members onboarded",
        "Feature adoption expanding",
        "High upgrade probability detected",
    ],
};

export function getDemoCustomerDetail(
    id: string
): CobraiCustomerDetail | null {
    const base = getDemoCustomers().find((c) => c.id === id);

    if (!base) return null;

    const scenario =
        ((base as any).scenario as ScenarioType) || "usage_drop";

    const riskTrend =
        scenario === "expansion"
            ? "recovering"
            : "increasing";

    return {
        ...base,

        mode: "demo",

        workspaceTier: "starter",

        scenario,

        confidence:
            scenario === "billing_risk"
                ? "high"
                : scenario === "usage_drop"
                    ? "high"
                    : "medium",

        protectedMrr: base.mrr || 0,

        riskDelta:
            scenario === "expansion"
                ? -12
                : 14,

        riskTrend,

        aiReasons:
            scenarioReasons[scenario] || [],

        activity:
            scenarioTimelineMap[scenario] || [],

        emailSuggestions: [
            {
                key: "billing-recovery",

                title: "Billing recovery email",

                subject: `Quick billing check-in — ${base.name}`,

                preview:
                    "We noticed a billing-related issue and wanted to help resolve it quickly.",
            },

            {
                key: "re-engagement",

                title: "Re-engagement email",

                subject: `Can we help your team get value this week? — ${base.name}`,

                preview:
                    "We noticed engagement has declined and wanted to help your team get back on track.",
            },

            {
                key: "check-in",

                title: "Customer success check-in",

                subject: `Quick check-in — ${base.name}`,

                preview:
                    "Just reaching out to make sure your team is getting value from the platform.",
            },
        ],
    };
}