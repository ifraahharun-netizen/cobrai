import type { GeneratedPlan, RiskAccount } from "@/types";

function includesAny(haystack: string, needles: string[]) {
    const t = haystack.toLowerCase();
    return needles.some((n) => t.includes(n));
}

function filterByScopes(accounts: RiskAccount[], scopes: Record<string, boolean>) {
    // scopes: highRisk, mediumRisk, newCustomers, billingOnly
    // For now: newCustomers uses reason keyword heuristics (upgrade later when you have createdAt)
    const wantHigh = !!scopes.highRisk;
    const wantMed = !!scopes.mediumRisk;
    const wantBillingOnly = !!scopes.billingOnly;
    const wantNew = !!scopes.newCustomers;

    let out = accounts.slice();

    // risk thresholds
    out = out.filter((a) => {
        if (a.risk >= 70) return wantHigh;
        if (a.risk >= 60) return wantMed;
        // below 60 not included in wizard scopes for v1
        return false;
    });

    if (wantBillingOnly) {
        out = out.filter((a) => includesAny(a.reason, ["payment", "billing", "invoice", "card", "dunning"]));
    }

    if (wantNew) {
        out = out.filter((a) => includesAny(a.reason, ["onboarding", "first 30", "new customer", "activation"]));
    }

    return out;
}

export function generateRetentionPlan(
    allAccounts: RiskAccount[],
    scopes: Record<string, boolean>
): GeneratedPlan {
    const accounts = filterByScopes(allAccounts, scopes);

    const highRisk = accounts.filter((a) => a.risk >= 70);
    const mediumRisk = accounts.filter((a) => a.risk >= 60 && a.risk < 70);

    const mrrAtRisk = highRisk.reduce((sum, a) => sum + a.mrr, 0);

    // Pattern buckets by reason keywords
    const billing = highRisk.filter((a) => includesAny(a.reason, ["payment", "billing", "invoice", "card", "dunning"]));
    const usage = highRisk.filter((a) => includesAny(a.reason, ["usage", "no login", "drop", "inactive"]));
    const adoption = highRisk.filter((a) => includesAny(a.reason, ["feature", "adoption", "unused", "activation"]));
    const support = highRisk.filter((a) => includesAny(a.reason, ["ticket", "support", "unresolved", "sentiment"]));

    const actions: GeneratedPlan["actions"] = [];

    if (billing.length) {
        actions.push({
            key: "billing",
            priority: 1,
            title: "Billing recovery",
            why: "Failed/at-risk payments detected in high-risk accounts.",
            recommended: ["Send payment reminder", "Trigger dunning retry", "Escalate after 2nd failure"],
            affectedCount: billing.length,
            accountIds: billing.map((a) => a.id),
            impactLabel: `Protect ~£${Math.round(mrrAtRisk * 0.4).toLocaleString()} MRR`,
        });
    }

    if (usage.length) {
        actions.push({
            key: "usage",
            priority: 2,
            title: "Usage re-activation",
            why: "Significant usage drop detected in high-risk accounts.",
            recommended: ["Send quick-win email", "Offer 15-min success call", "Highlight 1 core feature"],
            affectedCount: usage.length,
            accountIds: usage.map((a) => a.id),
            impactLabel: `Protect ~£${Math.round(mrrAtRisk * 0.35).toLocaleString()} MRR`,
        });
    }

    if (adoption.length) {
        actions.push({
            key: "adoption",
            priority: 2,
            title: "Feature adoption push",
            why: "Low adoption of a key feature correlates with churn signals.",
            recommended: ["Send 2-min setup checklist", "In-app nudge", "Book onboarding follow-up"],
            affectedCount: adoption.length,
            accountIds: adoption.map((a) => a.id),
            impactLabel: `Protect ~£${Math.round(mrrAtRisk * 0.25).toLocaleString()} MRR`,
        });
    }

    if (support.length) {
        actions.push({
            key: "support",
            priority: 3,
            title: "Support backlog resolution",
            why: "Unresolved tickets / negative sentiment detected.",
            recommended: ["Fast-track top tickets", "Close-loop email", "Offer support call"],
            affectedCount: support.length,
            accountIds: support.map((a) => a.id),
            impactLabel: `Protect ~£${Math.round(mrrAtRisk * 0.2).toLocaleString()} MRR`,
        });
    }

    // Expected outcome (simple, defensible v1)
    const mrrPrevented = Math.round(mrrAtRisk * 0.6);
    const riskReductionPct = actions.length ? Math.min(45, 18 + actions.length * 7) : 0;

    return {
        summary: {
            highRiskCount: highRisk.length,
            mediumRiskCount: mediumRisk.length,
            customersAnalysed: accounts.length,
            mrrAtRisk,
            churnWindow: "7–14 days",
            patternsFound: actions.length,
        },
        actions,
        expected: { mrrPrevented, riskReductionPct },
    };
}