import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyFirebaseIdToken } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getBearerToken(req: Request) {
    const h = req.headers.get("authorization") || "";
    const m = h.match(/^Bearer\s+(.+)$/i);
    return m?.[1] || null;
}

function isCanceledStatus(status: string | null | undefined) {
    const s = (status || "").toLowerCase();
    return s === "canceled" || s === "cancelled" || s === "churned";
}

export async function GET(req: Request) {
    try {
        const token = getBearerToken(req);
        if (!token) {
            return NextResponse.json(
                { ok: false, error: "Missing Authorization Bearer token" },
                { status: 401 }
            );
        }

        const decoded = await verifyFirebaseIdToken(token);
        const firebaseUid = decoded.uid;

        const user = await prisma.user.findUnique({
            where: { firebaseUid },
            select: { workspaceId: true },
        });

        if (!user?.workspaceId) {
            return NextResponse.json(
                { ok: false, error: "No workspace for user" },
                { status: 404 }
            );
        }

        const workspaceId = user.workspaceId;

        const customers = await prisma.customer.findMany({
            where: { workspaceId },
            select: {
                mrr: true,
                riskScore: true,
                status: true,
            },
        });

        const mrrProtected = customers
            .filter((c) => !isCanceledStatus(c.status) && Number(c.riskScore || 0) < 65)
            .reduce((sum, c) => sum + Number(c.mrr || 0), 0);

        return NextResponse.json({
            ok: true,
            mrrProtected,
        });
    } catch (e: any) {
        console.error("dashboard/metrics/mrr-protected GET failed:", e);
        return NextResponse.json(
            { ok: false, error: e?.message ?? "Failed to load MRR protected" },
            { status: 500 }
        );
    }
}