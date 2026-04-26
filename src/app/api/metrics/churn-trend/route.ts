import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

export async function GET() {
    const workspaceId = "ws_demo";

    const customers = await prisma.customer.findMany({
        where: { workspaceId },
        select: { churnRisk: true },
    });

    const avg =
        customers.length > 0
            ? customers.reduce((s, c) => s + (Number(c.churnRisk) || 0), 0) / customers.length
            : 0;

    // Make a stable-looking "trend" around the avg (demo-friendly)
    // Output is percentage 0-100
    const base = clamp(Math.round(avg), 0, 100);
    const deltas = [8, 5, 3, 2, 1, 0].map((d, i) => (i % 2 === 0 ? d : -d));

    const points = [6, 5, 4, 3, 2, 1].map((w, i) => ({
        label: `W-${w}`,
        churnProb: clamp(base + deltas[i], 0, 100),
    }));

    return NextResponse.json({ avg: base, points });
}
