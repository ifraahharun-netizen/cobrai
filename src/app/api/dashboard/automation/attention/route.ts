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

function toMinorFromMajor(maybeMajor: number | null | undefined) {
    const n = Number(maybeMajor || 0);
    return Math.round(n * 100);
}

function getRiskBand(score: number): "Critical" | "High" | "Medium" | "Low" {
    if (score >= 85) return "Critical";
    if (score >= 70) return "High";
    if (score >= 45) return "Medium";
    return "Low";
}

function recommendedActionForRow(reason: string | null | undefined, riskScore: number) {
    const text = (reason || "").toLowerCase();

    if (text.includes("payment") || text.includes("billing") || text.includes("failed")) {
        return "Recover failed payment";
    }

    if (riskScore >= 85) {
        return "Send check-in + billing recovery automation";
    }

    if (riskScore >= 70) {
        return "Trigger re-engagement sequence";
    }

    if (riskScore >= 45) {
        return "Monitor activity and schedule follow-up";
    }

    return "Review for expansion opportunity";
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

        const rows = await prisma.accountRisk.findMany({
            where: { workspaceId },
            orderBy: [{ riskScore: "desc" }, { updatedAt: "desc" }],
            take: 10,
            select: {
                id: true,
                customerId: true,
                companyName: true,
                reasonLabel: true,
                riskScore: true,
                mrr: true,
                updatedAt: true,
            },
        });

        return NextResponse.json({
            ok: true,
            rows: rows.map((r) => ({
                id: r.customerId || r.id,
                company: r.companyName,
                risk: r.riskScore,
                riskBand: getRiskBand(r.riskScore),
                mrrMinor: toMinorFromMajor(r.mrr),
                driver: r.reasonLabel || null,
                lastActiveAt: null,
                recommendedAction: recommendedActionForRow(r.reasonLabel, r.riskScore),
            })),
        });
    } catch (e: any) {
        console.error("dashboard/automation/attention GET failed:", e);
        return NextResponse.json(
            { ok: false, error: e?.message ?? "Failed to load attention rows" },
            { status: 500 }
        );
    }
}