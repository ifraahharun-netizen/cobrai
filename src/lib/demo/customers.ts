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
            id: "northstar-ai",
            name: "Northstar AI",
            email: "ops@northstar.ai",
            plan: "Scale",
            seats: 22,
            mrr: 740000,
            churnRisk: 81,
            riskScore: 83,
            healthScore: 34,
            lastActiveAt: "2026-03-14T10:00:00Z",
            createdAt: "2025-10-10T09:00:00Z",
            status: "At risk",
            stripeCustomerId: null,
            hubspotCompanyId: null,
        },
        {
            id: "canvas-hub",
            name: "Canvas Hub",
            email: "team@canvashub.co",
            plan: "Pro",
            seats: 14,
            mrr: 490000,
            churnRisk: 57,
            riskScore: 61,
            healthScore: 51,
            lastActiveAt: "2026-03-20T11:00:00Z",
            createdAt: "2025-11-04T09:00:00Z",
            status: "Watch",
            stripeCustomerId: null,
            hubspotCompanyId: null,
        },
        {
            id: "global-tech",
            name: "Global Tech",
            email: "success@globaltech.io",
            plan: "Pro",
            seats: 18,
            mrr: 450000,
            churnRisk: 18,
            riskScore: 18,
            healthScore: 84,
            lastActiveAt: "2026-03-27T13:00:00Z",
            createdAt: "2025-08-12T09:00:00Z",
            status: "Active",
            stripeCustomerId: null,
            hubspotCompanyId: null,
        },
        {
            id: "acme-groups",
            name: "Acme Groups",
            email: "hello@acmegroups.com",
            plan: "Starter",
            seats: 6,
            mrr: 120000,
            churnRisk: 24,
            riskScore: 26,
            healthScore: 79,
            lastActiveAt: "2026-03-26T08:00:00Z",
            createdAt: "2025-12-02T09:00:00Z",
            status: "Active",
            stripeCustomerId: null,
            hubspotCompanyId: null,
        },
    ];
}