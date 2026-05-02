import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireAuthenticatedUser } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
    try {
        const authResult = await requireAuthenticatedUser(req);

        if (!authResult.ok) {
            return authResult.response;
        }

        const { user } = authResult;

        if (!user.workspaceId) {
            return NextResponse.json(
                { error: "No workspace for user" },
                { status: 404 }
            );
        }

        const adminDb = getAdminDb();

        await adminDb.doc(`users/${user.firebaseUid}/integrations/main`).set(
            {
                hubspot: {
                    connected: false,
                    accountName: "",
                    accessToken: "",
                    refreshToken: "",
                    connectedAt: null,
                },
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
                accessTokenEnc: "",
                refreshTokenEnc: "",
                lastSyncError: null,
            },
        });

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error("HubSpot disconnect failed:", error);

        return NextResponse.json(
            { error: "Failed to disconnect HubSpot" },
            { status: 500 }
        );
    }
}