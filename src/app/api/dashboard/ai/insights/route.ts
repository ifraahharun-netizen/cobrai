import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { generateWorkspaceInsights } from "@/lib/ai/generateWorkspaceInsights";
import { getAiEffectivenessScore } from "@/lib/ai/aiEffectivenessScore";
import { getWorkspaceFromRequest } from "@/lib/auth/getWorkspaceFromRequest";
import { ratelimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_TIMEFRAMES = new Set(["day", "week", "month"]);

export async function POST(req: Request) {
    try {
        const { workspaceId } = await getWorkspaceFromRequest(req);

        const { success, reset } = await ratelimit.limit(
            `ai-insights:${workspaceId}`
        );

        if (!success) {
            return NextResponse.json(
                {
                    error: "Too many requests. Please try again shortly.",
                },
                {
                    status: 429,
                    headers: {
                        "Retry-After": String(
                            Math.max(
                                1,
                                Math.ceil((reset - Date.now()) / 1000)
                            )
                        ),
                    },
                }
            );
        }

        const body = await req.json().catch(() => ({}));

        const timeframe =
            typeof body?.timeframe === "string" &&
                ALLOWED_TIMEFRAMES.has(body.timeframe)
                ? body.timeframe
                : "week";

        const workspace = await prisma.workspace.findUnique({
            where: {
                id: workspaceId,
            },
            select: {
                id: true,
                tier: true,
                trialEndsAt: true,
                demoMode: true,
            },
        });

        if (!workspace) {
            return NextResponse.json(
                {
                    error: "Workspace not found",
                },
                {
                    status: 404,
                }
            );
        }

        const [result, aiEffectiveness] = await Promise.all([
            generateWorkspaceInsights({
                workspaceId,
                timeframe,
                source: workspace.demoMode ? "demo" : "live",
            }),
            getAiEffectivenessScore(workspaceId),
        ]);

        return NextResponse.json({
            ...result,
            aiEffectiveness,
        });
    } catch (err) {
        console.error("AI insights route failed");

        return NextResponse.json(
            {
                error: "Failed to generate workspace insights",
            },
            {
                status: 500,
            }
        );
    }
}