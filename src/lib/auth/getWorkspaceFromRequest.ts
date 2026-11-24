import { prisma } from "@/lib/prisma";
import { verifyFirebaseIdToken } from "@/lib/firebaseAdmin";

import { AuthError } from "@/lib/auth/errors";
import { assertPaidAccess } from "@/lib/billing/access";

export { AuthError };

function extractBearerToken(req: Request) {
    const authHeader = req.headers.get("authorization") ?? "";
    const [scheme, token] = authHeader.split(" ");

    if (scheme !== "Bearer" || !token) {
        throw new AuthError("Missing authorization token", 401);
    }

    return token.trim();
}

/**
 * Resolves the signed-in user's workspace. Also enforces billing: once the free
 * trial ends without a paid plan this throws a 402 (PaymentRequiredError).
 * Pass { allowLocked: true } only for routes a locked customer still needs,
 * such as contacting support.
 */
export async function getWorkspaceFromRequest(req: Request, options: { allowLocked?: boolean } = {}) {
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
        throw new AuthError("Unauthorized", 401);
    }

    if (!user.workspaceId) {
        throw new AuthError("No workspace found for this user", 403);
    }

    if (!options.allowLocked) {
        await assertPaidAccess(user.workspaceId);
    }

    return {
        userId: user.id,
        firebaseUid: user.firebaseUid,
        workspaceId: user.workspaceId,
    };
}