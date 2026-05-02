import { prisma } from "@/lib/prisma";
import { verifyFirebaseIdToken } from "@/lib/firebaseAdmin";

function getBearerToken(req: Request) {
    const authHeader = req.headers.get("authorization") ?? "";
    const match = authHeader.match(/^Bearer\s+(.+)$/i);

    if (!match) {
        throw new Error("Unauthorized");
    }

    return match[1];
}

export async function getWorkspaceIdFromRequest(req: Request) {
    const token = getBearerToken(req);
    const decoded = await verifyFirebaseIdToken(token);

    const firebaseUid = decoded.uid;

    const user = await prisma.user.findUnique({
        where: { firebaseUid },
        select: { workspaceId: true },
    });

    if (!user?.workspaceId) {
        throw new Error("Forbidden");
    }

    return user.workspaceId;
}