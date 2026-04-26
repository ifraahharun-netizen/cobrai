import type { GeneratedPlan, PlanScope, ExecutionOptions } from "./types";

export const SCOPES: PlanScope[] = [
    {
        key: "highRisk",
        label: "High-risk customers only",
        hint: "Focus on accounts most likely to churn soon",
        defaultOn: true,
    },
    {
        key: "mediumRisk",
        label: "Medium risk customers",
        hint: "Prevent risk from escalating",
    },
    {
        key: "newCustomers",
        label: "New customers (first 30 days)",
        hint: "Reduce early churn and onboarding drop-off",
    },
    {
        key: "billingOnly",
        label: "Billing issues only",
        hint: "Payment failures, dunning, expiring cards",
    },
];

export const DEFAULT_EXECUTION: ExecutionOptions = {
    createTasks: true,
    syncCrm: false,
    sendOutreach: false,
};

export function mockGeneratePlan(): GeneratedPlan {
    return {
        summary: {
            highRiskCount: 4,
            mrrAtRisk: 2596,
            churnWindow: "7–14 days",
            patternsFound: 7,
            customersAnalysed: 412,
        },
        actions: [
            {
                key: "billingRecovery",
                priority: 1,
                title: "Billing Recovery",
                why: "2 customers had failed payments in the last 48 hours.",
                recommended: [
                    "Send payment reminder",
                    "Retry charge in 24 hours",
                    "Flag for manual outreach if second failure",
                ],
                impactLabel: "Potential save: £900 MRR",
                affectedCount: 2,
            },
            {
                key: "featureAdoption",
                priority: 2,
                title: "Feature Adoption",
                why: "Low adoption of core feature X detected across 3 accounts.",
                recommended: [
                    "Trigger onboarding email (feature X)",
                    "Assign follow-up call to unblock setup",
                ],
                impactLabel: "Potential save: £500 MRR",
                affectedCount: 3,
            },
            {
                key: "usageDropoff",
                priority: 2,
                title: "Usage Drop-off",
                why: "Sessions dropped >40% week-over-week for 2 accounts.",
                recommended: [
                    "Send “quick win” checklist",
                    "Surface in-app prompt for key workflow",
                ],
                impactLabel: "Potential save: £350 MRR",
                affectedCount: 2,
            },
            {
                key: "supportBacklog",
                priority: 3,
                title: "Support Backlog",
                why: "Unresolved tickets correlate with churn in 3 accounts.",
                recommended: [
                    "Prioritise tickets tagged “billing” and “setup”",
                    "Offer 15-min fast-track call",
                ],
                impactLabel: "Potential save: £250 MRR",
                affectedCount: 3,
            },
        ],
        expected: {
            mrrPrevented: 1400,
            riskReductionPct: 32,
        },
    };
}
