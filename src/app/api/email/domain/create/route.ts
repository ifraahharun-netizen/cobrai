import { NextResponse } from "next/server";
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import {
    AuthError,
    getWorkspaceFromRequest,
} from "@/lib/auth/getWorkspaceFromRequest";

export const runtime = "nodejs";

const resend = new Resend(process.env.RESEND_API_KEY);

function jsonError(message: string, status = 400, code?: string) {
    return NextResponse.json(
        { ok: false, error: message, ...(code ? { code } : {}) },
        { status }
    );
}

function normalizeDomain(value: unknown) {
    if (typeof value !== "string") return "";

    return value
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .replace(/\/.*$/, "")
        .replace(/\.$/, "");
}

function isLikelyValidDomain(domain: string) {
    // Keeps this strict enough for production UI/API validation
    // while still allowing common business domains/subdomains.
    return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain);
}

export async function POST(req: Request) {
    try {
        if (!process.env.RESEND_API_KEY) {
            return jsonError("Missing RESEND_API_KEY", 500, "MISSING_RESEND_API_KEY");
        }

        const { workspaceId } = await getWorkspaceFromRequest(req);

        const raw = await req.json().catch(() => null);
        if (!raw || typeof raw !== "object") {
            return jsonError("Invalid request body", 400);
        }

        const domain = normalizeDomain((raw as any).domain);

        if (!domain) {
            return jsonError("Domain is required", 400);
        }

        if (!isLikelyValidDomain(domain)) {
            return jsonError("Enter a valid domain, for example acme.com", 400);
        }

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: {
                id: true,
                name: true,
                sendingDomain: true,
                sendingDomainStatus: true,
                resendDomainId: true,
            },
        });

        if (!workspace) {
            return jsonError("Workspace not found", 404);
        }

        // If this workspace already has the same domain stored, try to refresh from Resend
        // instead of creating duplicate domains.
        if (workspace.resendDomainId && workspace.sendingDomain === domain) {
            const existing = await resend.domains.get(workspace.resendDomainId);

            if (existing?.error) {
                // Fall through to recreate only if lookup failed.
                // This can happen if the remote domain was deleted manually.
            } else if (existing?.data) {
                const refreshed = await prisma.workspace.update({
                    where: { id: workspaceId },
                    data: {
                        sendingDomain: existing.data.name || domain,
                        sendingDomainStatus: existing.data.status || null,
                        sendingDomainRecords: ((existing.data as any).records ?? null) as any,
                        senderVerifiedAt:
                            existing.data.status === "verified" ? new Date() : null,
                    },
                    select: {
                        id: true,
                        sendingDomain: true,
                        sendingDomainStatus: true,
                        resendDomainId: true,
                        sendingDomainRecords: true,
                        senderVerifiedAt: true,
                    },
                });

                return NextResponse.json({
                    ok: true,
                    created: false,
                    domain: {
                        id: refreshed.resendDomainId,
                        name: refreshed.sendingDomain,
                        status: refreshed.sendingDomainStatus,
                        records: refreshed.sendingDomainRecords,
                        verifiedAt: refreshed.senderVerifiedAt,
                    },
                });
            }
        }

        // Optional safeguard: if the workspace has a different domain already connected,
        // require the caller to disconnect/replace intentionally.
        if (
            workspace.sendingDomain &&
            workspace.sendingDomain !== domain &&
            workspace.resendDomainId
        ) {
            return jsonError(
                "This workspace already has a sending domain connected. Replace flow should be handled explicitly.",
                409,
                "DOMAIN_ALREADY_CONNECTED"
            );
        }

        // Resend create domain
        const created = await resend.domains.create({ name: domain });

        if (created?.error) {
            const message =
                typeof created.error.message === "string"
                    ? created.error.message
                    : "Failed to create domain in Resend";

            return jsonError(message, 400, "RESEND_CREATE_DOMAIN_FAILED");
        }

        if (!created?.data?.id) {
            return jsonError(
                "Resend did not return a domain ID",
                500,
                "RESEND_DOMAIN_ID_MISSING"
            );
        }

        const updatedWorkspace = await prisma.workspace.update({
            where: { id: workspaceId },
            data: {
                resendDomainId: created.data.id,
                sendingDomain: created.data.name || domain,
                sendingDomainStatus: created.data.status || "not_started",
                sendingDomainRecords: ((created.data as any).records ?? null) as any,
                senderVerifiedAt:
                    created.data.status === "verified" ? new Date() : null,
                // Clear sender identity if domain changes or new domain is being set
                senderEmail: null,
            },
            select: {
                id: true,
                sendingDomain: true,
                sendingDomainStatus: true,
                resendDomainId: true,
                sendingDomainRecords: true,
                senderName: true,
                senderEmail: true,
                senderReplyTo: true,
                senderVerifiedAt: true,
            },
        });

        return NextResponse.json({
            ok: true,
            created: true,
            domain: {
                id: updatedWorkspace.resendDomainId,
                name: updatedWorkspace.sendingDomain,
                status: updatedWorkspace.sendingDomainStatus,
                records: updatedWorkspace.sendingDomainRecords,
                verifiedAt: updatedWorkspace.senderVerifiedAt,
            },
        });
    } catch (e: any) {
        if (e instanceof AuthError) {
            return jsonError(e.message, e.status);
        }

        console.error("[EMAIL_DOMAIN_CREATE_ERROR]", e);

        return NextResponse.json(
            { ok: false, error: "Failed to create sending domain" },
            { status: 500 }
        );
    }
}