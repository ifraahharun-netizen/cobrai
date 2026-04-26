import { NextResponse } from "next/server";
import { verifyFirebaseIdToken } from "@/lib/firebaseAdmin";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * This endpoint is used by analyticsclient.tsx
 * It returns the "AnalyticsPayload" shape (mode, kpi, mrrSeries, churnSeries, cohorts, insights, etc.)
 * Demo mode returns a complete payload so the UI is always populated.
 * Live mode returns the same shape but empty placeholders (ready to fill when connectors write data).
 */

type Mode = "demo" | "live";
type Point = { label: string; value: number };

function demoPayload() {
    const mrrSeries: Point[] = [
        { label: "W1", value: 28750 },
        { label: "W2", value: 29420 },
        { label: "W3", value: 30110 },
        { label: "W4", value: 29840 },
        { label: "W5", value: 30590 },
        { label: "W6", value: 31480 },
        { label: "W7", value: 31020 },
        { label: "W8", value: 31960 },
    ];

    const churnSeries: Point[] = [
        { label: "W1", value: 3.2 },
        { label: "W2", value: 3.5 },
        { label: "W3", value: 3.1 },
        { label: "W4", value: 3.9 },
        { label: "W5", value: 3.6 },
        { label: "W6", value: 3.4 },
        { label: "W7", value: 3.8 },
        { label: "W8", value: 3.3 },
    ];

    const cohorts = {
        rows: ["2025-11", "2025-12", "2026-01", "2026-02"],
        cols: ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8"],
        values: [
            [100, 78, 66, 60, 56, 53, 51, 49],
            [100, 81, 70, 64, 60, 58, 55, 53],
            [100, 84, 76, 70, 66, 63, 61, 59],
            [100, 86, 79, 74, 71, 0, 0, 0],
        ],
    };

    return {
        mode: "demo" as Mode,
        kpi: {
            mrr: 31960,
            mrrChangePct: 5.2,
            churnRate: 3.3,
            activeCustomers: 214,
            expansion: 1420,
            contraction: 610,
            nrr: 112.4,
        },
        mrrSeries,
        churnSeries,
        churnReasons: [
            { label: "Low usage / inactive", value: 41 },
            { label: "Pricing / budget", value: 23 },
            { label: "Missing feature", value: 18 },
            { label: "Support / onboarding", value: 12 },
            { label: "Other", value: 6 },
        ],
        riskBuckets: [
            { label: "Critical", value: 9 },
            { label: "High", value: 24 },
            { label: "Medium", value: 61 },
            { label: "Low", value: 120 },
        ],
        behaviour: {
            weeklyActivePct: 64,
            inactive7d: 37,
            topSignals: [
                { label: "Avg. logins / wk", value: "2.1" },
                { label: "Feature adoption", value: "Top 3 features used by 58%" },
                { label: "Time-to-value", value: "Median 2.4 days" },
            ],
        },
        cohorts,
        insights: [
            {
                title: "Usage drop is leading churn",
                detail: "Accounts with 7+ inactive days are ~2.8× more likely to cancel in the next 30 days.",
                impact: "high" as const,
            },
            {
                title: "Pro plan retains better",
                detail: "Pro users retain ~11–14 pts higher after week 4 compared to Starter in recent cohorts.",
                impact: "medium" as const,
            },
            {
                title: "Onboarding gap",
                detail: "Customers who don’t complete setup in the first 72 hours churn significantly faster.",
                impact: "high" as const,
            },
        ],
        actions: [
            {
                title: "Reach out to inactive high-MRR accounts",
                detail: "Prioritise accounts inactive 7+ days with MRR > £150.",
                cta: "View accounts" as const,
            },
            {
                title: "Trigger onboarding nudge",
                detail: "Email users who haven’t completed setup within 48–72 hours.",
                cta: "Create email" as const,
            },
            {
                title: "Review feature-gap churn",
                detail: "Tag + review cancellations mentioning missing features; shortlist top requests.",
                cta: "Open insights" as const,
            },
        ],
        segments: {
            plans: ["All plans", "Starter", "Pro"],
            regions: ["All regions", "UK", "EU", "US", "Other"],
        },
    };
}

function liveEmptyPayload() {
    return {
        mode: "live" as Mode,
        kpi: {
            mrr: 0,
            mrrChangePct: 0,
            churnRate: 0,
            activeCustomers: 0,
            expansion: 0,
            contraction: 0,
            nrr: 0,
        },
        mrrSeries: [] as Point[],
        churnSeries: [] as Point[],
        churnReasons: [] as Array<{ label: string; value: number }>,
        riskBuckets: [] as Array<{ label: string; value: number }>,
        behaviour: { weeklyActivePct: 0, inactive7d: 0, topSignals: [] as Array<{ label: string; value: string }> },
        cohorts: { rows: [] as string[], cols: [] as string[], values: [] as number[][] },
        insights: [] as Array<{ title: string; detail: string; impact?: "high" | "medium" | "low" }>,
        actions: [] as Array<{ title: string; detail: string; cta?: "View accounts" | "Create email" | "Open insights" }>,
        segments: { plans: ["All plans"], regions: ["All regions"] },
    };
}

export async function GET(req: Request) {
    try {
        const authHeader = req.headers.get("authorization") || "";
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

        // No token -> safe demo payload
        if (!token) return NextResponse.json(demoPayload(), { status: 200 });

        const decoded = await verifyFirebaseIdToken(token);
        const uid = decoded.uid;

        const workspace = await prisma.workspace.findFirst({
            where: { ownerUid: uid },
            select: { id: true, demoMode: true },
        });

        if (!workspace || workspace.demoMode) {
            return NextResponse.json(demoPayload(), { status: 200 });
        }

        // Live (empty scaffold until your connectors write real data)
        return NextResponse.json(liveEmptyPayload(), { status: 200 });
    } catch {
        // Fail soft in demo
        return NextResponse.json(demoPayload(), { status: 200 });
    }
}