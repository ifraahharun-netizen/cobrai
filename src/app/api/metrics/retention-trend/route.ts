import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    const workspaceId = "ws_demo";
    const now = new Date();
    const points: { label: string; retention: number }[] = [];

    const total = await prisma.customer.count({ where: { workspaceId } });

    for (let w = 6; w >= 1; w--) {
        const start = new Date(now);
        start.setUTCDate(now.getUTCDate() - w * 7);
        const end = new Date(start);
        end.setUTCDate(start.getUTCDate() + 7);

        const activeCustomers = await prisma.event.findMany({
            where: { workspaceId, occurredAt: { gte: start, lt: end } },
            select: { customerId: true },
            distinct: ["customerId"],
        });

        const retention = total ? activeCustomers.length / total : 0;
        points.push({ label: `W-${w}`, retention: Number(retention.toFixed(2)) });
    }

    return NextResponse.json({ points });
}
