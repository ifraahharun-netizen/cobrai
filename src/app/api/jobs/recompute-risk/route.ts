import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// MVP risk scoring:
// - inactivity (days since lastActive)
// - usage drop (events this week vs last week)
// - failed invoices in last 14 days
function clamp01(x: number) {
    return Math.max(0, Math.min(1, x));
}

export async function POST() {
    const workspaceId = "ws_demo";
    const now = new Date();

    const thisWeekStart = new Date(now);
    thisWeekStart.setUTCDate(now.getUTCDate() - 7);

    const lastWeekStart = new Date(now);
    lastWeekStart.setUTCDate(now.getUTCDate() - 14);

    const customers = await prisma.customer.findMany({
        where: { workspaceId },
        select: { id: true, lastActiveAt: true },
    });

    for (const c of customers) {
        const lastActive = c.lastActiveAt ?? new Date(0);
        const daysInactive = Math.floor((now.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24));

        const thisWeekCount = await prisma.event.count({
            where: { workspaceId, customerId: c.id, occurredAt: { gte: thisWeekStart } },
        });

        const lastWeekCount = await prisma.event.count({
            where: { workspaceId, customerId: c.id, occurredAt: { gte: lastWeekStart, lt: thisWeekStart } },
        });

        const usageDrop = lastWeekCount > 0 ? clamp01((lastWeekCount - thisWeekCount) / lastWeekCount) : 0;

        const failedInvoices = await prisma.invoice.count({
            where: {
                workspaceId,
                customerId: c.id,
                status: "failed",
                dueAt: { gte: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000) },
            },
        });

        // Score pieces (0..1)
        const inactivityRisk = clamp01(daysInactive / 14);         // 2 weeks inactive -> 1.0
        const billingRisk = failedInvoices > 0 ? 1 : 0;

        // Weighted sum
        const risk = clamp01(0.5 * inactivityRisk + 0.35 * usageDrop + 0.15 * billingRisk);

        // Health score inverse-ish (0..100)
        const health = Math.round(100 * (1 - risk));

        await prisma.customer.update({
            where: { id: c.id },
            data: { churnRisk: risk, healthScore: health },
        });
    }

    return NextResponse.json({ ok: true, updated: customers.length });
}
