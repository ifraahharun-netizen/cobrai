import { NextResponse } from "next/server";
import { Resend } from "resend";
import { fileReceivedEmail, ReceivedEmailFetchError, verifyResendWebhook } from "@/lib/resendWebhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Resend receiving → Cobrai inbox, for a webhook that only sends `email.received`.
 * The main /api/webhooks/resend endpoint also handles `email.received`, so one
 * Resend webhook can cover everything; this route stays for separate setups.
 * Signing secret: RESEND_INBOUND_WEBHOOK_SECRET (falls back to RESEND_WEBHOOK_SECRET).
 */
export async function POST(req: Request) {
    const secret = process.env.RESEND_INBOUND_WEBHOOK_SECRET || process.env.RESEND_WEBHOOK_SECRET;
    const apiKey = process.env.RESEND_API_KEY;
    if (!secret || !apiKey) {
        console.error("Resend inbound webhook: webhook secret or RESEND_API_KEY is not set");
        return NextResponse.json({ error: "Inbound email is not configured" }, { status: 503 });
    }

    const resend = new Resend(apiKey);
    const event = verifyResendWebhook(resend, req.headers, await req.text(), secret);
    if (!event) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

    if (event.type !== "email.received") {
        return NextResponse.json({ ok: true, ignored: event.type });
    }

    try {
        const result = await fileReceivedEmail(resend, event);
        return NextResponse.json({ ok: true, ...result });
    } catch (error) {
        console.error("Resend inbound webhook failed", error);
        // 500 so Resend retries the delivery.
        const message = error instanceof ReceivedEmailFetchError ? "Could not fetch the email" : "Could not store the email.";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
