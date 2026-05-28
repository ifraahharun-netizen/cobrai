import { prisma } from "@/lib/prisma";

function safeNumber(value: unknown) {
    const n = Number(value);

    return Number.isFinite(n) ? n : 0;
}

function calculateHealthScore(args: {
    churnRatePct: number;
    atRiskRatio: number;
}) {
    const { churnRatePct, atRiskRatio } = args;

    let score = 100;

    score -= churnRatePct * 6;
    score -= atRiskRatio * 35;

    return Math.max(
        0,
        Math.min(100, Math.round(score))
    );
}

function getBusinessHealth(
    healthScore: number
) {
    if (healthScore >= 85) {
        return "Strong";
    }

    if (healthScore >= 65) {
        return "Healthy";
    }

    if (healthScore >= 45) {
        return "At Risk";
    }

    return "Critical";
}

function getRevenueNarrative(args: {
    totalMrrMinor: number;
    previousMrrMinor: number;
    deltaPct: number;
}) {
    const {
        totalMrrMinor,
        previousMrrMinor,
        deltaPct,
    } = args;

    if (
        totalMrrMinor <= 0 &&
        previousMrrMinor <= 0
    ) {
        return "No meaningful revenue activity detected yet.";
    }

    if (deltaPct > 0) {
        return `Revenue increased ${Math.abs(
            deltaPct
        ).toFixed(
            1
        )}% month over month driven by subscription growth and expansion activity.`;
    }

    if (deltaPct < 0) {
        return `Revenue declined ${Math.abs(
            deltaPct
        ).toFixed(
            1
        )}% month over month due to churn and contraction signals.`;
    }

    return "Revenue remained stable compared to the previous month.";
}

function getChurnNarrative(args: {
    churnRatePct: number;
    atRiskCustomers: number;
}) {
    const {
        churnRatePct,
        atRiskCustomers,
    } = args;

    if (churnRatePct >= 7) {
        return `Churn pressure is elevated with ${atRiskCustomers} high-risk accounts requiring immediate retention intervention.`;
    }

    if (churnRatePct >= 4) {
        return `Moderate churn pressure detected with several accounts showing declining health signals.`;
    }

    return "Customer retention remains within a relatively healthy range.";
}

function getEngagementNarrative(args: {
    activeCustomers: number;
    inactiveCustomers: number;
}) {
    const {
        activeCustomers,
        inactiveCustomers,
    } = args;

    if (
        activeCustomers === 0 &&
        inactiveCustomers === 0
    ) {
        return "No engagement activity detected yet.";
    }

    if (
        inactiveCustomers >
        activeCustomers * 0.4
    ) {
        return "A significant portion of customers show low engagement activity.";
    }

    return "Customer engagement levels remain relatively healthy.";
}

function getMonthKey(date: Date) {
    return `${date.getFullYear()}-${String(
        date.getMonth() + 1
    ).padStart(2, "0")}`;
}

