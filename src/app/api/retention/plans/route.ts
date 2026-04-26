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

export async function GET(req: NextRequest) {
    try {
        const token = bearer(req);
        const decoded = await verifyFirebaseIdToken(token);

        const user = await prisma.user.findUnique({
            where: { firebaseUid: decoded.uid },
            select: { workspaceId: true },
        });
        if (!user?.workspaceId) return NextResponse.json({ ok: false, error: "No workspace" }, { status: 401 });

        const plans = await prisma.retentionPlan.findMany({
            where: { workspaceId: user.workspaceId },
            orderBy: { createdAt: "desc" },
            include: {
                actions: { orderBy: { createdAt: "desc" } },
                runs: { orderBy: { createdAt: "desc" }, take: 1 },
            },
            take: 20,
        });

        return NextResponse.json({ ok: true, plans });
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e?.message || "Failed" }, { status: 500 });
    }
}
