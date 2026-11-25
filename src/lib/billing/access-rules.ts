// Who may use Cobrai's data and actions. No runtime imports, so it's unit-tested
// directly. The dashboard lock screen (lib/trial) and the server-side check
// (lib/billing/access) both use these rules, so they always agree.

export type SubscriptionLike = {
    status: string | null;
    currentPeriodEnd?: Date | null;
    endedAt?: Date | null;
};

const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

export function hasActiveSubscription(subscriptions: SubscriptionLike[], now = new Date()): boolean {
    return subscriptions.some(
        (s) =>
            ACTIVE_STATUSES.has(String(s.status)) &&
            (!s.endedAt || s.endedAt > now) &&
            (!s.currentPeriodEnd || s.currentPeriodEnd > now)
    );
}

/** BILLING_EXEMPT_EMAILS: comma-separated owner emails whose workspaces never lock (staff, friends, design partners). */
export function parseExemptEmails(raw: string | null | undefined): Set<string> {
    return new Set(
        String(raw ?? "")
            .split(",")
            .map((e) => e.trim().toLowerCase())
            .filter(Boolean)
    );
}

export function isOwnerExempt(ownerEmail: string | null | undefined, exempt: Set<string>): boolean {
    return Boolean(ownerEmail) && exempt.has(String(ownerEmail).trim().toLowerCase());
}

/**
 * Locked = the free trial has ended and there's no paying subscription.
 * A workspace whose trial hasn't started yet is not locked (the trial starts on
 * first visit to the dashboard).
 */
export function isWorkspaceLocked(args: {
    trialEndsAt: Date | null;
    subscriptions: SubscriptionLike[];
    ownerEmail?: string | null;
    exemptEmails?: Set<string>;
    now?: Date;
}): boolean {
    const now = args.now ?? new Date();
    if (args.exemptEmails && isOwnerExempt(args.ownerEmail, args.exemptEmails)) return false;
    if (hasActiveSubscription(args.subscriptions, now)) return false;
    return Boolean(args.trialEndsAt && args.trialEndsAt.getTime() <= now.getTime());
}
