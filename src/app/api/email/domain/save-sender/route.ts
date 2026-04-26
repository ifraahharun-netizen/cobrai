import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
    AuthError,
    getWorkspaceFromRequest,
} from "@/lib/auth/getWorkspaceFromRequest";

export const runtime = "nodejs";

function jsonError(message: string, status = 400, code?: string) {
    return NextResponse.json(
        { ok: false, error: message, ...(code ? { code } : {}) },
        { status }
    );
}

function normalizeText(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function isValidEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getEmailDomain(email: string) {
    return email.split("@")[1]?.trim().toLowerCase() || "";
}

function isVerifiedStatus(status: string | null | undefined) {
    return typeof status === "string" && status.toLowerCase() === "verified";
}

export async function POST(req: Request) {
    try {
        const { workspaceId } = await getWorkspaceFromRequest(req);

        const raw = await req.json().catch(() => null);
        if (!raw || typeof raw !== "object") {
            return jsonError("Invalid request body", 400);
        }

        const senderName = normalizeText((raw as any).senderName);
        const senderEmail = normalizeText((raw as any).senderEmail).toLowerCase();
        const senderReplyTo = normalizeText((raw as any).senderReplyTo).toLowerCase();

        if (!senderName) {
            return jsonError("Sender name is required", 400, "SENDER_NAME_REQUIRED");
        }

        if (!senderEmail) {
            return jsonError("Sender email is required", 400, "SENDER_EMAIL_REQUIRED");
        }

        if (!isValidEmail(senderEmail)) {
            return jsonError("Sender email is invalid", 400, "INVALID_SENDER_EMAIL");
        }

        if (senderReplyTo && !isValidEmail(senderReplyTo)) {
            return jsonError("Reply-to email is invalid", 400, "INVALID_REPLY_TO");
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

        if (!workspace.sendingDomain || !workspace.resendDomainId) {
            return jsonError(
                "No sending domain has been configured for this workspace",
                400,
                "NO_SENDING_DOMAIN"
            );
        }

        const sendingDomain = workspace.sendingDomain.trim().toLowerCase();
        const senderDomain = getEmailDomain(senderEmail);

        if (senderDomain !== sendingDomain) {
            return jsonError(
                "Sender email must match the connected sending domain",
                400,
                "SENDER_DOMAIN_MISMATCH"
            );
        }

        if (senderReplyTo) {
            const replyToDomain = getEmailDomain(senderReplyTo);
            if (!replyToDomain) {
                return jsonError("Reply-to email is invalid", 400, "INVALID_REPLY_TO");
            }
        }

        const verified = isVerifiedStatus(workspace.sendingDomainStatus);

        const updated = await prisma.workspace.update({
            where: { id: workspaceId },
            data: {
                senderName,
                senderEmail,
                senderReplyTo: senderReplyTo || null,
                senderVerifiedAt: verified ? new Date() : null,
            },
            select: {
                id: true,
                name: true,
                sendingDomain: true,
                sendingDomainStatus: true,
                senderName: true,
                senderEmail: true,
                senderReplyTo: true,
                senderVerifiedAt: true,
            },
        });

        return NextResponse.json({
            ok: true,
            sender: {
                name: updated.senderName,
                email: updated.senderEmail,
                replyTo: updated.senderReplyTo,
                domain: updated.sendingDomain,
                domainVerified: verified,
                ready:
                    verified &&
                    !!updated.senderName &&
                    !!updated.senderEmail &&
                    getEmailDomain(updated.senderEmail) ===
                    (updated.sendingDomain || "").toLowerCase(),
                verifiedAt: updated.senderVerifiedAt,
            },
        });
    } catch (e: any) {
        if (e instanceof AuthError) {
            return jsonError(e.message, e.status);
        }

        console.error("[EMAIL_SAVE_SENDER_ERROR]", e);

        return NextResponse.json(
            { ok: false, error: "Failed to save sender settings" },
            { status: 500 }
        );
    }
}