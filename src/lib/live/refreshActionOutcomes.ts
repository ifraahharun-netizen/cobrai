import { prisma } from "@/lib/prisma";

type SnapshotMeta = {
    outstandingInvoicesBefore?: number;
    outstandingInvoicesAfter?: number;
    lastActiveAtBefore?: string | null;
    lastActiveAtAfter?: string | null;
};

function asMeta(value: unknown): SnapshotMeta {
    if (!value || typeof value !== "object") return {};
    return value as SnapshotMeta;
}

function normalizeChurnRiskToPct(value: number | null | undefined) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    if (n <= 1) return Math.round(n * 100);
    return Math.round(n);
}

function deriveOutcome(args: {
    sentAt: Date | null;
    riskScoreBefore: number | null;
    riskScoreAfter: number | null;
    mrrBefore: number | null;
    mrrAfter: number | null;
    lastActiveAtAfter: Date | null;
    outstandingInvoicesBefore: number;
    outstandingInvoicesAfter: number;
}) {
    const {
        sentAt,
        riskScoreBefore,
        riskScoreAfter,
        mrrBefore,
        mrrAfter,
        lastActiveAtAfter,
        outstandingInvoicesBefore,
        outstandingInvoicesAfter,
    } = args;

    const now = Date.now();
    const sentMs = sentAt?.getTime() ?? now;
    const ageDays = Math.floor((now - sentMs) / 86400000);

    const paymentRecovered =
        outstandingInvoicesBefore > 0 && outstandingInvoicesAfter === 0;

    const riskReduced =
        typeof riskScoreBefore === "number" &&
        typeof riskScoreAfter === "number" &&
        riskScoreAfter < riskScoreBefore;

    const activeAgain =
        !!sentAt &&
        !!lastActiveAtAfter &&
        lastActiveAtAfter.getTime() >= sentAt.getTime();

    let retainedRevenueMinor = 0;

    if (paymentRecovered) {
        retainedRevenueMinor = Math.max(0, Number(mrrAfter ?? mrrBefore ?? 0)) * 100;
    } else if (riskReduced && typeof mrrAfter === "number") {
        retainedRevenueMinor = Math.max(0, mrrAfter) * 100;
    }

    let outcomeLabel: string;
    let status: string;

    if (paymentRecovered) {
        outcomeLabel = "payment_recovered";
        status = "recovered";
    } else if (riskReduced && (riskScoreAfter ?? 999) <= 49) {
        outcomeLabel = "retained";
        status = "retained";
    } else if (riskReduced) {
        outcomeLabel = "risk_decreased";
        status = "retained";
    } else if (activeAgain) {
        outcomeLabel = "active_again";
        status = "retained";
    } else if (ageDays >= 7) {
        outcomeLabel = "no_change";
        status = "failed";
    } else {
        outcomeLabel = "pending";
        status = "sent";
    }

    return {
        paymentRecovered,
        retainedRevenueMinor,
        outcomeLabel,
        status,
    };
}

