// lib/ai/buildCustomerFacts.ts

import type {
    CustomerFact,
    DataSource,
    FailedInvoiceRow,
    RiskBand,
    TopCustomerRow,
} from "./types";

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

function normaliseRisk(value: number): number {
    if (!Number.isFinite(value)) return 0;

    // Supports both 0.87 and 87 formats
    if (value > 1) return Math.min(100, Math.max(0, value)) / 100;

    return Math.min(1, Math.max(0, value));
}

function toRiskBand(churnRisk: number): RiskBand {
    const risk = normaliseRisk(churnRisk);

    if (risk >= 0.8) return "high";
    if (risk >= 0.5) return "medium";
    return "low";
}

function buildReasonFlags(args: {
    churnRisk: number;
    healthScore: number | null;
    inactiveDays: number | null;
    failedInvoiceCount: number;
}): string[] {
    const reasonFlags: string[] = [];

    const risk = normaliseRisk(args.churnRisk);

    if (risk >= 0.8) reasonFlags.push("high_churn");
    if ((args.healthScore ?? 100) < 40) reasonFlags.push("low_health");
    if ((args.inactiveDays ?? 0) >= 21) reasonFlags.push("inactive_21d");
    if ((args.inactiveDays ?? 0) >= 30) reasonFlags.push("inactive_30d");
    if (args.failedInvoiceCount > 0) reasonFlags.push("billing_failed_recent");

    return reasonFlags;
}

export function buildCustomerFacts(args: {
    customers: TopCustomerRow[];
    failedInvoices: FailedInvoiceRow[];
    source?: DataSource;
}): CustomerFact[] {
    const failedByCustomer = new Map<
        string,
        { count: number; totalAmount: number }
    >();

    for (const invoice of args.failedInvoices) {
        const customerId = invoice.customer?.id;

        if (!customerId) continue;

        const current = failedByCustomer.get(customerId) ?? {
            count: 0,
            totalAmount: 0,
        };

        current.count += 1;
        current.totalAmount += Number(invoice.amount || 0);

        failedByCustomer.set(customerId, current);
    }

    return args.customers.map((customer) => {
        const inactiveDays = daysSince(customer.lastActiveAt?.toISOString() ?? null);
        const churnRisk = normaliseRisk(Number(customer.churnRisk || 0));
        const riskBand = toRiskBand(churnRisk);
        const failed = failedByCustomer.get(customer.id);

        const failedInvoiceCount = failed?.count ?? 0;
        const recentBillingFailureAmount = Number(failed?.totalAmount ?? 0);

        const reasonFlags = buildReasonFlags({
            churnRisk,
            healthScore: customer.healthScore ?? null,
            inactiveDays,
            failedInvoiceCount,
        });

        return {
            id: customer.id,
            name: customer.name,
            mrr: Number(customer.mrr || 0),
            churnRisk,
            healthScore: customer.healthScore ?? null,
            lastActiveAt: customer.lastActiveAt?.toISOString() ?? null,
            daysInactive: inactiveDays,
            riskBand,
            recentBillingFailure: failedInvoiceCount > 0,
            recentBillingFailureAmount,
            reasonFlags,
            source: args.source ?? "demo",
        };
    });
}