/**
 * Syncs a workspace's connected Stripe account into Cobrai's tables.
 *
 * - StripeCustomer / StripeSubscription mirrors
 * - MrrSnapshot: one row per customer per month (MINOR units). The first sync
 *   (Workspace.stripeHistoryBackfilledAt is null) rebuilds the last 12 months
 *   from subscription dates; later syncs rewrite only the current month.
 * - Customer: mrr (minor), currency, status, canceledAt, customerSince
 * - Invoice: last 120 days of invoices (failed / paid) for risk + recovery
 * - Billing-based risk: Customer.riskScore / churnRisk / healthScore and
 *   AccountRisk rows for customers at risk
 *
 * Used by the sync route, the daily cron and the Connect webhook.
 */
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/stripe";
import { buildAccountRisk } from "@/lib/risk/buildAccountRisk";
import { runWorkspaceAnalyticsPipeline } from "@/lib/analytics/runWorkspaceAnalyticsPipeline";
import {
    PAYING_STATUSES,
    buildMonthlyCustomerMrr,
    customerMrr,
    monthKeyUtc,
    monthKeysBack,
    type CouponLookup,
    type MonthlyCustomerMrr,
} from "./mrr";

import { AT_RISK_THRESHOLD } from "@/lib/risk/thresholds";
import { billingRiskInputs, type CustomerInvoiceRow } from "@/lib/risk/billingRisk";
export { AT_RISK_THRESHOLD };

const SUBSCRIPTION_EXPAND = ["data.discounts", "data.items.data.discounts"];
const INVOICE_LOOKBACK_DAYS = 120;
const BATCH = 50;

function unixToDate(value?: number | null) {
    return value ? new Date(value * 1000) : null;
}

function customerIdOf(value: string | { id: string } | null | undefined) {
    if (!value) return null;
    return typeof value === "string" ? value : value.id;
}

function previousMonthKey(now: Date) {
    return monthKeyUtc(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));
}

async function inBatches<T>(items: T[], run: (batch: T[]) => Promise<unknown>) {
    for (let i = 0; i < items.length; i += BATCH) {
        await run(items.slice(i, i + BATCH));
    }
}

async function listAll<T extends { id: string }>(
    fetchPage: (startingAfter?: string) => Promise<Stripe.ApiList<T>>
) {
    const all: T[] = [];
    let startingAfter: string | undefined;
    while (true) {
        const page = await fetchPage(startingAfter);
        all.push(...page.data);
        if (!page.has_more || page.data.length === 0) break;
        startingAfter = page.data[page.data.length - 1].id;
    }
    return all;
}

// ---------------------------------------------------------------------------
// Coupons: discount.source.coupon may be an id; resolve ids up front.

function discountCouponIds(subscriptions: Stripe.Subscription[]) {
    const ids = new Set<string>();
    const visit = (discounts: unknown) => {
        for (const d of (discounts as Array<string | Stripe.Discount>) ?? []) {
            if (!d || typeof d === "string") continue;
            const coupon = (d.source as { coupon?: unknown } | undefined)?.coupon;
            if (typeof coupon === "string") ids.add(coupon);
        }
    };
    for (const sub of subscriptions) {
        visit(sub.discounts);
        for (const item of sub.items?.data ?? []) visit(item.discounts);
    }
    return ids;
}

async function resolveCoupons(
    stripe: Stripe,
    stripeAccount: string,
    subscriptions: Stripe.Subscription[]
): Promise<CouponLookup> {
    const map = new Map<string, Stripe.Coupon | null>();
    for (const id of discountCouponIds(subscriptions)) {
        try {
            map.set(id, await stripe.coupons.retrieve(id, {}, { stripeAccount }));
        } catch {
            map.set(id, null); // deleted coupon: ignore its discount
        }
    }
    return (id) => map.get(id) ?? null;
}

// ---------------------------------------------------------------------------
// Mirrors

