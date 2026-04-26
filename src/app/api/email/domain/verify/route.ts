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

function isVerifiedStatus(status: unknown) {
    return typeof status === "string" && status.toLowerCase() === "verified";
}

export async function POST(req: Request) {
    try {
        if (!process.env.RESEND_API_KEY) {
            return jsonError("Missing RESEND_API_KEY", 500, "MISSING_RESEND_API_KEY");
        }

        const { workspaceId } = await getWorkspaceFromRequest(req);

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: {
                id: true,
                resendDomainId: true,
                sendingDomain: true,
                sendingDomainStatus: true,
                senderName: true,
                senderEmail: true,
                senderReplyTo: true,
            },
        });

        if (!workspace) {
            return jsonError("Workspace not found", 404);
        }

        if (!workspace.resendDomainId || !workspace.sendingDomain) {
            return jsonError(
                "No sending domain has been configured for this workspace",
                400,
                "NO_SENDING_DOMAIN"
            );
        }

        const fetched = await resend.domains.get(workspace.resendDomainId);

        if (fetched?.error) {
            const message =
                typeof fetched.error.message === "string"
                    ? fetched.error.message
                    : "Failed to fetch domain status from Resend";

            return jsonError(message, 400, "RESEND_GET_DOMAIN_FAILED");
        }

        if (!fetched?.data) {
            return jsonError(
                "Resend did not return domain data",
                500,
                "RESEND_DOMAIN_DATA_MISSING"
            );
        }

        const remote = fetched.data;
        const verified = isVerifiedStatus(remote.status);

        const updated = await prisma.workspace.update({
            where: { id: workspaceId },
            data: {
                sendingDomain: remote.name || workspace.sendingDomain,
                sendingDomainStatus: remote.status || workspace.sendingDomainStatus,
                sendingDomainRecords: ((remote as any).records ?? null) as any,
                senderVerifiedAt: verified ? new Date() : null,
            },
            select: {
                id: true,
                resendDomainId: true,
                sendingDomain: true,
                sendingDomainStatus: true,
                sendingDomainRecords: true,
                senderName: true,
                senderEmail: true,
                senderReplyTo: true,
                senderVerifiedAt: true,
            },
        });

        const senderDomain =
            typeof updated.senderEmail === "string" && updated.senderEmail.includes("@")
                ? updated.senderEmail.split("@")[1]?.toLowerCase() || null
                : null;

        const senderMatchesDomain =
            !!senderDomain &&
            !!updated.sendingDomain &&
            senderDomain === updated.sendingDomain.toLowerCase();

        return NextResponse.json({
            ok: true,
            verified,
            domain: {
                id: updated.resendDomainId,
                name: updated.sendingDomain,
                status: updated.sendingDomainStatus,
                records: updated.sendingDomainRecords,
                verifiedAt: updated.senderVerifiedAt,
            },
            sender: {
                name: updated.senderName,
                email: updated.senderEmail,
                replyTo: updated.senderReplyTo,
                matchesDomain: senderMatchesDomain,
                ready:
                    verified &&
                    !!updated.senderName &&
                    !!updated.senderEmail &&
                    senderMatchesDomain,
            },
        });
    } catch (e: any) {
        if (e instanceof AuthError) {
            return jsonError(e.message, e.status);
        }

        console.error("[EMAIL_DOMAIN_VERIFY_ERROR]", e);

        return NextResponse.json(
            { ok: false, error: "Failed to verify sending domain" },
            { status: 500 }
        );
    }
}