import { prisma } from "@/lib/prisma";
import { AuthError } from "@/lib/auth/errors";
import { isWorkspaceLocked, parseExemptEmails } from "@/lib/billing/access-rules";

/** Thrown when a workspace's trial has ended and nobody is paying. Maps to HTTP 402. */
export class PaymentRequiredError extends AuthError {
    constructor() {
        super("Your free trial has ended. Choose a plan to keep using Cobrai.", 402);
        this.name = "PaymentRequiredError";
    }
}

// Short cache so a dashboard load (many API calls at once) costs one lookup.
// Paying unlocks within this window; Stripe's webhook also clears it (clearAccessCache).
const CACHE_MS = 30_000;
const cache = new Map<string, { locked: boolean; at: number }>();

export function clearAccessCache(workspaceId?: string) {
    if (workspaceId) cache.delete(workspaceId);
    else cache.clear();
}

export async function isWorkspaceLockedById(workspaceId: string): Promise<boolean> {
    const hit = cache.get(workspaceId);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.locked;

    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: {
            ownerEmail: true,
            trialEndsAt: true,
            stripeSubscriptions: {
                orderBy: { updatedAt: "desc" },
                take: 5,
                select: { status: true, currentPeriodEnd: true, endedAt: true },
            },
        },
    });

    const locked = workspace
        ? isWorkspaceLocked({
            trialEndsAt: workspace.trialEndsAt,
            subscriptions: workspace.stripeSubscriptions,
            ownerEmail: workspace.ownerEmail,
            exemptEmails: parseExemptEmails(process.env.BILLING_EXEMPT_EMAILS),
        })
        : false;

    cache.set(workspaceId, { locked, at: Date.now() });
    return locked;
}

/** Call after resolving the workspace in any route that serves data or runs actions. */
export async function assertPaidAccess(workspaceId: string): Promise<void> {
    if (await isWorkspaceLockedById(workspaceId)) throw new PaymentRequiredError();
}

/** For routes that build their own responses: returns a 402 response when locked, otherwise null. */
export async function paymentRequiredResponse(workspaceId: string | null | undefined): Promise<Response | null> {
    if (!workspaceId || !(await isWorkspaceLockedById(workspaceId))) return null;
    return Response.json(
        { ok: false, error: new PaymentRequiredError().message, code: "payment_required" },
        { status: 402 }
    );
}

/** In a route's catch block: turns a PaymentRequiredError into a 402 instead of a 500. */
export function paymentRequiredFromError(error: unknown): Response | null {
    if (!(error instanceof PaymentRequiredError)) return null;
    return Response.json(
        { ok: false, error: error.message, code: "payment_required" },
        { status: 402 }
    );
}
