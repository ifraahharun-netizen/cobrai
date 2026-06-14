import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
    AuthError,
    getWorkspaceFromRequest,
} from "@/lib/auth/getWorkspaceFromRequest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status = 400, code?: string) {
    return NextResponse.json(
        { ok: false, error: message, ...(code ? { code } : {}) },
        { status }
    );
}

function normalizeText(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function getActionType(type: string, action: string) {
    const value = `${type} ${action}`.toLowerCase();

    if (
        value.includes("upsell") ||
        value.includes("expansion") ||
        value.includes("upgrade")
    ) {
        return "expansion_email";
    }

    if (
        value.includes("reactivation") ||
        value.includes("re-engagement") ||
        value.includes("inactive")
    ) {
        return "reengagement_email";
    }

    if (
        value.includes("billing") ||
        value.includes("payment") ||
        value.includes("invoice")
    ) {
        return "billing_recovery_email";
    }

    return "checkin_email";
}

export async function POST(req: Request) {
    try {
        const { workspaceId } = await getWorkspaceFromRequest(req);

        const raw = await req.json().catch(() => null);

        if (!raw || typeof raw !== "object") {
            return jsonError("Invalid request body", 400);
        }

        const customerId = normalizeText((raw as any).customerId);
        const accountRiskId = normalizeText((raw as any).accountRiskId);
        const accountName = normalizeText((raw as any).accountName);
        const type = normalizeText((raw as any).type);
        const action = normalizeText((raw as any).action);
        const reason = normalizeText((raw as any).reason);
        const valueMinor = Number((raw as any).valueMinor || 0);
        const confidence = Number((raw as any).confidence || 0);

        if (!customerId && !accountRiskId) {
            return jsonError("Missing customerId or accountRiskId", 400);
        }

        if (!action) {
            return jsonError("Missing action", 400);
        }

        let linkedCustomerId: string | null = customerId || null;
        let linkedAccountRiskId: string | null = accountRiskId || null;
        let customerName = accountName || null;
        let riskScoreBefore: number | null = null;
        let mrrBefore: number | null = null;
        let churnRiskBefore: number | null = null;

        if (accountRiskId) {
            const risk = await prisma.accountRisk.findFirst({
                where: {
                    id: accountRiskId,
                    workspaceId,
                },
                include: {
                    customer: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            mrr: true,
                            churnRisk: true,
                        },
                    },
                },
            });

            if (risk) {
                linkedCustomerId = risk.customerId || risk.customer?.id || linkedCustomerId;
                linkedAccountRiskId = risk.id;
                customerName = risk.customer?.name || risk.companyName || customerName;
                riskScoreBefore = risk.riskScore ?? null;
                mrrBefore = typeof risk.customer?.mrr === "number" ? risk.customer.mrr : null;
                churnRiskBefore =
                    typeof risk.customer?.churnRisk === "number"
                        ? Math.round(risk.customer.churnRisk)
                        : null;
            }
        }

        if (linkedCustomerId && mrrBefore === null) {
            const customer = await prisma.customer.findFirst({
                where: {
                    id: linkedCustomerId,
                    workspaceId,
                },
                select: {
                    id: true,
                    name: true,
                    mrr: true,
                    churnRisk: true,
                },
            });

            if (customer) {
                customerName = customer.name || customerName;
                mrrBefore = typeof customer.mrr === "number" ? customer.mrr : null;
                churnRiskBefore =
                    typeof customer.churnRisk === "number"
                        ? Math.round(customer.churnRisk)
                        : null;
            }
        }

        const recentDuplicate = await prisma.actionExecution.findFirst({
            where: {
                workspaceId,
                customerId: linkedCustomerId || undefined,
                title: action,
                createdAt: {
                    gte: new Date(Date.now() - 1000 * 60 * 10),
                },
            },
            select: {
                id: true,
            },
        });

        if (recentDuplicate) {
            return jsonError(
                "This action was already started recently.",
                429,
                "ACTION_ALREADY_STARTED"
            );
        }

        const actionType = getActionType(type, action);
        const safeValueMinor = Number.isFinite(valueMinor) ? Math.round(valueMinor) : 0;
        const safeConfidence =
            Number.isFinite(confidence) && confidence > 0
                ? Math.round(confidence)
                : null;

        const actionExecution = await prisma.actionExecution.create({
            data: {
                workspaceId,
                customerId: linkedCustomerId,
                accountRiskId: linkedAccountRiskId,
                actionType,
                channel: "manual",
                title: action,
                reason,
                aiConfidence: safeConfidence,
                status: "pending",
                metadata: {
                    source: "revenue_recovery_queue",
                    accountName: customerName,
                    queueType: type || null,
                    valueMinor: safeValueMinor,
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
                retainedRevenueMinor: null,
                outcomeLabel: "action_started",
                metadata: {
                    source: "revenue_recovery_queue",
                    accountName: customerName,
                    queueType: type || null,
                    valueMinor: safeValueMinor,
                } as any,
            },
        });

        if (linkedCustomerId) {
            await prisma.accountTimelineEvent.create({
                data: {
                    workspaceId,
                    customerId: linkedCustomerId,
                    type: "retention_action_started",
                    title: "Retention action started",
                    description: action,
                    severity: "info",
                    source: "automation",
                    metadata: {
                        actionExecutionId: actionExecution.id,
                        reason,
                        queueType: type || null,
                        actionType,
                        valueMinor: safeValueMinor,
                    } as any,
                },
            });
        }

        
        return NextResponse.json({
            ok: true,
            actionExecutionId: actionExecution.id,
        });
    } catch (e: any) {
        if (e instanceof AuthError) {
            return jsonError(e.message, e.status);
        }

        console.error("EXECUTE ACTION ERROR:", e);

        return NextResponse.json(
            { ok: false, error: "Failed to execute retention action" },
            { status: 500 }
        );
    }
}