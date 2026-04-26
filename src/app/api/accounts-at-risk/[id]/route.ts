import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthError, getWorkspaceFromRequest } from "@/lib/auth/getWorkspaceFromRequest";

type RecommendedAction = {
    key: "billing" | "inactive" | "checkin";
    label: string;
    reason: string;
    automationLabel: string;
};

type RiskLevel = "critical" | "high" | "medium" | "low";

function formatMoney(value: number) {
    return `£${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function riskLevelFromScore(score: number): RiskLevel {
    if (score >= 85) return "critical";
    if (score >= 70) return "high";
    if (score >= 50) return "medium";
    return "low";
}

function scoreDeltaPct(current: number, previous: number) {
    if (!previous) return current ? 100 : 0;
    return Number((((current - previous) / previous) * 100).toFixed(1));
}

function buildSignals(args: {
    status?: string | null;
    lastActiveAt?: Date | null;
    recentFailedInvoices?: number;
    recentOverdueInvoices?: number;
}) {
    const signals: Array<{ key: string; label: string }> = [];
    const now = Date.now();

    if (typeof args.recentFailedInvoices === "number" && args.recentFailedInvoices > 0) {
        signals.push({ key: "billing_failed", label: "Payment failed" });
    }

    if (typeof args.recentOverdueInvoices === "number" && args.recentOverdueInvoices > 0) {
        signals.push({ key: "invoice_overdue", label: "Invoice overdue" });
    }

    if (args.lastActiveAt) {
        const days = Math.max(0, Math.floor((now - args.lastActiveAt.getTime()) / 86400000));
        if (days >= 30) {
            signals.push({ key: "inactive_30d", label: "Inactive 30+ days" });
        } else if (days >= 14) {
            signals.push({ key: "inactive_14d", label: "Low recent activity" });
        }
    }

    if ((args.status || "").toLowerCase() === "past_due") {
        signals.push({ key: "past_due", label: "Past due" });
    }

    return signals.slice(0, 3);
}

function nextActionFromReason(reasonKey: string, signals: Array<{ key: string; label: string }>) {
    const key = (reasonKey || "").toLowerCase();
    const signalKeys = signals.map((s) => s.key);

    if (key.includes("billing") || signalKeys.includes("billing_failed") || signalKeys.includes("invoice_overdue")) {
        return "Send billing recovery email";
    }

    if (key.includes("inactive") || signalKeys.includes("inactive_30d") || signalKeys.includes("inactive_14d")) {
        return "Send re-engagement email";
    }

    return "Send check-in email";
}

function buildAiSummary(args: {
    reasonLabel: string;
    riskScore: number;
    lastActiveAt?: Date | null;
    status?: string | null;
    paymentHistory?: Array<{ status?: string | null; label?: string | null }>;
    nextAction?: string | null;
    mrr?: number | null;
}) {
    const whyAtRisk: string[] = [];
    const drivers: string[] = [];
    const recommendedActions: RecommendedAction[] = [];

    const reasonLabel = args.reasonLabel || "";
    const riskScore = args.riskScore || 0;
    const reason = reasonLabel.toLowerCase();
    const status = (args.status || "").toLowerCase();
    const mrr = Number(args.mrr || 0);

    const inactiveDays = args.lastActiveAt
        ? Math.max(0, Math.floor((Date.now() - args.lastActiveAt.getTime()) / 86400000))
        : 0;

    const paymentFailed = Array.isArray(args.paymentHistory)
        ? args.paymentHistory.some((item) => {
            const itemStatus = (item.status || "").toLowerCase();
            const itemLabel = (item.label || "").toLowerCase();
            return (
                itemStatus.includes("fail") ||
                itemStatus.includes("past_due") ||
                itemLabel.includes("fail") ||
                itemLabel.includes("past due")
            );
        })
        : false;

    if (reasonLabel) {
        whyAtRisk.push(reasonLabel);
        drivers.push(reasonLabel);
    }

    if (typeof riskScore === "number" && riskScore >= 70) {
        whyAtRisk.push("Elevated churn risk score");
        drivers.push("Elevated churn risk score");
    }

    if (inactiveDays >= 14) {
        whyAtRisk.push(`No recent activity in ${inactiveDays} days`);
        drivers.push(`No recent product activity for ${inactiveDays} days`);
    }

    if (paymentFailed || reason.includes("billing") || reason.includes("payment") || status.includes("past due")) {
        drivers.push("Recent billing failure or past-due status detected");
        recommendedActions.push({
            key: "billing",
            label: "Recover failed payment",
            reason: mrr > 0
                ? `Billing failure is the strongest churn driver on ${formatMoney(mrr)} MRR`
                : "Billing failure is the strongest current churn driver",
            automationLabel: "Send billing recovery email",
        });
    }

    if (inactiveDays >= 14 || reason.includes("inactive") || reason.includes("usage")) {
        recommendedActions.push({
            key: "inactive",
            label: "Re-engage account",
            reason: mrr > 0
                ? `Low usage is putting ${formatMoney(mrr)} MRR at risk`
                : "Low usage suggests drop in perceived value",
            automationLabel: "Send re-engagement email",
        });
    }

    if (recommendedActions.length === 0 || riskScore >= 70 || inactiveDays >= 21) {
        recommendedActions.push({
            key: "checkin",
            label: "Schedule human check-in",
            reason: mrr > 0
                ? `Direct outreach can help protect ${formatMoney(mrr)} MRR`
                : "Direct outreach can unblock risk factors faster",
            automationLabel: "Send check-in email",
        });
    }

    const uniqueDrivers = drivers.filter((item, index, arr) => arr.indexOf(item) === index);
    const uniqueActions = recommendedActions.filter(
        (item, index, arr) => arr.findIndex((x) => x.key === item.key) === index
    );

    let recommendation = "Send a proactive check-in email";
    let automationSuggestion = "check_in_email";

    if (uniqueActions[0]?.key === "billing") {
        recommendation = "Send a billing recovery email and confirm payment blockers";
        automationSuggestion = "billing_recovery_email";
    } else if (uniqueActions[0]?.key === "inactive") {
        recommendation = "Send a re-engagement email and offer a short walkthrough";
        automationSuggestion = "re_engagement_email";
    }

    const riskWord =
        riskScore >= 85 ? "critical" : riskScore >= 70 ? "high" : riskScore >= 50 ? "medium" : "low";

    const headline =
        riskScore >= 85
            ? "Critical churn risk detected"
            : riskScore >= 70
                ? "High churn risk detected"
                : "Churn risk detected";

    const summaryParts: string[] = [];

    if (paymentFailed || reason.includes("billing") || reason.includes("payment") || status.includes("past due")) {
        summaryParts.push("a recent billing failure");
    }

    if (inactiveDays >= 14) {
        summaryParts.push(`no product activity for ${inactiveDays} days`);
    }

    const moneyPrefix = mrr > 0 ? `${formatMoney(mrr)} in monthly revenue is currently exposed. ` : "";

    const summary =
        summaryParts.length > 0
            ? `${moneyPrefix}This account is at ${riskWord} risk of churn due to ${summaryParts.join(" and ")}.`
            : `${moneyPrefix}This account is at ${riskWord} risk of churn based on recent account signals.`;

    const confidenceBase =
        (paymentFailed ? 30 : 0) +
        ((reason.includes("billing") || reason.includes("payment")) ? 20 : 0) +
        (inactiveDays >= 14 ? 25 : 0) +
        (inactiveDays >= 21 ? 10 : 0) +
        (riskScore >= 85 ? 10 : riskScore >= 70 ? 5 : 0);

    const confidence = Math.max(55, Math.min(97, confidenceBase));

    const nextBestAction =
        uniqueActions[0]?.label ||
        args.nextAction ||
        "Review this account and confirm the highest-risk signal";

    return {
        whyAtRisk,
        recommendation,
        automationSuggestion,
        headline,
        summary,
        drivers: uniqueDrivers.length
            ? uniqueDrivers
            : ["Multiple churn signals detected across billing, activity, or risk score"],
        confidence,
        recommendedActions: uniqueActions,
        nextBestAction,
    };
}

export async function GET(
    req: Request,
    ctx: { params: Promise<{ id: string }> }
) {
    try {
        const { workspaceId } = await getWorkspaceFromRequest(req);
        const { id } = await ctx.params;

        if (!id) {
            return NextResponse.json({ ok: false, error: "Missing account id" }, { status: 400 });
        }

        const row = await prisma.accountRisk.findFirst({
            where: {
                id,
                workspaceId,
            },
            include: {
                customer: true,
            },
        });

        if (!row) {
            return NextResponse.json(
                { ok: false, error: "Account not found" },
                { status: 404 }
            );
        }

        let customer = row.customer;

        if (!customer && row.customerId) {
            customer = await prisma.customer.findFirst({
                where: {
                    id: row.customerId,
                    workspaceId,
                },
            });
        }

        if (!customer) {
            customer = await prisma.customer.findFirst({
                where: {
                    workspaceId,
                    name: row.companyName,
                },
                orderBy: {
                    createdAt: "desc",
                },
            });
        }

        const [paymentHistoryRows, supportHistoryRows, invoiceGroups, openAction] = await Promise.all([
            customer
                ? prisma.invoice.findMany({
                    where: {
                        workspaceId,
                        customerId: customer.id,
                    },
                    orderBy: [{ dueAt: "desc" }, { paidAt: "desc" }],
                    take: 8,
                    select: {
                        status: true,
                        amount: true,
                        dueAt: true,
                        paidAt: true,
                    },
                })
                : Promise.resolve([]),
            customer
                ? prisma.event.findMany({
                    where: {
                        workspaceId,
                        customerId: customer.id,
                    },
                    orderBy: { occurredAt: "desc" },
                    take: 8,
                    select: {
                        type: true,
                        occurredAt: true,
                    },
                })
                : Promise.resolve([]),
            customer
                ? prisma.invoice.groupBy({
                    by: ["customerId", "status"],
                    where: {
                        workspaceId,
                        customerId: customer.id,
                    },
                    _count: { _all: true },
                })
                : Promise.resolve([]),
            customer
                ? prisma.action.findFirst({
                    where: {
                        workspaceId,
                        customerId: customer.id,
                        done: false,
                    },
                    orderBy: { createdAt: "desc" },
                    select: {
                        title: true,
                    },
                })
                : Promise.resolve(null),
        ]);

        const invoiceInfo = { failed: 0, overdue: 0 };
        for (const item of invoiceGroups) {
            const status = (item.status || "").toLowerCase();
            if (status === "failed") invoiceInfo.failed += item._count._all;
            if (status === "open" || status === "past_due" || status === "overdue") {
                invoiceInfo.overdue += item._count._all;
            }
        }

        const resolvedMrr =
            typeof customer?.mrr === "number"
                ? customer.mrr
                : Math.round(Number(row.mrr || 0));

        const previousRiskScore =
            typeof row.previousRiskScore === "number" ? row.previousRiskScore : row.riskScore;

        const riskDeltaPct = scoreDeltaPct(row.riskScore, previousRiskScore);

        const signals = buildSignals({
            status: customer?.status,
            lastActiveAt: customer?.lastActiveAt,
            recentFailedInvoices: invoiceInfo.failed,
            recentOverdueInvoices: invoiceInfo.overdue,
        });

        const nextAction =
            openAction?.title || nextActionFromReason(row.reasonKey, signals);

        const profile = {
            companyName: customer?.name || row.companyName,
            plan: customer?.plan || "—",
            startDate: customer?.createdAt?.toISOString() || null,
            paymentHistory: paymentHistoryRows.map((invoice) => ({
                label:
                    invoice.status === "paid"
                        ? "Subscription payment successful"
                        : invoice.status === "failed"
                            ? "Subscription payment failed"
                            : invoice.status === "past_due"
                                ? "Invoice past due"
                                : `Invoice ${invoice.status}`,
                at: (invoice.paidAt || invoice.dueAt)?.toISOString(),
                amount: invoice.amount,
                status: invoice.status,
            })),
            supportHistory: supportHistoryRows.map((event) => ({
                label: event.type.replaceAll("_", " "),
                at: event.occurredAt.toISOString(),
                channel: "system",
                status: "logged",
            })),
        };

        const ai = buildAiSummary({
            reasonLabel: row.reasonLabel,
            riskScore: row.riskScore,
            lastActiveAt: customer?.lastActiveAt || null,
            status: customer?.status || null,
            paymentHistory: profile.paymentHistory,
            nextAction,
            mrr: resolvedMrr,
        });

        return NextResponse.json({
            ok: true,
            id: row.id,
            customerId: customer?.id || row.customerId || null,

            account: {
                id: row.id,
                companyName: customer?.name || row.companyName,
                email: customer?.email || undefined,
                riskScore: row.riskScore,
                riskLevel: riskLevelFromScore(row.riskScore),
                reasonKey: row.reasonKey,
                reasonLabel: row.reasonLabel,
                riskTrend: riskDeltaPct > 0 ? "up" : riskDeltaPct < 0 ? "down" : "flat",
                riskDelta: Math.abs(riskDeltaPct),
                status: customer?.status || "active",
                lastActiveAt: customer?.lastActiveAt?.toISOString() || null,
                signals,
                nextAction,
                mrr: resolvedMrr,
                updatedAt: row.updatedAt.toISOString(),
            },

            profile,
            ai,
        });
    } catch (e: any) {
        if (e instanceof AuthError) {
            return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
        }

        console.error("GET /api/dashboard/accounts-at-risk/[id] failed", e);

        return NextResponse.json(
            { ok: false, error: "Failed to load account" },
            { status: 500 }
        );
    }
}