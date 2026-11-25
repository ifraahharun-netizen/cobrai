// Monthly Claude allowance per plan. No runtime imports, so it's unit-tested.
// Claude (Opus) is the expensive part of Cobrai: every summary, question and
// customer-behaviour read counts as one request.

export const CLAUDE_MONTHLY_LIMITS = {
    trial: 30, // free trial and demo workspaces
    starter: 100,
    pro: 500,
} as const;

export type ClaudePlan = keyof typeof CLAUDE_MONTHLY_LIMITS;

/** Which allowance applies. A trial is checked first because trials run on the Pro tier. */
export function claudePlanFor(args: {
    tier: string | null | undefined;
    trialEndsAt: Date | null | undefined;
    hasPaidSubscription: boolean;
    now?: Date;
}): ClaudePlan {
    const now = args.now ?? new Date();
    if (!args.hasPaidSubscription) {
        const inTrial = Boolean(args.trialEndsAt && args.trialEndsAt.getTime() > now.getTime());
        if (inTrial || args.tier === "free" || !args.tier) return "trial";
    }
    return args.tier === "pro" || args.tier === "scale" ? "pro" : "starter";
}

/** Start of the current calendar month (UTC): allowances reset on the 1st. */
export function monthStartUtc(now = new Date()): Date {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function claudeLimitMessage(plan: ClaudePlan, limit: number): string {
    const name = plan === "trial" ? "your trial" : plan === "pro" ? "Pro" : "Starter";
    const next = plan === "pro" ? "It resets on the 1st of next month." : "Upgrade for more, or it resets on the 1st of next month.";
    return `You've used all ${limit} Claude requests included with ${name} this month. ${next}`;
}
