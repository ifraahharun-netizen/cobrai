import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { syncConnectedStripeWorkspace } from "@/lib/stripe-connect/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Stop starting new workspaces after this long, so the run ends cleanly
// before maxDuration. Workspaces synced least recently go first, so any left
// over are first in line tomorrow.
const TIME_BUDGET_MS = 240_000;

function isAuthorised(req: Request) {
    const secret = process.env.CRON_SECRET?.trim();
    if (!secret) return false;
    const header = req.headers.get("authorization") || "";
    const received = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    const a = Buffer.from(received);
    const b = Buffer.from(secret);
    return a.length === b.length && timingSafeEqual(a, b);
}

/*
 * Daily re-sync of every connected Stripe account (Vercel Cron, see
 * vercel.json). Gives every month an MRR snapshot even when no webhook
 * events arrive.
 */
export async function GET(req: Request) {
    if (!isAuthorised(req)) {
        return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const started = Date.now();
    const workspaces = await prisma.workspace.findMany({
        where: { stripeAccountId: { not: null }, demoMode: false },
        select: { id: true },
        orderBy: { stripeLastSyncedAt: { sort: "asc", nulls: "first" } },
    });

    const results: Array<{ workspaceId: string; ok: boolean; error?: string; totalMrrMinor?: number }> = [];

    for (const ws of workspaces) {
        if (Date.now() - started > TIME_BUDGET_MS) break;
        try {
            const r = await syncConnectedStripeWorkspace(ws.id);
            results.push({ workspaceId: ws.id, ok: true, totalMrrMinor: r.totalMrrMinor });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`[cron/stripe-sync] workspace ${ws.id} failed:`, error);
            results.push({ workspaceId: ws.id, ok: false, error: message });
            await prisma.integration
                .updateMany({
                    where: { workspaceId: ws.id, provider: "stripe" },
                    data: { lastSyncError: message.slice(0, 500) },
                })
                .catch(() => undefined);
        }
    }

    return NextResponse.json({
        ok: true,
        total: workspaces.length,
        synced: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).length,
        skipped: workspaces.length - results.length,
        results,
    });
}
