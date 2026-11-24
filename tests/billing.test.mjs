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
