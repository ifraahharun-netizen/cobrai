import prisma from "@/lib/prisma";
import { isValidEmail, threadKeyFor, type InboxChannel } from "@/lib/inbox";

/** "Sam Patel <sam@kitelabs.io>" -> { email, name } */
export function parseAddress(value: unknown): { email: string; name: string | null } {
    const first = Array.isArray(value) ? value[0] : value;
    const text =
        typeof first === "string"
            ? first
            : typeof first === "object" && first
                ? String((first as { email?: string }).email ?? "")
                : "";
    const match = text.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
    if (match) return { email: match[2].trim().toLowerCase(), name: match[1].trim() || null };
    return { email: text.trim().toLowerCase(), name: null };
}

/** Plain text from an HTML email body, for when no text part was sent. */
export function htmlToText(html: string) {
    return html
        .replace(/<(style|script|head)[^>]*>[\s\S]*?<\/\1>/gi, "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

export type InboundEmail = {
    from: { email: string; name: string | null };
    /** Every address the email was delivered to; the first that matches a workspace wins. */
    to: string[];
    subject: string;
    text: string;
    messageId: string | null;
    inReplyTo: string | null;
    channel: InboxChannel;
};

export type IngestResult =
    | { stored: true }
    | { stored: false; reason: "invalid_address" | "no_workspace" | "duplicate" };

/** Files a received email in the inbox of the workspace it was sent to. */
export async function ingestInboundEmail(email: InboundEmail): Promise<IngestResult> {
    const recipients = email.to.map((address) => address.trim().toLowerCase()).filter(isValidEmail);
    if (!isValidEmail(email.from.email) || recipients.length === 0) {
        return { stored: false, reason: "invalid_address" };
    }

    // Which workspace was this sent to? Match its sender/reply-to address, its
    // reply subdomain (reply.acme.com), then its sending domain.
    let workspace: { id: string } | null = null;
    let toEmail = recipients[0];
    for (const address of recipients) {
        const domain = address.split("@")[1];
        workspace = await prisma.workspace.findFirst({
            where: {
                OR: [
                    { senderEmail: { equals: address, mode: "insensitive" } },
                    { senderReplyTo: { equals: address, mode: "insensitive" } },
                    { replyDomain: { equals: domain, mode: "insensitive" } },
                    { sendingDomain: { equals: domain, mode: "insensitive" } },
                ],
            },
            select: { id: true },
        });
        if (workspace) {
            toEmail = address;
            break;
        }
    }

    if (!workspace) return { stored: false, reason: "no_workspace" };

    if (email.messageId) {
        const existing = await prisma.inboxMessage.findUnique({
            where: { providerMessageId: email.messageId },
            select: { id: true },
        });
        if (existing) return { stored: false, reason: "duplicate" };
    }

    const customer = await prisma.customer.findFirst({
        where: { workspaceId: workspace.id, email: { equals: email.from.email, mode: "insensitive" } },
        select: { id: true },
    });

    await prisma.inboxMessage.create({
        data: {
            workspaceId: workspace.id,
            customerId: customer?.id ?? null,
            threadKey: threadKeyFor(email.from.email, email.subject),
            direction: "inbound",
            fromEmail: email.from.email,
            fromName: email.from.name?.slice(0, 120) ?? null,
            toEmail,
            subject: email.subject.slice(0, 300),
            bodyText: email.text.slice(0, 50_000),
            providerMessageId: email.messageId,
            inReplyTo: email.inReplyTo,
            status: "received",
            channel: email.channel,
        },
    });

    return { stored: true };
}