function stripeSubscriptionData(workspaceId: string, sub: Stripe.Subscription, stripeCustomerId: string) {
    const item = sub.items?.data?.[0] as
        | (Stripe.SubscriptionItem & { current_period_start?: number; current_period_end?: number })
        | undefined;
    return {
        workspaceId,
        stripeCustomerId,
        status: sub.status,
        currency: sub.currency ?? null,
        currentPeriodStart: unixToDate(item?.current_period_start ?? null),
        currentPeriodEnd: unixToDate(item?.current_period_end ?? null),
        cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
        canceledAt: unixToDate(sub.canceled_at),
        endedAt: unixToDate(sub.ended_at),
    };
}

export async function upsertStripeCustomerMirror(workspaceId: string, customer: Stripe.Customer) {
    await prisma.stripeCustomer.upsert({
        where: { stripeId: customer.id },
        update: { workspaceId, email: customer.email ?? null, name: customer.name ?? null },
        create: { workspaceId, stripeId: customer.id, email: customer.email ?? null, name: customer.name ?? null },
    });
}

export async function upsertStripeSubscriptionMirror(workspaceId: string, sub: Stripe.Subscription) {
    const stripeCustomerId = customerIdOf(sub.customer);
    if (!stripeCustomerId) return;
    const data = stripeSubscriptionData(workspaceId, sub, stripeCustomerId);
    await prisma.stripeSubscription.upsert({
        where: { stripeId: sub.id },
        update: data,
        create: { ...data, stripeId: sub.id },
    });
}

// ---------------------------------------------------------------------------
// Invoices

/** Cobrai's invoice status: paid | failed | pending | uncollectible. */
export function invoiceStatus(invoice: Stripe.Invoice, now = new Date()) {
    if (invoice.status === "paid") return "paid";
    if (invoice.status === "uncollectible") return "uncollectible";
    if (invoice.status === "open") {
        const attempted = (invoice.attempt_count ?? 0) > 0 && !!invoice.attempted;
        const overdue = !!invoice.due_date && invoice.due_date * 1000 < now.getTime();
        return attempted || overdue ? "failed" : "pending";
    }
    return null; // draft / void: ignore
}

export async function upsertInvoiceFromStripe(args: {
    workspaceId: string;
    customerId: string;
    invoice: Stripe.Invoice;
    /** Set when the caller knows a payment attempt just failed. */
    failedNow?: boolean;
    existingFailedAt?: Date | null;
}) {
    const { workspaceId, customerId, invoice } = args;
    const status = invoiceStatus(invoice);
    if (!status) return;

    const attemptCount = invoice.attempt_count ?? 0;
    const paidAt = status === "paid" ? unixToDate(invoice.status_transitions?.paid_at) ?? new Date() : null;
    const failedBefore = status === "paid" && attemptCount > 1;
    const failedAt =
        args.existingFailedAt ??
        (args.failedNow || status === "failed" || status === "uncollectible" || failedBefore
            ? args.failedNow
                ? new Date()
                : unixToDate(invoice.status_transitions?.finalized_at) ?? unixToDate(invoice.created) ?? new Date()
            : null);

    const data = {
        workspaceId,
        customerId,
        status,
        amount: invoice.amount_due ?? invoice.total ?? 0,
        currency: invoice.currency?.toUpperCase() ?? null,
        dueAt: unixToDate(invoice.due_date) ?? unixToDate(invoice.created) ?? new Date(),
        paidAt,
        attemptCount,
        isDemo: false,
    };

    // Keep failedAt once set, so a later payment still counts as recovered.
    await prisma.invoice.upsert({
        where: { stripeInvoiceId: invoice.id },
        update: failedAt ? { ...data, failedAt } : data,
        create: { ...data, stripeInvoiceId: invoice.id, failedAt },
    });
}

// ---------------------------------------------------------------------------
// Customer state + risk


