/**
 * The one MRR definition for connected Stripe accounts. Used by the sync, the
 * webhook and the history backfill so they always agree.
 *
 * - Units: MINOR units (pence/cents) of the subscription's currency.
 * - Counts subscriptions that are `active` or `past_due`. `trialing` is
 *   reported separately as trial MRR; `unpaid`, `incomplete`,
 *   `incomplete_expired`, `paused` and `canceled` count as zero.
 * - Normalises every licensed recurring price to a month (yearly / 12,
 *   weekly * 52 / 12, daily * 365 / 12). Metered prices are skipped.
 * - Applies item- and subscription-level coupons (percent off and amount
 *   off) that are in force at the evaluation date. "once" coupons are ignored
 *   because they don't recur.
 *
 * Pure module: no database or Next.js imports, so scripts can test it.
 */
import type Stripe from "stripe";

export const PAYING_STATUSES = new Set(["active", "past_due"]);

export type CouponLookup = (couponId: string) => Stripe.Coupon | null | undefined;

export type SubscriptionMrr = {
    /** Paying MRR (minor units). */
    mrrMinor: number;
    /** MRR of the subscription while it is in trial (minor units). */
    trialMrrMinor: number;
    /** Upper-case ISO currency. */
    currency: string;
    state: "paying" | "trialing" | "none";
};

function toUnix(date: Date) {
    return Math.floor(date.getTime() / 1000);
}

/** How many months one billing period of a price covers. */
export function intervalMonths(recurring: { interval: string; interval_count?: number | null }) {
    const count = recurring.interval_count || 1;
    switch (recurring.interval) {
        case "year":
            return 12 * count;
        case "week":
            return (count * 12) / 52;
        case "day":
            return (count * 12) / 365;
        case "month":
        default:
            return count;
    }
}

function unitAmount(price: Stripe.Price) {
    if (typeof price.unit_amount === "number") return price.unit_amount;
    if (price.unit_amount_decimal) {
        const n = Number(price.unit_amount_decimal);
        return Number.isFinite(n) ? n : 0;
    }
    return 0;
}

function couponOf(
    discount: string | Stripe.Discount | Stripe.DeletedDiscount | null | undefined,
    coupons?: CouponLookup
): Stripe.Coupon | null {
    if (!discount || typeof discount === "string") return null;
    const source = (discount as Stripe.Discount).source as
        | { coupon?: string | Stripe.Coupon | null }
        | undefined;
    // Older API versions put the coupon directly on the discount.
    const raw = source?.coupon ?? (discount as unknown as { coupon?: string | Stripe.Coupon }).coupon;
    if (!raw) return null;
    if (typeof raw === "string") return coupons?.(raw) ?? null;
    return raw;
}

function discountInForce(discount: string | Stripe.Discount, at: number) {
    if (typeof discount === "string") return false;
    if (typeof discount.start === "number" && discount.start > at) return false;
    if (typeof discount.end === "number" && discount.end <= at) return false;
    return true;
}

/**
 * Applies the discounts in force at `at` to a monthly amount. `amount_off`
 * comes off each invoice, and an invoice covers `periodMonths` months.
 */
function applyDiscounts(
    monthlyMinor: number,
    discounts: Array<string | Stripe.Discount> | null | undefined,
    at: number,
    periodMonths: number,
    currency: string,
    coupons?: CouponLookup
) {
    let amount = monthlyMinor;
    for (const discount of discounts ?? []) {
        if (!discountInForce(discount, at)) continue;
        const coupon = couponOf(discount, coupons);
        if (!coupon) continue;
        if (coupon.duration === "once") continue;
        if (typeof coupon.percent_off === "number" && coupon.percent_off > 0) {
            amount *= 1 - coupon.percent_off / 100;
        } else if (typeof coupon.amount_off === "number" && coupon.amount_off > 0) {
            const lower = currency.toLowerCase();
            const off =
                (coupon.currency || "").toLowerCase() === lower
                    ? coupon.amount_off
                    : coupon.currency_options?.[lower]?.amount_off ?? 0;
            amount -= off / Math.max(periodMonths, 1e-9);
        }
    }
    return Math.max(0, amount);
}

/** Monthly value of the subscription's items with discounts in force at `at`. */
export function subscriptionMonthlyValueMinor(
    subscription: Stripe.Subscription,
    at: number,
    coupons?: CouponLookup
) {
    const currency = subscription.currency || "";
    let total = 0;
    let periodMonths = 1;

    for (const item of subscription.items?.data ?? []) {
        const price = item.price;
        if (!price?.recurring) continue;
        if (price.recurring.usage_type === "metered") continue;

        const months = intervalMonths(price.recurring);
        periodMonths = months;
        const perPeriod = unitAmount(price) * (item.quantity ?? 1);
        const monthly = perPeriod / months;
        total += applyDiscounts(monthly, item.discounts as Array<string | Stripe.Discount>, at, months, currency, coupons);
    }

    total = applyDiscounts(total, subscription.discounts, at, periodMonths, currency, coupons);
    return Math.round(total);
}

