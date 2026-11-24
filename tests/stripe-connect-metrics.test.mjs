// Fixture tests for the connected-Stripe metrics maths, checked against hand
// calculations. Run: npm run test:metrics   (Node 22.18+ runs the .ts imports
// directly; these modules have no runtime imports.)
//
// The fixtures mirror the Stripe test-mode scenario: monthly, yearly,
// percent- and amount-off discounts, a trial, a trial that converted, a
// cancellation, past_due and unpaid subscriptions, an upgrade and a downgrade
// made by adding/replacing subscriptions, a reactivation, an
// incomplete_expired subscription and a customer billed in another currency.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
    subscriptionMrr,
    customerMrr,
    buildMonthlyCustomerMrr,
    monthKeysBack,
} from "../src/lib/stripe-connect/mrr.ts";
import { computeMonthlyMetrics } from "../src/lib/stripe-connect/metrics.ts";
import { computeRiskScore } from "../src/lib/risk/computeRiskScore.ts";
import { billingRiskInputs } from "../src/lib/risk/billingRisk.ts";

const t = (iso) => Math.floor(new Date(iso).getTime() / 1000);

let seq = 0;
function coupon(fields) {
    return { id: `co_${++seq}`, object: "coupon", duration: "forever", percent_off: null, amount_off: null, currency: null, ...fields };
}
function discount(c, { start = "2020-01-01", end = null } = {}) {
    return { id: `di_${++seq}`, object: "discount", start: t(start), end: end ? t(end) : null, source: { type: "coupon", coupon: c } };
}
function sub({ customer, status = "active", currency = "gbp", start, ended = null, trialStart = null, trialEnd = null, items, discounts = [] }) {
    return {
        id: `sub_${++seq}`,
        object: "subscription",
        customer,
        status,
        currency,
        created: t(start),
        start_date: t(start),
        ended_at: ended ? t(ended) : null,
        canceled_at: ended ? t(ended) : null,
        trial_start: trialStart ? t(trialStart) : null,
        trial_end: trialEnd ? t(trialEnd) : null,
        cancel_at_period_end: false,
        cancel_at: null,
        discounts,
        items: {
            data: items.map((i) => ({
                id: `si_${++seq}`,
                quantity: i.qty ?? 1,
                discounts: i.discounts ?? [],
                price: {
                    unit_amount: i.amount,
                    recurring: { interval: i.interval ?? "month", interval_count: i.count ?? 1, usage_type: i.usage ?? "licensed" },
                },
            })),
        },
    };
}

// "Now" is mid-November 2026; the current month uses live status.
const NOW = new Date("2026-11-15T12:00:00Z");