export function deriveCustomerStatus(subs: Stripe.Subscription[]) {
    const statuses = subs.map((s) => s.status);
    if (statuses.some((s) => PAYING_STATUSES.has(s))) {
        return statuses.includes("past_due") ? "past_due" : "active";
    }
    if (statuses.includes("trialing")) return "trialing";
    if (statuses.includes("unpaid")) return "unpaid";
    if (statuses.includes("paused")) return "paused";
    if (statuses.includes("canceled")) return "canceled";
    return "incomplete";
}

function churnDate(subs: Stripe.Subscription[]) {
    let latest = 0;
    for (const s of subs) {
        const t = s.ended_at ?? s.canceled_at ?? 0;
        if (t > latest) latest = t;
    }
    return latest ? new Date(latest * 1000) : new Date();
}

function hasScheduledCancellation(subs: Stripe.Subscription[]) {
    const now = Date.now() / 1000;
    return subs.some(
        (s) =>
            (PAYING_STATUSES.has(s.status) || s.status === "trialing") &&
            (s.cancel_at_period_end || (!!s.cancel_at && s.cancel_at > now))
    );
}

/**
 * Writes the Customer row for a Stripe customer from all of its
 * subscriptions, then its billing risk. Returns the Customer id.
 */
export async function applyCustomerState(args: {
    workspaceId: string;
    stripeCustomer: Pick<Stripe.Customer, "id" | "name" | "email" | "created">;
    subscriptions: Stripe.Subscription[];
    coupons?: CouponLookup;
    previousMonthMrrMinor: number | null;
    /** Pre-loaded invoices; read from the database when omitted. */
    invoices?: CustomerInvoiceRow[];
}) {
    const { workspaceId, stripeCustomer, subscriptions } = args;
    const current = customerMrr(subscriptions, { coupons: args.coupons });
    const status = deriveCustomerStatus(subscriptions);
    const canceled = status === "canceled";
    const name = stripeCustomer.name || stripeCustomer.email || "Stripe customer";

    const base = {
        name,
        email: stripeCustomer.email ?? null,
        mrr: current.mrrMinor,
        currency: current.currency,
        status,
        canceledAt: canceled ? churnDate(subscriptions) : null,
        customerSince: unixToDate(stripeCustomer.created),
    };

    const customer = await prisma.customer.upsert({
        where: { workspaceId_stripeCustomerId: { workspaceId, stripeCustomerId: stripeCustomer.id } },
        update: base,
        create: { ...base, workspaceId, stripeCustomerId: stripeCustomer.id, churnRisk: 0, riskScore: 0 },
        select: { id: true, riskScore: true },
    });

    const invoices =
        args.invoices ??
        (await prisma.invoice.findMany({
            where: { customerId: customer.id, stripeInvoiceId: { not: null } },
            select: { status: true, dueAt: true, paidAt: true, failedAt: true },
            orderBy: { dueAt: "desc" },
            take: 20,
        }));

    await applyBillingRisk({
        workspaceId,
        customerId: customer.id,
        name,
        previousRiskScore: customer.riskScore,
        canceled,
        mrrMinor: current.mrrMinor,
        previousMonthMrrMinor: args.previousMonthMrrMinor,
        subscriptionStatus: status,
        cancelAtPeriodEnd: hasScheduledCancellation(subscriptions),
        invoices,
    });

    return customer.id;
}

