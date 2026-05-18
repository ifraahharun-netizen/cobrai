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

    // Supports both 0.87 and 87
    if (value > 1) {
        return Math.min(100, Math.max(0, value)) / 100;
    }

    return Math.min(1, Math.max(0, value));
}

function toRiskBand(churnRisk: number): RiskBand {
    const risk = normaliseRisk(churnRisk);

    if (risk >= 0.8) return "high";
    if (risk >= 0.5) return "medium";

    return "low";
}

function inferUsageTrend(args: {
    churnRisk: number;
    inactiveDays: number | null;
    healthScore: number | null;
}): "up" | "down" | "flat" {
    if (
        (args.inactiveDays ?? 0) >= 14 ||
        args.churnRisk >= 0.7 ||
        (args.healthScore ?? 100) < 45
    ) {
        return "down";
    }

    if (
        args.churnRisk <= 0.3 &&
        (args.healthScore ?? 0) >= 75
    ) {
        return "up";
    }

    return "flat";
}

function inferEngagementScore(args: {
    inactiveDays: number | null;
    healthScore: number | null;
    churnRisk: number;
}): number {
    const inactivePenalty = Math.min(
        40,
        (args.inactiveDays ?? 0) * 1.5
    );

    const churnPenalty = args.churnRisk * 35;

    const healthBoost = (args.healthScore ?? 50) * 0.45;

    const score =
        100 -
        inactivePenalty -
        churnPenalty +
        healthBoost;

    return Math.max(0, Math.min(100, Math.round(score)));
}

function inferRecentLoginCount(
    inactiveDays: number | null
): number {
    if (inactiveDays === null) return 0;

    if (inactiveDays <= 2) return 14;
    if (inactiveDays <= 5) return 9;
    if (inactiveDays <= 10) return 5;
    if (inactiveDays <= 20) return 2;

    return 0;
}

function inferTeamSeats(mrr: number): number {
    if (mrr >= 5000) return 80;
    if (mrr >= 2000) return 35;
    if (mrr >= 1000) return 15;
    if (mrr >= 500) return 8;

    return 3;
}

function inferSupportTicketCount(args: {
    churnRisk: number;
    failedInvoiceCount: number;
    healthScore: number | null;
}): number {
    let count = 0;

    if (args.churnRisk >= 0.75) count += 2;
    if ((args.healthScore ?? 100) < 45) count += 2;
    if (args.failedInvoiceCount > 0) count += 1;

    return count;
}

function buildReasonFlags(args: {
    churnRisk: number;
    healthScore: number | null;
    inactiveDays: number | null;
    failedInvoiceCount: number;
    usageTrend: "up" | "down" | "flat";
    engagementScore: number;
    recentLoginCount: number;
    supportTicketCount: number;
}): string[] {
    const reasonFlags: string[] = [];

    const risk = normaliseRisk(args.churnRisk);

    if (risk >= 0.8) {
        reasonFlags.push("high_churn");
    }

    if ((args.healthScore ?? 100) < 40) {
        reasonFlags.push("low_health");
    }

    if ((args.inactiveDays ?? 0) >= 14) {
        reasonFlags.push("inactive_14d");
    }

    if ((args.inactiveDays ?? 0) >= 21) {
        reasonFlags.push("inactive_21d");
    }

    if ((args.inactiveDays ?? 0) >= 30) {
        reasonFlags.push("inactive_30d");
    }

    if (args.failedInvoiceCount > 0) {
        reasonFlags.push("billing_failed_recent");
    }

    if (args.usageTrend === "down") {
        reasonFlags.push("usage_declining");
    }

    if (args.engagementScore <= 35) {
        reasonFlags.push("low_engagement");
    }

    if (args.recentLoginCount <= 1) {
        reasonFlags.push("minimal_logins");
    }

    if (args.supportTicketCount >= 3) {
        reasonFlags.push("support_friction");
    }

    return reasonFlags;
}

export function buildCustomerFacts(args: {
    customers: TopCustomerRow[];
    failedInvoices: FailedInvoiceRow[];
    source?: DataSource;
}): CustomerFact[] {
    const failedByCustomer = new Map<
        string,
        {
            count: number;
            totalAmount: number;
        }
    >();

    for (const invoice of args.failedInvoices) {
        const customerId = invoice.customer?.id;

        if (!customerId) continue;

        const current =
            failedByCustomer.get(customerId) ?? {
                count: 0,
                totalAmount: 0,
            };

        current.count += 1;
        current.totalAmount += Number(invoice.amount || 0);

        failedByCustomer.set(customerId, current);
    }

    return args.customers.map((customer) => {
        const inactiveDays = daysSince(
            customer.lastActiveAt?.toISOString() ?? null
        );

        const churnRisk = normaliseRisk(
            Number(customer.churnRisk || 0)
        );

        const riskBand = toRiskBand(churnRisk);

        const failed = failedByCustomer.get(customer.id);

        const failedInvoiceCount = failed?.count ?? 0;

        const recentBillingFailureAmount = Number(
            failed?.totalAmount ?? 0
        );

        const usageTrend = inferUsageTrend({
            churnRisk,
            inactiveDays,
            healthScore: customer.healthScore ?? null,
        });

        const engagementScore = inferEngagementScore({
            inactiveDays,
            healthScore: customer.healthScore ?? null,
            churnRisk,
        });

        const recentLoginCount =
            inferRecentLoginCount(inactiveDays);

        const teamSeats = inferTeamSeats(
            Number(customer.mrr || 0)
        );

        const supportTicketCount =
            inferSupportTicketCount({
                churnRisk,
                failedInvoiceCount,
                healthScore: customer.healthScore ?? null,
            });

        const lastPaymentStatus =
            failedInvoiceCount > 0
                ? "failed"
                : "paid";

        const reasonFlags = buildReasonFlags({
            churnRisk,
            healthScore: customer.healthScore ?? null,
            inactiveDays,
            failedInvoiceCount,
            usageTrend,
            engagementScore,
            recentLoginCount,
            supportTicketCount,
        });

        return {
            id: customer.id,

            name: customer.name,

            mrr: Number(customer.mrr || 0),

            churnRisk,

            healthScore:
                customer.healthScore ?? null,

            lastActiveAt:
                customer.lastActiveAt?.toISOString() ??
                null,

            daysInactive: inactiveDays,

            riskBand,

            recentBillingFailure:
                failedInvoiceCount > 0,

            recentBillingFailureAmount,

            reasonFlags,

            usageTrend,

            engagementScore,

            recentLoginCount,

            supportTicketCount,

            lastPaymentStatus,

            teamSeats,

            plan: null,

            source: args.source ?? "demo",
        };
    });
}