/**
 * The subscription's MRR. With no `at`, uses the live status. With `at`
 * (a past month end), reconstructs the state at that moment from
 * start_date / trial / ended_at. Past `past_due` / `unpaid` periods can't be
 * reconstructed and count as paying.
 */
export function subscriptionMrr(
    subscription: Stripe.Subscription,
    options: { at?: Date; coupons?: CouponLookup } = {}
): SubscriptionMrr {
    const currency = (subscription.currency || "").toUpperCase();
    const none: SubscriptionMrr = { mrrMinor: 0, trialMrrMinor: 0, currency, state: "none" };

    // Never paid: no revenue at any point.
    if (subscription.status === "incomplete" || subscription.status === "incomplete_expired") {
        return none;
    }

    let state: SubscriptionMrr["state"];
    let at: number;

    if (options.at) {
        at = toUnix(options.at);
        const start = subscription.start_date ?? subscription.created;
        if (start > at) return none;
        if (subscription.ended_at && subscription.ended_at <= at) return none;
        const inTrial =
            !!subscription.trial_end &&
            subscription.trial_end > at &&
            (subscription.trial_start ?? start) <= at;
        state = inTrial ? "trialing" : "paying";
    } else {
        at = toUnix(new Date());
        if (PAYING_STATUSES.has(subscription.status)) state = "paying";
        else if (subscription.status === "trialing") state = "trialing";
        else return none;
    }

    const value = subscriptionMonthlyValueMinor(subscription, at, options.coupons);
    return state === "paying"
        ? { mrrMinor: value, trialMrrMinor: 0, currency, state }
        : { mrrMinor: 0, trialMrrMinor: value, currency, state };
}

export type CustomerMrr = {
    mrrMinor: number;
    trialMrrMinor: number;
    currency: string | null;
};

/**
 * Sums a customer's subscriptions. Stripe bills a customer in one currency,
 * but if several appear the largest wins and the others are dropped rather
 * than added across currencies.
 */
export function customerMrr(
    subscriptions: Stripe.Subscription[],
    options: { at?: Date; coupons?: CouponLookup } = {}
): CustomerMrr {
    const byCurrency = new Map<string, { mrr: number; trial: number }>();
    for (const sub of subscriptions) {
        const r = subscriptionMrr(sub, options);
        if (r.state === "none") continue;
        const row = byCurrency.get(r.currency) ?? { mrr: 0, trial: 0 };
        row.mrr += r.mrrMinor;
        row.trial += r.trialMrrMinor;
        byCurrency.set(r.currency, row);
    }
    let best: [string, { mrr: number; trial: number }] | null = null;
    for (const entry of byCurrency) {
        if (!best || entry[1].mrr + entry[1].trial > best[1].mrr + best[1].trial) best = entry;
    }
    if (!best) {
        const fallback = subscriptions[0]?.currency?.toUpperCase() ?? null;
        return { mrrMinor: 0, trialMrrMinor: 0, currency: fallback };
    }
    return { mrrMinor: best[1].mrr, trialMrrMinor: best[1].trial, currency: best[0] };
}

// ---------------------------------------------------------------------------
// Months (UTC)

export function monthKeyUtc(date: Date) {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Last millisecond of the month, UTC. */
export function monthEndUtc(key: string) {
    const [y, m] = key.split("-").map(Number);
    return new Date(Date.UTC(y, m, 1) - 1);
}

export function monthStartUtc(key: string) {
    const [y, m] = key.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, 1));
}

/** `count` month keys ending with the month of `now`, oldest first. */
export function monthKeysBack(now: Date, count: number) {
    const keys: string[] = [];
    for (let i = count - 1; i >= 0; i--) {
        keys.push(monthKeyUtc(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))));
    }
    return keys;
}

function customerIdOf(sub: Stripe.Subscription) {
    return typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
}

export type MonthlyCustomerMrr = {
    stripeCustomerId: string;
    month: string;
    mrrMinor: number;
    trialMrrMinor: number;
    currency: string | null;
};

/**
 * Per-customer MRR for each month: past months at month end (reconstructed
 * from the subscriptions), the current month from live status. Customers with
 * nothing in a month get no row for it.
 */
export function buildMonthlyCustomerMrr(
    subscriptions: Stripe.Subscription[],
    months: string[],
    now: Date,
    coupons?: CouponLookup
): MonthlyCustomerMrr[] {
    const byCustomer = new Map<string, Stripe.Subscription[]>();
    for (const sub of subscriptions) {
        const id = customerIdOf(sub);
        if (!id) continue;
        const list = byCustomer.get(id) ?? [];
        list.push(sub);
        byCustomer.set(id, list);
    }

    const currentKey = monthKeyUtc(now);
    const rows: MonthlyCustomerMrr[] = [];
    for (const [stripeCustomerId, subs] of byCustomer) {
        for (const month of months) {
            const r =
                month === currentKey
                    ? customerMrr(subs, { coupons })
                    : customerMrr(subs, { at: monthEndUtc(month), coupons });
            if (r.mrrMinor <= 0 && r.trialMrrMinor <= 0) continue;
            rows.push({ stripeCustomerId, month, ...r });
        }
    }
    return rows;
}
