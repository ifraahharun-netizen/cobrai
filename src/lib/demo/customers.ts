export type CobraiCustomerListItem = {
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
};



export function getDemoCustomers(): CobraiCustomerListItem[] {
    return [
        {
            id: "demo-cedarworks",
            name: "CedarWorks",
            email: "support@cedarworks.io",
            plan: "Pro",
            seats: 24,
            mrr: 21900,
            churnRisk: 91,
            riskScore: 91,
            healthScore: 22,
            lastActiveAt: "2026-04-12T10:00:00.000Z",
            createdAt: "2025-11-08T09:00:00.000Z",
            status: "Critical risk",
            stripeCustomerId: null,
            hubspotCompanyId: null,
        },
        {
            id: "demo-kite-labs",
            name: "Kite Labs",
            email: "finance@kitelabs.io",
            plan: "Pro",
            seats: 18,
            mrr: 12900,
            churnRisk: 87,
            riskScore: 87,
            healthScore: 28,
            lastActiveAt: "2026-04-04T09:00:00.000Z",
            createdAt: "2025-10-14T09:00:00.000Z",
            status: "Critical risk",
            stripeCustomerId: null,
            hubspotCompanyId: null,
        },
        {
            id: "demo-nova-pay",
            name: "NovaPay",
            email: "ops@novapay.io",
            plan: "Starter",
            seats: 12,
            mrr: 8400,
            churnRisk: 76,
            riskScore: 76,
            healthScore: 41,
            lastActiveAt: "2026-04-18T13:00:00.000Z",
            createdAt: "2025-12-02T09:00:00.000Z",
            status: "High risk",
            stripeCustomerId: null,
            hubspotCompanyId: null,
        },
        {
            id: "demo-brightdesk",
            name: "BrightDesk",
            email: "hello@brightdesk.co",
            plan: "Starter",
            seats: 10,
            mrr: 7200,
            churnRisk: 69,
            riskScore: 69,
            healthScore: 48,
            lastActiveAt: "2026-04-20T16:00:00.000Z",
            createdAt: "2026-01-05T09:00:00.000Z",
            status: "Medium risk",
            stripeCustomerId: null,
            hubspotCompanyId: null,
        },
        {
            id: "demo-orbit-crm",
            name: "Orbit CRM",
            email: "team@orbitcrm.com",
            plan: "Pro",
            seats: 9,
            mrr: 6600,
            churnRisk: 63,
            riskScore: 63,
            healthScore: 52,
            lastActiveAt: "2026-04-21T11:00:00.000Z",
            createdAt: "2026-01-18T09:00:00.000Z",
            status: "Medium risk",
            stripeCustomerId: null,
            hubspotCompanyId: null,
        },
        {
            id: "demo-flowbyte",
            name: "Flowbyte",
            email: "billing@flowbyte.io",
            plan: "Starter",
            seats: 8,
            mrr: 5100,
            churnRisk: 58,
            riskScore: 58,
            healthScore: 56,
            lastActiveAt: "2026-04-22T15:00:00.000Z",
            createdAt: "2026-02-02T09:00:00.000Z",
            status: "Medium risk",
            stripeCustomerId: null,
            hubspotCompanyId: null,
        },
        {
            id: "demo-cloudora",
            name: "Cloudora",
            email: "success@cloudora.ai",
            plan: "Starter",
            seats: 7,
            mrr: 4700,
            churnRisk: 48,
            riskScore: 48,
            healthScore: 66,
            lastActiveAt: "2026-04-25T10:00:00.000Z",
            createdAt: "2026-02-12T09:00:00.000Z",
            status: "Low risk",
            stripeCustomerId: null,
            hubspotCompanyId: null,
        },
        {
            id: "demo-signalstack",
            name: "SignalStack",
            email: "admin@signalstack.io",
            plan: "Starter",
            seats: 6,
            mrr: 3900,
            churnRisk: 44,
            riskScore: 44,
            healthScore: 70,
            lastActiveAt: "2026-04-26T12:00:00.000Z",
            createdAt: "2026-02-24T09:00:00.000Z",
            status: "Low risk",
            stripeCustomerId: null,
            hubspotCompanyId: null,
        },
        {
            id: "demo-paypilot",
            name: "PayPilot",
            email: "accounts@paypilot.co",
            plan: "Starter",
            seats: 5,
            mrr: 3200,
            churnRisk: 39,
            riskScore: 39,
            healthScore: 74,
            lastActiveAt: "2026-04-27T09:00:00.000Z",
            createdAt: "2026-03-01T09:00:00.000Z",
            status: "Low risk",
            stripeCustomerId: null,
            hubspotCompanyId: null,
        },
        {
            id: "demo-retainly",
            name: "Retainly",
            email: "team@retainly.io",
            plan: "Starter",
            seats: 4,
            mrr: 2800,
            churnRisk: 35,
            riskScore: 35,
            healthScore: 78,
            lastActiveAt: "2026-04-28T10:00:00.000Z",
            createdAt: "2026-03-08T09:00:00.000Z",
            status: "Low risk",
            stripeCustomerId: null,
            hubspotCompanyId: null,
        },
        {
            id: "demo-launchgrid",
            name: "LaunchGrid",
            email: "hello@launchgrid.co",
            plan: "Starter",
            seats: 3,
            mrr: 2100,
            churnRisk: 28,
            riskScore: 28,
            healthScore: 84,
            lastActiveAt: "2026-04-28T14:00:00.000Z",
            createdAt: "2026-03-15T09:00:00.000Z",
            status: "Healthy",
            stripeCustomerId: null,
            hubspotCompanyId: null,
        },
        {
            id: "demo-metriclane",
            name: "MetricLane",
            email: "ops@metriclane.io",
            plan: "Starter",
            seats: 3,
            mrr: 1900,
            churnRisk: 22,
            riskScore: 22,
            healthScore: 89,
            lastActiveAt: "2026-04-29T08:00:00.000Z",
            createdAt: "2026-03-22T09:00:00.000Z",
            status: "Healthy",
            stripeCustomerId: null,
            hubspotCompanyId: null,
        },
    ];
}


