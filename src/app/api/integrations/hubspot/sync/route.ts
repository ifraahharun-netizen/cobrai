import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyFirebaseIdToken } from "@/lib/firebaseAdmin";
import { syncHubSpotWorkspace } from "@/lib/hubspot/sync";
// import { decryptString } from "@/lib/crypto"; // use your real decrypt helper if needed

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getBearerToken(req: Request) {
    const h = req.headers.get("authorization") || "";
    const m = h.match(/^Bearer\s+(.+)$/i);
    return m?.[1] || null;
}

export async function POST(req: Request) {
    try {
        const token = getBearerToken(req);

        if (!token) {
            return NextResponse.json(
                { ok: false, error: "Missing Authorization Bearer token" },
                { status: 401 }
            );
        }

        const decoded = await verifyFirebaseIdToken(token);
        const firebaseUid = decoded.uid;

        const user = await prisma.user.findUnique({
            where: { firebaseUid },
            select: { workspaceId: true },
        });

        if (!user?.workspaceId) {
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

        // If the token is encrypted, decrypt it here.
        // const accessToken = decryptString(integration.accessTokenEnc);
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
    } catch (e: any) {
        console.error("hubspot sync POST failed:", e);

        return NextResponse.json(
            { ok: false, error: e?.message || "HubSpot sync failed" },
            { status: 500 }
        );
    }
}