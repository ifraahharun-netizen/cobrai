import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

import { prisma } from "@/lib/prisma";

function verifySignature(payload: string, signature: string | null) {
    const secret = process.env.RESEND_WEBHOOK_SECRET;

    if (!secret || !signature) return false;

    const expected = crypto
        .createHmac("sha256", secret)
        .update(payload)
        .digest("hex");

    return crypto.timingSafeEqual(
        Buffer.from(expected),
        Buffer.from(signature)
    );
}

async function reduceCustomerRisk(customerId: string, amount = 0.08) {
    const customer = await prisma.customer.findUnique({
        where: { id: customerId },
        select: {
            churnRisk: true,
        },
    });

    if (!customer) return null;

    const before = Math.round(Number(customer.churnRisk || 0) * 100);

    const reduced = Math.max(
        0.05,
        Number(customer.churnRisk || 0) - amount
    );

    await prisma.customer.update({
        where: { id: customerId },
        data: {
            churnRisk: reduced,
        },
    });

    return {
        before,
        after: Math.round(reduced * 100),
    };
}

export async function POST(req: NextRequest) {
    try {
        const rawBody = await req.text();

        const signature =
            req.headers.get("x-resend-signature") ||
            req.headers.get("resend-signature");

        const valid = verifySignature(rawBody, signature);

        if (!valid) {
            return NextResponse.json(
                { ok: false, error: "Invalid signature" },
                { status: 401 }
            );
        }

        const body = JSON.parse(rawBody);

        const eventType = body.type;
        const data = body.data || {};

        const providerEventId =
            data.email_id ||
            data.id ||
            crypto.randomUUID();

        const existing = await prisma.providerEvent.findUnique({
            where: {
                externalId: providerEventId,
            },
        });

        if (existing) {
            return NextResponse.json({
                ok: true,
                duplicate: true,
            });
        }

        await prisma.providerEvent.create({
            data: {
                provider: "resend",
                externalId: providerEventId,
                type: eventType,
                payload: body,
                processedAt: new Date(),
            },
        });

        const emailId =
            data.email_id ||
            data.emailId ||
            data.id;

        if (!emailId) {
            return NextResponse.json({
                ok: true,
                skipped: "No email ID",
            });
        }

        const execution = await prisma.actionExecution.findFirst({
            where: {
                providerMessageId: emailId,
            },
            include: {
                customer: true,
            },
        });

        if (!execution) {
            return NextResponse.json({
                ok: true,
                skipped: "No matching execution",
            });
        }

        const customerId = execution.customerId;
        const workspaceId = execution.workspaceId;

        if (!customerId || !workspaceId) {
            return NextResponse.json({
                ok: true,
                skipped: "Missing customer/workspace",
            });
        }

        if (eventType === "email.opened") {
            await prisma.actionExecution.update({
                where: {
                    id: execution.id,
                },
                data: {
                    openedAt: new Date(),
                    status: "opened",
                },
            });

            const riskDelta = await reduceCustomerRisk(customerId, 0.08);

            await prisma.actionOutcomeSnapshot.create({
                data: {
                    workspaceId,
                    actionExecutionId: execution.id,
                    wasOpened: true,
                    riskScoreBefore: riskDelta?.before ?? null,
                    riskScoreAfter: riskDelta?.after ?? null,
                    outcomeLabel: "email_opened",
                    metadata: {
                        providerEventId,
                        emailId,
                    } as any,
                },
            });

            await prisma.accountTimelineEvent.create({
                data: {
                    workspaceId,
                    customerId,
                    type: "reengagement_email_opened",
                    title: "Customer opened outreach email",
                    description:
                        "The customer opened the retention email shortly after delivery.",
                    severity: "success",
                    source: "resend",
                    providerEventId,
                    metadata: {
                        emailId,
                    },
                },
            });
        }

        if (eventType === "email.clicked") {
            await prisma.actionExecution.update({
                where: {
                    id: execution.id,
                },
                data: {
                    clickedAt: new Date(),
                    status: "clicked",
                },
            });

            const riskDelta = await reduceCustomerRisk(customerId, 0.12);

            await prisma.actionOutcomeSnapshot.create({
                data: {
                    workspaceId,
                    actionExecutionId: execution.id,
                    wasClicked: true,
                    riskScoreBefore: riskDelta?.before ?? null,
                    riskScoreAfter: riskDelta?.after ?? null,
                    outcomeLabel: "email_clicked",
                    metadata: {
                        providerEventId,
                        emailId,
                    } as any,
                },
            });

            await prisma.accountTimelineEvent.create({
                data: {
                    workspaceId,
                    customerId,
                    type: "email_clicked",
                    title: "Customer clicked retention email",
                    description:
                        "The customer interacted with a retention email CTA.",
                    severity: "success",
                    source: "resend",
                    providerEventId,
                    metadata: {
                        emailId,
                    },
                },
            });
        }

        if (eventType === "email.delivered") {
            await prisma.actionExecution.update({
                where: {
                    id: execution.id,
                },
                data: {
                    status: "delivered",
                },
            });
        }

        if (eventType === "email.bounced") {
            await prisma.actionExecution.update({
                where: {
                    id: execution.id,
                },
                data: {
                    status: "bounced",
                    outcomeAt: new Date(),
                },
            });

            await prisma.actionOutcomeSnapshot.create({
                data: {
                    workspaceId,
                    actionExecutionId: execution.id,
                    outcomeLabel: "email_bounced",
                    metadata: {
                        providerEventId,
                        emailId,
                    } as any,
                },
            });

            await prisma.accountTimelineEvent.create({
                data: {
                    workspaceId,
                    customerId,
                    type: "email_bounced",
                    title: "Retention email bounced",
                    description:
                        "The retention email could not be delivered to the customer.",
                    severity: "danger",
                    source: "resend",
                    providerEventId,
                    metadata: {
                        emailId,
                    },
                },
            });
        }

        return NextResponse.json({
            ok: true,
        });
    } catch (error) {
        console.error("RESEND WEBHOOK ERROR:", error);

        return NextResponse.json(
            {
                ok: false,
                error: "Webhook processing failed",
            },
            { status: 500 }
        );
    }
}