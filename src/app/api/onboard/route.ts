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
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

        if (!token) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const decoded = await verifyFirebaseIdToken(token);
        const uid = decoded.uid;
        const email = (decoded as any).email ?? null;
        const name = (decoded as any).name ?? null;

        let user = await prisma.user.findUnique({
            where: { firebaseUid: uid },
            select: { id: true, workspaceId: true, email: true, name: true },
        });

        if (!user) {
            user = await prisma.user.create({
                data: {
                    firebaseUid: uid,
                    email,
                    name,
                },
                select: { id: true, workspaceId: true, email: true, name: true },
            });
        }

        const ownerEmail = user.email ?? email;
        if (!ownerEmail) {
            return NextResponse.json(
                { error: "User email is required to create a workspace" },
                { status: 400 }
            );
        }

        if (user.workspaceId) {
            return NextResponse.json({
                ok: true,
                workspaceId: user.workspaceId,
                created: false,
            });
        }

        const trialEndsAt = getTrialEndsAt();

        const result = await prisma.$transaction(async (tx) => {
            const workspace = await tx.workspace.create({
                data: {
                    name:
                        user!.name ||
                        user!.email?.split("@")[0] ||
                        "My Workspace",
                    ownerEmail,
                    tier: "free",
                    demoMode: false,
                    trialEndsAt,
                },
                select: { id: true },
            });

            await tx.user.update({
                where: { id: user!.id },
                data: { workspaceId: workspace.id },
            });

            return workspace;
        });

        return NextResponse.json({
            ok: true,
            workspaceId: result.id,
            created: true,
            tier: "free",
            trialEndsAt: trialEndsAt.toISOString(),
        });
    } catch (e) {
        console.error("POST /api/onboard failed:", e);
        return NextResponse.json({ error: "Failed to onboard" }, { status: 500 });
    }
}

