import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type RiskLevel = "critical" | "high" | "medium" | "low";

function riskLevelFromScore(score: number): RiskLevel {
    if (score >= 80) return "critical";
    if (score >= 60) return "high";
    if (score >= 40) return "medium";
    return "low";
}

function makeDemoRow(id: string) {
    const demoMap: Record<
        string,
        {
            companyName: string;
            riskScore: number;
            previousRiskScore: number;
            reasonKey: string;
            reasonLabel: string;
            mrr: number;
            updatedAt: string;
        }
    > = {
        "demo-1": {
            companyName: "SproutCRM",
            riskScore: 86,
            previousRiskScore: 78,
            reasonKey: "no_activity",
            reasonLabel: "No activity in 16 days",
            mrr: 1299,
            updatedAt: new Date().toISOString(),
        },
        "demo-2": {
            companyName: "Northstar Health",
            riskScore: 74,
            previousRiskScore: 68,
            reasonKey: "low_adoption",
            reasonLabel: "Feature adoption dropped this month",
            mrr: 2200,
            updatedAt: new Date().toISOString(),
        },
        "demo-3": {
            companyName: "OrbitDesk",
            riskScore: 63,
            previousRiskScore: 71,
            reasonKey: "payment_risk",
            reasonLabel: "Recent payment recovery flow triggered",
            mrr: 890,
            updatedAt: new Date().toISOString(),
        },
        "demo-4": {
            companyName: "Aster AI",
            riskScore: 58,
            previousRiskScore: 52,
            reasonKey: "support_drop",
            reasonLabel: "Support engagement decreased",
            mrr: 1450,
            updatedAt: new Date().toISOString(),
        },
        "demo-5": {
            companyName: "LoomTax",
            riskScore: 69,
            previousRiskScore: 61,
            reasonKey: "seat_drop",
            reasonLabel: "Seat count reduced this cycle",
            mrr: 1750,
            updatedAt: new Date().toISOString(),
        },
        "demo-6": {
            companyName: "VertexFlow",
            riskScore: 82,
            previousRiskScore: 73,
            reasonKey: "no_activity",
            reasonLabel: "No activity in 12 days",
            mrr: 3100,
            updatedAt: new Date().toISOString(),
        },
        "demo-7": {
            companyName: "BrightOps",
            riskScore: 66,
            previousRiskScore: 64,
            reasonKey: "usage_drop",
            reasonLabel: "Weekly active usage is trending down",
            mrr: 980,
            updatedAt: new Date().toISOString(),
        },
        "demo-8": {
            companyName: "ScalePilot",
            riskScore: 88,
            previousRiskScore: 79,
            reasonKey: "renewal_risk",
            reasonLabel: "Renewal approaching with weak engagement",
            mrr: 4200,
            updatedAt: new Date().toISOString(),
        },
    };

    const d = demoMap[id];
    if (!d) return null;

    const riskDelta = d.riskScore - d.previousRiskScore;

    return {
        id,
        companyName: d.companyName,
        riskScore: d.riskScore,
        previousRiskScore: d.previousRiskScore,
        riskLevel: riskLevelFromScore(d.riskScore),
        riskDelta,
        riskTrend: riskDelta > 0 ? "up" : riskDelta < 0 ? "down" : "flat",
        reasonKey: d.reasonKey,
        reasonLabel: d.reasonLabel,
        mrr: d.mrr,
        updatedAt: d.updatedAt,
        isDemo: true,
    };
}

export async function GET(
    req: Request,
    ctx: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await ctx.params;

        if (id.startsWith("demo-")) {
            const demoRow = makeDemoRow(id);

            if (!demoRow) {
                return NextResponse.json(
                    { ok: false, error: "Demo account not found" },
                    { status: 404 }
                );
            }

            return NextResponse.json({ ok: true, row: demoRow });
        }

        let row = await prisma.accountRisk.findFirst({
            where: { customerId: id },
            select: {
                id: true,
                customerId: true,
                companyName: true,
                riskScore: true,
                previousRiskScore: true,
                reasonKey: true,
                reasonLabel: true,
                mrr: true,
                updatedAt: true,
            },
        });

        if (!row) {
            row = await prisma.accountRisk.findUnique({
                where: { id },
                select: {
                    id: true,
                    customerId: true,
                    companyName: true,
                    riskScore: true,
                    previousRiskScore: true,
                    reasonKey: true,
                    reasonLabel: true,
                    mrr: true,
                    updatedAt: true,
                },
            });
        }

        if (!row) {
            return NextResponse.json(
                { ok: false, error: "Account not found" },
                { status: 404 }
            );
        }

        const prev =
            typeof row.previousRiskScore === "number"
                ? row.previousRiskScore
                : row.riskScore;

        const riskDelta = row.riskScore - prev;

        const mapped = {
            id: row.customerId || row.id,
            accountRiskId: row.id,
            companyName: row.companyName,
            riskScore: row.riskScore,
            previousRiskScore: prev,
            riskLevel: riskLevelFromScore(row.riskScore),
            riskDelta,
            riskTrend: riskDelta > 0 ? "up" : riskDelta < 0 ? "down" : "flat",
            reasonKey: row.reasonKey,
            reasonLabel: row.reasonLabel,
            mrr: row.mrr,
            updatedAt: row.updatedAt.toISOString(),
            isDemo: false,
        };

        return NextResponse.json({ ok: true, row: mapped });
    } catch (e: any) {
        console.error("GET /api/dashboard/accounts-at-risk/[id] error:", e);

        return NextResponse.json(
            { ok: false, error: e?.message || "Failed to load account" },
            { status: 500 }
        );
    }
}