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

function getEmailDomain(email: string | null | undefined) {
    if (!email || !email.includes("@")) return "";
    return email.split("@")[1]?.trim().toLowerCase() || "";
}

function isVerifiedStatus(status: string | null | undefined) {
    return typeof status === "string" && status.toLowerCase() === "verified";
}

export async function GET(req: Request) {
    try {
        const { workspaceId } = await getWorkspaceFromRequest(req);

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: {
                id: true,
                name: true,
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

        if (!workspace) {
            return jsonError("Workspace not found", 404);
        }

        const verified = isVerifiedStatus(workspace.sendingDomainStatus);

        return NextResponse.json({
            ok: true,
            settings: {
                workspaceName: workspace.name,
                resendDomainId: workspace.resendDomainId,
                sendingDomain: workspace.sendingDomain,
                sendingDomainStatus: workspace.sendingDomainStatus,
                sendingDomainRecords: workspace.sendingDomainRecords,
                senderName: workspace.senderName,
                senderEmail: workspace.senderEmail,
                senderReplyTo: workspace.senderReplyTo,
                senderVerifiedAt: workspace.senderVerifiedAt,
                senderMatchesDomain:
                    !!workspace.senderEmail &&
                    !!workspace.sendingDomain &&
                    getEmailDomain(workspace.senderEmail) ===
                    workspace.sendingDomain.toLowerCase(),
                ready:
                    verified &&
                    !!workspace.senderName &&
                    !!workspace.senderEmail &&
                    !!workspace.sendingDomain &&
                    getEmailDomain(workspace.senderEmail) ===
                    workspace.sendingDomain.toLowerCase(),
            },
        });
    } catch (e: any) {
        if (e instanceof AuthError) {
            return jsonError(e.message, e.status);
        }

        console.error("[EMAIL_SETTINGS_GET_ERROR]", e);

        return NextResponse.json(
            { ok: false, error: "Failed to load email settings" },
            { status: 500 }
        );
    }
}