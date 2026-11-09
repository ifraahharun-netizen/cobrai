import { NextResponse } from "next/server";
import crypto from "crypto";
import prisma from "@/lib/prisma";
import { isValidEmail, normaliseChannel, threadKeyFor } from "@/lib/inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Receives customer replies and files them in the inbox.
 *
 * Point your inbound-email provider (e.g. Resend inbound, Postmark, a Gmail
 * forwarder) at this URL and send header `x-cobrai-inbound-secret` set to
 * INBOUND_EMAIL_SECRET. Accepted body (JSON):
 *   { "to": "...", "from": "...", "fromName": "...", "subject": "...",
 *     "text": "...", "messageId": "...", "inReplyTo": "...",
 *     "channel": "gmail" | "outlook" | "intercom" | "zendesk" | "hubspot" }
 * The channel can also be passed as `?source=gmail` on the URL. Without one,
 * the message is filed under Cobrai (a reply to an email Cobrai sent).
 * A Resend-style `{ "type": "email.received", "data": { ... } }` wrapper is also accepted.
 */

function secretMatches(given: string | null) {
    const expected = process.env.INBOUND_EMAIL_SECRET;
    if (!expected || !given) return false;
    const a = Buffer.from(given);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** "Sam Patel <sam@kitelabs.io>" -> { email, name } */
function parseAddress(value: unknown): { email: string; name: string | null } {
    const first = Array.isArray(value) ? value[0] : value;
    const text = typeof first === "string" ? first : typeof first === "object" && first ? String((first as { email?: string }).email ?? "") : "";
    const match = text.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
    if (match) return { email: match[2].trim().toLowerCase(), name: match[1].trim() || null };
    return { email: text.trim().toLowerCase(), name: null };
}

export async function POST(req: Request) {
    if (!secretMatches(req.headers.get("x-cobrai-inbound-secret"))) {
        return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    try {
        const raw = (await req.json().catch(() => null)) as Record<string, unknown> | null;
        const payload = (raw && typeof raw.data === "object" && raw.data ? raw.data : raw) as Record<string, unknown> | null;

        if (!payload) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

        const from = parseAddress(payload.from);
        const to = parseAddress(payload.to);
        const fromName =
            typeof payload.fromName === "string" ? payload.fromName.slice(0, 120) : from.name;
        const subject = typeof payload.subject === "string" ? payload.subject.slice(0, 300) : "(no subject)";
        const text =
            typeof payload.text === "string"
                ? payload.text
                : typeof payload.body === "string"
                    ? payload.body
                    : "";
        const messageId =
            typeof payload.messageId === "string"
                ? payload.messageId
                : typeof payload.email_id === "string"
                    ? payload.email_id
                    : null;
        const inReplyTo = typeof payload.inReplyTo === "string" ? payload.inReplyTo : null;
        const channel =
            normaliseChannel(new URL(req.url).searchParams.get("source")) ??
            normaliseChannel(payload.channel ?? payload.source ?? payload.provider) ??
            "cobrai";

        if (!isValidEmail(from.email) || !isValidEmail(to.email)) {
            return NextResponse.json({ error: "Missing sender or recipient" }, { status: 400 });
        }

        // Which workspace was this sent to? Match its sender/reply-to address, then its domain.
        const toDomain = to.email.split("@")[1];
        const workspace = await prisma.workspace.findFirst({
            where: {
                OR: [
                    { senderEmail: { equals: to.email, mode: "insensitive" } },
                    { senderReplyTo: { equals: to.email, mode: "insensitive" } },
                    { sendingDomain: { equals: toDomain, mode: "insensitive" } },
                ],
            },
            select: { id: true },
        });

        if (!workspace) {
            // Acknowledge so the provider doesn't retry forever, but don't store it.
            return NextResponse.json({ ok: true, stored: false, reason: "No workspace for this address" });
        }

        const customer = await prisma.customer.findFirst({
            where: { workspaceId: workspace.id, email: { equals: from.email, mode: "insensitive" } },
            select: { id: true },
        });

        if (messageId) {
            const existing = await prisma.inboxMessage.findUnique({ where: { providerMessageId: messageId } });
            if (existing) return NextResponse.json({ ok: true, stored: false, reason: "Duplicate" });
        }

        await prisma.inboxMessage.create({
            data: {
                workspaceId: workspace.id,
                customerId: customer?.id ?? null,
                threadKey: threadKeyFor(from.email, subject),
                direction: "inbound",
                fromEmail: from.email,
                fromName,
                toEmail: to.email,
                subject,
                bodyText: text.slice(0, 50_000),
                providerMessageId: messageId,
                inReplyTo,
                status: "received",
                channel,
            },
        });

        return NextResponse.json({ ok: true, stored: true });
    } catch (error) {
        console.error("Inbound email failed", error);
        return NextResponse.json({ error: "Could not store the email." }, { status: 500 });
    }
}
