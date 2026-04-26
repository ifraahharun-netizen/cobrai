import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function getWorkspaceForUid(uid: string) {
    return prisma.workspace.findFirst({
        where: {
            user: {
                some: {
                    firebaseUid: uid,
                },
            },
        },
        select: {
            id: true,
            stripeAccountId: true,
            stripeConnectedAt: true,
        },
    });
}

export async function GET(req: NextRequest) {
    try {
        const uid = req.nextUrl.searchParams.get("uid");

        if (!uid) {
            return NextResponse.json(
                { error: "Missing uid" },
                { status: 400 }
            );
        }

        const workspace = await getWorkspaceForUid(uid);

        if (!workspace) {
            return NextResponse.json(
                {
                    connected: false,
                    stripeAccountId: null,
                    connectedAt: null,
                    workspaceId: null,
                },
                { status: 200 }
            );
        }

        return NextResponse.json({
            connected: Boolean(workspace.stripeAccountId),
            stripeAccountId: workspace.stripeAccountId ?? null,
            connectedAt: workspace.stripeConnectedAt ?? null,
            workspaceId: workspace.id,
        });
    } catch (error) {
        console.error("[Stripe Connect] status failed:", error);

        return NextResponse.json(
            { error: "Failed to load Stripe connection status" },
            { status: 500 }
        );
    }
}