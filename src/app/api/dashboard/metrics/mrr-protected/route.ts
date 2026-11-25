import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyFirebaseIdToken } from "@/lib/firebaseAdmin";
import { paymentRequiredResponse } from "@/lib/billing/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getBearerToken(req: Request) {
    const h = req.headers.get("authorization") || "";
    const m = h.match(/^Bearer\s+(.+)$/i);
    return m?.[1] || null;
}

const WINDOW_DAYS = 30;

export async function GET(req: Request) {
    try {
        const token = getBearerToken(req);
        if (!token) {
            return NextResponse.json(
                { ok: false, error: "Missing Authorization Bearer token" },
                { status: 401 }
            );
        }

        const decoded = await verifyFirebaseIdToken(token);
        const firebaseUid = decoded.uid;

        const user = await prisma.user.findUnique({
            where: { firebaseUid },
            select: { workspaceId: true },
        });

        if (!user?.workspaceId) {
            return NextResponse.json(
                { ok: false, error: "No workspace for user" },
                { status: 404 }
            );
        }

        const workspaceId = user.workspaceId;

        // Billing: trial ended without a paid plan → 402.
        const locked = await paymentRequiredResponse(workspaceId);
        if (locked) return locked;


        /*
         * "Revenue saved" = revenue actually recovered in the last 30 days
         * (MINOR units of the workspace currency):
         *   - invoices that failed and were later paid (amount collected)
         *   - cancellations that were scheduled and then withdrawn (that
         *     subscription's MRR, recorded by the Connect webhook)
         * It used to be the MRR of every customer with riskScore < 65.
         */
        const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { currency: true },
        });
        const currency = (workspace?.currency || "GBP").toUpperCase();

        const [recoveredInvoices, reversals] = await Promise.all([
            prisma.invoice.aggregate({
                where: {
                    workspaceId,
                    status: "paid",
                    failedAt: { not: null },
                    paidAt: { gte: since },
                    isDemo: false,
                    OR: [{ currency: null }, { currency }],
                },
                _sum: { amount: true },
                _count: { _all: true },
            }),
            prisma.event.aggregate({
                where: {
                    workspaceId,
                    type: "cancellation_reversed",
                    occurredAt: { gte: since },
                    isDemo: false,
                },
                _sum: { value: true },
                _count: { _all: true },
            }),
        ]);

        const recoveredInvoicesMinor = Number(recoveredInvoices._sum.amount || 0);
        // Event.value is MAJOR units.
        const reversedCancellationsMinor = Math.round(Number(reversals._sum.value || 0) * 100);

        return NextResponse.json({
            ok: true,
            mrrProtected: recoveredInvoicesMinor + reversedCancellationsMinor,
            currency,
            windowDays: WINDOW_DAYS,
            breakdown: {
                recoveredInvoicesMinor,
                recoveredInvoices: recoveredInvoices._count._all,
                reversedCancellationsMinor,
                reversedCancellations: reversals._count._all,
            },
        });
    } catch (e: any) {
        console.error("dashboard/metrics/mrr-protected GET failed:", e);
        return NextResponse.json(
            { ok: false, error: "Failed to load MRR protected" },
            { status: 500 }
        );
    }
}