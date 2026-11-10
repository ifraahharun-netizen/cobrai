import type { Resend } from "resend";
import { prisma } from "@/lib/prisma";

/**
 * Each workspace receives customer replies on a receive-only subdomain of its
 * sending domain (reply.acme.com). The MX record goes on that subdomain, so the
 * company's normal mailbox on acme.com is never touched.
 */
export const REPLY_SUBDOMAIN = "reply";

export function replyDomainFor(sendingDomain: string) {
    return `${REPLY_SUBDOMAIN}.${sendingDomain.trim().toLowerCase()}`;
}

export function isVerifiedStatus(status: unknown) {
    return typeof status === "string" && status.toLowerCase() === "verified";
}

/**
 * The Reply-To address for emails a workspace sends. Once the reply subdomain is
 * verified, replies go to <sender local part>@reply.<domain> so they land in the
 * Cobrai inbox; until then, the workspace's own reply-to (if any) is used.
 */
export function replyToAddressFor(workspace: {
    senderEmail?: string | null;
    senderReplyTo?: string | null;
    replyDomain?: string | null;
    replyDomainStatus?: string | null;
}) {
    const local = workspace.senderEmail?.split("@")[0]?.trim().toLowerCase();
    if (workspace.replyDomain && isVerifiedStatus(workspace.replyDomainStatus) && local) {
        return `${local}@${workspace.replyDomain}`;
    }
    return workspace.senderReplyTo?.trim() || null;
}

type RemoteDomain = { id: string; name?: string; status?: string; records?: unknown };

type ReplyDomainState = {
    replyDomain: string | null;
    resendReplyDomainId: string | null;
    replyDomainStatus: string | null;
    replyDomainRecords: unknown;
};

/**
 * Makes sure the workspace has a receive-only reply subdomain in Resend and
 * stores its latest status and DNS records. Never throws: replies are an add-on,
 * so a failure here must not block sending-domain setup.
 */
export async function syncReplyDomain(
    resend: Resend,
    workspaceId: string,
    sendingDomain: string,
    current: { replyDomain: string | null; resendReplyDomainId: string | null; replyDomainStatus?: string | null }
): Promise<{ state: ReplyDomainState | null; error: string | null }> {
    const name = replyDomainFor(sendingDomain);

    try {
        let remote: RemoteDomain | null = null;

        // Reuse the existing Resend domain when it still matches this sending domain.
        if (current.resendReplyDomainId && current.replyDomain === name) {
            if (!isVerifiedStatus(current.replyDomainStatus)) {
                // Ask Resend to re-check DNS; the status below picks up the result.
                await resend.domains.verify(current.resendReplyDomainId).catch(() => null);
            }
            const fetched = await resend.domains.get(current.resendReplyDomainId);
            if (fetched.data) remote = fetched.data as RemoteDomain;
        }

        if (!remote) {
            const created = await resend.domains.create({
                name,
                capabilities: { sending: "disabled", receiving: "enabled" },
            });
            if (created.error || !created.data?.id) {
                return { state: null, error: created.error?.message || "Resend did not create the reply domain" };
            }
            remote = created.data as RemoteDomain;
        }

        const state: ReplyDomainState = {
            replyDomain: remote.name || name,
            resendReplyDomainId: remote.id,
            replyDomainStatus: remote.status || "not_started",
            replyDomainRecords: remote.records ?? null,
        };

        await prisma.workspace.update({
            where: { id: workspaceId },
            data: {
                replyDomain: state.replyDomain,
                resendReplyDomainId: state.resendReplyDomainId,
                replyDomainStatus: state.replyDomainStatus,
                replyDomainRecords: (state.replyDomainRecords ?? undefined) as never,
            },
        });

        return { state, error: null };
    } catch (error) {
        console.error("[REPLY_DOMAIN_SYNC_ERROR]", error);
        return { state: null, error: "Could not set up the reply domain" };
    }
}
