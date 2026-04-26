import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    const workspaceId = "ws_demo";

    // If you don’t have a model yet, we can derive “signals” from customers for now:
    const customers = await prisma.customer.findMany({
        where: { workspaceId },
        select: { id: true, name: true, mrr: true, churnRisk: true },
        take: 50,
    });

    // Demo heuristic: low churnRisk + decent MRR => expansion candidate
    const signals = customers
        .map((c) => {
            const risk = Number(c.churnRisk) || 0;
            const mrr = Number(c.mrr) || 0;
            const score = Math.round((100 - risk) * (mrr > 0 ? 1 : 0.6));
            return {
                id: c.id,
                account: c.name ?? "Unknown",
                type: risk <= 35 ? "Expansion likely" : risk <= 55 ? "Nurture" : "Watch",
                score,
                upliftPotential: Math.round(mrr * (risk <= 35 ? 0.25 : 0.1)), // £ estimate
            };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 7);

    const totalPotential = signals.reduce((s, x) => s + x.upliftPotential, 0);

    // Simple “trend” for chart (demo)
    const trend = [6, 5, 4, 3, 2, 1].map((w, i) => ({
        label: `W-${w}`,
        potential: Math.max(0, Math.round(totalPotential * (0.6 + i * 0.08))),
    }));

    return NextResponse.json({
        signals,
        totalPotential,
        trend,
    });
}

