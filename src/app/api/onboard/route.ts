export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyFirebaseIdToken } from "@/lib/firebaseAdmin";

function getTrialEndsAt() {
    return new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
}

export async function POST(req: Request) {
    try {
        const auth = req.headers.get("authorization") || "";
        const token = auth.startsWith("Bearer ")
            ? auth.slice(7)
            : null;

        if (!token) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const decoded = await verifyFirebaseIdToken(token);

        const uid = decoded.uid;
        const email = (decoded as any).email ?? null;
        const name = (decoded as any).name ?? null;

        let user = await prisma.user.findUnique({
            where: {
                firebaseUid: uid,
            },
        });

        if (!user) {
            user = await prisma.user.create({
                data: {
                    firebaseUid: uid,
                    email,
                    name,
                },
            });
        }

        if (!user.workspaceId) {
            const existingWorkspace = await prisma.workspace.findFirst({
                where: {
                    ownerEmail: user.email ?? email ?? undefined,
                },
            });

            let workspaceId = existingWorkspace?.id;

            if (!workspaceId) {
                const workspace = await prisma.workspace.create({
                    data: {
                        name:
                            user.name ||
                            user.email?.split("@")[0] ||
                            "My Workspace",

                        ownerEmail:
                            user.email ||
                            email ||
                            "unknown@cobrai.uk",

                        tier: "free",

                        demoMode: true,

                        trialEndsAt: getTrialEndsAt(),
                    },
                });

                workspaceId = workspace.id;

                console.log(
                    "Created missing workspace:",
                    workspaceId
                );
            }

            await prisma.user.update({
                where: {
                    id: user.id,
                },

                data: {
                    workspaceId,
                },
            });

            user = await prisma.user.findUnique({
                where: {
                    id: user.id,
                },
            });
        }

        return NextResponse.json({
            ok: true,

            workspaceId: user?.workspaceId,

            created: true,

            demoMode: true,
        });
    } catch (e) {
        console.error("POST /api/onboard failed:", e);

        return NextResponse.json(
            {
                error: "Failed to onboard",
            },
            {
                status: 500,
            }
        );
    }
}