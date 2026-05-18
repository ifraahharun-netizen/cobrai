import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/stripe";

import {
    AuthError,
    getWorkspaceFromRequest,
} from "@/lib/auth/getWorkspaceFromRequest";

export const runtime = "nodejs";

function jsonError(
    message: string,
    status = 400,
    code?: string
) {
    return NextResponse.json(
        {
            ok: false,
            error: message,
            ...(code ? { code } : {}),
        },
        { status }
    );
}

function normalizeText(value: unknown) {
    return typeof value === "string"
        ? value.trim()
        : "";
}

function getAppUrl() {
    return (
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.NEXT_PUBLIC_SITE_URL ||
        "http://localhost:3000"
    ).replace(/\/$/, "");
}

async function createTimelineEvent(args: {
    workspaceId: string;
    customerId: string;

    type: string;
    title: string;
    description?: string;

    severity?: string;
    source?: string;

    metadata?: any;
}) {
    await prisma.accountTimelineEvent.create({
        data: {
            workspaceId: args.workspaceId,
            customerId: args.customerId,

            type: args.type,
            title: args.title,

            description:
                args.description || null,

            severity:
                args.severity || "info",

            source:
                args.source || "automation",

            metadata:
                args.metadata || {},

            createdAt: new Date(),
        },
    });
}

export async function POST(req: Request) {
    try {
        const { workspaceId } =
            await getWorkspaceFromRequest(req);

        const workspace =
            await prisma.workspace.findUnique({
                where: {
                    id: workspaceId,
                },

                select: {
                    id: true,
                    tier: true,
                },
            });

        if (!workspace) {
            return jsonError(
                "Workspace not found",
                404
            );
        }

        if (workspace.tier !== "pro") {
            return jsonError(
                "Retry payment is available on Pro.",
                403,
                "PRO_FEATURE_REQUIRED"
            );
        }

        const raw =
            await req
                .json()
                .catch(() => null);

        if (
            !raw ||
            typeof raw !== "object"
        ) {
            return jsonError(
                "Invalid request body",
                400
            );
        }

        const customerId =
            normalizeText(
                (raw as any).customerId
            );

        const accountId =
            normalizeText(
                (raw as any).accountId
            );

        if (
            !customerId &&
            !accountId
        ) {
            return jsonError(
                "Missing customerId or accountId",
                400
            );
        }

        let linkedCustomerId:
            | string
            | null =
            customerId || null;

        let companyName:
            | string
            | null =
            null;

        if (accountId) {
            const risk =
                await prisma.accountRisk.findFirst(
                    {
                        where: {
                            id: accountId,
                            workspaceId,
                        },

                        include: {
                            customer: {
                                select: {
                                    id: true,
                                    name: true,
                                },
                            },
                        },
                    }
                );

            if (!risk) {
                return jsonError(
                    "Account not found",
                    404
                );
            }

            linkedCustomerId =
                risk.customerId ||
                risk.customer?.id ||
                linkedCustomerId;

            companyName =
                risk.customer?.name ||
                risk.companyName ||
                null;
        }

        if (!linkedCustomerId) {
            return jsonError(
                "No linked customer found for retry payment",
                400
            );
        }

        const customer =
            await prisma.customer.findFirst(
                {
                    where: {
                        id: linkedCustomerId,
                        workspaceId,
                    },

                    select: {
                        id: true,
                        name: true,
                        email: true,
                        mrr: true,
                        status: true,
                        stripeCustomerId: true,
                    },
                }
            );

        if (!customer) {
            return jsonError(
                "Customer not found",
                404
            );
        }

        if (
            !customer.stripeCustomerId
        ) {
            return jsonError(
                "This customer is not linked to Stripe.",
                400,
                "MISSING_STRIPE_CUSTOMER"
            );
        }

        if (
            !customer.stripeCustomerId
        ) {
            return jsonError(
                "This customer is not linked to Stripe.",
                400,
                "MISSING_STRIPE_CUSTOMER"
            );
        }

        const recentRetry =
            await prisma.actionExecution.findFirst({
                where: {
                    workspaceId,

                    customerId:
                        customer.id,

                    actionType:
                        "retry_payment",

                    createdAt: {
                        gte: new Date(
                            Date.now() -
                            1000 * 60 * 15
                        ),
                    },
                },

                select: {
                    id: true,
                    createdAt: true,
                },
            });

        if (recentRetry) {
            return jsonError(
                "Retry payment flow was already started recently.",
                429,
                "RETRY_ALREADY_STARTED"
            );
        }

        const stripe =
            getStripeClient();

        const appUrl =
            getAppUrl();

        const portalSession =
            await stripe.billingPortal.sessions.create(
                {
                    customer:
                        customer.stripeCustomerId,

                    return_url: `${appUrl}/dashboard/accounts-at-risk`,

                    flow_data: {
                        type:
                            "payment_method_update",

                        after_completion:
                        {
                            type: "redirect",

                            redirect: {
                                return_url: `${appUrl}/dashboard/accounts-at-risk`,
                            },
                        },
                    },
                }
            );

        const actionExecution =
            await prisma.actionExecution.create(
                {
                    data: {
                        workspaceId,

                        customerId:
                            customer.id,

                        accountRiskId:
                            accountId ||
                            null,

                        actionType:
                            "retry_payment",

                        channel:
                            "stripe",

                        title:
                            companyName
                                ? `${companyName} payment retry`
                                : `${customer.name || "Customer"} payment retry`,

                        subject:
                            "Retry payment",

                        body:
                            "Stripe payment update link created.",

                        status:
                            "pending",

                        metadata:
                            {
                                customerEmail:
                                    customer.email,

                                customerStatus:
                                    customer.status,

                                mrr:
                                    customer.mrr,

                                stripeCustomerId:
                                    customer.stripeCustomerId,

                                portalSessionId:
                                    portalSession.id,

                                source:
                                    "dashboard",
                            } as any,
                    },
                }
            );

        await createTimelineEvent({
            workspaceId,
            customerId:
                customer.id,

            type:
                "billing_recovery_started",

            title:
                "Retry payment started",

            description:
                "Stripe billing recovery flow was initiated by Cobrai.",

            severity:
                "warning",

            source:
                "automation",

            metadata: {
                actionExecutionId:
                    actionExecution.id,

                stripeCustomerId:
                    customer.stripeCustomerId,

                portalSessionId:
                    portalSession.id,

                customerEmail:
                    customer.email,

                mrr:
                    customer.mrr,
            },
        });

        await prisma.accountRisk.updateMany(
            {
                where: {
                    customerId:
                        customer.id,

                    workspaceId,
                },

                data: {
                    updatedAt:
                        new Date(),
                },
            }
        );

        return NextResponse.json({
            ok: true,

            message:
                "Stripe retry payment link created.",

            url: portalSession.url,
        });
    } catch (e: any) {
        if (e instanceof AuthError) {
            return jsonError(
                e.message,
                e.status
            );
        }

        console.error(
            "RETRY PAYMENT ERROR:",
            e
        );

        return NextResponse.json(
            {
                ok: false,
                error:
                    "Failed to process retry payment action",
            },
            {
                status: 500,
            }
        );
    }
}