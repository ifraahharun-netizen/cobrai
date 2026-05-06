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

        const result = await generateWorkspaceInsights({
            workspaceId,
            timeframe,
            source: workspace.demoMode ? "demo" : "live",
        });

        return NextResponse.json(result);
    } catch (err) {
        console.error("AI insights route failed:", err);

        return NextResponse.json(
            {
                error: "Failed to generate workspace insights",
                message: err instanceof Error ? err.message : String(err),
            },
            { status: 500 }
        );
    }
}