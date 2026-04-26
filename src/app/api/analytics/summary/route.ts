import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyFirebaseIdToken } from "@/lib/firebaseAdmin";


export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getBearerToken(req: Request) {
    const h = req.headers.get("authorization") || "";
    const m = h.match(/^Bearer\s+(.+)$/i);
    return m?.[1] || null;
}

function toMinorFromMajor(maybeMajor: number | null | undefined) {
    const n = Number(maybeMajor || 0);
    return Math.round(n * 100);
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

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: {
                id: true,
                tier: true,
                demoMode: true,
            },
        });

        if (!workspace) {
            return NextResponse.json(
                { ok: false, error: "Workspace not found" },
                { status: 404 }
            );
        }

        const integrations = await prisma.integration.findMany({
            where: {
                workspaceId,
                status: "connected",
            },
            select: {
                provider: true,
            },
        });

        const connectedIntegrations = integrations.map((i) => i.provider);



        const customers = await prisma.customer.findMany({
            where: { workspaceId },
            select: {
                id: true,
                createdAt: true,
                mrr: true,
                status: true,
                canceledAt: true,
                lastActiveAt: true,
            },
        });

        const activeCustomers = customers.filter((c) => !c.canceledAt);
        const canceledCustomers = customers.filter((c) => !!c.canceledAt);

        const totalMrrMinor = activeCustomers.reduce((sum, c) => sum + Number(c.mrr || 0), 0);

        const atRiskAccounts = await prisma.accountRisk.count({
            where: {
                workspaceId,
                riskScore: { gte: 70 },
            },
        });

        const mrrAtRiskAgg = await prisma.accountRisk.aggregate({
            where: {
                workspaceId,
                riskScore: { gte: 70 },
            },
            _sum: {
                mrr: true,
            },
        });

        const mrrAtRiskMinor = toMinorFromMajor(mrrAtRiskAgg._sum.mrr);

        const churnBase = activeCustomers.length + canceledCustomers.length;
        const churnPct =
            churnBase > 0
                ? Math.round((canceledCustomers.length / churnBase) * 1000) / 10
                : null;

        const retentionPct =
            churnPct == null ? null : Math.max(0, Math.round((100 - churnPct) * 10) / 10);

        const riskAccounts = await prisma.accountRisk.findMany({
            where: { workspaceId },
            orderBy: [{ riskScore: "desc" }, { updatedAt: "desc" }],
            take: 8,
            select: {
                id: true,
                companyName: true,
                reasonLabel: true,
                riskScore: true,
                mrr: true,
            },
        });

        const since = new Date();
        since.setDate(since.getDate() - 30);

        const newSubscriptions = customers.filter((c) => c.createdAt >= since).length;

        const failedSubscriptions = await prisma.accountRisk.count({
            where: {
                workspaceId,
                updatedAt: { gte: since },
                OR: [
                    { reasonLabel: { contains: "payment", mode: "insensitive" } },
                    { reasonLabel: { contains: "billing", mode: "insensitive" } },
                    { reasonLabel: { contains: "failed", mode: "insensitive" } },
                ],
            },
        });

        return NextResponse.json({
            ok: true,
            tier: workspace.tier,
            demoMode: workspace.demoMode,
            connectedIntegrations,
            kpis: {
                totalMrr: totalMrrMinor,
                mrrAtRisk: mrrAtRiskMinor,
                atRiskAccounts,
                retentionPct,
                churnPct,
            },
            riskAccounts: riskAccounts.map((r) => ({
                id: r.id,
                company: r.companyName,
                reason: r.reasonLabel,
                risk: r.riskScore,
                mrr: typeof r.mrr === "number" ? r.mrr : null, // pounds
            })),
            activitySummary: {
                windowLabel: "Last 30 days",
                newSubscriptions,
                newTrials: 0,
                reactivations: 0,
                failedSubscriptions,
            },
        });
    } catch (e: any) {
        console.error("dashboard/summary GET failed:", e);
        return NextResponse.json(
            { ok: false, error: e?.message ?? "Analytics summary failed" },
            { status: 500 }
        );
    }
}