import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function monthKey(d: Date) {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function GET() {
    // In v1: assume single workspace for now OR pass workspaceId via query/auth later
    const workspace = await prisma.workspace.findFirst({
        select: { id: true, name: true, createdAt: true },
    });

    if (!workspace) {
        return NextResponse.json({
            ok: true,
            tier: "starter",
            kpis: {
                atRiskAccounts: 0,
                mrrAtRisk: 0,
                retentionPct: 0,
                churnPct: 0,
            },
        });
    }

    const customers = await prisma.customer.findMany({
        where: { workspaceId: workspace.id },
        select: {
            id: true,
            mrr: true,
            churnRisk: true,
            createdAt: true,
            invoices: {
                select: { status: true, amount: true, dueAt: true, paidAt: true },
                orderBy: { dueAt: "desc" },
                take: 20,
            },
        },
    });

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // "At risk" definition (tune later)
    const atRisk = customers.filter((c) => c.churnRisk >= 0.7);
    const atRiskAccounts = atRisk.length;
    const mrrAtRisk = atRisk.reduce((sum, c) => sum + (c.mrr || 0), 0);

    // Churn (v1): count customers with a canceled/uncollectible invoice in last 30d
    // (Better v2: use subscription.deleted/updated webhook and store explicit churn events)
    let churnedLast30 = 0;

    for (const c of customers) {
        const churnSignal = c.invoices.find((inv) => {
            const t = inv.paidAt ?? inv.dueAt;
            const status = (inv.status || "").toLowerCase();
            return (
                t >= thirtyDaysAgo &&
                (status === "canceled" || status === "uncollectible" || status === "void")
            );
        });
        if (churnSignal) churnedLast30++;
    }

    const base = Math.max(customers.length, 1);
    const churnPct = (churnedLast30 / base) * 100;
    const retentionPct = Math.max(0, 100 - churnPct);

    // Tier (v1): hardcode until you store it on Workspace from Stripe subscription
    const tier = "starter";

    return NextResponse.json({
        ok: true,
        tier,
        kpis: {
            atRiskAccounts,
            mrrAtRisk,
            retentionPct,
            churnPct,
        },
    });
}