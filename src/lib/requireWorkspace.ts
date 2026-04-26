import { headers } from "next/headers";
import prisma from "@/lib/prisma";
import { getFirebaseAdmin } from "@/lib/firebaseAdmin";

/**
 * Reads Firebase ID token from:
 * Authorization: Bearer <token>
 * Creates Workspace + User mapping on first request.
 */
export async function requireWorkspace() {
    const h = await headers();
    const authHeader = h.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) throw new Error("Missing Authorization Bearer token.");

    const admin = getFirebaseAdmin();
    const decoded = await admin.auth().verifyIdToken(token);

    const firebaseUid = decoded.uid;
    const email = (decoded.email as string | undefined) || null;

    // Find user -> workspace mapping
    let user = await prisma.user.findUnique({ where: { firebaseUid } });

    // Auto-bootstrap on first login
    if (!user) {
        const ws = await prisma.workspace.create({
            data: { name: email ? email.split("@")[0] : "Workspace" },
        });

        user = await prisma.user.create({
            data: {
                firebaseUid,
                email,
                workspaceId: ws.id,
            },
        });
    }

    return { workspaceId: user.workspaceId, firebaseUid, email };
}
