import { prisma } from "@/lib/prisma";
import { verifyFirebaseIdToken } from "@/lib/firebaseAdmin";

export type AuthenticatedUser = {
    userId: string;
    firebaseUid: string;
    email: string | null;
    workspaceId: string | null;
};

export async function requireAuthenticatedUser(
    req: Request
): Promise<{ ok: true; user: AuthenticatedUser } | { ok: false; response: Response }> {
    try {
        const auth = req.headers.get("authorization") ?? "";
        const [scheme, token] = auth.split(" ");

        if (scheme !== "Bearer" || !token) {
            return {
                ok: false,
                response: Response.json({ error: "Unauthorized" }, { status: 401 }),
            };
        }

        const decoded = await verifyFirebaseIdToken(token);
        const firebaseUid = decoded.uid;
        const email = (decoded as { email?: string | null }).email ?? null;

        const user = await prisma.user.findUnique({
            where: { firebaseUid },
            select: {
                id: true,
                firebaseUid: true,
                email: true,
                workspaceId: true,
            },
        });

        if (!user) {
            return {
                ok: false,
                response: Response.json({ error: "Unauthorized" }, { status: 401 }),
            };
        }

        return {
            ok: true,
            user: {
                userId: user.id,
                firebaseUid: user.firebaseUid,
                email: user.email ?? email,
                workspaceId: user.workspaceId,
            },
        };
    } catch (error) {
        console.error("requireAuthenticatedUser failed:", error);
        return {
            ok: false,
            response: Response.json({ error: "Unauthorized" }, { status: 401 }),
        };
    }
}

export async function requireOwnedWorkspace(
    req: Request,
    requestedWorkspaceId?: string | null
): Promise<
    | { ok: true; user: AuthenticatedUser; workspaceId: string }
    | { ok: false; response: Response }
> {
    const authResult = await requireAuthenticatedUser(req);

    if (!authResult.ok) {
        return authResult;
    }

    const { user } = authResult;

    if (!user.workspaceId) {
        return {
            ok: false,
            response: Response.json(
                { error: "No workspace associated with this user" },
                { status: 404 }
            ),
        };
    }

    if (requestedWorkspaceId && requestedWorkspaceId !== user.workspaceId) {
        return {
            ok: false,
            response: Response.json({ error: "Forbidden" }, { status: 403 }),
        };
    }

    return {
        ok: true,
        user,
        workspaceId: user.workspaceId,
    };
}