async function applyBillingRisk(args: {
    workspaceId: string;
    customerId: string;
    name: string;
    previousRiskScore: number;
    canceled: boolean;
    mrrMinor: number;
    previousMonthMrrMinor: number | null;
    subscriptionStatus: string;
    cancelAtPeriodEnd: boolean;
    invoices: CustomerInvoiceRow[];
}) {
    const risk = args.canceled
        ? null
        : buildAccountRisk({
            id: args.customerId,
            name: args.name,
            previousRiskScore: args.previousRiskScore,
            ...billingRiskInputs(args),
        });
    const score = risk?.riskScore ?? 0;

    await prisma.customer.update({
        where: { id: args.customerId },
        data: { riskScore: score, churnRisk: score / 100, healthScore: 100 - score },
    });

    if (!risk || score < AT_RISK_THRESHOLD) {
        await prisma.accountRisk.deleteMany({
            where: { workspaceId: args.workspaceId, customerId: args.customerId, isDemo: false },
        });
        return;
    }

    const data = {
        workspaceId: args.workspaceId,
        customerId: args.customerId,
        companyName: args.name,
        riskScore: score,
        previousRiskScore: args.previousRiskScore,
        reasonKey: risk.reasonKey,
        reasonLabel: risk.reasonLabel,
        mrr: args.mrrMinor / 100, // AccountRisk.mrr is MAJOR units
    };
    const existing = await prisma.accountRisk.findFirst({
        where: { workspaceId: args.workspaceId, customerId: args.customerId, isDemo: false },
        select: { id: true },
        orderBy: { updatedAt: "desc" },
    });
    if (existing) {
        await prisma.accountRisk.update({ where: { id: existing.id }, data: { ...data, previousUpdatedAt: new Date() } });
    } else {
        await prisma.accountRisk.create({ data });
    }
}

// ---------------------------------------------------------------------------
// Snapshots

function snapshotData(workspaceId: string, row: MonthlyCustomerMrr, firstSeenMonth: string) {
    return {
        workspaceId,
        stripeCustomerId: row.stripeCustomerId,
        month: row.month,
        mrrMinor: row.mrrMinor,
        trialMrrMinor: row.trialMrrMinor,
        currency: row.currency,
        active: row.mrrMinor > 0,
        firstSeenMonth,
    };
}

/** Upserts (or clears) one customer's snapshot for the current month. */
export async function writeCurrentMonthSnapshot(workspaceId: string, row: MonthlyCustomerMrr) {
    const where = {
        workspaceId_stripeCustomerId_month: {
            workspaceId,
            stripeCustomerId: row.stripeCustomerId,
            month: row.month,
        },
    };
    if (row.mrrMinor <= 0 && row.trialMrrMinor <= 0) {
        await prisma.mrrSnapshot.deleteMany({
            where: { workspaceId, stripeCustomerId: row.stripeCustomerId, month: row.month },
        });
        return;
    }
    const data = snapshotData(workspaceId, row, row.month);
    const { firstSeenMonth: _ignored, ...update } = data;
    void _ignored;
    await prisma.mrrSnapshot.upsert({ where, update, create: data });
}

// ---------------------------------------------------------------------------
// Full sync

export type ConnectedSyncResult = {
    workspaceId: string;
    stripeAccountId: string;
    customers: number;
    subscriptions: number;
    invoices: number;
    month: string;
    monthsWritten: string[];
    historyRebuilt: boolean;
    currency: string;
    totalMrrMinor: number;
    trialMrrMinor: number;
    /** MRR in other currencies, left out of totals. */
    otherCurrencyMrrMinor: Record<string, number>;
};

