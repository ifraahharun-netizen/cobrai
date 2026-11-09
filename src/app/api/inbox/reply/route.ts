import { NextResponse } from "next/server";
import { Resend } from "resend";
import prisma from "@/lib/prisma";
import { getWorkspaceFromRequest } from "@/lib/auth/getWorkspaceFromRequest";
import { ratelimit } from "@/lib/rateLimit";
import { isValidEmail, replySubject, threadKeyFor } from "@/lib/inbox";
import { sanitizeEmailHtml } from "@/lib/emailHtml";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 10_000;

function deliveryEnabled() {
    return process.env.EMAIL_DELIVERY_ENABLED === "true" && Boolean(process.env.RESEND_API_KEY);
}

/**
 * Send a reply from the inbox. The recipient must already be part of the
 * conversation (they emailed us, or they're the customer we emailed), so the
 * inbox can't be used to email arbitrary addresses.
 */
/** A stored message id as an RFC 5322 Message-ID header value, or null. */
function toMessageIdHeader(value: string | null | undefined) {
    const id = String(value ?? "").replace(/[\r\n\s]/g, "").replace(/^<|>$/g, "");
    if (!id || !id.includes("@") || id.length > 250) return null;
    return `<${id}>`;
}

export async function POST(req: Request) {
    try {
        const { workspaceId } = await getWorkspaceFromRequest(req);

        const { success } = await ratelimit.limit(`inbox-reply:${workspaceId}`);

        if (!success) {
            return NextResponse.json({ error: "Too many replies. Please try again shortly." }, { status: 429 });
        }

        const raw = (await req.json().catch(() => null)) as Record<string, unknown> | null;
        const to = typeof raw?.to === "string" ? raw.to.trim().toLowerCase() : "";
        const subject = typeof raw?.subject === "string" ? raw.subject.trim().slice(0, 180) : "";
        const body = typeof raw?.body === "string" ? raw.body.trim() : "";
        // The inbox message being replied to (our database id). Its email
        // Message-ID is looked up below for the In-Reply-To / References headers.
        const replyToMessageId =
            typeof raw?.replyToMessageId === "string" ? raw.replyToMessageId.slice(0, 100) : null;
        // Formatted version from the editor, cleaned so only simple formatting is kept.
        const html = typeof raw?.html === "string" ? sanitizeEmailHtml(raw.html) || null : null;

        if (!to || !subject || !body) {
            return NextResponse.json({ error: "Add a message before sending." }, { status: 400 });
        }

        if (!isValidEmail(to)) {
            return NextResponse.json({ error: "Invalid recipient." }, { status: 400 });
        }

        if (body.length > MAX_BODY) {
            return NextResponse.json({ error: `Message is too long (max ${MAX_BODY} characters).` }, { status: 400 });
        }

        const threadKey = threadKeyFor(to, subject);

        // The recipient must be someone this workspace is already talking to.
        const [customer, priorInbound] = await Promise.all([
            prisma.customer.findFirst({
                where: { workspaceId, email: { equals: to, mode: "insensitive" } },
                select: { id: true },
            }),
            prisma.inboxMessage.findFirst({
                where: { workspaceId, direction: "inbound", fromEmail: { equals: to, mode: "insensitive" } },
                select: { id: true, customerId: true },
            }),
        ]);

        if (!customer && !priorInbound) {
            return NextResponse.json(
                { error: "You can only reply to customers or people who have emailed you." },
                { status: 403 }
            );
        }

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: {
                name: true,
                senderName: true,
                senderEmail: true,
                senderReplyTo: true,
                sendingDomainStatus: true,
            },
        });

        if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

        // Thread the reply in the customer's mail client: use the inbound email's
        // own Message-ID, not our database id. Providers that only give their own
        // ids (no "@") can't be used as a header, so the reply is sent unthreaded.
        const repliedTo = replyToMessageId
            ? await prisma.inboxMessage.findFirst({
                where: { id: replyToMessageId, workspaceId, direction: "inbound" },
                select: { providerMessageId: true },
            })
            : null;
        const inReplyTo = toMessageIdHeader(repliedTo?.providerMessageId);

        const senderEmail = workspace.senderEmail?.trim() || "";
        const senderName = workspace.senderName?.trim() || workspace.name || "Cobrai";
        const verified = String(workspace.sendingDomainStatus || "").toLowerCase() === "verified";

        let status: "sent" | "failed" | "not_sent" = "not_sent";
        let providerMessageId: string | null = null;
        let notice: string | null = null;

        if (deliveryEnabled() && senderEmail && verified) {
            try {
                const resend = new Resend(process.env.RESEND_API_KEY);
                const result = await resend.emails.send({
                    from: `${senderName} <${senderEmail}>`,
                    to,
                    subject: replySubject(subject),
                    text: body,
                    ...(html ? { html } : {}),
                    ...(workspace.senderReplyTo ? { replyTo: workspace.senderReplyTo } : {}),
                    ...(inReplyTo ? { headers: { "In-Reply-To": inReplyTo, References: inReplyTo } } : {}),
                });

                if (result.error) {
                    status = "failed";
                    notice = result.error.message || "The email provider rejected the message.";
                } else {
                    status = "sent";
                    providerMessageId = result.data?.id ?? null;
                }
            } catch (error) {
                status = "failed";
                notice = error instanceof Error ? error.message : "Sending failed.";
            }
        } else {
            notice = !senderEmail || !verified
                ? "Saved but not sent: verify your sending domain in Settings first."
                : "Saved but not sent: email delivery is turned off (EMAIL_DELIVERY_ENABLED).";
        }

        const message = await prisma.inboxMessage.create({
            data: {
                workspaceId,
                customerId: customer?.id ?? priorInbound?.customerId ?? null,
                threadKey,
                direction: "outbound",
                fromEmail: senderEmail || "unverified-sender",
                fromName: senderName,
                toEmail: to,
                subject: replySubject(subject),
                bodyText: body,
                bodyHtml: html,
                providerMessageId,
                inReplyTo,
                status,
                channel: "cobrai",
            },
        });

        return NextResponse.json({
            ok: status !== "failed",
            status,
            notice,
            message: {
                id: message.id,
                direction: "outbound",
                source: "inbox",
                fromEmail: message.fromEmail,
                fromName: message.fromName,
                toEmail: message.toEmail,
                subject: message.subject,
                bodyText: message.bodyText,
                bodyHtml: message.bodyHtml,
                createdAt: message.createdAt.toISOString(),
                status: message.status,
                channel: "cobrai",
                read: true,
            },
        });
    } catch (error) {
        console.error("Inbox reply failed", error);
        return NextResponse.json({ error: "Could not send the reply." }, { status: 500 });
    }
}
