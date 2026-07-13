export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requireOwnedWorkspace } from "@/lib/apiAuth";
import { getOrStartWorkspaceTrial } from "@/lib/trial";

export async function GET(req: Request) {
    try {
        const authResult = await requireOwnedWorkspace(req, null);

        if (!authResult.ok) {
            return authResult.response;
        }

        const state = await getOrStartWorkspaceTrial(
            authResult.workspaceId
        );

        return NextResponse.json(
            {
                ok: true,
                ...state,
            },
            {
                headers: {
                    "Cache-Control":
                        "private, no-store, no-cache, must-revalidate",
                },
            }
        );
    } catch (error) {
        console.error("Trial status error:", error);

        return NextResponse.json(
            {
                ok: false,
                error: "Unable to load trial status.",
            },
            { status: 500 }
        );
    }
}
