// lib/demo/retentionActivity.ts

export type RetentionOutcome = "success" | "pending" | "failed";
export type RetentionKind = "email" | "retry_payment";
export type ConfidenceLevel = "High" | "Medium" | "Low";

export type RetentionSignal = {
    label: string;
    severity: "low" | "medium" | "high";
};

export type DemoRetentionActivityRow = {
    id: string;
    accountId: string;
    customerId: string;
    account: string;
    email: string | null;
    action: string;
    aiReason: string;
    aiRecommendation: string;
    aiSignals: RetentionSignal[];
    outcome: RetentionOutcome;
    mrrSavedMinor: number;
    riskScore: number;
    confidence: ConfidenceLevel;
    date: string;
    kind: RetentionKind;
};

export type DemoRetentionActivityResponse = {
    ok: true;
    mode: "demo";
    currency: "GBP";
    connectedIntegrations: string[];
    kpis: {
        mrrProtectedMinor: number;
        accountsSaved: number;
        actionsExecuted: number;
        successRate: number;
        mrrProtectedPct: number;
        accountsSavedPct: number;
        actionsExecutedPct: number;
        successRatePct: number;
    };
    aiInsight: {
        headline: string;
        summary: string;
        confidence: ConfidenceLevel;
        nextBestAction: string;
        topDriver: string;
    };
    nextPriorityAccounts: {
        id: string;
        account: string;
        aiReason: string;
        aiAction: string;
        mrrMinor: number;
        riskScore: number;
    }[];
    progressBreakdown: DemoRetentionActivityRow[];
};

function daysAgo(days: number) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString();
}

