import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getWorkspaceIdFromRequest } from "@/lib/workspace.server";
import { getDemoCustomers } from "@/lib/demo/customers";

type RiskLevel = "critical" | "high" | "medium" | "low";

function riskLevelFromScore(score: number): RiskLevel {
    if (score >= 85) return "critical";
    if (score >= 70) return "high";
    if (score >= 50) return "medium";
    return "low";
}

function formatMoney(value: number) {
    return `£${Number(value || 0).toLocaleString(undefined, {
        maximumFractionDigits: 0,
    })}`;
}

function reasonFromScore(score: number, status?: string | null) {
    const s = String(status || "").toLowerCase();

    if (s.includes("billing") || s.includes("payment") || s.includes("invoice")) {
        return "Billing issue";
    }

    if (score >= 85) return "High churn risk detected";
    if (score >= 70) return "Usage dropped";
    if (score >= 50) return "Reduced product activity";
    if (score >= 35) return "Light engagement";

    return "Healthy usage";
}

function actionFromScore(score: number, reason: string) {
    const r = reason.toLowerCase();

    if (r.includes("billing") || r.includes("payment") || r.includes("invoice")) {
        return "Confirm billing contact and resolve payment today.";
    }

    if (score >= 85) {
        return "Send a personal check-in and offer a quick walkthrough.";
    }

    if (score >= 70) {
        return "Send a value recap and suggest a success call.";
    }

    if (score >= 50) {
        return "Highlight unused features and offer setup support.";
    }

    return "Maintain normal check-in cadence.";
}