export async function runWorkspaceAnalyticsPipeline(
    workspaceId: string
) {
    const now = new Date();

    const currentMonthKey =
        getMonthKey(now);

    const previousMonthDate =
        new Date(
            now.getFullYear(),
            now.getMonth() - 1,
            1
        );

    const previousMonthKey =
        getMonthKey(
            previousMonthDate
        );

    const [
        workspace,
        customers,
        risks,
        invoices,
        recentEvents,
        previousSnapshot,
    ] = await Promise.all([
        prisma.workspace.findUnique({
            where: {
                id: workspaceId,
            },

            select: {
                id: true,
                tier: true,
                demoMode: true,
            },
        }),

        prisma.customer.findMany({
            where: {
                workspaceId,
            },
        }),

        prisma.accountRisk.findMany({
            where: {
                workspaceId,
            },
        }),

        prisma.invoice.findMany({
            where: {
                workspaceId,
            },

            orderBy: {
                dueAt: "desc",
            },

            take: 250,
        }),

        prisma.event.findMany({
            where: {
                workspaceId,
            },

            orderBy: {
                occurredAt: "desc",
            },

            take: 250,
        }),

        prisma.workspaceAnalyticsSnapshot.findFirst(
            {
                where: {
                    workspaceId,
                },

                orderBy: {
                    snapshotDate:
                        "desc",
                },
            }
        ),
    ]);

    if (!workspace) {
        throw new Error(
            "Workspace not found"
        );
    }

    const activeCustomers =
        customers.filter(
            (c) => !c.canceledAt
        );

    const churnedCustomers =
        customers.filter(
            (c) => !!c.canceledAt
        );

    const atRiskCustomers =
        risks.filter(
            (r) => r.riskScore >= 70
        );

    const inactiveCustomers =
        customers.filter((c) => {
            if (!c.lastActiveAt) {
                return true;
            }

            const diff =
                Date.now() -
                new Date(
                    c.lastActiveAt
                ).getTime();

            const days =
                diff /
                (1000 *
                    60 *
                    60 *
                    24);

            return days >= 14;
        });

    const totalMrrMinor =
        activeCustomers.reduce(
            (sum, customer) =>
                sum +
                Math.round(
                    safeNumber(
                        customer.mrr
                    ) * 100
                ),
            0
        );

    const mrrAtRiskMinor =
        atRiskCustomers.reduce(
            (sum, risk) =>
                sum +
                Math.round(
                    safeNumber(
                        risk.mrr
                    ) * 100
                ),
            0
        );

    const expansionPotential =
        activeCustomers.reduce(
            (sum, customer) => {
                const mrrMinor =
                    Math.round(
                        safeNumber(
                            customer.mrr
                        ) * 100
                    );

                const churnRisk =
                    safeNumber(
                        customer.churnRisk
                    );

                if (
                    churnRisk >= 0.7
                ) {
                    return sum;
                }

                return (
                    sum +
                    Math.round(
                        mrrMinor * 0.2
                    )
                );
            },
            0
        );

    const churnRatePct =
        customers.length > 0
            ? Math.round(
                (churnedCustomers.length /
                    customers.length) *
                1000
            ) / 10
            : 0;

    const retentionRatePct =
        customers.length > 0
            ? Math.round(
                (activeCustomers.length /
                    customers.length) *
                1000
            ) / 10
            : 0;

    const previousMrrMinor =
        previousSnapshot?.totalMrr
            ? Math.round(previousSnapshot.totalMrr * 100)
            : 0;
    const deltaMinor =
        totalMrrMinor -
        previousMrrMinor;

    const deltaPct =
        previousMrrMinor > 0
            ? Math.round(
                (deltaMinor /
                    previousMrrMinor) *
                1000
            ) / 10
            : 0;

    const netRevenueRetentionPct =
        previousMrrMinor > 0
            ? Math.round(
                (totalMrrMinor /
                    previousMrrMinor) *
                1000
            ) / 10
            : 100;

    const atRiskRatio =
        customers.length > 0
            ? atRiskCustomers.length /
            customers.length
            : 0;

    const healthScore =
        calculateHealthScore({
            churnRatePct,
            atRiskRatio,
        });

    const businessHealth =
        getBusinessHealth(
            healthScore
        );

    const revenueNarrative =
        getRevenueNarrative({
            totalMrrMinor,
            previousMrrMinor,
            deltaPct,
        });

    const churnNarrative =
        getChurnNarrative({
            churnRatePct,
            atRiskCustomers:
                atRiskCustomers.length,
        });

    const engagementNarrative =
        getEngagementNarrative({
            activeCustomers:
                activeCustomers.length,

            inactiveCustomers:
                inactiveCustomers.length,
        });

    const projectedMrrNextMonth =
        Math.max(
            0,
            totalMrrMinor +
            deltaMinor
        );

    const projectedChurnNextMonth =
        Math.max(
            0,
            churnRatePct +
            churnRatePct * 0.08
        );

    /*
     * Create MRR snapshot
     */

    for (const customer of activeCustomers) {
        if (
            !customer.stripeCustomerId
        ) {
            continue;
        }

        await prisma.mrrSnapshot.upsert(
            {
                where: {
                    workspaceId_stripeCustomerId_month:
                    {
                        workspaceId,

                        stripeCustomerId:
                            customer.stripeCustomerId,

                        month:
                            currentMonthKey,
                    },
                },

                update: {
                    mrrMinor:
                        Math.round(
                            safeNumber(
                                customer.mrr
                            ) * 100
                        ),

                    active: true,
                },

                create: {
                    workspaceId,

                    stripeCustomerId:
                        customer.stripeCustomerId,

                    month:
                        currentMonthKey,

                    mrrMinor:
                        Math.round(
                            safeNumber(
                                customer.mrr
                            ) * 100
                        ),

                    active: true,

                    firstSeenMonth:
                        currentMonthKey,
                },
            }
        );
    }

    /*
     * Workspace analytics snapshot
     */

    await prisma.workspaceAnalyticsSnapshot.create({
        data: {
            workspaceId,

            snapshotDate: now,

            totalMrr: totalMrrMinor / 100,

            mrrAtRisk: mrrAtRiskMinor / 100,

            retentionRate: retentionRatePct,

            predictedChurnRate: churnRatePct,

            atRiskAccounts:
                atRiskCustomers.length,

            activeCustomers:
                activeCustomers.length,

            churnedCustomers:
                churnedCustomers.length,

            projectedMrr7d:
                projectedMrrNextMonth / 100,

            projectedMrr30d:
                projectedMrrNextMonth / 100,

            projectedChurn7d:
                projectedChurnNextMonth,

            projectedChurn30d:
                projectedChurnNextMonth,

            businessHealthScore:
                healthScore,
        },
    });
    /*
     * Customer health snapshots
     */

    for (const customer of customers) {
        const mrrMinor =
            Math.round(
                safeNumber(
                    customer.mrr
                ) * 100
            );

        const inactiveDays =
            customer.lastActiveAt
                ? Math.floor(
                    (Date.now() -
                        new Date(
                            customer.lastActiveAt
                        ).getTime()) /
                    (1000 *
                        60 *
                        60 *
                        24)
                )
                : 999;

        const engagementScore =
            inactiveDays <= 3
                ? 95
                : inactiveDays <= 7
                    ? 78
                    : inactiveDays <= 14
                        ? 55
                        : 30;

        const billingScore =
            customer.status ===
                "past_due"
                ? 25
                : 92;

        const supportScore =
            safeNumber(
                customer.churnRisk
            ) >= 0.7
                ? 40
                : 85;

        await prisma.customerHealthSnapshot.create(
            {
                data: {
                    workspaceId,

                    customerId:
                        customer.id,

                    snapshotDate:
                        now,

                    healthScore:
                        customer.healthScore,

                    churnRisk:
                        customer.churnRisk,

                    mrrMinor,

                    engagementScore,

                    billingScore,

                    supportScore,

                    productUsageScore:
                        engagementScore,

                    activeDays7d:
                        inactiveDays <= 7
                            ? 7 -
                            inactiveDays
                            : 0,

                    activeDays30d:
                        inactiveDays <= 30
                            ? 30 -
                            inactiveDays
                            : 0,
                },
            }
        );

        /*
         * Risk snapshots
         */

        await prisma.riskSnapshot.upsert(
            {
                where: {
                    workspaceId_customerId_bucketDate:
                    {
                        workspaceId,

                        customerId:
                            customer.id,

                        bucketDate:
                            now,
                    },
                },

                update: {
                    riskScore:
                        customer.riskScore,

                    churnProb:
                        customer.churnRisk,

                    mrrAtRisk:
                        mrrMinor,
                },

                create: {
                    workspaceId,

                    customerId:
                        customer.id,

                    riskScore:
                        customer.riskScore,

                    churnProb:
                        customer.churnRisk,

                    mrrAtRisk:
                        mrrMinor,

                    bucketDate:
                        now,
                },
            }
        );
    }

    /*
     * AI narratives
     */

    await prisma.aiWorkspaceNarrative.create(
        {
            data: {
                workspaceId,

                type: "business_health",

                headline: businessHealth,

                narrative:
                    revenueNarrative,

                importance:
                    healthScore >= 80
                        ? "low"
                        : healthScore >= 60
                            ? "medium"
                            : "high",

                metadata: {
                    totalMrrMinor,

                    churnRatePct,

                    projectedMrrNextMonth,

                    projectedChurnNextMonth,
                },
            },
        }
    );

    await prisma.aiWorkspaceNarrative.create(
        {
            data: {
                workspaceId,

                type: "churn",

                headline:
                    "Churn analysis",

                narrative:
                    churnNarrative,

                importance:
                    churnRatePct >= 7
                        ? "high"
                        : churnRatePct >= 4
                            ? "medium"
                            : "low",

                metadata: {
                    churnRatePct,

                    atRiskCustomers:
                        atRiskCustomers.length,
                },
            },
        }
    );

    await prisma.aiWorkspaceNarrative.create(
        {
            data: {
                workspaceId,

                type: "engagement",

                headline:
                    "Customer engagement",

                narrative:
                    engagementNarrative,

                importance:
                    inactiveCustomers.length >
                        customers.length *
                        0.4
                        ? "high"
                        : "low",

                metadata: {
                    activeCustomers:
                        activeCustomers.length,

                    inactiveCustomers:
                        inactiveCustomers.length,
                },
            },
        }
    );

    /*
     * Account risk snapshots
     */

    for (const risk of risks) {
        await prisma.accountRiskSnapshot.create(
            {
                data: {
                    workspaceId,

                    accountRiskId:
                        risk.id,

                    companyName:
                        risk.companyName,

                    riskScore:
                        risk.riskScore,

                    reasonKey:
                        risk.reasonKey,

                    reasonLabel:
                        risk.reasonLabel,

                    mrrMinor:
                        Math.round(
                            safeNumber(
                                risk.mrr
                            ) * 100
                        ),

                    snapshotDate:
                        now,

                    predictedRisk7d:
                        Math.min(
                            100,
                            risk.riskScore +
                            6
                        ),

                    predictedRisk14d:
                        Math.min(
                            100,
                            risk.riskScore +
                            12
                        ),

                    predictedRisk30d:
                        Math.min(
                            100,
                            risk.riskScore +
                            20
                        ),

                    escalationDetected:
                        risk.riskScore >=
                        75,
                },
            }
        );
    }

    /*
     * Sync tracking
     */

    await prisma.syncRun.create({
        data: {
            workspaceId,

            provider: "analytics",

            status: "completed",

            completedAt:
                new Date(),

            recordsProcessed:
                customers.length +
                invoices.length +
                recentEvents.length,

            metadata: {
                currentMonthKey,
                previousMonthKey,

                totalCustomers:
                    customers.length,

                totalRisks:
                    risks.length,

                totalInvoices:
                    invoices.length,

                totalEvents:
                    recentEvents.length,
            },
        },
    });

    /*
     * Workspace freshness
     */

    await prisma.workspace.update({
        where: {
            id: workspaceId,
        },

        data: {
            stripeLastSyncedAt:
                new Date(),
        },
    });

    return {
        ok: true,

        workspaceId,

        totalMrrMinor,

        mrrAtRiskMinor,

        expansionPotential,

        churnRatePct,

        retentionRatePct,

        healthScore,

        businessHealth,

        projectedMrrNextMonth,

        projectedChurnNextMonth,
    };
}