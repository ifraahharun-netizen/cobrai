export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyFirebaseIdToken } from "@/lib/firebaseAdmin";

function bearer(req: Request) {
    const auth = req.headers.get("authorization") || "";
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (!m) throw new Error("Unauthorized");
    return m[1];
}

function riskOf(c: any) {
    return Number(c?.riskScore ?? c?.churnRisk ?? c?.risk ?? 0);
}
function mrrOf(c: any) {
    const v = c?.mrr;
    if (typeof v === "number") return v;
    if (typeof v === "string") return parseFloat(v.replace(/[^\d.]/g, "")) || 0;
    return 0;
}

export async function GET(req: NextRequest) {
    try {
        const token = bearer(req);
        const decoded = await verifyFirebaseIdToken(token);

        const user = await prisma.user.findUnique({
            where: { firebaseUid: decoded.uid },
            select: { workspaceId: true },
        });
        if (!user?.workspaceId) return NextResponse.json({ ok: false, error: "No workspace" }, { status: 401 });

        const customers: any[] = await prisma.customer.findMany({
            where: { workspaceId: user.workspaceId },
            take: 200,
        });

        const atRisk = customers.filter((c) => riskOf(c) >= 75);
        const mrrAtRisk = atRisk.reduce((sum, c) => sum + mrrOf(c), 0);

        // crude signal: “trend” based on how many at-risk updated recently
        const recent = atRisk.filter((c) => {
            const d = c?.updatedAt ? new Date(c.updatedAt) : null;
            if (!d) return false;
            const days = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
            return days <= 14;
        }).length;

        return NextResponse.json({
            ok: true,
            health: {
                atRiskAccounts: atRisk.length,
                mrrAtRisk,
                recentSignals: recent,
                totalCustomers: customers.length,
            },
        });
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e?.message || "Failed" }, { status: 500 });
    }
}