const SUBS = [
    // A: £100/month since January
    sub({ customer: "A", start: "2026-01-10", items: [{ amount: 10000 }] }),
    // B: £1,200/year -> £100/month
    sub({ customer: "B", start: "2026-03-05", items: [{ amount: 120000, interval: "year" }] }),
    // C: £200/month with 25% off forever -> £150
    sub({ customer: "C", start: "2026-02-01", items: [{ amount: 20000 }], discounts: [discount(coupon({ percent_off: 25 }))] }),
    // D: £50/month, in trial until 30 Nov -> trial MRR only
    sub({ customer: "D", status: "trialing", start: "2026-11-01", trialStart: "2026-11-01", trialEnd: "2026-11-30", items: [{ amount: 5000 }] }),
    // E: £80/month, cancelled 20 Oct -> churn in October
    sub({ customer: "E", status: "canceled", start: "2026-04-01", ended: "2026-10-20", items: [{ amount: 8000 }] }),
    // F: £60/month, past_due -> still MRR (and at risk)
    sub({ customer: "F", status: "past_due", start: "2026-06-01", items: [{ amount: 6000 }] }),
    // G: £70/month, now unpaid -> not MRR now -> counts as churn in November
    sub({ customer: "G", status: "unpaid", start: "2026-05-01", items: [{ amount: 7000 }] }),
    // H: £50/month with £10 off forever -> £40
    sub({ customer: "H", start: "2026-07-01", items: [{ amount: 5000 }], discounts: [discount(coupon({ amount_off: 1000, currency: "gbp" }))] }),
    // I: £30/month, plus a £20/month add-on from 5 Nov -> £20 expansion
    sub({ customer: "I", start: "2026-08-01", items: [{ amount: 3000 }] }),
    sub({ customer: "I", start: "2026-11-05", items: [{ amount: 2000 }] }),
    // J: £100/month replaced by £40/month on 3 Nov -> £60 contraction
    sub({ customer: "J", status: "canceled", start: "2026-08-01", ended: "2026-11-03", items: [{ amount: 10000 }] }),
    sub({ customer: "J", start: "2026-11-03", items: [{ amount: 4000 }] }),
    // K: £25/month Feb-May 10, back on 2 Nov -> churn in May, reactivation in Nov
    sub({ customer: "K", status: "canceled", start: "2026-02-01", ended: "2026-05-10", items: [{ amount: 2500 }] }),
    sub({ customer: "K", start: "2026-11-02", items: [{ amount: 2500 }] }),
    // L: £30/month, trial 20 Sep - 4 Oct, then paying -> new in October
    sub({ customer: "L", start: "2026-09-20", trialStart: "2026-09-20", trialEnd: "2026-10-04", items: [{ amount: 3000 }] }),
    // M: never paid
    sub({ customer: "M", status: "incomplete_expired", start: "2026-10-01", items: [{ amount: 9900 }] }),
    // N: billed in euros -> kept out of GBP totals
    sub({ customer: "N", currency: "eur", start: "2026-01-01", items: [{ amount: 9000 }] }),
];

const MONTHS = monthKeysBack(NOW, 13); // 2025-11 .. 2026-11
const ROWS = buildMonthlyCustomerMrr(SUBS, MONTHS, NOW);
const GBP_ROWS = ROWS.filter((r) => r.currency === "GBP");
const METRICS = computeMonthlyMetrics(GBP_ROWS, MONTHS.slice(1)); // 2025-12 .. 2026-11
const month = (key) => METRICS.find((m) => m.month === key);

test("MRR definition: intervals, discounts, statuses", () => {
    const at = { at: new Date("2026-10-31T23:59:59Z") };
    assert.equal(subscriptionMrr(SUBS[1]).mrrMinor, 10000, "yearly / 12");
    assert.equal(subscriptionMrr(SUBS[2]).mrrMinor, 15000, "25% off");
    assert.equal(subscriptionMrr(SUBS[7]).mrrMinor, 4000, "£10 off");
    assert.deepEqual(
        [subscriptionMrr(SUBS[3]).mrrMinor, subscriptionMrr(SUBS[3]).trialMrrMinor],
        [0, 5000],
        "trialing is tracked apart, not in MRR"
    );
    assert.equal(subscriptionMrr(SUBS[5]).mrrMinor, 6000, "past_due counts");
    assert.equal(subscriptionMrr(SUBS[6]).mrrMinor, 0, "unpaid does not count");
    assert.equal(subscriptionMrr(SUBS[6], at).mrrMinor, 7000, "unpaid counted in history (status history unknown)");
    assert.equal(subscriptionMrr(SUBS[15]).mrrMinor, 0, "incomplete_expired never counts");
    assert.equal(subscriptionMrr(SUBS[4], at).mrrMinor, 0, "ended before month end");
    assert.equal(subscriptionMrr(SUBS[4], { at: new Date("2026-09-30T23:59:59Z") }).mrrMinor, 8000);

    // Weekly and multi-month intervals, quantity, metered skipped.
    const weekly = sub({ customer: "W", start: "2026-01-01", items: [{ amount: 1200, interval: "week", qty: 2 }] });
    assert.equal(subscriptionMrr(weekly).mrrMinor, Math.round((1200 * 2 * 52) / 12));
    const quarterly = sub({ customer: "Q", start: "2026-01-01", items: [{ amount: 30000, count: 3 }, { amount: 999, usage: "metered" }] });
    assert.equal(subscriptionMrr(quarterly).mrrMinor, 10000);
    // amount_off on a yearly plan is spread over 12 months.
    const yearlyOff = sub({ customer: "Y", start: "2026-01-01", items: [{ amount: 120000, interval: "year" }], discounts: [discount(coupon({ amount_off: 12000, currency: "gbp" }))] });
    assert.equal(subscriptionMrr(yearlyOff).mrrMinor, 9000);
    // "once" coupons and expired discounts don't reduce MRR.
    const once = sub({ customer: "O", start: "2026-01-01", items: [{ amount: 10000 }], discounts: [discount(coupon({ percent_off: 50, duration: "once" }))] });
    assert.equal(subscriptionMrr(once).mrrMinor, 10000);
    const expired = sub({ customer: "X", start: "2026-01-01", items: [{ amount: 10000 }], discounts: [discount(coupon({ percent_off: 50, duration: "repeating" }), { end: "2026-04-01" })] });
    assert.equal(subscriptionMrr(expired, { at: new Date("2026-03-31T23:59:59Z") }).mrrMinor, 5000);
    assert.equal(subscriptionMrr(expired, { at: new Date("2026-04-30T23:59:59Z") }).mrrMinor, 10000);
});

