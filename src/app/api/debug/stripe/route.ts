import { NextResponse } from "next/server";
import { getStripeClient } from "@/lib/stripe";

export const runtime = "nodejs";

export async function GET() {
    try {
        const stripe = getStripeClient();

        // ✅ FIX: pass "self"
        const acct = await stripe.accounts.retrieve("self");

        return NextResponse.json({
            ok: true,
            id: acct.id,
            email: acct.email ?? null,
        });
    } catch (e: any) {
        return NextResponse.json(
            { ok: false, error: e?.message ?? "Unknown error" },
            { status: 500 }
        );
    }
}