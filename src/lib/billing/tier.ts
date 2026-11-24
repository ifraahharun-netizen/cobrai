// Works out a workspace's Cobrai plan from its Stripe subscription.
// No runtime imports, so it can be unit-tested directly with node --test.

export type PlanTier = "free" | "starter" | "pro";

/** Statuses that keep paid access. past_due keeps access while Stripe retries the card. */
export function isActiveSubscriptionStatus(status: string | null | undefined): boolean {
    return status === "trialing" || status === "active" || status === "past_due";
}

/**
 * The price the customer actually pays decides the plan, so a switch made in the
 * Stripe billing portal (Pro → Starter or back) is picked up. The tier saved in
 * metadata at checkout is only a fallback for prices we don't recognise.
 */
export function tierFromSubscription(args: {
    status: string | null | undefined;
    priceIds: Array<string | null | undefined>;
    metadataTier?: string | null;
    proPriceId?: string | null;
    starterPriceId?: string | null;
}): PlanTier {
    if (!isActiveSubscriptionStatus(args.status)) return "free";

    const prices = new Set(args.priceIds.filter((id): id is string => Boolean(id)));
    if (args.proPriceId && prices.has(args.proPriceId)) return "pro";
    if (args.starterPriceId && prices.has(args.starterPriceId)) return "starter";

    return args.metadataTier === "pro" ? "pro" : "starter";
}
