import prisma from "@/lib/prisma";

export type AiUsageDecision = {
    allowed: boolean;
    limit: number | null;
    used: number;
    remaining: number | null;
    reason: "allowed" | "limit_reached";
};

const STARTER_MONTHLY_AI_LIMIT = 20;
const FREE_MONTHLY_AI_LIMIT = 10;
const PRO_MONTHLY_AI_LIMIT = 500;

function startOfMonth() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
}

function isTrialActive(trialEndsAt?: Date | string | null) {
    if (!trialEndsAt) return false;
    const date = new Date(trialEndsAt);
    return Number.isFinite(date.getTime()) && date.getTime() > Date.now();
}

export async function checkAiUsageLimit(args: {
    workspaceId: string;
    tier?: string | null;
    trialEndsAt?: Date | string | null;
    demoMode?: boolean | null;
}): Promise<AiUsageDecision> {
    if (args.demoMode || isTrialActive(args.trialEndsAt)) {
        return {
            allowed: true,
            limit: null,
            used: 0,
            remaining: null,
            reason: "allowed",
        };
    }

    const tier = args.tier || "free";

    const limit =
        tier === "scale"
            ? null
            : tier === "pro"
                ? PRO_MONTHLY_AI_LIMIT
                : tier === "starter"
                    ? STARTER_MONTHLY_AI_LIMIT
                    : FREE_MONTHLY_AI_LIMIT;

    if (limit === null) {
        return {
            allowed: true,
            limit: null,
            used: 0,
            remaining: null,
            reason: "allowed",
        };
    }

    const used = await prisma.aiUsageRun.count({
        where: {
            workspaceId: args.workspaceId,
            source: "openai",
            createdAt: {
                gte: startOfMonth(),
            },
        },
    });

    return {
        allowed: used < limit,
        limit,
        used,
        remaining: Math.max(0, limit - used),
        reason: used < limit ? "allowed" : "limit_reached",
    };
}

export async function recordAiUsageRun(args: {
    workspaceId: string;
    source: "openai" | "fallback" | "cache" | "blocked_limit" | "fallback_after_error";
    type?: string;
    timeframe?: string;
    tokensIn?: number;
    tokensOut?: number;
    costMinor?: number;
}) {
    return prisma.aiUsageRun.create({
        data: {
            workspaceId: args.workspaceId,
            source: args.source,
            type: args.type ?? "workspace_insights",
            timeframe: args.timeframe ?? "week",
            tokensIn: args.tokensIn ?? 0,
            tokensOut: args.tokensOut ?? 0,
            costMinor: args.costMinor ?? 0,
        },
    });
}