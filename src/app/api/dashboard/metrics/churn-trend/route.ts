import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function monthKey(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function GET() {
    // This uses your DB (which should be filled by Stripe webhooks/sync)
    // Churn is inferred from Event records like "stripe.subscription.canceled".
    const since = new Date();
    since.setMonth(since.getMonth() - 5);
    since.setHours(0, 0, 0, 0);

    const [events, activeCustomers] = await Promise.all([
        prisma.event.findMany({
            where: {
                occurredAt: { gte: since },
                OR: [
                    { type: { contains: "subscription.canceled" } },
                    { type: { contains: "customer.subscription.deleted" } },
                    { type: { contains: "churn" } },
                ],
            },
            select: { occurredAt: true },
            orderBy: { occurredAt: "asc" },
        }),
        prisma.customer.count({
            where: { mrr: { gt: 0 } },
        }),
    ]);

    const churnByMonth = new Map<string, number>();
    for (const e of events) {
        const k = monthKey(e.occurredAt);
        churnByMonth.set(k, (churnByMonth.get(k) ?? 0) + 1);
    }

    // If you have no active base yet, return empty so charts show “no data”
    if (!activeCustomers) {
        return NextResponse.json({ points: [] });
    }

    // build last 6 months keys
    const months: string[] = [];
    const cursor = new Date(since);
    for (let i = 0; i < 6; i++) {
        months.push(monthKey(cursor));
        cursor.setMonth(cursor.getMonth() + 1);
    }

    const points = months.map((m) => {
        const churned = churnByMonth.get(m) ?? 0;
        const churnPct = Number(((churned / activeCustomers) * 100).toFixed(1));
        return { month: m, churnPct };
    });

    return NextResponse.json({ points });
}