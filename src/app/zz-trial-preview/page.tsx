"use client";
// TEMPORARY local preview of the trial report. Not committed; delete when done.
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useState } from "react";
import TrialUpgradeGate, { type TrialStatus } from "../(app)/dashboard/_components/TrialUpgradeGate";
import TrialEndingBanner from "../(app)/dashboard/_components/TrialEndingBanner";

function Preview() {
    const params = useSearchParams();
    const empty = params.get("empty") === "1";
    const reminder = params.get("mode") === "reminder";
    const [open, setOpen] = useState(false);
    const status: TrialStatus = {
        workspaceId: "preview", tier: "pro", trialStartedAt: "2026-11-01T00:00:00Z", trialEndsAt: "2026-11-15T00:00:00Z",
        trialExpired: !reminder, trialActive: reminder, hasActiveSubscription: false, daysRemaining: reminder ? 3 : 0, accessExempt: false, currency: "GBP",
        impact: empty
            ? { accountsMonitored: 0, highRiskAccounts: 0, aiActionsGenerated: 0, customersRetained: 0, revenueProtectedMinor: 0, paymentsRecovered: 0 }
            : { accountsMonitored: 229, highRiskAccounts: 8, aiActionsGenerated: 31, customersRetained: 3, revenueProtectedMinor: 41200, paymentsRecovered: 2 },
        atStake: empty ? undefined : {
            mrrTrackedMinor: 223000, atRiskMinor: 43100, atRiskAccounts: 8, failedPaymentsMinor: 27600, failedPayments: 3,
            topAccounts: [
                { name: "Kite Labs", reason: "Payment failed twice", riskScore: 91, mrrMinor: 14900, nextStep: "Retry the payment and email the billing contact" },
                { name: "Cedarworks", reason: "No logins for 26 days", riskScore: 78, mrrMinor: 9900, nextStep: "Send a re-engagement email with a tailored tip" },
                { name: "Nova Pay", reason: "Downgraded last month", riskScore: 64, mrrMinor: 7900, nextStep: "Offer a plan review call before they downgrade further" },
            ],
        },
        summary: "During your 14-day Pro trial, Cobrai monitored 229 customer accounts, identified 8 high-risk accounts and generated 31 retention actions. Recorded outcomes indicate approximately £412 in protected recurring revenue.",
    };
    const user = { getIdToken: async () => "" } as never;
    if (!reminder) return <TrialUpgradeGate user={user} status={status} />;
    return (
        <div style={{ padding: 24, background: "#fff", minHeight: "100vh", fontFamily: "system-ui, sans-serif" }}>
            <TrialEndingBanner user={user} status={status} onOpenReport={() => setOpen(true)} />
            <p style={{ color: "#888" }}>(Dashboard content would be here.)</p>
            {open ? <TrialUpgradeGate user={user} status={status} mode="reminder" onClose={() => setOpen(false)} /> : null}
        </div>
    );
}

export default function Page() {
    return <Suspense><Preview /></Suspense>;
}
