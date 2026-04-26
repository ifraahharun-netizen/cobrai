import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const WORKSPACE_ID = "cml4asaa70000s4zxthxbd4c6";

export async function POST() {
    try {
        const now = new Date();

        const sample = Array.from({ length: 25 }).map((_, i) => {
            const churnRisk = Math.round((10 + Math.random() * 85) * 10) / 10; // 10–95 (1dp)
            const healthScore = Math.max(5, Math.min(95, Math.round(100 - churnRisk)));
            const daysAgo = Math.floor(Math.random() * 35);
            const lastActiveAt = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);

            const plans = ["starter", "pro", "scale"] as const;
            const plan = plans[Math.floor(Math.random() * plans.length)];

            // mrr stored as pennies (Int)
            const mrrPennies =
                plan === "starter" ? 14900 : plan === "pro" ? 29900 : 59900;

            return {
                workspaceId: WORKSPACE_ID,
                name: `Customer ${i + 1}`,
                email: `customer${i + 1}@example.com`,
                plan,
                seats: plan === "starter" ? 1 : plan === "pro" ? 3 : 10,
                mrr: mrrPennies,
                churnRisk,
                healthScore,
                riskScore: Math.round(churnRisk),
                status: "active",
                lastActiveAt,
            };
        });

        const created = await prisma.customer.createMany({
            data: sample,
            skipDuplicates: true,
        });

        return NextResponse.json({
            ok: true,
            inserted: created.count,
            workspaceId: WORKSPACE_ID,
        });
    } catch (e: any) {
        console.error("seed-customers error:", e);
        return NextResponse.json(
            { ok: false, error: e?.message ?? "Failed to seed customers" },
            { status: 500 }
        );
    }
}
