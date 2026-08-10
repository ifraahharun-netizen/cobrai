"use client";

import TrialUpgradeGate, {
    type TrialStatus,
} from "../dashboard/_components/TrialUpgradeGate";

const previewStatus: TrialStatus = {
    workspaceId: "preview-workspace",
    tier: "free",

    trialStartedAt: "2026-07-27T00:00:00.000Z",
    trialEndsAt: "2026-08-10T00:00:00.000Z",

    trialExpired: true,
    trialActive: false,
    hasActiveSubscription: false,
    daysRemaining: 0,

    impact: {
        revenueProtectedMinor: 245000,
        customersRetained: 7,
        accountsMonitored: 124,
        highRiskAccounts: 18,
        aiActionsGenerated: 43,
        paymentsRecovered: 4,
    },

    summary:
        "During your 14-day trial, Cobrai identified high-risk accounts before churn, surfaced retention opportunities and generated targeted actions to help protect recurring revenue.",
};

export default function TrialUpgradeGatePreviewPage() {
    const previewUser = {
        getIdToken: async () => "preview-token",
    };

    return (
        <TrialUpgradeGate
            user={previewUser as never}
            status={previewStatus}
        />
    );
}