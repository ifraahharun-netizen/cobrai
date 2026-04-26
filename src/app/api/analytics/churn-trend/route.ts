import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireWorkspace } from "@/lib/requireWorkspace";

export const runtime = "nodejs";

export async function GET() {
    const { workspaceId } = await requireWorkspace();

    if (!workspaceId) {
        return NextResponse.json(
            { error: "No workspace linked to this user." },
            { status: 401 }
        );
    }

    const since = new Date();
    since.setMonth(since.getMonth() - 6);

    const churned = await prisma.customer.findMany({
        where: {
            workspaceId,
            status: "churned",
            createdAt: { gte: since },
        },
        select: { createdAt: true },
    });

    const buckets = new Map<string, number>();

    for (const row of churned) {
        const d = row.createdAt;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        buckets.set(key, (buckets.get(key) || 0) + 1);
    }

    const labels = Array.from(buckets.keys()).sort();
    const series = labels.map((k) => buckets.get(k) || 0);

    return NextResponse.json({ labels, series });
}