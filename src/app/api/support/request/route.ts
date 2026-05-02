import { NextResponse } from "next/server";
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { getWorkspaceFromRequest } from "@/lib/auth/getWorkspaceFromRequest";

export const runtime = "nodejs";

const resend = new Resend(process.env.RESEND_API_KEY);

const SUPPORT_EMAIL = process.env.COBRAI_SUPPORT_EMAIL || "cobrai@cobrai.uk";
const FROM_EMAIL =
    process.env.RESEND_FROM_EMAIL || "Cobrai Support <cobrai@cobrai.uk>";

function isValidEmail(email: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: Request) {
    try {
        const body = await req.json();

        const email = String(body?.email || "").trim().toLowerCase();
        const requestMessage = String(body?.request || "").trim();
        const name = String(body?.name || "").trim();

        if (!email) {
            return NextResponse.json(
                { ok: false, error: "Email is required." },
                { status: 400 }
            );
        }

        if (!isValidEmail(email)) {
            return NextResponse.json(
                { ok: false, error: "Enter a valid email address." },
                { status: 400 }
            );
        }

        if (!requestMessage) {
            return NextResponse.json(
                { ok: false, error: "Request message is required." },
                { status: 400 }
            );
        }

        if (requestMessage.length < 10) {
            return NextResponse.json(
                { ok: false, error: "Please write a little more detail." },
                { status: 400 }
            );
        }

        if (requestMessage.length > 3000) {
            return NextResponse.json(
                { ok: false, error: "Request is too long. Please keep it under 3000 characters." },
                { status: 400 }
            );
        }

        if (!process.env.RESEND_API_KEY) {
            return NextResponse.json(
                { ok: false, error: "Email service is not configured." },
                { status: 500 }
            );
        }

        let workspaceId: string | null = null;
        let workspaceName = "Demo Workspace";
        let ownerEmail = "Not available";
        let plan = "demo";

        try {
            const auth = await getWorkspaceFromRequest(req);
            workspaceId = auth.workspaceId;

            const workspace = await prisma.workspace.findUnique({
                where: { id: auth.workspaceId },
                select: {
                    name: true,
                    ownerEmail: true,
                    tier: true,
                },
            });

            workspaceName = workspace?.name || "Unknown workspace";
            ownerEmail = workspace?.ownerEmail || "Not available";
            plan = workspace?.tier || "Not available";
        } catch (error) {
            console.warn("[Support Request] workspace lookup skipped:", error);
        }

        const recentRequests = await prisma.supportRequest.count({
            where: {
                email,
                createdAt: {
                    gte: new Date(Date.now() - 10 * 60 * 1000),
                },
            },
        });

        if (recentRequests >= 3) {
            return NextResponse.json(
                { ok: false, error: "Too many requests. Please try again later." },
                { status: 429 }
            );
        }

        await prisma.supportRequest.create({
            data: {
                workspaceId,
                name: name || null,
                email,
                message: requestMessage,
                status: "open",
            },
        });

        const result = await resend.emails.send({
            from: FROM_EMAIL,
            to: SUPPORT_EMAIL,
            replyTo: email,
            subject: `New Cobrai support request from ${email}`,
            text: `
New support request

Name: ${name || "Not provided"}
Email: ${email}

Workspace: ${workspaceName}
Workspace ID: ${workspaceId || "demo"}
Owner Email: ${ownerEmail}
Plan: ${plan}

Request:
${requestMessage}
            `.trim(),
        });

        if (result.error) {
            console.error("[Support Request] Resend error:", result.error);

            return NextResponse.json(
                {
                    ok: false,
                    error: result.error.message || "Support request was saved, but email failed.",
                },
                { status: 500 }
            );
        }

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error("[Support Request] failed:", error);

        return NextResponse.json(
            { ok: false, error: "Failed to send support request." },
            { status: 500 }
        );
    }
}