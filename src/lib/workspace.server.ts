import { prisma } from "@/lib/prisma";
import { verifyFirebaseIdToken } from "@/lib/firebaseAdmin";

function getBearerToken(req: Request) {
    const authHeader =
        req.headers.get("authorization") ?? "";

    const match =
        authHeader.match(/^Bearer\s+(.+)$/i);

    if (!match) {
        throw new Error("Unauthorized");
    }

    return match[1];
}

export async function getWorkspaceIdFromRequest(
    req: Request
) {
    const token = getBearerToken(req);

    const decoded =
        await verifyFirebaseIdToken(token);

    const firebaseUid = decoded.uid;

    console.log(
        "Looking up workspace for firebaseUid:",
        firebaseUid
    );

    let user =
        await prisma.user.findUnique({
            where: {
                firebaseUid,
            },

            select: {
                id: true,
                email: true,
                workspaceId: true,
            },
        });

    console.log("Found user:", user);

    /*
     * Auto recover after prisma reset
     */
    if (!user) {
        const firebaseEmail =
            decoded.email || null;

        if (!firebaseEmail) {
            throw new Error("Unauthorized");
        }

        user =
            await prisma.user.upsert({
                where: {
                    firebaseUid,
                },

                update: {
                    email: firebaseEmail,
                },

                create: {
                    firebaseUid,
                    email: firebaseEmail,
                },

                select: {
                    id: true,
                    email: true,
                    workspaceId: true,
                },

            });
   
        console.log(
            "Recovered or created user:",
            user
        );
    }

    /*
     * Auto create workspace if missing
     */
    if (!user.workspaceId) {
        const workspace =
            await prisma.workspace.create({
                data: {
                    name:
                        user.email?.split("@")[0] ||
                        "Workspace",

                    ownerEmail:
                        user.email || "",
                },

                select: {
                    id: true,
                },
            });

        await prisma.user.update({
            where: {
                id: user.id,
            },

            data: {
                workspaceId:
                    workspace.id,
            },
        });

        console.log(
            "Created missing workspace:",
            workspace.id
        );

        return workspace.id;
    }

    return user.workspaceId;
}