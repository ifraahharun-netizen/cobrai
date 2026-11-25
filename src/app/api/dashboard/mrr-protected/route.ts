import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getWorkspaceIdFromRequest } from "@/lib/workspace.server";
import { paymentRequiredFromError } from "@/lib/billing/access";

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
        const paymentRequired = paymentRequiredFromError(e);
        if (paymentRequired) return paymentRequired;

        const msg = String(e?.message ?? "Unknown error");

        // Auth error → 401
        if (msg.toLowerCase().includes("authorization") || msg.toLowerCase().includes("token")) {
            return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        }

        console.error("GET /api/dashboard/mrr-protected failed:", e);

        return NextResponse.json(
            { ok: false, error: "Failed to load MRR protected" },
            { status: 500 }
        );
    }
}
