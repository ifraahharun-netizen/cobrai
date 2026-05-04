import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireAuthenticatedUser } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";

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

        const adminDb = getAdminDb();

        await adminDb.doc(`users/${user.firebaseUid}/integrations/main`).set(
            {
                hubspot: FieldValue.delete(),
                updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
        );

        await prisma.integration.updateMany({
            where: {
                workspaceId: user.workspaceId,
                provider: "hubspot",
            },
            data: {
                status: "disconnected",
                accessTokenEnc: null,
                refreshTokenEnc: null,
                externalAccountId: null,
                lastSyncError: null,
                lastSyncedAt: null,
                metadata: {},
            },
        });

        return NextResponse.json({
            ok: true,
            provider: "hubspot",
            status: "disconnected",
        });
    } catch (error) {
        console.error("HubSpot disconnect failed:", error);

        return NextResponse.json(
            {
                ok: false,
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to disconnect HubSpot",
            },
            { status: 500 }
        );
    }
}