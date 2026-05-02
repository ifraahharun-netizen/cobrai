import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyFirebaseIdToken } from "@/lib/firebaseAdmin";

const MAX_NAME_LENGTH = 80;

function getBearerToken(req: NextRequest) {
    const authHeader = req.headers.get("authorization") ?? "";
    const [scheme, token] = authHeader.split(" ");

    if (scheme !== "Bearer" || !token) return null;

    return token;
}

function getFirstName(fullName: string) {
    const trimmed = fullName.trim();
    if (!trimmed) return "My";
    return trimmed.split(/\s+/)[0] || "My";
}

export async function POST(req: NextRequest) {
    try {
        const token = getBearerToken(req);

        if (!token) {
            return NextResponse.json(
                { ok: false, error: "Missing authorization token." },
                { status: 401 }
            );
        }

        const decoded = await verifyFirebaseIdToken(token);

        if (!decoded?.uid || !decoded?.email) {
            return NextResponse.json(
                { ok: false, error: "Invalid Firebase token." },
                { status: 401 }
            );
        }

        const body = await req.json().catch(() => ({}));

        const rawFullName =
            typeof body?.fullName === "string" ? body.fullName.trim() : "";

        const fullName = rawFullName.slice(0, MAX_NAME_LENGTH);

        const email = decoded.email.toLowerCase();
        const firebaseUid = decoded.uid;

        const existingUser = await prisma.user.findUnique({
            where: { firebaseUid },
            select: {
                id: true,
                workspaceId: true,
            },
        });

        if (existingUser) {
            return NextResponse.json({
                ok: true,
                alreadyExists: true,
                workspaceId: existingUser.workspaceId,
            });
        }

        const workspaceName = `${getFirstName(fullName)}'s Workspace`;

        const result = await prisma.$transaction(async (tx) => {
            const workspace = await tx.workspace.create({
                data: {
                    name: workspaceName,
                    ownerEmail: email,
                    tier: "starter",
                    demoMode: true,
                },
            });

            const user = await tx.user.create({
                data: {
                    firebaseUid,
                    email,
                    name: fullName || email.split("@")[0],
                    workspaceId: workspace.id,
                },
            });

            return { workspace, user };
        });

        return NextResponse.json({
            ok: true,
            workspaceId: result.workspace.id,
            userId: result.user.id,
        });
    } catch (error) {
        console.error("POST /api/auth/register error:", error);

        return NextResponse.json(
            {
                ok: false,
                error: "Failed to register user.",
            },
            { status: 500 }
        );
    }
}