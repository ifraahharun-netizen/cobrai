import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyFirebaseIdToken } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getBearerToken(req: Request) {
    const h = req.headers.get("authorization") || "";
    const m = h.match(/^Bearer\s+(.+)$/i);
    return m?.[1] || null;
}

export async function GET(req: Request) {
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

        const integrations = await prisma.integration.findMany({
            where: { workspaceId: user.workspaceId },
            select: {
                provider: true,
                status: true,
                lastSyncedAt: true,
                lastSyncError: true,
                externalAccountId: true,
                metadata: true,
            },
        });

        return NextResponse.json({
            ok: true,
            integrations,
        });
    } catch (e: any) {
        console.error("integrations/status GET failed:", e);
        return NextResponse.json(
            { ok: false, error: e?.message || "Failed to load integrations status" },
            { status: 500 }
        );
    }
}