export async function refreshRecentActionOutcomes(workspaceId: string) {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const actions = await prisma.actionExecution.findMany({
        where: {
            workspaceId,
            sentAt: { gte: ninetyDaysAgo },
        },
        orderBy: { sentAt: "desc" },
        include: {
            customer: {
                select: {
                    id: true,
                    name: true,
                    mrr: true,
                    churnRisk: true,
                    lastActiveAt: true,
                },
            },
            outcomeSnapshots: {
                orderBy: { createdAt: "desc" },
                take: 1,
            },
        },
    });

    for (const action of actions) {
        const latestSnapshot = action.outcomeSnapshots[0] || null;

        let currentRiskScore: number | null = null;
        let currentMrr: number | null = null;
        let currentChurnRisk: number | null = null;
        let currentLastActiveAt: Date | null = action.customer?.lastActiveAt || null;
        let currentCustomerId = action.customerId || action.customer?.id || null;

        if (action.accountRiskId) {
            const risk = await prisma.accountRisk.findFirst({
                where: {
                    id: action.accountRiskId,
                    workspaceId,
                },
                include: {
                    customer: {
                        select: {
                            id: true,
                            mrr: true,
                            churnRisk: true,
                            lastActiveAt: true,
                        },
                    },
                },
            });

            if (risk) {
                currentRiskScore = risk.riskScore;
                currentCustomerId = currentCustomerId || risk.customerId || risk.customer?.id || null;

                if (risk.customer) {
                    currentMrr = risk.customer.mrr ?? null;
                    currentChurnRisk = normalizeChurnRiskToPct(risk.customer.churnRisk);
                    currentLastActiveAt = risk.customer.lastActiveAt || currentLastActiveAt;
                }
            }
        }

        if (!currentCustomerId && action.customerId) {
            currentCustomerId = action.customerId;
        }

        if (currentCustomerId && (currentMrr == null || currentChurnRisk == null)) {
            const customer = await prisma.customer.findFirst({
                where: {
                    id: currentCustomerId,
                    workspaceId,
                },
                select: {
                    mrr: true,
                    churnRisk: true,
                    lastActiveAt: true,
                },
            });

            if (customer) {
                if (currentMrr == null) currentMrr = customer.mrr ?? null;
                if (currentChurnRisk == null) {
                    currentChurnRisk = normalizeChurnRiskToPct(customer.churnRisk);
                }
                currentLastActiveAt = customer.lastActiveAt || currentLastActiveAt;
            }
        }

        const outstandingInvoicesAfter = currentCustomerId
            ? await prisma.invoice.count({
                where: {
                    workspaceId,
                    customerId: currentCustomerId,
                    status: { in: ["failed", "past_due", "open", "overdue"] },
                },
            })
            : 0;

        const meta = asMeta(latestSnapshot?.metadata);
        const outstandingInvoicesBefore =
            typeof meta.outstandingInvoicesBefore === "number"
                ? meta.outstandingInvoicesBefore
                : 0;

        const derived = deriveOutcome({
            sentAt: action.sentAt,
            riskScoreBefore: latestSnapshot?.riskScoreBefore ?? null,
            riskScoreAfter: currentRiskScore,
            mrrBefore: latestSnapshot?.mrrBefore ?? null,
            mrrAfter: currentMrr,
            lastActiveAtAfter: currentLastActiveAt,
            outstandingInvoicesBefore,
            outstandingInvoicesAfter,
        });

        if (latestSnapshot) {
            await prisma.actionOutcomeSnapshot.update({
                where: { id: latestSnapshot.id },
                data: {
                    riskScoreAfter: currentRiskScore,
                    mrrAfter: currentMrr,
                    churnRiskAfter: currentChurnRisk,
                    paymentRecovered: derived.paymentRecovered,
                    retainedRevenueMinor: derived.retainedRevenueMinor,
                    outcomeLabel: derived.outcomeLabel,
                    metadata: {
                        ...meta,
                        outstandingInvoicesBefore,
                        outstandingInvoicesAfter,
                        lastActiveAtBefore: meta.lastActiveAtBefore || null,
                        lastActiveAtAfter: currentLastActiveAt
                            ? currentLastActiveAt.toISOString()
                            : null,
                    } as any,
                },
            });
        } else {
            await prisma.actionOutcomeSnapshot.create({
                data: {
                    workspaceId,
                    actionExecutionId: action.id,
                    riskScoreAfter: currentRiskScore,
                    mrrAfter: currentMrr,
                    churnRiskAfter: currentChurnRisk,
                    paymentRecovered: derived.paymentRecovered,
                    retainedRevenueMinor: derived.retainedRevenueMinor,
                    outcomeLabel: derived.outcomeLabel,
                    metadata: {
                        outstandingInvoicesBefore,
                        outstandingInvoicesAfter,
                        lastActiveAtAfter: currentLastActiveAt
                            ? currentLastActiveAt.toISOString()
                            : null,
                    } as any,
                },
            });
        }

        await prisma.actionExecution.update({
            where: { id: action.id },
            data: {
                status: derived.status,
                outcomeAt:
                    derived.status === "recovered" ||
                        derived.status === "retained" ||
                        derived.status === "failed"
                        ? new Date()
                        : null,
            },
        });
    }

    return {
        ok: true,
        refreshed: actions.length,
    };
}