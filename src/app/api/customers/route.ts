import { NextResponse } from "next/server";
import { getDemoCustomers } from "@/lib/demo/customers";
import { getLiveCustomers } from "@/lib/live/customer";
import { getWorkspaceDataMode } from "@/lib/workspace/getWorkspaceDataMode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getWorkspaceIdFromRequest(_req: Request) {
  return "ws_demo";
}

export async function GET(req: Request) {
  try {
    const workspaceId = await getWorkspaceIdFromRequest(req);
    const modeInfo = await getWorkspaceDataMode(workspaceId);

    if (modeInfo.mode === "live") {
      const rows = await getLiveCustomers(workspaceId);
      return NextResponse.json({
        mode: "live",
        workspaceTier: modeInfo.workspaceTier,
        connectedIntegrations: modeInfo.connectedIntegrations,
        rows,
      });
    }

    return NextResponse.json({
      mode: "demo",
      workspaceTier: modeInfo.workspaceTier,
      connectedIntegrations: modeInfo.connectedIntegrations,
      rows: getDemoCustomers(),
    });
  } catch (error: any) {
    console.error("GET /api/customers failed", error);
    return NextResponse.json(
      { error: error?.message || "Failed to load customers" },
      { status: 500 }
    );
  }
}