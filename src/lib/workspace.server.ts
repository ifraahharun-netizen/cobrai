import { prisma } from "@/lib/prisma";
import { verifyFirebaseIdToken } from "@/lib/firebaseAdmin";

function getBearerToken(req: Request) {
    const authHeader = req.headers.get("authorization") || "";
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) throw new Error("Missing Authorization: Bearer <token>");
    return match[1];
}

export async function getWorkspaceIdFromRequest(req: Request) {
    const token = getBearerToken(req);
    const decoded = await verifyFirebaseIdToken(token);

    const firebaseUid = decoded.uid;
    const email = decoded.email || null;

    // ✅ Adjust this to match your User model fields:
    // You MUST have either firebaseUid or email stored for the user.
    // src/lib/workspace.server.ts
    const user = await prisma.user.findFirst({
        where: {
            OR: [
                { firebaseUid: firebaseUid }, // or just { firebaseUid }
                ...(email ? [{ email }] : []),
            ],
        },
        select: { workspaceId: true },
    });

    if (!user?.workspaceId) {
        throw new Error("No workspace linked to this user");
    }

    return user.workspaceId as string;
}
