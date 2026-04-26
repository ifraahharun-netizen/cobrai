import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireWorkspace } from "@/lib/requireWorkspace";

export const runtime = "nodejs";

export async function GET() {
    const { workspaceId } = await requireWorkspace();

    if (!workspaceId) {
        return NextResponse.json(
            { error: "No workspace linked to this user." },
            { status: 401 }
        );
    }


    const customers = await prisma.customer.findMany({
        where: { workspaceId },
        select: { mrr: true, riskScore: true, status: true },
    });

    const activeMrrPence = customers
        .filter((c) => c.status === "active")
        .reduce((sum, c) => sum + (c.mrr || 0), 0);

    const atRiskMrrPence = customers
        .filter((c) => c.status === "active" && (c.riskScore || 0) >= 65)
        .reduce((sum, c) => sum + (c.mrr || 0), 0);

    return NextResponse.json({ activeMrrPence, atRiskMrrPence });
}