test("customer MRR sums all subscriptions (webhook no longer overwrites with one)", () => {
    const iSubs = SUBS.filter((s) => s.customer === "I");
    assert.equal(customerMrr(iSubs).mrrMinor, 5000);
    assert.equal(customerMrr(iSubs).currency, "GBP");
});

test("current month totals (Nov 2026)", () => {
    const nov = month("2026-11");
    // A 100 + B 100 + C 150 + F 60 + H 40 + I 50 + J 40 + K 25 + L 30 = £595
    assert.equal(nov.mrrMinor, 59500);
    assert.equal(nov.payingCustomers, 9);
    assert.equal(nov.trialMrrMinor, 5000);
    assert.equal(nov.trialingCustomers, 1);
    assert.equal(nov.newTrials, 1);
    // The euro customer is not added to GBP.
    assert.equal(ROWS.filter((r) => r.month === "2026-11" && r.currency === "EUR")[0].mrrMinor, 9000);
});

test("November movement, churn, NRR/GRR", () => {
    const nov = month("2026-11");
    // Start = October: A 100 + B 100 + C 150 + F 60 + G 70 + H 40 + I 30 + J 100 + L 30 = £680
    assert.equal(nov.startMrrMinor, 68000);
    assert.equal(nov.newMinor, 0);
    assert.equal(nov.reactivationMinor, 2500); // K
    assert.equal(nov.expansionMinor, 2000); // I
    assert.equal(nov.contractionMinor, 6000); // J
    assert.equal(nov.churnedMinor, 7000); // G (unpaid)
    assert.equal(
        nov.startMrrMinor + nov.newMinor + nov.reactivationMinor + nov.expansionMinor - nov.contractionMinor - nov.churnedMinor,
        nov.mrrMinor,
        "movement reconciles to MRR"
    );
    assert.equal(nov.churnedCustomers, 1);
    assert.equal(nov.churnPct, 11.1); // 1 of 9
    assert.equal(nov.nrrPct, 83.8); // (680 + 20 - 60 - 70) / 680
    assert.equal(nov.grrPct, 80.9); // (680 - 60 - 70) / 680
    assert.deepEqual(
        nov.moves.map((m) => [m.stripeCustomerId, m.kind, m.deltaMinor]),
        [["G", "churned", -7000], ["J", "contraction", -6000], ["K", "reactivation", 2500], ["I", "expansion", 2000]]
    );
});

