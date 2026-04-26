import type { CustomerFact, FailedInvoiceRow, RiskBand, TopCustomerRow } from "./types";

function isValidDate(value: unknown): value is string {
    return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function daysSince(dateString: string | null | undefined): number | null {
    if (!dateString || !isValidDate(dateString)) return null;
    const now = Date.now();
    const then = new Date(dateString).getTime();
    const diff = now - then;
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

function toRiskBand(churnRisk: number): RiskBand {
    if (churnRisk >= 0.8) return "high";
    if (churnRisk >= 0.5) return "medium";
    return "low";
}

export function buildCustomerFacts(args: {
    customers: TopCustomerRow[];
    failedInvoices: FailedInvoiceRow[];
    source?: "demo" | "live";
}): CustomerFact[] {
    const failedByCustomer = new Map<string, { count: number; totalAmount: number }>();

    for (const inv of args.failedInvoices) {
        if (!inv.customer?.id) continue;

        const key = inv.customer.id;
        const current = failedByCustomer.get(key) ?? { count: 0, totalAmount: 0 };
        current.count += 1;
        current.totalAmount += Number(inv.amount || 0);
        failedByCustomer.set(key, current);
    }

    return args.customers.map((c) => {
        const inactiveDays = daysSince(c.lastActiveAt?.toISOString() ?? null);
        const riskBand = toRiskBand(Number(c.churnRisk || 0));
        const failed = failedByCustomer.get(c.id);

        const reasonFlags: string[] = [];

        if ((c.churnRisk ?? 0) >= 0.8) reasonFlags.push("high_churn");
        if ((c.healthScore ?? 100) < 40) reasonFlags.push("low_health");
        if ((inactiveDays ?? 0) >= 21) reasonFlags.push("inactive_21d");
        if ((inactiveDays ?? 0) >= 30) reasonFlags.push("inactive_30d");
        if ((failed?.count ?? 0) > 0) reasonFlags.push("billing_failed_recent");

        return {
            id: c.id,
            name: c.name,
            mrr: Number(c.mrr || 0),
            churnRisk: Number(c.churnRisk || 0),
            healthScore: c.healthScore ?? null,
            lastActiveAt: c.lastActiveAt?.toISOString() ?? null,
            daysInactive: inactiveDays,
            riskBand,
            recentBillingFailure: (failed?.count ?? 0) > 0,
            recentBillingFailureAmount: Number(failed?.totalAmount ?? 0),
            reasonFlags,
            source: args.source ?? "demo",
        };
    });
}