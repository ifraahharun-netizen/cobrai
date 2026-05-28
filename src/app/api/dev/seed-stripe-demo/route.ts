import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runWorkspaceAnalyticsPipeline } from "@/lib/analytics/runWorkspaceAnalyticsPipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getMonthKey(date = new Date()) {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function POST(req: Request) {
    if (process.env.NODE_ENV === "production") {
        return NextResponse.json(
            { ok: false, error: "Disabled in production" },
            { status: 403 }
        );
    }

    try {
        const body = await req.json().catch(() => ({}));
        const workspaceId = typeof body?.workspaceId === "string" ? body.workspaceId : null;

        if (!workspaceId) {
            return NextResponse.json(
                { ok: false, error: "Missing workspaceId" },
                { status: 400 }
            );
        }

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { id: true },
        });

        if (!workspace) {
            return NextResponse.json(
                { ok: false, error: "Workspace not found" },
                { status: 404 }
            );
        }

        const month = getMonthKey();

        const demoRows = [
            {
                stripeCustomerId: `demo_stripe_customer_${workspaceId}_1`,
                name: "Northstar Analytics",
                email: "billing@northstar-demo.com",
                mrrMinor: 125000,
                churnRisk: 0.28,
                riskScore: 28,
                healthScore: 82,
            },
            {
                stripeCustomerId: `demo_stripe_customer_${workspaceId}_2`,
                name: "BrightPath SaaS",
                email: "finance@brightpath-demo.com",
                mrrMinor: 84000,
                churnRisk: 0.62,
                riskScore: 62,
                healthScore: 54,
            },
            {
                stripeCustomerId: `demo_stripe_customer_${workspaceId}_3`,
                name: "Atlas Learning",
                email: "ops@atlas-demo.com",
                mrrMinor: 59000,
                churnRisk: 0.81,
                riskScore: 81,
                healthScore: 38,
            },
        ];

        for (const row of demoRows) {
            await prisma.stripeCustomer.upsert({
                where: { stripeId: row.stripeCustomerId },
                update: {
                    workspaceId,
                    name: row.name,
                    email: row.email,
                },
                create: {
                    workspaceId,
                    stripeId: row.stripeCustomerId,
                    name: row.name,
                    email: row.email,
                },
            });

            const customer = await prisma.customer.upsert({
                where: {
                    workspaceId_stripeCustomerId: {
                        workspaceId,
                        stripeCustomerId: row.stripeCustomerId,
                    },
                },
                update: {
                    name: row.name,
                    email: row.email,
                    mrr: row.mrrMinor,
                    status: "active",
                    canceledAt: null,
                    churnRisk: row.churnRisk,
                    riskScore: row.riskScore,
                    healthScore: row.healthScore,
                    lastActiveAt: new Date(),
                    isDemo: true,
                },
                create: {
                    workspaceId,
                    stripeCustomerId: row.stripeCustomerId,
                    name: row.name,
                    email: row.email,
                    mrr: row.mrrMinor,
                    status: "active",
                    churnRisk: row.churnRisk,
                    riskScore: row.riskScore,
                    healthScore: row.healthScore,
                    lastActiveAt: new Date(),
                    isDemo: true,
                },
                select: { id: true },
            });

            await prisma.mrrSnapshot.upsert({
                where: {
                    workspaceId_stripeCustomerId_month: {
                        workspaceId,
                        stripeCustomerId: row.stripeCustomerId,
                        month,
                    },
                },
                update: {
                    mrrMinor: row.mrrMinor,
                    active: true,
                },
                create: {
                    workspaceId,
                    stripeCustomerId: row.stripeCustomerId,
                    month,
                    mrrMinor: row.mrrMinor,
                    active: true,
                    firstSeenMonth: month,
                },
            });

            await prisma.accountRisk.upsert({
                where: {
                    id: `demo-risk-${customer.id}`,
                },
                update: {
                    workspaceId,
                    customerId: customer.id,
                    companyName: row.name,
                    riskScore: row.riskScore,
                    reasonKey: row.riskScore >= 70 ? "high_churn" : "engagement_watch",
                    reasonLabel:
                        row.riskScore >= 70
                            ? "High churn risk"
                            : "Engagement needs monitoring",
                    mrr: row.mrrMinor,
                    isDemo: true,
                },
                create: {
                    id: `demo-risk-${customer.id}`,
                    workspaceId,
                    customerId: customer.id,
                    companyName: row.name,
                    riskScore: row.riskScore,
                    reasonKey: row.riskScore >= 70 ? "high_churn" : "engagement_watch",
                    reasonLabel:
                        row.riskScore >= 70
                            ? "High churn risk"
                            : "Engagement needs monitoring",
                    mrr: row.mrrMinor,
                    isDemo: true,
                },
            });
        }

        await runWorkspaceAnalyticsPipeline(workspaceId);

        return NextResponse.json({
            ok: true,
            workspaceId,
            month,
            totalMrrMinor: demoRows.reduce((sum, row) => sum + row.mrrMinor, 0),
            customersSeeded: demoRows.length,
        });
    } catch (error: any) {
        console.error("[seed-stripe-demo] failed:", error);

        return NextResponse.json(
            {
                ok: false,
                error: error?.message || "Failed to seed Stripe demo data",
            },
            { status: 500 }
        );
    }
}