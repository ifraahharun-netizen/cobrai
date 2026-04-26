import { NextResponse } from "next/server";
import { generateWorkspaceInsights } from "@/lib/ai/generateWorkspaceInsights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WORKSPACE_ID = "ws_demo";

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));
        const timeframe = typeof body?.timeframe === "string" ? body.timeframe : "week";

        const result = await generateWorkspaceInsights({
            workspaceId: WORKSPACE_ID,
            timeframe,
            source: "demo",
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