const progressBreakdown: DemoRetentionActivityRow[] = [
    {
        id: "demo-progress-001",
        accountId: "demo-account-acme-groups",
        customerId: "demo-account-acme-groups",
        account: "Acme Groups",
        email: "finance@acmegroups.co.uk",
        action: "Triggered billing recovery workflow",
        aiReason:
            "OpenAI reasoning detected two failed renewal attempts within 48 hours while product usage remained stable. Cobrai classified the risk as billing friction rather than product dissatisfaction.",
        aiRecommendation:
            "Retry payment, send a billing recovery email, and notify the account owner if the invoice remains unpaid.",
        aiSignals: [
            { label: "2 failed renewals", severity: "high" },
            { label: "Usage stable", severity: "low" },
            { label: "Invoice overdue", severity: "medium" },
        ],
        outcome: "success",
        mrrSavedMinor: 20000,
        riskScore: 82,
        confidence: "High",
        date: daysAgo(0),
        kind: "retry_payment",
    },
    {
        id: "demo-progress-002",
        accountId: "demo-account-northstar-ai",
        customerId: "demo-account-northstar-ai",
        account: "Northstar AI",
        email: "ops@northstarai.co",
        action: "Sent re-engagement email",
        aiReason:
            "OpenAI reasoning found weekly active users down 38% over 21 days, with fewer team invites and lower dashboard usage from the admin account.",
        aiRecommendation:
            "Send a re-engagement email focused on feature adoption and offer a short success review.",
        aiSignals: [
            { label: "Usage ↓ 38%", severity: "high" },
            { label: "Invites slowed", severity: "medium" },
            { label: "Admin inactive", severity: "medium" },
        ],
        outcome: "pending",
        mrrSavedMinor: 12000,
        riskScore: 74,
        confidence: "High",
        date: daysAgo(1),
        kind: "email",
    },
    {
        id: "demo-progress-003",
        accountId: "demo-account-peak-ops",
        customerId: "demo-account-peak-ops",
        account: "Peak Ops",
        email: "billing@peakops.io",
        action: "Scheduled retry payment recovery",
        aiReason:
            "OpenAI reasoning detected a failed card charge on renewal day and an expired payment method warning that was not resolved by the customer.",
        aiRecommendation:
            "Schedule automatic retry payment recovery and send a short billing update to the finance contact.",
        aiSignals: [
            { label: "Card failed", severity: "high" },
            { label: "Renewal due", severity: "high" },
            { label: "Payment method expired", severity: "medium" },
        ],
        outcome: "pending",
        mrrSavedMinor: 16000,
        riskScore: 79,
        confidence: "High",
        date: daysAgo(1),
        kind: "retry_payment",
    },
    {
        id: "demo-progress-004",
        accountId: "demo-account-peak-ops",
        customerId: "demo-account-peak-ops",
        account: "Peak Ops",
        email: "billing@peakops.io",
        action: "Recovered failed renewal payment",
        aiReason:
            "OpenAI reasoning confirmed the second retry succeeded after the billing contact opened the recovery email and updated the payment method.",
        aiRecommendation:
            "Mark the account as recovered and continue monitoring renewal behaviour for the next billing cycle.",
        aiSignals: [
            { label: "Retry succeeded", severity: "low" },
            { label: "Email opened", severity: "low" },
            { label: "Billing updated", severity: "low" },
        ],
        outcome: "success",
        mrrSavedMinor: 16000,
        riskScore: 48,
        confidence: "High",
        date: daysAgo(3),
        kind: "retry_payment",
    },
    {
        id: "demo-progress-005",
        accountId: "demo-account-clearpath-labs",
        customerId: "demo-account-clearpath-labs",
        account: "Clearpath Labs",
        email: "success@clearpathlabs.com",
        action: "Sent executive retention check-in",
        aiReason:
            "OpenAI reasoning linked slowed expansion activity with delayed support responses and a 24% decline in collaboration workflow usage.",
        aiRecommendation:
            "Send an executive check-in, acknowledge support delays, and offer a focused adoption review.",
        aiSignals: [
            { label: "Expansion slowed", severity: "medium" },
            { label: "Support delay ↑", severity: "high" },
            { label: "Workflow usage ↓ 24%", severity: "medium" },
        ],
        outcome: "failed",
        mrrSavedMinor: 18000,
        riskScore: 88,
        confidence: "Medium",
        date: daysAgo(5),
        kind: "email",
    },
    {
        id: "demo-progress-006",
        accountId: "demo-account-orbit-stack",
        customerId: "demo-account-orbit-stack",
        account: "Orbit Stack",
        email: "admin@orbitstack.dev",
        action: "Sent billing recovery email",
        aiReason:
            "OpenAI reasoning identified a renewal risk caused by an expired payment method and no billing portal activity after the first reminder.",
        aiRecommendation:
            "Send a concise payment recovery email and escalate to the account owner if there is no response within 24 hours.",
        aiSignals: [
            { label: "Payment expired", severity: "high" },
            { label: "No portal activity", severity: "medium" },
            { label: "First reminder ignored", severity: "medium" },
        ],
        outcome: "failed",
        mrrSavedMinor: 9000,
        riskScore: 81,
        confidence: "Medium",
        date: daysAgo(6),
        kind: "email",
    },
    {
        id: "demo-progress-007",
        accountId: "demo-account-nova-works",
        customerId: "demo-account-nova-works",
        account: "Nova Works",
        email: "team@novaworks.co",
        action: "Sent re-engagement email",
        aiReason:
            "OpenAI reasoning detected no login activity for 12 days, declining seat usage, and lower feature adoption across the newest team members.",
        aiRecommendation:
            "Send an onboarding-focused re-engagement email and recommend a short product walkthrough.",
        aiSignals: [
            { label: "No login 12d", severity: "high" },
            { label: "Seat usage ↓", severity: "medium" },
            { label: "Adoption slowed", severity: "medium" },
        ],
        outcome: "pending",
        mrrSavedMinor: 14000,
        riskScore: 72,
        confidence: "High",
        date: daysAgo(7),
        kind: "email",
    },
    {
        id: "demo-progress-008",
        accountId: "demo-account-luma-health",
        customerId: "demo-account-luma-health",
        account: "Luma Health",
        email: "ops@lumahealth.io",
        action: "Sent adoption recovery email",
        aiReason:
            "OpenAI reasoning found onboarding completion down across recently added users, with only one active admin session in the last 10 days.",
        aiRecommendation:
            "Send an adoption recovery email highlighting the fastest path to value for new users.",
        aiSignals: [
            { label: "Onboarding ↓", severity: "high" },
            { label: "Admin inactive", severity: "medium" },
            { label: "New users stuck", severity: "medium" },
        ],
        outcome: "success",
        mrrSavedMinor: 11000,
        riskScore: 64,
        confidence: "Medium",
        date: daysAgo(8),
        kind: "email",
    },
    {
        id: "demo-progress-009",
        accountId: "demo-account-cobalt-crm",
        customerId: "demo-account-cobalt-crm",
        account: "Cobalt CRM",
        email: "growth@cobaltcrm.com",
        action: "Sent expansion risk check-in",
        aiReason:
            "OpenAI reasoning detected a drop in power-user sessions after pricing-page visits increased, suggesting uncertainty around plan value.",
        aiRecommendation:
            "Send a value-focused check-in and offer to review the account before renewal.",
        aiSignals: [
            { label: "Power users ↓", severity: "medium" },
            { label: "Pricing views ↑", severity: "medium" },
            { label: "Renewal soon", severity: "high" },
        ],
        outcome: "success",
        mrrSavedMinor: 17000,
        riskScore: 69,
        confidence: "Medium",
        date: daysAgo(9),
        kind: "email",
    },
    {
        id: "demo-progress-010",
        accountId: "demo-account-cedarworks",
        customerId: "demo-account-cedarworks",
        account: "CedarWorks",
        email: "hello@cedarworks.co",
        action: "Sent silent churn recovery email",
        aiReason:
            "OpenAI reasoning flagged silent churn risk after workspace activity dropped steadily without any support tickets or cancellation messages.",
        aiRecommendation:
            "Send a low-friction check-in asking whether the team needs help getting value from the product.",
        aiSignals: [
            { label: "Silent churn risk", severity: "high" },
            { label: "Activity ↓ 31%", severity: "high" },
            { label: "No tickets", severity: "low" },
        ],
        outcome: "pending",
        mrrSavedMinor: 13000,
        riskScore: 76,
        confidence: "High",
        date: daysAgo(10),
        kind: "email",
    },
];

