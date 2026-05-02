import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthenticatedUser } from "@/lib/apiAuth";
import { syncHubSpotWorkspace } from "@/lib/hubspot/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    try {
        const authResult = await requireAuthenticatedUser(req);

        if (!authResult.ok) {
            return authResult.response;
        }

        const { user } = authResult;

        if (!user.workspaceId) {
            return NextResponse.json(
                { ok: false, error: "No workspace for user" },
                { status: 404 }
            );
        }

        const integration = await prisma.integration.findUnique({
            where: {
                workspaceId_provider: {
                    workspaceId: user.workspaceId,
                    provider: "hubspot",
                },
            },
            select: {
                accessTokenEnc: true,
                status: true,
            },
        });

        if (
            !integration ||
            integration.status !== "connected" ||
            !integration.accessTokenEnc
        ) {
            return NextResponse.json(
                { ok: false, error: "HubSpot is not connected" },
                { status: 400 }
            );
        }

        const accessToken = integration.accessTokenEnc;

        const result = await syncHubSpotWorkspace({
            workspaceId: user.workspaceId,
            accessToken,
        });

        await prisma.integration.update({
            where: {
                workspaceId_provider: {
                    workspaceId: user.workspaceId,
                    provider: "hubspot",
                },
            },
            data: {
                lastSyncedAt: new Date(),
                lastSyncError: null,
            },
        });

        return NextResponse.json({
            ok: true,
            result,
        });
    } catch (e) {
        console.error("hubspot sync POST failed:", e);

        return NextResponse.json(
            { ok: false, error: "HubSpot sync failed" },
            { status: 500 }
        );
    }
}