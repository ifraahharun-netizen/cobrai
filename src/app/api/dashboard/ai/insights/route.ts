import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { generateWorkspaceInsights } from "@/lib/ai/generateWorkspaceInsights";
import { getWorkspaceFromRequest } from "@/lib/auth/getWorkspaceFromRequest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STARTER_AI_LIMIT_PER_WEEK = 10;

function getNextWeeklyReset() {
    const now = new Date();
    const reset = new Date(now);
    reset.setDate(now.getDate() + 7);
    return reset;
}

export async function POST(req: Request) {
    try {
        const { workspaceId } = await getWorkspaceFromRequest(req);

        const body = await req.json().catch(() => ({}));
        const timeframe = typeof body?.timeframe === "string" ? body.timeframe : "week";

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: {
                id: true,
                tier: true,
                trialEndsAt: true,
                demoMode: true,
                aiActionsUsedThisWeek: true,
                aiResetAt: true,
            },
        });

        if (!workspace) {
            return NextResponse.json(
                { error: "Workspace not found" },
                { status: 404 }
            );
        }

        const isTrialActive =
            workspace.trialEndsAt instanceof Date &&
            workspace.trialEndsAt.getTime() > Date.now();

        const isUnlimited =
            workspace.tier === "pro" ||
            workspace.tier === "scale" ||
            workspace.demoMode ||
            isTrialActive;

        const shouldReset =
            !workspace.aiResetAt || workspace.aiResetAt.getTime() <= Date.now();

        const usedThisWeek = shouldReset ? 0 : workspace.aiActionsUsedThisWeek ?? 0;

        if (!isUnlimited && workspace.tier === "starter") {
            if (usedThisWeek >= STARTER_AI_LIMIT_PER_WEEK) {
                return NextResponse.json(
                    {
                        error: "AI usage limit reached",
                        code: "STARTER_AI_LIMIT_REACHED",
                        limit: STARTER_AI_LIMIT_PER_WEEK,
                        used: usedThisWeek,
                    },
                    { status: 429 }
                );
            }
        }

        if (!isUnlimited && workspace.tier !== "starter") {
            return NextResponse.json(
                {
                    error: "AI insights require Starter or Pro",
                    code: "AI_PLAN_REQUIRED",
                },
                { status: 403 }
            );
        }

        const result = await generateWorkspaceInsights({
            workspaceId,
            timeframe,
            source: workspace.demoMode ? "demo" : "live",
        });

        if (!isUnlimited && workspace.tier === "starter" && !result.cached) {
            await prisma.workspace.update({
                where: { id: workspaceId },
                data: {
                    aiActionsUsedThisWeek: usedThisWeek + 1,
                    aiResetAt: shouldReset ? getNextWeeklyReset() : workspace.aiResetAt,
                },
            });
        }

        return NextResponse.json({
            ...result,
            usage:
                workspace.tier === "starter" && !isUnlimited
                    ? {
                        used: result.cached ? usedThisWeek : usedThisWeek + 1,
                        limit: STARTER_AI_LIMIT_PER_WEEK,
                        resetAt: shouldReset ? getNextWeeklyReset() : workspace.aiResetAt,
                    }
                    : null,
        });
    } catch (err) {
        return NextResponse.json(
            {
                error: "Failed to generate workspace insights",
                message: err instanceof Error ? err.message : String(err),
            },
            { status: 500 }
        );
    }
}