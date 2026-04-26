import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyFirebaseIdToken } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

function startOfDayUTC(d: Date) {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function isoDay(d: Date) {
    return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function clampDays(v: any): 7 | 30 | 90 {
    const n = Number(v);
    if (n === 7 || n === 30 || n === 90) return n;
    return 30;
}

function mulberry32(seed: number) {
    return function () {
        let t = (seed += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function demoSeries(days: 7 | 30 | 90) {
    const today = startOfDayUTC(new Date());
    const from = new Date(today.getTime() - (days - 1) * 86400000);

    const rand = mulberry32(42);
    let score = 62;

    const series = [];
    for (let i = 0; i < days; i++) {
        const d = new Date(from.getTime() + i * 86400000);

        // gentle drift + occasional spikes
        const drift = (rand() - 0.5) * 2.2; // ~[-1.1..+1.1]
        const spike = rand() > 0.93 ? (6 + rand() * 10) : 0; // rare spike
        const recovery = spike > 0 ? -2.5 : 0;

        score = score + drift + spike + recovery;
        score = Math.max(15, Math.min(95, score));

        series.push({
            date: isoDay(d),
            riskScore: Math.round(score),
            churnProb: Math.round(Math.max(0, Math.min(100, score))), // keep as 0-100 like your UI
        });
    }

    const delta = series.length ? series[series.length - 1].riskScore - series[0].riskScore : 0;
    const direction: "up" | "down" | "flat" = delta >= 3 ? "up" : delta <= -3 ? "down" : "flat";

    // simple volatility (std dev)
    const mean = series.reduce((a, p) => a + p.riskScore, 0) / (series.length || 1);
    const variance =
        series.reduce((a, p) => a + Math.pow(p.riskScore - mean, 2), 0) / (series.length || 1);
    const volatility = Math.sqrt(variance);

    return { series, delta, direction, volatility };
}

export async function GET(req: Request) {
    try {
        const url = new URL(req.url);
        const days = clampDays(url.searchParams.get("days"));

        const auth = req.headers.get("authorization") || "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
        if (!token) {
            return NextResponse.json({ ok: false, error: "Missing auth token" }, { status: 401 });
        }

        const decoded = await verifyFirebaseIdToken(token);
        const firebaseUid = decoded?.uid;
        if (!firebaseUid) {
            return NextResponse.json({ ok: false, error: "Invalid auth token" }, { status: 401 });
        }

        // Find user + workspace (adjust if your schema differs)
        const user = await prisma.user.findUnique({
            where: { firebaseUid },
            select: {
                id: true,
                workspaceId: true,
                workspace: { select: { demoMode: true } },
            },
        });


        if (!user?.workspaceId) {
            // safest fallback to demo response
            const demo = demoSeries(days);
            return NextResponse.json({
                ok: true,
                rangeDays: days,
                series: demo.series,
                delta: demo.delta,
                direction: demo.direction,
                volatility: demo.volatility,
                mode: "demo",
            });
        }

        const workspaceId = user.workspaceId;

        // If you haven’t created RiskSnapshot table yet, just return demo
        // (prevents crashes while you’re still migrating/seeding)
        // @ts-ignore
        const hasModel = !!(prisma as any).riskSnapshot;
        if (!hasModel) {
            const demo = demoSeries(days);
            return NextResponse.json({
                ok: true,
                rangeDays: days,
                series: demo.series,
                delta: demo.delta,
                direction: demo.direction,
                volatility: demo.volatility,
                mode: "demo",
            });
        }

        const today = startOfDayUTC(new Date());
        const from = new Date(today.getTime() - (days - 1) * 86400000);

        // portfolio snapshots only: customerId = null
        const rows = await prisma.riskSnapshot.findMany({
            where: {
                workspaceId,
                customerId: null,
                bucketDate: { gte: from, lte: today },
            },
            select: { bucketDate: true, riskScore: true, churnProb: true, mrrAtRisk: true },
            orderBy: { bucketDate: "asc" },
        });

        // fill missing days so the line is continuous
        const byDay = new Map(rows.map((r: any) => [isoDay(r.bucketDate), r]));
        const series = [];
        let lastScore = 60;

        for (let i = 0; i < days; i++) {
            const d = new Date(from.getTime() + i * 86400000);
            const key = isoDay(d);
            const r: any = byDay.get(key);

            if (r) lastScore = Number(r.riskScore ?? lastScore);

            series.push({
                date: key,
                riskScore: Math.round(Math.max(0, Math.min(100, Number(r?.riskScore ?? lastScore)))),
                churnProb:
                    typeof r?.churnProb === "number"
                        ? Math.round(Math.max(0, Math.min(100, r.churnProb * 100)))
                        : undefined,
                mrrAtRisk: typeof r?.mrrAtRisk === "number" ? r.mrrAtRisk : undefined,
            });
        }

        // compute extras
        const delta = series.length ? series[series.length - 1].riskScore - series[0].riskScore : 0;
        const direction: "up" | "down" | "flat" = delta >= 3 ? "up" : delta <= -3 ? "down" : "flat";

        const mean = series.reduce((a, p) => a + p.riskScore, 0) / (series.length || 1);
        const variance = series.reduce((a, p) => a + Math.pow(p.riskScore - mean, 2), 0) / (series.length || 1);
        const volatility = Math.sqrt(variance);

        return NextResponse.json({
            ok: true,
            rangeDays: days,
            series,
            delta,
            direction,
            volatility,
            mode: user?.workspace?.demoMode ? "demo" : "live",

        });
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e?.message || "Failed" }, { status: 500 });
    }
}
