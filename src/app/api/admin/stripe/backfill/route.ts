import Stripe from "stripe";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { verifyFirebaseIdToken } from "@/lib/firebaseAdmin";
import { buildMonthlyCustomerMrr } from "@/lib/stripe-connect/mrr";
import { syncConnectedStripeWorkspace } from "@/lib/stripe-connect/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getBearerToken(req: Request) {
    const auth = req.headers.get("authorization") || "";
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (!m) throw new Error("Missing Authorization: Bearer <token>");
    return m[1];
}

function monthKeyUTC(d: Date) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
}

async function workspaceIdFromUid(uid: string) {
    const u = await prisma.user.findUnique({
        where: { firebaseUid: uid },
        select: { workspaceId: true },
    });
    if (!u?.workspaceId) throw new Error("Missing workspaceId for user");
    return u.workspaceId;
}

function getPeriodFromItems(sub: Stripe.Subscription): {
    start: Date | null;
    end: Date | null;
} {
    const items = (sub.items?.data ?? []) as any[];

    // Stripe moved periods to subscription items in newer API versions
    const starts = items
        .map((it) => Number(it?.current_period_start ?? 0))
        .filter((n) => Number.isFinite(n) && n > 0);

    const ends = items
        .map((it) => Number(it?.current_period_end ?? 0))
        .filter((n) => Number.isFinite(n) && n > 0);

    const startSec = starts.length ? Math.max(...starts) : 0; // max item start
    const endSec = ends.length ? Math.min(...ends) : 0;      // min item end

    return {
        start: startSec ? new Date(startSec * 1000) : null,
        end: endSec ? new Date(endSec * 1000) : null,
    };
}


export async function POST(req: Request) {
    try {
        const idToken = getBearerToken(req);
        const decoded = await verifyFirebaseIdToken(idToken);
        const workspaceId = await workspaceIdFromUid(decoded.uid);

        // Load Stripe key from workspace
        const ws = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { stripeSecretKeyEnc: true, stripeAccountId: true },
        });

        // Connected accounts: the shared sync, rebuilding 12 months of history.
        if (ws?.stripeAccountId) {
            const r = await syncConnectedStripeWorkspace(workspaceId, { rebuildHistory: true });
            return NextResponse.json(
                {
                    ok: true,
                    workspaceId,
                    customers: r.customers,
                    subscriptions: r.subscriptions,
                    snapshots: r.monthsWritten.length,
                    totalMrrMinor: r.totalMrrMinor,
                },
                { status: 200 }
            );
        }

        if (!ws?.stripeSecretKeyEnc) {
            return NextResponse.json({ ok: false, error: "Stripe not connected" }, { status: 400 });
        }

        const secret = decrypt(ws.stripeSecretKeyEnc);
        const stripe = new Stripe(secret, { apiVersion: "2024-06-20" as any });

        // 1) Backfill customers
        const customers: Stripe.Customer[] = [];
        let starting_after: string | undefined;

        for (; ;) {
            const resp = await stripe.customers.list({ limit: 100, ...(starting_after ? { starting_after } : {}) });
            customers.push(...resp.data);
            if (!resp.has_more) break;
            starting_after = resp.data.at(-1)?.id;
            if (!starting_after) break;
        }

        for (const c of customers) {
            await prisma.stripeCustomer.upsert({
                where: { stripeId: c.id },
                update: {
                    workspaceId,
                    email: c.email ?? null,
                    name: c.name ?? null,
                },
                create: {
                    workspaceId,
                    stripeId: c.id,
                    email: c.email ?? null,
                    name: c.name ?? null,
                },
            });
        }

        // 2) Backfill subscriptions (active + trialing + past_due + unpaid)
        const subs: Stripe.Subscription[] = [];
        starting_after = undefined;

        for (; ;) {
            const resp = (await (stripe as any).subscriptions.list({
                limit: 100,
                status: "all",
                expand: ["data.discounts"],
                ...(starting_after ? { starting_after } : {}),
            })) as Stripe.ApiList<Stripe.Subscription>;

            subs.push(...resp.data);

            if (!resp.has_more) break;

            starting_after = resp.data[resp.data.length - 1]?.id;
            if (!starting_after) break;
        }


        // We will create snapshots for current month only (fast MVP)
        const month = monthKeyUTC(new Date());

        let subCount = 0;
        let snapCount = 0;

        const knownCustomerIds = new Set(customers.map((c) => c.id));
        for (const s of subs) {
            const subCustomerId = typeof s.customer === "string" ? s.customer : s.customer.id;
            if (!knownCustomerIds.has(subCustomerId)) continue; // deleted customer
            const stripeCustomerId = typeof s.customer === "string" ? s.customer : s.customer.id;

            const { start, end } = getPeriodFromItems(s);

            await prisma.stripeSubscription.upsert({
                where: { stripeId: s.id },
                update: {
                    workspaceId,
                    stripeCustomerId,
                    status: String(s.status),
                    currency: s.currency ?? null,

                    currentPeriodStart: start,
                    currentPeriodEnd: end,

                    cancelAtPeriodEnd: Boolean(s.cancel_at_period_end),
                    canceledAt: s.canceled_at ? new Date(s.canceled_at * 1000) : null,
                    endedAt: s.ended_at ? new Date(s.ended_at * 1000) : null,
                },
                create: {
                    workspaceId,
                    stripeId: s.id,
                    stripeCustomerId,
                    status: String(s.status),
                    currency: s.currency ?? null,

                    currentPeriodStart: start,
                    currentPeriodEnd: end,

                    cancelAtPeriodEnd: Boolean(s.cancel_at_period_end),
                    canceledAt: s.canceled_at ? new Date(s.canceled_at * 1000) : null,
                    endedAt: s.ended_at ? new Date(s.ended_at * 1000) : null,
                },
            });


            subCount++;

        }

        // Current-month snapshot per customer: the sum of ALL their
        // subscriptions, using the shared MRR definition (minor units).
        const rows = buildMonthlyCustomerMrr(subs, [month], new Date());
        const known = new Set(customers.map((c) => c.id));
        await prisma.$transaction([
            prisma.mrrSnapshot.deleteMany({ where: { workspaceId, month } }),
            prisma.mrrSnapshot.createMany({
                data: rows
                    .filter((r) => known.has(r.stripeCustomerId))
                    .map((r) => ({
                        workspaceId,
                        stripeCustomerId: r.stripeCustomerId,
                        month,
                        mrrMinor: r.mrrMinor,
                        trialMrrMinor: r.trialMrrMinor,
                        currency: r.currency,
                        active: r.mrrMinor > 0,
                        firstSeenMonth: month,
                    })),
                skipDuplicates: true,
            }),
        ]);
        snapCount = rows.length;

        return NextResponse.json(
            { ok: true, workspaceId, customers: customers.length, subscriptions: subCount, snapshots: snapCount },
            { status: 200 }
        );
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: "Backfill failed" }, { status: 500 });
    }
}
