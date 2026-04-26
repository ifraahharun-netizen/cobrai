import { prisma } from "@/lib/prisma";
import { verifyFirebaseIdToken } from "@/lib/firebaseAdmin";

export class AuthError extends Error {
    status: number;

    constructor(message: string, status = 401) {
        super(message);
        this.name = "AuthError";
        this.status = status;
    }
}

function extractBearerToken(req: Request) {
    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
        throw new AuthError("Missing authorization token", 401);
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
        throw new AuthError("Missing authorization token", 401);
    }

    return token;
}

export async function getWorkspaceFromRequest(req: Request) {
    const token = extractBearerToken(req);
    const decoded = await verifyFirebaseIdToken(token);

    const user = await prisma.user.findUnique({
        where: { firebaseUid: decoded.uid },
        select: {
            id: true,
            firebaseUid: true,
            workspaceId: true,
        },
    });

    if (!user) {
        throw new AuthError("User not found", 401);
    }

    if (!user.workspaceId) {
        throw new AuthError("No workspace found for this user", 403);
    }

    return {
        userId: user.id,
        firebaseUid: user.firebaseUid,
        workspaceId: user.workspaceId,
    };
}