import { NextResponse } from "next/server";
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { AuthError, getWorkspaceFromRequest } from "@/lib/auth/getWorkspaceFromRequest";

export const runtime = "nodejs";

const resend = new Resend(process.env.RESEND_API_KEY);

const MAX_SUBJECT_LENGTH = 180;
const MAX_BODY_LENGTH = 10000;
const STARTER_WEEKLY_EMAIL_CAP = 5;

function jsonError(message: string, status = 400, code?: string) {
    return NextResponse.json(
        { ok: false, error: message, ...(code ? { code } : {}) },
        { status }
    );
}

function getActionType(subject: string) {
    const s = subject.toLowerCase();

    if (s.includes("billing")) return "billing_recovery_email";
    if (s.includes("value") || s.includes("usage")) return "reengagement_email";
    return "checkin_email";
}

function isValidEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function startOfNextWeek(from = new Date()) {
    const d = new Date(from);
    const day = d.getDay();
    const daysUntilNextMonday = ((8 - day) % 7) || 7;
    d.setDate(d.getDate() + daysUntilNextMonday);
    d.setHours(0, 0, 0, 0);
    return d;
}

function normalizeText(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function isEmailDeliveryEnabled() {
    return process.env.EMAIL_DELIVERY_ENABLED === "true";
}

function getEmailDomain(email: string | null | undefined) {
    if (!email || !email.includes("@")) return null;
    return email.split("@")[1]?.trim().toLowerCase() || null;
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

        const to = normalizeText((raw as any).to);
        const subject = normalizeText((raw as any).subject);
        const body =
            typeof (raw as any).body === "string"
                ? (raw as any).body.trim()
                : "";

        const accountId =
            typeof (raw as any).accountId === "string" && (raw as any).accountId.trim()
                ? (raw as any).accountId.trim()
                : null;

        if (!to || !subject || !body) {
            return jsonError("Missing to/subject/body", 400);
        }

        if (!accountId) {
            return jsonError("Missing accountId", 400);
        }

        if (!isValidEmail(to)) {
            return jsonError("Invalid recipient email address", 400);
        }

        if (subject.length > MAX_SUBJECT_LENGTH) {
            return jsonError(
                `Subject is too long. Max ${MAX_SUBJECT_LENGTH} characters.`,
                400
            );
        }

        if (body.length > MAX_BODY_LENGTH) {
            return jsonError(
                `Body is too long. Max ${MAX_BODY_LENGTH} characters.`,
                400
            );
        }

        let customerId: string | null = null;
        let riskScoreBefore: number | null = null;
        let mrrBefore: number | null = null;
        let churnRiskBefore: number | null = null;
        let lastActiveAtBefore: string | null = null;
        let outstandingInvoicesBefore = 0;
        let companyName: string | null = null;

        const risk = await prisma.accountRisk.findFirst({
            where: {
                workspaceId,
                OR: [{ id: accountId }, { customerId: accountId }],
            },
            include: {
                customer: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        mrr: true,
                        churnRisk: true,
                        lastActiveAt: true,
                    },
                },
            },
        });

        if (!risk) {
            return jsonError("Account not found", 404);
        }

        customerId = risk.customerId || risk.customer?.id || null;
        riskScoreBefore = risk.riskScore ?? null;
        companyName = risk.customer?.name || risk.companyName || null;

        if (!risk.customer?.email || risk.customer.email.toLowerCase() !== to.toLowerCase()) {
            return jsonError(
                "Recipient email must match the selected customer.",
                403,
                "RECIPIENT_MISMATCH"
            );
        }

        if (risk.customer) {
            mrrBefore = typeof risk.customer.mrr === "number" ? risk.customer.mrr : null;
            churnRiskBefore =
                typeof risk.customer.churnRisk === "number"
                    ? Math.round(risk.customer.churnRisk)
                    : null;
            lastActiveAtBefore = risk.customer.lastActiveAt
                ? risk.customer.lastActiveAt.toISOString()
                : null;
        }

        if (customerId) {
            outstandingInvoicesBefore = await prisma.invoice.count({
                where: {
                    workspaceId,
                    customerId,
                    status: { in: ["failed", "past_due", "open", "overdue"] },
                },
            });
        }

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: {
                id: true,
                tier: true,
                emailActionsUsedThisWeek: true,
                emailResetAt: true,
                name: true,
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

        const now = new Date();
        const tier = workspace.tier === "pro" ? "pro" : "starter";
        const resetAt = workspace.emailResetAt;
        const shouldResetWindow = !resetAt || resetAt.getTime() <= now.getTime();

        const currentUsed = shouldResetWindow ? 0 : workspace.emailActionsUsedThisWeek;
        const weeklyCap = tier === "pro" ? null : STARTER_WEEKLY_EMAIL_CAP;

        if (tier === "starter" && currentUsed >= STARTER_WEEKLY_EMAIL_CAP) {
            return jsonError(
                "Starter email limit reached. Upgrade to Pro for unlimited email actions.",
                403,
                "STARTER_EMAIL_LIMIT_REACHED"
            );
        }

        const deliveryEnabled = isEmailDeliveryEnabled();

        const senderName = normalizeText(workspace.senderName) || workspace.name || "Cobrai";
        const senderEmail = normalizeText(workspace.senderEmail);
        const replyTo = normalizeText(workspace.senderReplyTo);

        const sendingDomain = normalizeText(workspace.sendingDomain).toLowerCase();
        const senderDomain = getEmailDomain(senderEmail);
        const replyToDomain = getEmailDomain(replyTo);

        if (deliveryEnabled) {
            if (!senderEmail) {
                return jsonError(
                    "No sender email configured for this workspace",
                    400,
                    "SENDER_EMAIL_MISSING"
                );
            }

            if (!sendingDomain) {
                return jsonError(
                    "No sending domain configured for this workspace",
                    400,
                    "SENDING_DOMAIN_MISSING"
                );
            }

            if (!isVerifiedStatus(workspace.sendingDomainStatus)) {
                return jsonError(
                    "Sending domain is not verified yet",
                    400,
                    "SENDING_DOMAIN_NOT_VERIFIED"
                );
            }

            if (!senderDomain || senderDomain !== sendingDomain) {
                return jsonError(
                    "Sender email must match the verified sending domain",
                    400,
                    "SENDER_DOMAIN_MISMATCH"
                );
            }

            if (replyTo && (!replyToDomain || !isValidEmail(replyTo))) {
                return jsonError("Reply-to email is invalid", 400, "INVALID_REPLY_TO");
            }
        }

        let providerId: string | null = null;

        if (deliveryEnabled) {
            const sendPayload: {
                from: string;
                to: string;
                subject: string;
                text: string;
                replyTo?: string;
            } = {
                from: `${senderName} <${senderEmail}>`,
                to,
                subject,
                text: body,
            };

            if (replyTo) {
                sendPayload.replyTo = replyTo;
            }

            const result = await resend.emails.send(sendPayload);

            if ((result as any)?.error) {
                console.error("Resend send failed:", (result as any).error);
                return jsonError("Failed to send email", 400, "RESEND_SEND_FAILED");
            }

            providerId =
                typeof (result as any)?.data?.id === "string"
                    ? (result as any).data.id
                    : null;
        } else {
            console.log("EMAIL DRY RUN:", {
                workspaceId,
                to,
                subject,
                accountId,
                from: senderEmail ? `${senderName} <${senderEmail}>` : null,
                replyTo: replyTo || null,
            });
        }

        const actionExecution = await prisma.actionExecution.create({
            data: {
                workspaceId,
                customerId,
                accountRiskId: accountId,
                actionType: getActionType(subject),
                channel: "email",
                title: companyName ? `${companyName} outreach` : "Retention outreach",
                subject,
                body,
                status: "sent",
                sentAt: now,
                metadata: {
                    provider: deliveryEnabled ? "resend" : "dry_run",
                    providerId,
                    to,
                    from: senderEmail ? `${senderName} <${senderEmail}>` : null,
                    replyTo: replyTo || null,
                    sendingDomain: sendingDomain || null,
                    dryRun: !deliveryEnabled,
                    tier,
                } as any,
            },
        });

        await prisma.actionOutcomeSnapshot.create({
            data: {
                workspaceId,
                actionExecutionId: actionExecution.id,
                riskScoreBefore,
                mrrBefore,
                churnRiskBefore,
                metadata: {
                    outstandingInvoicesBefore,
                    lastActiveAtBefore,
                } as any,
            },
        });

        await prisma.workspace.update({
            where: { id: workspaceId },
            data:
                tier === "pro"
                    ? {}
                    : {
                        emailActionsUsedThisWeek: shouldResetWindow
                            ? 1
                            : { increment: 1 },
                        emailResetAt: shouldResetWindow
                            ? startOfNextWeek(now)
                            : undefined,
                    },
        });

        const nextUsed =
            tier === "pro" ? null : shouldResetWindow ? 1 : currentUsed + 1;

        return NextResponse.json({
            ok: true,
            dryRun: !deliveryEnabled,
            actionExecutionId: actionExecution.id,
            tier,
            sender: {
                name: senderName,
                email: senderEmail || null,
                replyTo: replyTo || null,
                domain: sendingDomain || null,
                verified: isVerifiedStatus(workspace.sendingDomainStatus),
            },
            emailUsage:
                tier === "pro"
                    ? {
                        used: null,
                        limit: null,
                        remaining: null,
                        resetAt: null,
                    }
                    : {
                        used: nextUsed,
                        limit: weeklyCap,
                        remaining: Math.max(
                            0,
                            STARTER_WEEKLY_EMAIL_CAP - (nextUsed || 0)
                        ),
                        resetAt: shouldResetWindow
                            ? startOfNextWeek(now)
                            : workspace.emailResetAt,
                    },
        });
    } catch (e: any) {
        if (e instanceof AuthError) {
            return jsonError(e.message, e.status);
        }

        console.error("EMAIL ERROR:", e);

        return NextResponse.json(
            { ok: false, error: "Failed to process email action" },
            { status: 500 }
        );
    }
}

export async function GET(req: Request) {
    try {
        const { workspaceId } = await getWorkspaceFromRequest(req);

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: {
                name: true,
                senderName: true,
                senderEmail: true,
                senderReplyTo: true,
                sendingDomain: true,
                sendingDomainStatus: true,
            },
        });

        if (!workspace) {
            return jsonError("Workspace not found", 404);
        }

        return NextResponse.json({
            ok: true,
            sender: {
                companyName: workspace.name || "Your company",
                senderName: workspace.senderName || "Team",
                senderEmail: workspace.senderEmail || null,
                replyTo: workspace.senderReplyTo || null,
                sendingDomain: workspace.sendingDomain || null,
                verified: isVerifiedStatus(workspace.sendingDomainStatus),
            },
        });
    } catch (e: any) {
        if (e instanceof AuthError) {
            return jsonError(e.message, e.status);
        }

        console.error("EMAIL SETTINGS ERROR:", e);

        return NextResponse.json(
            { ok: false, error: "Failed to load email sender settings" },
            { status: 500 }
        );
    }
}