import { NextResponse } from "next/server";
import { Resend } from "resend";
import { htmlToText, ingestInboundEmail, parseAddress } from "@/lib/inboxIngest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Resend receiving → Cobrai inbox.
 *
 * In Resend, add a webhook pointing at /api/webhooks/resend-inbound with the
 * `email.received` event, and set its signing secret (whsec_…) as
 * RESEND_INBOUND_WEBHOOK_SECRET. Resend's webhook only carries metadata, so the
 * body is fetched from the Received emails API before it is filed.
 */
export async function POST(req: Request) {
    const secret = process.env.RESEND_INBOUND_WEBHOOK_SECRET;
    const apiKey = process.env.RESEND_API_KEY;
    if (!secret || !apiKey) {
        console.error("Resend inbound webhook: RESEND_INBOUND_WEBHOOK_SECRET or RESEND_API_KEY is not set");
        return NextResponse.json({ error: "Inbound email is not configured" }, { status: 503 });
    }

    const resend = new Resend(apiKey);
    const payload = await req.text();

    let event: ReturnType<typeof resend.webhooks.verify>;
    try {
        event = resend.webhooks.verify({
            payload,
            headers: {
                id: req.headers.get("svix-id") ?? "",
                timestamp: req.headers.get("svix-timestamp") ?? "",
                signature: req.headers.get("svix-signature") ?? "",
            },
            webhookSecret: secret,
        });
    } catch {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // Other event types may share this endpoint; acknowledge and ignore them.
    if (event.type !== "email.received") {
        return NextResponse.json({ ok: true, ignored: event.type });
    }

    try {
        const { data: email, error } = await resend.emails.receiving.get(event.data.email_id);
        if (error || !email) {
            console.error("Resend inbound webhook: could not fetch received email", error);
            // 500 so Resend retries the delivery.
            return NextResponse.json({ error: "Could not fetch the email" }, { status: 500 });
        }

        const headers = Object.fromEntries(
            Object.entries(email.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value])
        );
        const from = parseAddress(headers.from || email.from);
        const text = email.text?.trim() || (email.html ? htmlToText(email.html) : "");

        const result = await ingestInboundEmail({
            from: { email: from.email || parseAddress(email.from).email, name: from.name },
            // received_for covers forwarded mail, where `to` is the original address.
            to: [...(email.to ?? []), ...((event.data as { received_for?: string[] }).received_for ?? [])].map(
                (address) => parseAddress(address).email
            ),
            subject: email.subject || "(no subject)",
            text,
            messageId: email.message_id || null,
            inReplyTo: typeof headers["in-reply-to"] === "string" ? headers["in-reply-to"].trim() || null : null,
            channel: "cobrai",
        });

        return NextResponse.json({ ok: true, ...result });
    } catch (error) {
        console.error("Resend inbound webhook failed", error);
        return NextResponse.json({ error: "Could not store the email." }, { status: 500 });
    }
}
