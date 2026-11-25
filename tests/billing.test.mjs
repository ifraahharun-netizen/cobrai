// Billing and access rules. Run: npm run test:metrics (runs everything in tests/).
import { test } from "node:test";
import assert from "node:assert/strict";

import { tierFromSubscription, isActiveSubscriptionStatus } from "../src/lib/billing/tier.ts";
import {
    canAccessFeature,
    getTrialDaysLeft,
    hasActiveTrial,
    hasFeatureAccess,
    isProFeature,
} from "../src/lib/permissions.ts";

const PRICES = { proPriceId: "price_pro", starterPriceId: "price_starter" };
const DAY = 24 * 60 * 60 * 1000;

test("plan follows the price actually paid, not the checkout label", () => {
    // Bought Pro, then switched to Starter in the billing portal: metadata still says pro.
    assert.equal(
        tierFromSubscription({ status: "active", priceIds: ["price_starter"], metadataTier: "pro", ...PRICES }),
        "starter"
    );
    // Upgraded Starter → Pro in the portal.
    assert.equal(
        tierFromSubscription({ status: "active", priceIds: ["price_pro"], metadataTier: "starter", ...PRICES }),
        "pro"
    );
});

test("unknown prices fall back to the checkout label", () => {
    assert.equal(tierFromSubscription({ status: "active", priceIds: ["price_old"], metadataTier: "pro", ...PRICES }), "pro");
    assert.equal(tierFromSubscription({ status: "active", priceIds: ["price_old"], metadataTier: null, ...PRICES }), "starter");
    assert.equal(tierFromSubscription({ status: "active", priceIds: ["price_pro"], metadataTier: "starter" }), "starter");
});

test("cancelled or unpaid subscriptions lose paid access; past_due keeps it while Stripe retries", () => {
    for (const status of ["canceled", "unpaid", "incomplete", "incomplete_expired", "paused", null]) {
        assert.equal(tierFromSubscription({ status, priceIds: ["price_pro"], ...PRICES }), "free", String(status));
    }
    for (const status of ["active", "trialing", "past_due"]) {
        assert.equal(isActiveSubscriptionStatus(status), true, status);
    }
});

test("plan features: starter can't use Pro features, pro can use everything", () => {
    assert.equal(hasFeatureAccess("starter", "basic-dashboard"), true);
    assert.equal(hasFeatureAccess("starter", "automations"), false);
    assert.equal(hasFeatureAccess("pro", "automations"), true);
    assert.equal(hasFeatureAccess("pro", "basic-dashboard"), true);
    assert.equal(hasFeatureAccess("free", "basic-dashboard"), false);
    assert.equal(hasFeatureAccess(null, "basic-dashboard"), false);
    assert.equal(isProFeature("retry-payment"), true);
    assert.equal(isProFeature("basic-dashboard"), false);
});

test("trial days: rounds up, expires at zero, ignores bad dates", () => {
    const now = Date.now();
    assert.equal(getTrialDaysLeft(new Date(now + 13.2 * DAY)), 14);
    assert.equal(getTrialDaysLeft(new Date(now + 60 * 1000)), 1);
    assert.equal(getTrialDaysLeft(new Date(now - 1000)), 0);
    assert.equal(getTrialDaysLeft(null), null);
    assert.equal(getTrialDaysLeft("not a date"), null);
    assert.equal(hasActiveTrial(new Date(now - DAY).toISOString()), false);
    assert.equal(hasActiveTrial(new Date(now + DAY).toISOString()), true);
});

test("an active trial unlocks Pro features; once it ends, the plan decides", () => {
    const now = Date.now();
    assert.equal(canAccessFeature({ plan: "free", feature: "automations", trialEndsAt: new Date(now + DAY) }), true);
    assert.equal(canAccessFeature({ plan: "free", feature: "automations", trialEndsAt: new Date(now - DAY) }), false);
    assert.equal(canAccessFeature({ plan: "starter", feature: "automations", trialEndsAt: new Date(now - DAY) }), false);
    assert.equal(canAccessFeature({ plan: "pro", feature: "automations", trialEndsAt: null }), true);
});

import { isWorkspaceLocked, parseExemptEmails, hasActiveSubscription } from "../src/lib/billing/access-rules.ts";

