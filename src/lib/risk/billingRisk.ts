/**
 * Risk inputs from billing data, shared by the Stripe sync (which stores
 * Customer.riskScore) and the accounts-at-risk route (which recomputes it with
 * reasons), so both give the same score. Pure module.
 *
 * There is no product-usage source yet, so activity is passed as unknown
 * (null) and never counts against a customer.
 */
export type CustomerInvoiceRow = {
    status: string;
    dueAt: Date;
    paidAt: Date | null;
    failedAt: Date | null;
};

export function billingRiskInputs(args: {
    mrrMinor: number;
    previousMonthMrrMinor: number | null;
    subscriptionStatus: string;
    cancelAtPeriodEnd: boolean;
    invoices: CustomerInvoiceRow[];
}) {
    const unpaid = args.invoices.filter((i) => i.status === "failed" || i.status === "uncollectible");
    const prev = args.previousMonthMrrMinor;
    return {
        churnRisk: null,
        healthScore: null,
        lastActiveAt: null, // no usage source yet: unknown, not inactive
        invoices: unpaid.map((i) => ({ status: "failed", dueAt: i.dueAt, paidAt: i.paidAt })),
        failedPayments: unpaid.length,
        subscriptionStatus: args.subscriptionStatus,
        cancelAtPeriodEnd: args.cancelAtPeriodEnd,
        mrrChangePct: prev && prev > 0 ? ((args.mrrMinor - prev) / prev) * 100 : null,
        mrr: args.mrrMinor,
    };
}
