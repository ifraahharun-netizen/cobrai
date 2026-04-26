export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyFirebaseIdToken } from "@/lib/firebaseAdmin";

function bearer(req: Request) {
    const m = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i);
    if (!m) throw new Error("Unauthorized");
    return m[1];
}

function range(period: string) {
    const now = new Date();

    if (period === "week") return new Date(now.getTime() - 7 * 86400000);
    if (period === "month") return new Date(now.getTime() - 30 * 86400000);

    // supports your existing "90d" default and also any unknown values
    return new Date(now.getTime() - 90 * 86400000);
}

function asName(a: any, fallback: string) {
    const n = a?.name ?? a?.customerName ?? a?.companyName ?? null;
    const s = typeof n === "string" ? n.trim() : "";
    return s || fallback;
}

function asMrrMinor(a: any) {
    // Accept common shapes:
    // - mrrMinor (preferred)
    // - mrr (sometimes already minor)
    // - mrrPounds (rare)
    const raw =
        a?.mrrMinor ??
        a?.mrr_minor ??
        a?.mrr ??
        a?.mrrPounds ??
        a?.mrr_pounds ??
        0;

    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return 0;

    // If someone stored pounds, try to detect (heuristic)
    // (If you KNOW everything is minor already, you can remove this.)
    if (a?.mrrPounds != null || a?.mrr_pounds != null) return Math.round(n * 100);

    return Math.round(n);
}

export async function GET(req: NextRequest) {
    try {
        const token = bearer(req);
        const decoded = await verifyFirebaseIdToken(token);

        const user = await prisma.user.findUnique({
            where: { firebaseUid: decoded.uid },
            select: { workspaceId: true },
        });

        if (!user?.workspaceId) throw new Error("No workspace");

        const period = req.nextUrl.searchParams.get("period") ?? "month";
        const from = range(period);

        const runs = await prisma.planRun.findMany({
            where: {
                plan: { workspaceId: user.workspaceId },
                createdAt: { gte: from },
                status: "completed",
            },
            orderBy: { createdAt: "desc" },
            take: 20,
            select: {
                id: true,
                createdAt: true,
                status: true,
                mrrProtectedMinor: true,
                actionsCompleted: true,
                riskReducedPct: true,
                protectedAccounts: true, // Json
            },
        });

        let totalMrrMinor = 0;

        // Aggregate per customer across runs
        type Agg = {
            name: string;
            mrrMinor: number;
            tasksExecuted: number;
            riskReducedSum: number;
            seenCount: number;
        };

        const byName = new Map<string, Agg>();

        for (const r of runs) {
            totalMrrMinor += r.mrrProtectedMinor || 0;

            const actionsCompleted = Number(r.actionsCompleted ?? 0) || 0;
            const riskReducedPct = Number(r.riskReducedPct ?? 0) || 0;

            const list = Array.isArray(r.protectedAccounts) ? (r.protectedAccounts as any[]) : [];
            if (!list.length) continue;

            // If multiple accounts in one run, we can:
            // - attribute full actionsCompleted to each (inflates)
            // - split evenly (fairer for now)
            const perAccountActions = actionsCompleted > 0 ? actionsCompleted / list.length : 0;

            for (let i = 0; i < list.length; i++) {
                const a = list[i];
                const name = asName(a, `Customer ${i + 1}`);
                const mrrMinor = asMrrMinor(a);

                const cur = byName.get(name) ?? {
                    name,
                    mrrMinor: 0,
                    tasksExecuted: 0,
                    riskReducedSum: 0,
                    seenCount: 0,
                };

                cur.mrrMinor += mrrMinor;
                cur.tasksExecuted += perAccountActions;
                cur.riskReducedSum += riskReducedPct;
                cur.seenCount += 1;

                byName.set(name, cur);
            }
        }

        const accounts = Array.from(byName.values())
            .map((a) => ({
                name: a.name,
                customerName: a.name, // convenient for existing UI fallbacks
                mrrMinor: Math.round(a.mrrMinor),
                // keep it an integer count for UI
                tasksExecuted: Math.max(0, Math.round(a.tasksExecuted)),
                // average risk reduced across runs where the account appeared
                riskReducedPct: a.seenCount ? Math.round((a.riskReducedSum / a.seenCount) * 10) / 10 : 0,
            }))
            .sort((x, y) => (y.mrrMinor || 0) - (x.mrrMinor || 0));

        return NextResponse.json({
            ok: true,
            impact: {
                mrrProtectedMinor: totalMrrMinor,
                runs: runs.length,
                // ✅ enriched rows for your new Impact list
                accounts,
                // optional: useful if you want "Most recent" label later
                lastUpdatedAt: runs[0]?.createdAt ?? null,
            },
        });
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
    }
}
