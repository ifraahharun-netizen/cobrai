import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

async function getWorkspaceIdForUid(uid: string) {
    const workspace = await prisma.workspace.findFirst({
        where: {
            user: {
                some: {
                    firebaseUid: uid,
                },
            },
        },
        select: {
            id: true,
        },
    });

    return workspace?.id ?? null;
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const uid = typeof body?.uid === "string" ? body.uid : null;

        if (!uid) {
            return NextResponse.json({ error: "Missing uid" }, { status: 400 });
        }

        const workspaceId = await getWorkspaceIdForUid(uid);

        if (!workspaceId) {
            return NextResponse.json(
                { error: "Workspace not found" },
                { status: 404 }
            );
        }

        await prisma.integration.upsert({
            where: {
                workspaceId_provider: {
                    workspaceId,
                    provider: "stripe",
                },
            },
            update: {
                status: "disconnected",
                externalAccountId: null,
                externalAccountName: null,
                externalAccountEmail: null,
                accessTokenEnc: null,
                refreshTokenEnc: null,
                scopes: null,
                disconnectedAt: new Date(),
                metadata: undefined,
                lastSyncError: null,
                connectedAt: null,
                lastSyncedAt: null,
            },
            create: {
                workspaceId,
                provider: "stripe",
                status: "disconnected",
                disconnectedAt: new Date(),
            },
        });

        await prisma.workspace.update({
            where: { id: workspaceId },
            data: {
                stripeAccountId: null,
                stripeAccessTokenEnc: null,
                stripeRefreshTokenEnc: null,
                stripeScope: null,
                stripeConnectedAt: null,
                stripeLastSyncedAt: null,
                stripeSecretKeyEnc: null,
            },
        });

        const adminDb = getAdminDb();

        await adminDb.doc(`users/${uid}/integrations/main`).set(
            {
                stripe: {
                    connected: false,
                    stripeAccountId: null,
                    accountName: "",
                    accountEmail: "",
                    disconnectedAt: FieldValue.serverTimestamp(),
                },
                updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
        );

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error("[Stripe Connect] disconnect failed:", error);

        return NextResponse.json(
            { error: "Failed to disconnect Stripe" },
            { status: 500 }
        );
    }
}