export async function syncConnectedStripeWorkspace(
    workspaceId: string,
    options: { rebuildHistory?: boolean; runPipeline?: boolean } = {}
): Promise<ConnectedSyncResult> {
    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: {
            id: true,
            stripeAccountId: true,
            stripeConnectedAt: true,
            stripeHistoryBackfilledAt: true,
            currency: true,
        },
    });
    if (!workspace?.stripeAccountId) throw new Error("Stripe is not connected for this workspace");

    const stripe = getStripeClient();
    const stripeAccount = workspace.stripeAccountId;
    const now = new Date();
    const month = monthKeyUtc(now);
    const prevMonth = previousMonthKey(now);

    const customers = (
        await listAll<Stripe.Customer | Stripe.DeletedCustomer>((starting_after) =>
            stripe.customers.list({ limit: 100, starting_after }, { stripeAccount })
        )
    ).filter((c): c is Stripe.Customer => !("deleted" in c && c.deleted));
    const customerById = new Map(customers.map((c) => [c.id, c]));

    const subscriptions = (
        await listAll<Stripe.Subscription>((starting_after) =>
            stripe.subscriptions.list(
                { status: "all", limit: 100, starting_after, expand: SUBSCRIPTION_EXPAND },
                { stripeAccount }
            )
        )
    ).filter((s) => {
        const id = customerIdOf(s.customer);
        return !!id && customerById.has(id);
    });

    const invoices = await listAll<Stripe.Invoice>((starting_after) =>
        stripe.invoices.list(
            {
                limit: 100,
                starting_after,
                created: { gte: Math.floor(now.getTime() / 1000) - INVOICE_LOOKBACK_DAYS * 86400 },
            },
            { stripeAccount }
        )
    );

    const coupons = await resolveCoupons(stripe, stripeAccount, subscriptions);

    // Mirrors
    await inBatches(customers, (batch) =>
        prisma.$transaction(
            batch.map((c) =>
                prisma.stripeCustomer.upsert({
                    where: { stripeId: c.id },
                    update: { workspaceId, email: c.email ?? null, name: c.name ?? null },
                    create: { workspaceId, stripeId: c.id, email: c.email ?? null, name: c.name ?? null },
                })
            )
        )
    );
    await inBatches(subscriptions, (batch) =>
        prisma.$transaction(
            batch.map((s) => {
                const data = stripeSubscriptionData(workspaceId, s, customerIdOf(s.customer)!);
                return prisma.stripeSubscription.upsert({
                    where: { stripeId: s.id },
                    update: data,
                    create: { ...data, stripeId: s.id },
                });
            })
        )
    );

    // Snapshots
    const historyRebuilt = options.rebuildHistory === true || !workspace.stripeHistoryBackfilledAt;
    const monthsWritten = historyRebuilt ? monthKeysBack(now, 13) : [month];
    const rows = buildMonthlyCustomerMrr(subscriptions, monthsWritten, now, coupons);

    const firstSeen = new Map<string, string>();
    for (const r of rows) {
        const f = firstSeen.get(r.stripeCustomerId);
        if (!f || r.month < f) firstSeen.set(r.stripeCustomerId, r.month);
    }

    await prisma.$transaction([
        prisma.mrrSnapshot.deleteMany({ where: { workspaceId, month: { in: monthsWritten } } }),
        prisma.mrrSnapshot.createMany({
            data: rows.map((r) => snapshotData(workspaceId, r, firstSeen.get(r.stripeCustomerId) ?? r.month)),
            skipDuplicates: true,
        }),
    ]);

    // Workspace currency = the currency most current MRR is billed in.
    const currentRows = rows.filter((r) => r.month === month);
    const mrrByCurrency = new Map<string, number>();
    for (const r of currentRows) {
        if (!r.currency) continue;
        mrrByCurrency.set(r.currency, (mrrByCurrency.get(r.currency) ?? 0) + r.mrrMinor + r.trialMrrMinor);
    }
    let currency = (workspace.currency || "GBP").toUpperCase();
    let bestTotal = -1;
    for (const [c, total] of mrrByCurrency) {
        if (total > bestTotal) {
            currency = c;
            bestTotal = total;
        }
    }

    // Previous-month MRR per customer, for downgrade detection.
    const prevMrr = new Map<string, number>();
    if (historyRebuilt) {
        for (const r of rows) if (r.month === prevMonth) prevMrr.set(r.stripeCustomerId, r.mrrMinor);
    } else {
        const prevRows = await prisma.mrrSnapshot.findMany({
            where: { workspaceId, month: prevMonth },
            select: { stripeCustomerId: true, mrrMinor: true },
        });
        for (const r of prevRows) prevMrr.set(r.stripeCustomerId, r.mrrMinor);
    }

    // Customers (anyone who has ever had a subscription)
    const subsByCustomer = new Map<string, Stripe.Subscription[]>();
    for (const s of subscriptions) {
        const id = customerIdOf(s.customer)!;
        const list = subsByCustomer.get(id) ?? [];
        list.push(s);
        subsByCustomer.set(id, list);
    }

    const customerRows = await prisma.customer.findMany({
        where: { workspaceId, stripeCustomerId: { in: Array.from(subsByCustomer.keys()) } },
        select: { id: true, stripeCustomerId: true },
    });
    const cobraiIdByStripeId = new Map(customerRows.map((c) => [c.stripeCustomerId as string, c.id]));
    // Create missing Customer rows first so invoices can reference them.
    const missing = Array.from(subsByCustomer.keys()).filter((id) => !cobraiIdByStripeId.has(id));
    if (missing.length) {
        await prisma.customer.createMany({
            data: missing.map((id) => {
                const c = customerById.get(id)!;
                return {
                    workspaceId,
                    stripeCustomerId: id,
                    name: c.name || c.email || "Stripe customer",
                    email: c.email ?? null,
                    customerSince: unixToDate(c.created),
                    churnRisk: 0,
                    riskScore: 0,
                };
            }),
            skipDuplicates: true,
        });
        const created = await prisma.customer.findMany({
            where: { workspaceId, stripeCustomerId: { in: missing } },
            select: { id: true, stripeCustomerId: true },
        });
        for (const c of created) cobraiIdByStripeId.set(c.stripeCustomerId as string, c.id);
    }

    // Invoices
    const existingInvoices = await prisma.invoice.findMany({
        where: { workspaceId, stripeInvoiceId: { in: invoices.map((i) => i.id) } },
        select: { stripeInvoiceId: true, failedAt: true },
    });
    const failedAtById = new Map(existingInvoices.map((i) => [i.stripeInvoiceId as string, i.failedAt]));
    let invoicesWritten = 0;
    for (const invoice of invoices) {
        const stripeCustomerId = customerIdOf(invoice.customer as string | { id: string } | null);
        const customerId = stripeCustomerId ? cobraiIdByStripeId.get(stripeCustomerId) : undefined;
        if (!customerId || !invoiceStatus(invoice, now)) continue;
        await upsertInvoiceFromStripe({
            workspaceId,
            customerId,
            invoice,
            existingFailedAt: failedAtById.get(invoice.id) ?? null,
        });
        invoicesWritten += 1;
    }

    const invoiceRows = await prisma.invoice.findMany({
        where: { workspaceId, stripeInvoiceId: { not: null } },
        select: { customerId: true, status: true, dueAt: true, paidAt: true, failedAt: true },
        orderBy: { dueAt: "desc" },
    });
    const invoicesByCustomer = new Map<string, CustomerInvoiceRow[]>();
    for (const i of invoiceRows) {
        const list = invoicesByCustomer.get(i.customerId) ?? [];
        list.push(i);
        invoicesByCustomer.set(i.customerId, list);
    }

    for (const [stripeCustomerId, subs] of subsByCustomer) {
        const stripeCustomer = customerById.get(stripeCustomerId)!;
        const cobraiId = cobraiIdByStripeId.get(stripeCustomerId);
        await applyCustomerState({
            workspaceId,
            stripeCustomer,
            subscriptions: subs,
            coupons,
            previousMonthMrrMinor: prevMrr.get(stripeCustomerId) ?? null,
            // Same window as the accounts-at-risk route: latest 20 invoices.
            invoices: cobraiId ? (invoicesByCustomer.get(cobraiId) ?? []).slice(0, 20) : [],
        });
    }

    const syncedAt = new Date();
    await prisma.workspace.update({
        where: { id: workspaceId },
        data: {
            stripeLastSyncedAt: syncedAt,
            currency,
            ...(historyRebuilt ? { stripeHistoryBackfilledAt: syncedAt } : {}),
        },
    });

    await prisma.integration.upsert({
        where: { workspaceId_provider: { workspaceId, provider: "stripe" } },
        update: {
            status: "connected",
            externalAccountId: stripeAccount,
            connectedAt: workspace.stripeConnectedAt ?? syncedAt,
            disconnectedAt: null,
            lastSyncError: null,
            lastSyncedAt: syncedAt,
        },
        create: {
            workspaceId,
            provider: "stripe",
            status: "connected",
            externalAccountId: stripeAccount,
            connectedAt: workspace.stripeConnectedAt ?? syncedAt,
            lastSyncedAt: syncedAt,
        },
    });

    if (options.runPipeline !== false) {
        await runWorkspaceAnalyticsPipeline(workspaceId);
    }

    let totalMrrMinor = 0;
    let trialMrrMinor = 0;
    const otherCurrencyMrrMinor: Record<string, number> = {};
    for (const r of currentRows) {
        if ((r.currency ?? currency) === currency) {
            totalMrrMinor += r.mrrMinor;
            trialMrrMinor += r.trialMrrMinor;
        } else if (r.currency) {
            otherCurrencyMrrMinor[r.currency] = (otherCurrencyMrrMinor[r.currency] ?? 0) + r.mrrMinor;
        }
    }

    return {
        workspaceId,
        stripeAccountId: stripeAccount,
        customers: customers.length,
        subscriptions: subscriptions.length,
        invoices: invoicesWritten,
        month,
        monthsWritten,
        historyRebuilt,
        currency,
        totalMrrMinor,
        trialMrrMinor,
        otherCurrencyMrrMinor,
    };
}

