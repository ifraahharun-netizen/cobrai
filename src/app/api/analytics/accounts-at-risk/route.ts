import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireWorkspace } from "@/lib/requireWorkspace";

export const runtime = "nodejs";

export async function GET() {
    const { workspaceId } = await requireWorkspace();

    const rows = await prisma.accountRisk.findMany({
        where: { workspaceId },
        orderBy: [{ riskScore: "desc" }, { updatedAt: "desc" }],
        take: 10,
    });

    return NextResponse.json({
        rows: rows.map((r) => ({
            id: r.id,
            company: r.companyName,
            reason: r.reasonLabel,
            risk: r.riskScore,
            mrr: r.mrr, // already stored as pounds-ish float in your model
            updatedAt: r.updatedAt.toISOString(),
        })),
    });
}
