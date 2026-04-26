import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getWorkspaceIdFromRequest } from "@/lib/workspace.server";

export const dynamic = "force-dynamic";

/**
 * /api/dashboard/mrr-protected
 */
export async function GET(req: Request) {
    try {
        // Auth + workspace
        const workspaceId = await getWorkspaceIdFromRequest(req);

        // Sum AccountRisk.mrr (Float pounds → pennies)
        const agg = await prisma.accountRisk.aggregate({
            where: { workspaceId, riskScore: { gte: 70 } },
            _sum: { mrr: true },
        });

        const pounds = Number(agg._sum.mrr || 0);
        const pennies = Math.round(pounds * 100);

        return NextResponse.json({
            ok: true,
            mrrProtected: pennies,
        });
    } catch (e: any) {
        const msg = String(e?.message ?? "Unknown error");

        // Auth error → 401
        if (msg.toLowerCase().includes("authorization") || msg.toLowerCase().includes("token")) {
            return NextResponse.json({ ok: false, error: msg }, { status: 401 });
        }

        console.error("GET /api/dashboard/mrr-protected failed:", e);

        return NextResponse.json(
            { ok: false, error: msg },
            { status: 500 }
        );
    }
}
