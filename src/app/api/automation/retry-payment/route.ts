import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthError, getWorkspaceFromRequest } from "@/lib/auth/getWorkspaceFromRequest";

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

export async function POST(req: Request) {
    try {
        const { workspaceId } = await getWorkspaceFromRequest(req);

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: {
                id: true,
                tier: true,
            },
        });

        if (!workspace) {
            return jsonError("Workspace not found", 404);
        }

        if (workspace.tier !== "pro") {
            return jsonError(
                "Retry payment is available on Pro.",
                403,
                "PRO_FEATURE_REQUIRED"
            );
        }

        const raw = await req.json().catch(() => null);
        if (!raw || typeof raw !== "object") {
            return jsonError("Invalid request body", 400);
        }

        const customerId = normalizeText((raw as any).customerId);
        const accountId = normalizeText((raw as any).accountId);

        if (!customerId && !accountId) {
            return jsonError("Missing customerId or accountId", 400);
        }

        let linkedCustomerId: string | null = customerId || null;
        let companyName: string | null = null;

        if (accountId) {
            const risk = await prisma.accountRisk.findFirst({
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
            });

            if (!risk) {
                return jsonError("Account not found", 404);
            }

            linkedCustomerId = risk.customerId || risk.customer?.id || linkedCustomerId;
            companyName = risk.customer?.name || risk.companyName || null;
        }

        if (!linkedCustomerId) {
            return jsonError("No linked customer found for retry payment", 400);
        }

        const customer = await prisma.customer.findFirst({
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
            },
        });

        if (!customer) {
            return jsonError("Customer not found", 404);
        }

        await prisma.actionExecution.create({
            data: {
                workspaceId,
                customerId: customer.id,
                accountRiskId: accountId || null,
                actionType: "retry_payment",
                channel: "manual",
                title: companyName ? `${companyName} payment retry` : "Payment retry",
                subject: "Retry payment",
                body: "Manual retry payment action requested.",
                status: "pending",
                metadata: {
                    customerEmail: customer.email,
                    customerStatus: customer.status,
                    mrr: customer.mrr,
                    source: "dashboard",
                } as any,
            },
        });

        return NextResponse.json({
            ok: true,
            message: "Retry payment action created.",
        });
    } catch (e: any) {
        if (e instanceof AuthError) {
            return jsonError(e.message, e.status);
        }

        console.error("RETRY PAYMENT ERROR:", e);

        return NextResponse.json(
            { ok: false, error: "Failed to process retry payment action" },
            { status: 500 }
        );
    }
}