test("lock: trial ended and nobody paying → locked; still in trial or paying → open", () => {
    const now = new Date("2026-11-24T12:00:00Z");
    const ended = new Date("2026-11-20T00:00:00Z");
    const future = new Date("2026-12-01T00:00:00Z");
    assert.equal(isWorkspaceLocked({ trialEndsAt: ended, subscriptions: [], now }), true);
    assert.equal(isWorkspaceLocked({ trialEndsAt: future, subscriptions: [], now }), false);
    assert.equal(isWorkspaceLocked({ trialEndsAt: null, subscriptions: [], now }), false, "trial not started yet");
    assert.equal(isWorkspaceLocked({ trialEndsAt: ended, subscriptions: [{ status: "active", currentPeriodEnd: future }], now }), false);
    assert.equal(isWorkspaceLocked({ trialEndsAt: ended, subscriptions: [{ status: "past_due", currentPeriodEnd: future }], now }), false);
});

test("lock: cancelled, expired or ended subscriptions don't keep access", () => {
    const now = new Date("2026-11-24T12:00:00Z");
    const ended = new Date("2026-11-20T00:00:00Z");
    const future = new Date("2026-12-01T00:00:00Z");
    assert.equal(isWorkspaceLocked({ trialEndsAt: ended, subscriptions: [{ status: "canceled", currentPeriodEnd: future }], now }), true);
    assert.equal(isWorkspaceLocked({ trialEndsAt: ended, subscriptions: [{ status: "active", currentPeriodEnd: ended }], now }), true);
    assert.equal(isWorkspaceLocked({ trialEndsAt: ended, subscriptions: [{ status: "active", endedAt: ended }], now }), true);
    assert.equal(hasActiveSubscription([{ status: "unpaid", currentPeriodEnd: future }], now), false);
});

test("lock: exempt owners never lock, matching email case-insensitively", () => {
    const now = new Date("2026-11-24T12:00:00Z");
    const ended = new Date("2026-11-20T00:00:00Z");
    const exempt = parseExemptEmails(" Founder@Example.com , friend@example.com,, ");
    assert.equal(exempt.size, 2);
    assert.equal(isWorkspaceLocked({ trialEndsAt: ended, subscriptions: [], ownerEmail: "founder@example.com", exemptEmails: exempt, now }), false);
    assert.equal(isWorkspaceLocked({ trialEndsAt: ended, subscriptions: [], ownerEmail: "someone@else.com", exemptEmails: exempt, now }), true);
    assert.equal(isWorkspaceLocked({ trialEndsAt: ended, subscriptions: [], ownerEmail: null, exemptEmails: exempt, now }), true);
    assert.equal(parseExemptEmails(undefined).size, 0);
});

import { buildTrialEndingEmail } from "../src/lib/billing/trialEmail.ts";

const EMAIL_BASE = {
    currency: "GBP",
    appUrl: "https://cobrai.uk/",
    atRiskMinor: 0,
    atRiskAccounts: 0,
    failedPaymentsMinor: 0,
    failedPayments: 0,
    topAccounts: [],
};

test("trial email: leads with the customer's own numbers when there are any", () => {
    const { subject, text, html } = buildTrialEndingEmail({
        ...EMAIL_BASE,
        daysRemaining: 3,
        atRiskMinor: 43100,
        atRiskAccounts: 8,
        failedPaymentsMinor: 27600,
        failedPayments: 3,
        topAccounts: [{ name: "Kite <Labs>", reason: "Payment failed twice", mrrMinor: 14900 }],
    });
    assert.equal(subject, "Your Cobrai trial ends in 3 days: £707 a month needs attention");
    assert.match(text, /£431 a month at risk across 8 accounts \(£5,172 a year if they leave\)/);
    assert.match(text, /£276 in 3 failed payments/);
    assert.match(text, /https:\/\/cobrai\.uk\/dashboard/);
    assert.match(html, /Kite &lt;Labs&gt;/, "account names are escaped");
    assert.doesNotMatch(html, /Kite <Labs>/);
});

test("trial email: honest short reminder without data; says 'tomorrow' on the last day", () => {
    const { subject, text } = buildTrialEndingEmail({ ...EMAIL_BASE, daysRemaining: 1 });
    assert.equal(subject, "Your Cobrai trial ends tomorrow");
    assert.doesNotMatch(text, /£0/);
    assert.match(text, /connected Stripe/);
});
