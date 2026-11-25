import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasActiveSubscription, isOwnerExempt, parseExemptEmails } from "@/lib/billing/access-rules";
import {
    CLAUDE_MONTHLY_LIMITS,
    claudeLimitMessage,
    claudePlanFor,
    monthStartUtc,
} from "@/lib/ai/claudeUsageRules";

export type ClaudeUsageType = "metrics_read" | "metrics_ask" | "customer_behaviour";

/**
 * Checks the workspace's monthly Claude allowance. Returns a 429 response when
 * it's used up (call before calling Claude), otherwise null.
 */
export async function claudeLimitResponse(workspaceId: string): Promise<Response | null> {
    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: {
            ownerEmail: true,
            tier: true,
            trialEndsAt: true,
            stripeSubscriptions: {
                orderBy: { updatedAt: "desc" },
                take: 5,
                select: { status: true, currentPeriodEnd: true, endedAt: true },
            },
        },
    });
    if (!workspace) return null;

    // Exempt owners (staff, partners) get the Pro allowance.
    const plan = isOwnerExempt(workspace.ownerEmail, parseExemptEmails(process.env.BILLING_EXEMPT_EMAILS))
        ? "pro"
        : claudePlanFor({
            tier: workspace.tier,
            trialEndsAt: workspace.trialEndsAt,
            hasPaidSubscription: hasActiveSubscription(workspace.stripeSubscriptions),
        });
    const limit = CLAUDE_MONTHLY_LIMITS[plan];
    const used = await prisma.aiUsageRun.count({
        where: { workspaceId, source: "claude", createdAt: { gte: monthStartUtc() } },
    });

    if (used < limit) return null;
    return NextResponse.json(
        { error: claudeLimitMessage(plan, limit), code: "ai_limit", limit, used },
        { status: 429 }
    );
}

/** Counts one Claude request against the allowance. Never throws. */
export async function recordClaudeUsage(workspaceId: string, type: ClaudeUsageType) {
    try {
        await prisma.aiUsageRun.create({
            data: { workspaceId, source: "claude", type, timeframe: "month" },
        });
    } catch (error) {
        console.warn("[claude-usage] could not record usage:", error);
    }
}
