import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { generateWorkspaceInsights } from "@/lib/ai/generateWorkspaceInsights";
import { getWorkspaceFromRequest } from "@/lib/auth/getWorkspaceFromRequest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    try {
        const { workspaceId } = await getWorkspaceFromRequest(req);

        const body = await req.json().catch(() => ({}));
        const timeframe =
            typeof body?.timeframe === "string" ? body.timeframe : "week";

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: {
                id: true,
                tier: true,
                trialEndsAt: true,
                demoMode: true,
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

        const canUseAi =
            workspace.tier === "starter" ||
            workspace.tier === "pro" ||
            workspace.tier === "scale" ||
            workspace.demoMode === true ||
            isTrialActive;

        if (!canUseAi) {
            return NextResponse.json(
                {
                    error: "AI insights require an active trial, Starter, Pro, or Scale plan",
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

        return NextResponse.json(result);
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