function eventLabelFromType(type: string) {
    const t = String(type || "").toLowerCase();

    if (t === "payment_successful" || t === "invoice_paid") return "Payment successful";
    if (t === "payment_failed" || t === "invoice_failed") return "Payment failed";
    if (t === "billing_issue_detected") return "Billing issue detected";
    if (t === "billing_recovery_email_sent") return "Billing recovery email sent";
    if (t === "reengagement_email_sent") return "Re-engagement email sent";
    if (t === "checkin_email_sent") return "Customer check-in email sent";
    if (t === "plan_upgraded") return "Plan upgraded";
    if (t === "risk_increased") return "Risk score increased";
    if (t === "risk_decreased") return "Risk score decreased";
    if (t === "usage_dropped") return "Usage dropped";
    if (t === "account_reviewed") return "Customer health reviewed by Cobrai";

    return t.replaceAll("_", " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function actionLabelFromType(type: string, fallback?: string | null) {
    const t = String(type || "").toLowerCase();

    if (fallback) return fallback;
    if (t === "billing_recovery_email") return "Billing recovery email sent";
    if (t === "reengagement_email") return "Re-engagement email sent";
    if (t === "checkin_email") return "Customer check-in email sent";

    return "Retention action sent";
}

function makeDemoResponse(id: string) {
    const customer = getDemoCustomers().find((c) => c.id === id);

    if (!customer) return null;

    const riskScore = Number(customer.riskScore ?? customer.churnRisk ?? 0);
    const previousRiskScore = Math.max(0, riskScore - 6);
    const riskDelta = riskScore - previousRiskScore;
    const reasonLabel = reasonFromScore(riskScore, customer.status);
    const nextAction = actionFromScore(riskScore, reasonLabel);

    const now = new Date();

    const demoActivity = [
        {
            id: "demo-review",
            type: "account_reviewed",
            label: "Customer health reviewed by Cobrai",
            date: now.toISOString(),
        },
        {
            id: "demo-payment",
            type: reasonLabel.toLowerCase().includes("billing")
                ? "payment_failed"
                : "payment_successful",
            label: reasonLabel.toLowerCase().includes("billing")
                ? `Payment failed for ${formatMoney(customer.mrr ?? 0)}`
                : `Payment successful for ${formatMoney(customer.mrr ?? 0)}`,
            date: "2026-04-15T11:00:00.000Z",
        },
        {
            id: "demo-risk",
            type: reasonLabel.toLowerCase().includes("billing")
                ? "billing_issue_detected"
                : "usage_dropped",
            label: reasonLabel,
            date: "2026-04-14T10:00:00.000Z",
        },
    ];

    return {
        ok: true,
        row: {
            id: customer.id,
            customerId: customer.id,
            companyName: customer.name,
            email: customer.email || undefined,
            riskScore,
            previousRiskScore,
            riskLevel: riskLevelFromScore(riskScore),
            riskDelta,
            riskTrend: riskDelta > 0 ? "up" : riskDelta < 0 ? "down" : "flat",
            reasonKey: reasonLabel.toLowerCase().replaceAll(" ", "_"),
            reasonLabel,
            status: customer.status || "Active",
            lastActiveAt: customer.lastActiveAt,
            nextAction,
            mrr: customer.mrr ?? 0,
            updatedAt: now.toISOString(),
            isDemo: true,
        },
        customerId: customer.id,
        profile: {
            companyName: customer.name,
            email: customer.email || undefined,
            plan: customer.plan || "—",
            createdAt: customer.createdAt,
            startDate: customer.createdAt,
            nextBillingAt: "2026-05-15T10:00:00.000Z",
            paymentHistory: [
                {
                    label: reasonLabel.toLowerCase().includes("billing")
                        ? "Payment needs attention"
                        : "Latest subscription payment",
                    at: "2026-04-15T10:00:00.000Z",
                    amount: customer.mrr ?? 0,
                    status: reasonLabel.toLowerCase().includes("billing") ? "failed" : "paid",
                },
            ],
            supportHistory: [
                {
                    label: "Customer health reviewed by Cobrai",
                    at: now.toISOString(),
                    channel: "system",
                    status: "completed",
                },
            ],
        },
        activity: demoActivity,
        ai: {
            headline: `${customer.name} needs attention`,
            summary: reasonLabel,
            confidence: riskScore,
            drivers: [reasonLabel],
            whyAtRisk: [reasonLabel],
            recommendation: nextAction,
            nextBestAction: nextAction,
            automationSuggestion: nextAction,
        },
    };
}

export async function GET(
    req: Request,
    ctx: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await ctx.params;

        if (!id) {
            return NextResponse.json(
                { ok: false, error: "Missing account id" },
                { status: 400 }
            );
        }

        const demoResponse = makeDemoResponse(id);

        if (demoResponse) {
            return NextResponse.json(demoResponse);
        }

        const workspaceId = await getWorkspaceIdFromRequest(req);

        let risk = await prisma.accountRisk.findFirst({
            where: {
                workspaceId,
                OR: [{ customerId: id }, { id }],
            },
            select: {
                id: true,
                customerId: true,
                companyName: true,
                riskScore: true,
                previousRiskScore: true,
                reasonKey: true,
                reasonLabel: true,
                mrr: true,
                updatedAt: true,
                createdAt: true,
            },
        });

        let customer = risk?.customerId
            ? await prisma.customer.findFirst({
                where: {
                    id: risk.customerId,
                    workspaceId,
                },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    mrr: true,
                    status: true,
                    plan: true,
                    createdAt: true,
                    updatedAt: true,
                    lastActiveAt: true,
                },
            })
            : null;

        if (!risk && !customer) {
            customer = await prisma.customer.findFirst({
                where: {
                    id,
                    workspaceId,
                },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    mrr: true,
                    status: true,
                    plan: true,
                    createdAt: true,
                    updatedAt: true,
                    lastActiveAt: true,
                },
            });

            if (customer) {
                risk = await prisma.accountRisk.findFirst({
                    where: {
                        workspaceId,
                        customerId: customer.id,
                    },
                    select: {
                        id: true,
                        customerId: true,
                        companyName: true,
                        riskScore: true,
                        previousRiskScore: true,
                        reasonKey: true,
                        reasonLabel: true,
                        mrr: true,
                        updatedAt: true,
                        createdAt: true,
                    },
                });
            }
        }

        if (!risk && !customer) {
            return NextResponse.json(
                { ok: false, error: "Account not found" },
                { status: 404 }
            );
        }

        const customerId = customer?.id || risk?.customerId || null;
        const accountRiskId = risk?.id || null;

        const riskScore =
            typeof risk?.riskScore === "number"
                ? risk.riskScore
                : Math.max(
                    0,
                    Math.min(
                        100,
                        Math.round(
                            typeof customer?.mrr === "number" && customer.mrr > 0 ? 50 : 0
                        )
                    )
                );

        const previousRiskScore =
            typeof risk?.previousRiskScore === "number"
                ? risk.previousRiskScore
                : riskScore;

        const riskDelta = riskScore - previousRiskScore;
        const reasonLabel =
            risk?.reasonLabel ||
            reasonFromScore(riskScore, customer?.status || "active");

        const reasonLower = reasonLabel.toLowerCase();

        const nextAction =
            risk?.reasonKey === "payment_risk" ||
                risk?.reasonKey === "billing_risk" ||
                reasonLower.includes("billing") ||
                reasonLower.includes("payment") ||
                reasonLower.includes("invoice")
                ? "Send billing recovery email"
                : risk?.reasonKey === "no_activity" ||
                    risk?.reasonKey === "usage_drop" ||
                    reasonLower.includes("usage") ||
                    reasonLower.includes("activity")
                    ? "Send re-engagement email"
                    : "Review account";

        const [invoices, events, actionExecutions] = await Promise.all([
            customerId
                ? prisma.invoice.findMany({
                    where: {
                        workspaceId,
                        customerId,
                    },
                    orderBy: { dueAt: "desc" },
                    take: 30,
                    select: {
                        id: true,
                        status: true,
                        amount: true,
                        dueAt: true,
                        paidAt: true,
                    },
                })
                : Promise.resolve([]),

            customerId
                ? prisma.event.findMany({
                    where: {
                        workspaceId,
                        customerId,
                    },
                    orderBy: { occurredAt: "desc" },
                    take: 30,
                    select: {
                        id: true,
                        type: true,
                        occurredAt: true,
                        value: true,
                    },
                })
                : Promise.resolve([]),

            prisma.actionExecution.findMany({
                where: {
                    workspaceId,
                    OR: [
                        ...(customerId ? [{ customerId }] : []),
                        ...(accountRiskId ? [{ accountRiskId }] : []),
                        ...(id ? [{ accountRiskId: id }] : []),
                    ],
                },
                orderBy: { createdAt: "desc" },
                take: 30,
                select: {
                    id: true,
                    actionType: true,
                    channel: true,
                    title: true,
                    status: true,
                    subject: true,
                    sentAt: true,
                    createdAt: true,
                },
            }),
        ]);

        const paymentHistory = invoices.map((invoice) => ({
            label:
                invoice.status === "paid"
                    ? "Payment successful"
                    : `Payment ${invoice.status.replaceAll("_", " ")}`,
            at: (invoice.paidAt || invoice.dueAt).toISOString(),
            amount: invoice.amount,
            status: invoice.status,
        }));

        const supportHistory = [
            ...events.map((event) => ({
                label: eventLabelFromType(event.type),
                at: event.occurredAt.toISOString(),
                channel: "system",
                status: "completed",
            })),
            ...actionExecutions.map((action) => ({
                label: actionLabelFromType(action.actionType, action.subject || action.title),
                at: (action.sentAt || action.createdAt).toISOString(),
                channel: action.channel || "system",
                status: action.status,
            })),
        ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

        const activity = [
            ...invoices.map((invoice) => {
                const normalized = invoice.status.toLowerCase();
                const isPaid = normalized === "paid" || Boolean(invoice.paidAt);

                return {
                    id: `invoice-${invoice.id}`,
                    type: isPaid ? "payment_successful" : "payment_failed",
                    label: isPaid
                        ? `Payment successful for ${formatMoney(invoice.amount)}`
                        : `Payment ${invoice.status.replaceAll("_", " ")} for ${formatMoney(
                            invoice.amount
                        )}`,
                    date: (invoice.paidAt || invoice.dueAt).toISOString(),
                };
            }),

            ...events.map((event) => ({
                id: `event-${event.id}`,
                type: event.type,
                label:
                    typeof event.value === "number"
                        ? `${eventLabelFromType(event.type)} · ${formatMoney(event.value)}`
                        : eventLabelFromType(event.type),
                date: event.occurredAt.toISOString(),
            })),

            ...actionExecutions.map((action) => ({
                id: `action-${action.id}`,
                type: action.actionType,
                label: actionLabelFromType(action.actionType, action.subject || action.title),
                date: (action.sentAt || action.createdAt).toISOString(),
            })),
        ]
            .filter((item) => item.date)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        const companyName = customer?.name || risk?.companyName || "Unknown account";
        const mrr = customer?.mrr ?? risk?.mrr ?? 0;

        return NextResponse.json({
            ok: true,
            row: {
                id: customerId || risk?.id || id,
                accountRiskId: risk?.id || null,
                customerId,
                companyName,
                email: customer?.email || undefined,
                riskScore,
                previousRiskScore,
                riskLevel: riskLevelFromScore(riskScore),
                riskDelta,
                riskTrend: riskDelta > 0 ? "up" : riskDelta < 0 ? "down" : "flat",
                reasonKey: risk?.reasonKey || reasonLabel.toLowerCase().replaceAll(" ", "_"),
                reasonLabel,
                status: customer?.status || "active",
                lastActiveAt: customer?.lastActiveAt?.toISOString() || null,
                nextAction,
                mrr,
                updatedAt:
                    risk?.updatedAt?.toISOString() ||
                    customer?.updatedAt?.toISOString() ||
                    new Date().toISOString(),
                isDemo: false,
            },
            customerId: customerId || risk?.id || id,
            profile: {
                companyName,
                email: customer?.email || undefined,
                plan: customer?.plan || "—",
                createdAt:
                    customer?.createdAt?.toISOString() ||
                    risk?.createdAt?.toISOString() ||
                    risk?.updatedAt?.toISOString() ||
                    new Date().toISOString(),
                startDate:
                    customer?.createdAt?.toISOString() ||
                    risk?.createdAt?.toISOString() ||
                    risk?.updatedAt?.toISOString() ||
                    new Date().toISOString(),
                nextBillingAt: invoices[0]?.dueAt?.toISOString() || null,
                paymentHistory,
                supportHistory,
            },
            activity,
            ai: {
                headline: `${companyName} needs attention`,
                summary: reasonLabel,
                confidence: riskScore,
                drivers: [reasonLabel],
                whyAtRisk: [reasonLabel],
                recommendation: nextAction,
                nextBestAction: nextAction,
                automationSuggestion: nextAction,
            },
        });
    } catch (e: any) {
        console.error("GET /api/dashboard/accounts-at-risk/[id] error:", e);

        return NextResponse.json(
            { ok: false, error: e?.message || "Failed to load account" },
            { status: 500 }
        );
    }
}