type DemoRecoveryQueueType =
    | "immediate_attention"
    | "billing_recovery"
    | "upsell_opportunity"
    | "reactivation"
    | "expansion_momentum";

export function getDemoRecoveryQueue() {
    return getDemoCustomers()
        .filter((customer) => Number(customer.mrr || 0) > 0)
        .sort((a, b) => Number(b.churnRisk || 0) - Number(a.churnRisk || 0))
        .slice(0, 8)
        .map((customer) => {
            const churnRisk = Number(customer.churnRisk || 0);
            const healthScore = Number(customer.healthScore || 0);
            const mrrMinor = Number(customer.mrr || 0);

            const isCritical = churnRisk >= 85;
            const isHighRisk = churnRisk >= 70;
            const isMediumRisk = churnRisk >= 55;

            const type: DemoRecoveryQueueType = isCritical
                ? "immediate_attention"
                : isHighRisk
                    ? "reactivation"
                    : isMediumRisk
                        ? "reactivation"
                        : "upsell_opportunity";

            const opportunity = isCritical
                ? "Retention recovery"
                : isHighRisk
                    ? "Usage recovery"
                    : isMediumRisk
                        ? "Engagement recovery"
                        : "Expansion opportunity";

            const whyNow = isCritical
                ? `${customer.name} has very high churn risk, weak health, and meaningful MRR exposure, making this one of the most urgent recovery accounts.`
                : isHighRisk
                    ? `${customer.name} is showing elevated retention risk while still contributing meaningful MRR, so early outreach could prevent revenue loss.`
                    : isMediumRisk
                        ? `${customer.name} has weaker engagement signals that could turn into churn if the account is left untouched.`
                        : `${customer.name} is healthy and recently active, making this a good moment to explore upgrade or expansion potential.`;
            const suggestedAction = isCritical
                ? "Send a personalised retention email and offer a founder-led check-in this week."
                : isHighRisk
                    ? "Schedule a check-in focused on recent value, blockers, and next steps."
                    : isMediumRisk
                        ? "Send a usage recovery email with one clear action to restart engagement."
                        : "Review plan fit and test an upgrade, annual plan, or seat expansion offer.";

            return {
                id: customer.id,
                customerId: customer.id,
                accountRiskId: customer.id,
                type,
                priority: isCritical
                    ? "Critical"
                    : isHighRisk
                        ? "High"
                        : isMediumRisk
                            ? "Medium"
                            : "Low",
                name: customer.name,
                email: customer.email,

                reason: whyNow,
                action: suggestedAction,

                opportunity,
                whyNow,
                suggestedAction,

                valueMinor: mrrMinor,
                confidence: isCritical ? 92 : isHighRisk ? 84 : isMediumRisk ? 72 : 68,
                lastEventAt: customer.lastActiveAt,
            };
        });
}