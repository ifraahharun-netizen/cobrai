import { Resend, type WebhookEventPayload } from "resend";
import { htmlToText, ingestInboundEmail, parseAddress, type IngestResult } from "@/lib/inboxIngest";

/**
 * Verifies a Resend webhook (Svix-signed: svix-id, svix-timestamp,
 * svix-signature headers) and returns the event, or null if the signature is
 * missing, wrong or too old.
 */
export function verifyResendWebhook(
    resend: Resend,
    headers: Headers,
    payload: string,
    secret: string
): WebhookEventPayload | null {
    const id = headers.get("svix-id");
    const timestamp = headers.get("svix-timestamp");
    const signature = headers.get("svix-signature");
    if (!id || !timestamp || !signature) return null;

    try {
        return resend.webhooks.verify({ payload, headers: { id, timestamp, signature }, webhookSecret: secret });
    } catch {
        return null;
    }
}

export class ReceivedEmailFetchError extends Error {}

/**
 * Files an `email.received` event in the inbox. Resend's webhook only carries
 * metadata, so the body and headers are fetched from the Received emails API.
 * Throws ReceivedEmailFetchError when Resend can't return the email (retryable).
 */
export async function fileReceivedEmail(
    resend: Resend,
    event: Extract<WebhookEventPayload, { type: "email.received" }>
): Promise<IngestResult> {
    const { data: email, error } = await resend.emails.receiving.get(event.data.email_id);
    if (error || !email) {
        throw new ReceivedEmailFetchError(error?.message || "Could not fetch the received email");
    }

    const headers = Object.fromEntries(
        Object.entries(email.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value])
    );
    const from = parseAddress(headers.from || email.from);
    const text = email.text?.trim() || (email.html ? htmlToText(email.html) : "");
    const receivedFor = (event.data as { received_for?: string[] }).received_for ?? [];

    return ingestInboundEmail({
        from: { email: from.email || parseAddress(email.from).email, name: from.name },
        // received_for covers forwarded mail, where `to` is the original address.
        to: [...(email.to ?? []), ...receivedFor].map((address) => parseAddress(address).email),
        subject: email.subject || "(no subject)",
        text,
        messageId: email.message_id || null,
        inReplyTo: typeof headers["in-reply-to"] === "string" ? headers["in-reply-to"].trim() || null : null,
        channel: "cobrai",
    });
}
