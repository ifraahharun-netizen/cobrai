import { NextResponse } from "next/server";
import { getDemoCustomerDetail } from "@/lib/demo/customerDetail";
import { getLiveCustomerDetail } from "@/lib/live/customerDetail";
import { getWorkspaceDataMode } from "@/lib/workspace/getWorkspaceDataMode";
import { verifyFirebaseIdToken } from "@/lib/firebaseAdmin";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getWorkspaceIdFromRequest(req: Request) {
    const authHeader = req.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
        throw new Error("Unauthorized");
    }

    const idToken = authHeader.slice("Bearer ".length).trim();

    if (!idToken) {
        throw new Error("Unauthorized");
    }

    const decoded = await verifyFirebaseIdToken(idToken);

    const user = await prisma.user.findFirst({
        where: {
            OR: [
                { firebaseUid: decoded.uid },
                ...(decoded.email ? [{ email: decoded.email }] : []),
            ],
        },
        select: {
            workspaceId: true,
        },
    });

    if (!user?.workspaceId) {
        throw new Error("Workspace not found");
    }

    return user.workspaceId;
}

export async function GET(
    req: Request,
    ctx: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await ctx.params;
        const workspaceId = await getWorkspaceIdFromRequest(req);
        const modeInfo = await getWorkspaceDataMode(workspaceId);

        if (modeInfo.mode === "live") {
            const customer = await getLiveCustomerDetail(
                workspaceId,
                id,
                modeInfo.workspaceTier
            );

            if (!customer) {
                return NextResponse.json(
                    { error: "Customer not found" },
                    { status: 404 }
                );
            }

            return NextResponse.json({
                ...customer,
                workspaceTier: modeInfo.workspaceTier,
                connectedIntegrations: modeInfo.connectedIntegrations,
                mode: "live",
            });
        }

        const customer = getDemoCustomerDetail(id);

        if (!customer) {
            return NextResponse.json(
                { error: "Customer not found" },
                { status: 404 }
            );
        }

        return NextResponse.json({
            ...customer,
            workspaceTier: modeInfo.workspaceTier,
            connectedIntegrations: modeInfo.connectedIntegrations,
            mode: "demo",
        });
    } catch (error: any) {
        console.error("GET /api/customers/[id] failed", error);

        const message = String(error?.message || "Failed to load customer");

        if (message === "Unauthorized") {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        if (message === "Workspace not found") {
            return NextResponse.json(
                { error: "Workspace not found" },
                { status: 404 }
            );
        }

        return NextResponse.json(
            { error: "Failed to load customer" },
            { status: 500 }
        );
    }
}