// ---------------------------------------------------------------------------
// Single customer (webhook)

/**
 * Recomputes one customer from all of their subscriptions in Stripe: the
 * current-month snapshot (sum across subscriptions), Customer row and risk.
 */
export async function refreshConnectedCustomer(args: {
    workspaceId: string;
    stripeAccount: string;
    stripeCustomerId: string;
    stripe?: Stripe;
}) {
    const stripe = args.stripe ?? getStripeClient();
    const { workspaceId, stripeAccount, stripeCustomerId } = args;

    const stripeCustomer = await stripe.customers.retrieve(stripeCustomerId, {}, { stripeAccount });
    if ("deleted" in stripeCustomer && stripeCustomer.deleted) return null;
    const customer = stripeCustomer as Stripe.Customer;
    await upsertStripeCustomerMirror(workspaceId, customer);

    const subscriptions = await listAll<Stripe.Subscription>((starting_after) =>
        stripe.subscriptions.list(
            { customer: stripeCustomerId, status: "all", limit: 100, starting_after, expand: SUBSCRIPTION_EXPAND },
            { stripeAccount }
        )
    );
    for (const sub of subscriptions) await upsertStripeSubscriptionMirror(workspaceId, sub);
    if (!subscriptions.length) return null;

    const coupons = await resolveCoupons(stripe, stripeAccount, subscriptions);
    const now = new Date();
    const month = monthKeyUtc(now);
    const current = customerMrr(subscriptions, { coupons });
    await writeCurrentMonthSnapshot(workspaceId, { stripeCustomerId, month, ...current });

    const prev = await prisma.mrrSnapshot.findUnique({
        where: {
            workspaceId_stripeCustomerId_month: { workspaceId, stripeCustomerId, month: previousMonthKey(now) },
        },
        select: { mrrMinor: true },
    });

    const customerId = await applyCustomerState({
        workspaceId,
        stripeCustomer: customer,
        subscriptions,
        coupons,
        previousMonthMrrMinor: prev?.mrrMinor ?? null,
    });

    return { customerId, mrrMinor: current.mrrMinor, currency: current.currency };
}

/** Finds (or creates from Stripe) the Cobrai Customer id for an invoice's customer. */
export async function customerIdForStripeCustomer(args: {
    workspaceId: string;
    stripeAccount: string;
    stripeCustomerId: string;
    stripe?: Stripe;
}) {
    const existing = await prisma.customer.findUnique({
        where: {
            workspaceId_stripeCustomerId: { workspaceId: args.workspaceId, stripeCustomerId: args.stripeCustomerId },
        },
        select: { id: true },
    });
    if (existing) return existing.id;
    const refreshed = await refreshConnectedCustomer(args);
    return refreshed?.customerId ?? null;
}