function calculateKpis(rows: DemoRetentionActivityRow[]) {
    const successfulRows = rows.filter((row) => row.outcome === "success");

    const mrrProtectedMinor = successfulRows.reduce(
        (total, row) => total + row.mrrSavedMinor,
        0
    );

    const accountsSaved = new Set(successfulRows.map((row) => row.customerId)).size;
    const actionsExecuted = rows.length;
    const successRate = Math.round((successfulRows.length / rows.length) * 100);

    return {
        mrrProtectedMinor,
        accountsSaved,
        actionsExecuted,
        successRate,
        mrrProtectedPct: 12,
        accountsSavedPct: 10,
        actionsExecutedPct: 8,
        successRatePct: 5,
    };
}

export function getDemoRetentionActivity(): DemoRetentionActivityResponse {
    const kpis = calculateKpis(progressBreakdown);

    const nextPriorityAccounts = progressBreakdown
        .filter((row) => row.outcome !== "success")
        .sort((a, b) => b.riskScore - a.riskScore)
        .slice(0, 4)
        .map((row) => ({
            id: row.customerId,
            account: row.account,
            aiReason: row.aiReason,
            aiAction: row.aiRecommendation,
            mrrMinor: row.mrrSavedMinor,
            riskScore: row.riskScore,
        }));

    return {
        ok: true,
        mode: "demo",
        currency: "GBP",
        connectedIntegrations: ["stripe", "hubspot", "resend"],
        kpis,
        aiInsight: {
            headline: "OpenAI reasoning found billing friction and usage decline driving retention risk",
            summary:
                "The highest-risk accounts are not all at risk for the same reason. Billing failures are recoverable quickly, while declining activity and slower expansion signals need human follow-up before renewal pressure builds.",
            confidence: "High",
            nextBestAction:
                "Prioritise failed renewal recovery first, then send executive check-ins to accounts with usage decline and support delays.",
            topDriver: "Billing recovery and declining engagement",
        },
        nextPriorityAccounts,
        progressBreakdown,
    };
}