test("October: cancellation and trial conversion", () => {
    const oct = month("2026-10");
    // September: A 100 + B 100 + C 150 + E 80 + F 60 + G 70 + H 40 + I 30 + J 100 = £730 (L in trial)
    assert.equal(oct.startMrrMinor, 73000);
    assert.equal(oct.mrrMinor, 68000);
    assert.equal(oct.churnedMinor, 8000); // E
    assert.equal(oct.newMinor, 3000); // L converted from trial
    assert.equal(oct.newCustomers, 1);
    assert.equal(oct.churnPct, 11.1);
    assert.equal(oct.nrrPct, 89.0);
    assert.equal(oct.grrPct, 89.0);
    assert.equal(month("2026-09").trialMrrMinor, 3000);
});

test("May: churn of K, new G; earlier months build from zero", () => {
    const may = month("2026-05");
    assert.equal(may.startMrrMinor, 45500); // A, B, C, E, K
    assert.equal(may.mrrMinor, 50000);
    assert.equal(may.churnPct, 20.0); // 1 of 5
    assert.equal(month("2025-12").mrrMinor, 0);
    assert.equal(month("2026-01").newMinor, 10000); // A
    assert.equal(month("2026-01").churnPct, null); // nobody paying in December
});

test("billing risk: no usage data is not a penalty; billing signals drive the score", () => {
    const score = (args) =>
        computeRiskScore(
            billingRiskInputs({ mrrMinor: 6000, previousMonthMrrMinor: 6000, subscriptionStatus: "active", cancelAtPeriodEnd: false, invoices: [], ...args })
        );
    const healthy = score({});
    assert.equal(healthy.riskScore, 0, "healthy paying customer with no activity data");
    assert.ok(!healthy.signals.some((s) => s.key === "inactive"));

    const failed = { status: "failed", dueAt: new Date(), paidAt: null, failedAt: new Date() };
    const pastDue = score({ subscriptionStatus: "past_due", invoices: [failed] });
    assert.equal(pastDue.riskScore, 70); // past_due 40 + failed payment 14 + billing issue 16
    assert.equal(pastDue.signals[0].key, "past_due");

    assert.equal(score({ cancelAtPeriodEnd: true }).riskScore, 60);
    const downgrade = score({ mrrMinor: 4000, previousMonthMrrMinor: 10000 });
    assert.equal(downgrade.riskScore, 25); // -60% -> capped at 25
    assert.equal(downgrade.signals[0].key, "downgrade");

    // A recovered (paid) invoice is no longer a billing issue.
    const recovered = { status: "paid", dueAt: new Date(), paidAt: new Date(), failedAt: new Date() };
    assert.equal(score({ invoices: [recovered] }).riskScore, 0);
});

test("Metrics page uses the exact movement from the API", async () => {
    const { buildMrrMovement, computeRetention } = await import("../src/app/(app)/dashboard/analytics/metricsExtras.ts");
    // Shape the API rows the way the timeseries route does.
    const keys = ["2026-10", "2026-11"];
    const ms = METRICS.filter((m) => keys.includes(m.month));
    const mrr = ms.map((m) => ({ x: m.month, y: m.mrrMinor / 100 }));
    const churn = ms.map((m) => ({ x: m.month, y: m.churnPct }));
    const activity = ms.map((m) => ({
        month: m.month,
        totalSubscribers: m.payingCustomers,
        newSubscribers: m.newCustomers + m.reactivatedCustomers,
        startMrrMinor: m.startMrrMinor,
        newMrrMinor: m.newMinor + m.reactivationMinor,
        expansionMrrMinor: m.expansionMinor,
        contractionMrrMinor: m.contractionMinor,
        churnedMrrMinor: m.churnedMinor,
    }));
    const movement = buildMrrMovement(mrr, churn, activity);
    const nov = movement.find((m) => m.month === "2026-11");
    assert.deepEqual(nov, { month: "2026-11", startMrr: 680, endMrr: 595, newMrr: 25, expansion: 20, contraction: 60, churned: 70 });
    const r = computeRetention([nov]);
    assert.equal(Math.round(r.nrr * 10) / 10, 83.8);
    assert.equal(Math.round(r.grr * 10) / 10, 80.9);
});
