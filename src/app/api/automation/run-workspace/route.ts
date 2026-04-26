import { NextResponse } from "next/server";
import { getWorkspaceDataMode } from "@/lib/workspace/getWorkspaceDataMode";
import { runWorkspaceAutomations } from "@/lib/automation/runWorkspaceAutomations";
import { AuthError, getWorkspaceFromRequest } from "@/lib/auth/getWorkspaceFromRequest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function badRequest(message: string, status = 400) {
    return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(req: Request) {
    try {
        const { workspaceId } = await getWorkspaceFromRequest(req);
        const modeInfo = await getWorkspaceDataMode(workspaceId);

        const result = await runWorkspaceAutomations(
            workspaceId,
            modeInfo.connectedIntegrations
        );

        return NextResponse.json(result);
    } catch (error: any) {
        if (error instanceof AuthError) {
            return badRequest(error.message, error.status);
        }

        console.error("POST /api/automation/run-workspace failed", error);

        return NextResponse.json(
            { ok: false, error: "Failed to run workspace automations" },
            { status: 500 }
        );
    }
}