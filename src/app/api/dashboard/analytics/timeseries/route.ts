import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyFirebaseIdToken } from "@/lib/firebaseAdmin";

import { buildDemoSeries } from "@/lib/demo/analytics";
import { Currency } from "lucide-react";
export const runtime = "nodejs";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

type RangeKey = "current" | "3m" | "6m" | "12m";

type ExpansionRow = {
    id: string;
    name: string;
    email: string | null;
    upsideMinor: number;
    action: string;
    lastEventAt?: string | null;
    reason?: string;
    confidence?: "High" | "Medium" | "Low";
};

type ActivityByMonthRow = {
    month: string;
    churned: number;
    retained: number;
    newSubscribers: number;
    trials: number;
    totalSubscribers: number;
    upgrades?: number;
};

type DriverAccountRow = {
    id: string;
    accountName: string;
    email: string | null;
    label: string;
    valueMinor: number;
    tone: "positive" | "negative";
    lastEventAt?: string | null;
};

type TopMoverRow = {
    id: string;
    name: string;
    email: string | null;
    deltaMinor: number;
    label: string;
};

type ChurnedAccountRow = {
    id: string;
    name: string;
    email: string | null;
    mrrMinor: number;
    lastEventAt?: string | null;
};

function getBearerToken(req: Request) {
    const h = req.headers.get("authorization") || "";
    const m = h.match(/^Bearer\s+(.+)$/i);

    return m?.[1] || null;
}

function monthKey(date: Date) {
    return `${date.getFullYear()}-${String(
        date.getMonth() + 1
    ).padStart(2, "0")}`;
}

function startOfMonth(date: Date) {
    return new Date(
        date.getFullYear(),
        date.getMonth(),
        1,
        0,
        0,
        0,
        0
    );
}

function endOfMonth(date: Date) {
    return new Date(
        date.getFullYear(),
        date.getMonth() + 1,
        0,
        23,
        59,
        59,
        999
    );
}

function resolveRange(input: string | null): RangeKey {
    if (input === "current") return "current";
    if (input === "3m") return "3m";
    if (input === "6m") return "6m";

    return "12m";
}

function buildMonthKeys(range: RangeKey): string[] {
    const now = new Date();
    const keys: string[] = [];

    let count = 12;

    if (range === "current") {
        count = 2;
    } else if (range === "3m") {
        count = 3;
    } else if (range === "6m") {
        count = 6;
    }

    const cursor = new Date(
        now.getFullYear(),
        now.getMonth(),
        1
    );

    for (let i = count - 1; i >= 0; i--) {
        const d = new Date(
            cursor.getFullYear(),
            cursor.getMonth() - i,
            1
        );

        keys.push(monthKey(d));
    }

    return keys;
}

function getBusinessMonthLabel(keys: string[]) {
    const current = keys[keys.length - 1];

    const previous =
        keys.length > 1
            ? keys[keys.length - 2]
            : null;

    return {
        current,
        previous,
    };
}

function daysSince(date?: Date | null) {
    if (!date) return 999;

    const diff =
        Date.now() -
        new Date(date).getTime();

    return Math.floor(
        diff / (1000 * 60 * 60 * 24)
    );
}

function estimateUpsideMinor(
    mrrMinor: number
) {
    return Math.round(mrrMinor * 0.25);
}

function pickExpansionAction(
    label?: string
) {
    const l = (label || "").toLowerCase();

    if (l.includes("upgrade")) {
        return "Upsell premium plan";
    }

    if (l.includes("new")) {
        return "Expand usage / upsell";
    }

    if (l.includes("payment")) {
        return "Convert to annual plan";
    }

    if (l.includes("expansion")) {
        return "Offer upgrade based on usage";
    }

    return "Send expansion email";
}

function getExpansionReason(
    label?: string,
    upsideMinor?: number
) {
    const l = (label || "").toLowerCase();

    const upside = Number(
        upsideMinor || 0
    );

    if (l.includes("upgrade")) {
        return "Recent upgrade activity suggests more expansion potential";
    }

    if (l.includes("new subscription")) {
        return "Strong recent activation suggests room to expand usage";
    }

    if (l.includes("payment")) {
        return "Recovered revenue suggests a good conversion window";
    }

    if (upside >= 20000) {
        return "Strong expansion signal from recent billing activity";
    }

    if (upside >= 8000) {
        return "Consistent growth or engagement detected";
    }

    return "Early expansion signal";
}

function getExpansionConfidence(
    upsideMinor?: number
): "High" | "Medium" | "Low" {
    const upside = Number(
        upsideMinor || 0
    );

    if (upside >= 20000) {
        return "High";
    }

    if (upside >= 8000) {
        return "Medium";
    }

    return "Low";
}

export async function GET(req: Request) {
    try {
        const token =
            getBearerToken(req);

        if (!token) {
            return NextResponse.json(
                {
                    ok: false,
                    error: "Missing Authorization Bearer token",
                },
                { status: 401 }
            );
        }

        const decoded =
            await verifyFirebaseIdToken(
                token
            );

        const firebaseUid =
            decoded.uid;

        const url = new URL(req.url);

        const rangeUsed =
            resolveRange(
                url.searchParams.get(
                    "range"
                )
            );

        const keys =
            buildMonthKeys(rangeUsed);

        const firstKey = keys[0];

        const lastKey =
            keys[keys.length - 1];

        const [firstYear, firstMonth] =
            firstKey
                .split("-")
                .map(Number);

        const [lastYear, lastMonth] =
            lastKey
                .split("-")
                .map(Number);

        const firstMonthStart =
            startOfMonth(
                new Date(
                    firstYear,
                    firstMonth - 1,
                    1
                )
            );

        const currentMonthStart =
            startOfMonth(new Date());

        const lastMonthEnd =
            endOfMonth(
                new Date(
                    lastYear,
                    lastMonth - 1,
                    1
                )
            );

        const user =
            await prisma.user.findUnique(
                {
                    where: {
                        firebaseUid,
                    },

                    select: {
                        workspaceId: true,

                        workspace: {
                            select: {
                                id: true,
                                tier: true,
                                demoMode: true,
                                trialEndsAt: true,
                            },
                        },
                    },
                }
            );

        if (!user?.workspaceId) {
            return NextResponse.json(
                {
                    ok: false,
                    error: "No workspace for user",
                },
                { status: 404 }
            );
        }

        const workspaceId =
            user.workspaceId;

        const trialActive =
            !!user.workspace
                ?.trialEndsAt &&
            new Date(
                user.workspace.trialEndsAt
            ).getTime() > Date.now();

        const workspaceCurrency = "GBP";

        if (
            user.workspace?.demoMode
        ) {
            const demo =
                buildDemoSeries();

            return NextResponse.json({
                ok: true,
                mode: "demo",
                currency: workspaceCurrency,
                workspaceCurrency,
                billingCurrency: workspaceCurrency,

                mrr: demo.mrr,
                churn: demo.churn,
                mau: demo.mau,
                activityByMonth:
                    demo.activityByMonth,
                expansionRows:
                    demo.expansionRows,
                insights:
                    demo.insights,
            });
        }

        const [
            customers,
            riskRows,
            events,
            invoices,
            snapshotRows,
        ] = await Promise.all([
            prisma.customer.findMany({
                where: {
                    workspaceId,

                    createdAt: {
                        lte: lastMonthEnd,
                    },
                },

                select: {
                    id: true,
                    name: true,
                    email: true,
                    createdAt: true,
                    mrr: true,
                    status: true,
                    canceledAt: true,
                    lastActiveAt: true,
                    churnRisk: true,
                },
            }),

            prisma.accountRisk.findMany({
                where: {
                    workspaceId,
                },

                select: {
                    id: true,
                    customerId: true,
                    companyName: true,
                    mrr: true,
                    riskScore: true,
                    reasonLabel: true,
                    updatedAt: true,

                    customer: {
                        select: {
                            email: true,
                        },
                    },
                },

                orderBy: [
                    {
                        riskScore:
                            "desc",
                    },

                    {
                        updatedAt:
                            "desc",
                    },
                ],

                take: 20,
            }),

            prisma.event.findMany({
                where: {
                    workspaceId,

                    occurredAt: {
                        gte: currentMonthStart,
                    },
                },

                select: {
                    id: true,
                    customerId: true,
                    type: true,
                    value: true,
                    occurredAt: true,

                    customer: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            mrr: true,
                        },
                    },
                },

                orderBy: {
                    occurredAt:
                        "desc",
                },

                take: 100,
            }),

            prisma.invoice.findMany({
                where: {
                    workspaceId,

                    paidAt: {
                        gte: currentMonthStart,
                    },

                    status: "paid",
                },

                select: {
                    id: true,
                    amount: true,
                    paidAt: true,

                    customer: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            mrr: true,
                        },
                    },
                },

                orderBy: {
                    paidAt: "desc",
                },

                take: 100,
            }),

            prisma.mrrSnapshot.findMany({
                where: {
                    workspaceId,

                    month: {
                        in: keys,
                    },

                    active: true,
                },

                select: {
                    month: true,
                    mrrMinor: true,
                },
            }),
        ]);

        const hasLiveAnalyticsData =
            customers.length > 0 ||
            events.length > 0 ||
            invoices.length > 0 ||
            snapshotRows.length > 0;

        if (!hasLiveAnalyticsData) {
            const demo = buildDemoSeries();

            return NextResponse.json({
                ok: true,
                mode: "demo",
                rangeUsed,
                mrr: demo.mrr,
                churn: demo.churn,
                mau: demo.mau,
                activityByMonth: demo.activityByMonth,
                expansionRows: demo.expansionRows,
                insights: demo.insights,
            });
        }

        const snapshotSumByMonth =
            new Map<
                string,
                number
            >();

        for (const row of snapshotRows) {
            snapshotSumByMonth.set(
                row.month,
                (
                    snapshotSumByMonth.get(
                        row.month
                    ) || 0
                ) +
                Number(
                    row.mrrMinor || 0
                )
            );
        }

        const mrr = keys.map(
            (key) => {
                const snapshotValue =
                    snapshotSumByMonth.get(
                        key
                    );

                if (
                    typeof snapshotValue ===
                    "number"
                ) {
                    return {
                        month: key,
                        valueMinor:
                            snapshotValue,
                    };
                }

                const [year, month] =
                    key
                        .split("-")
                        .map(Number);

                const monthEnd =
                    endOfMonth(
                        new Date(
                            year,
                            month - 1,
                            1
                        )
                    );

                const liveCalculatedMrr =
                    customers
                        .filter((c) => {
                            const created =
                                c.createdAt <=
                                monthEnd;

                            const active =
                                !c.canceledAt ||
                                c.canceledAt >
                                monthEnd;

                            return (
                                created &&
                                active
                            );
                        })
                        .reduce(
                            (
                                sum,
                                c
                            ) =>
                                sum +
                                Math.round(
                                    Number(
                                        c.mrr || 0
                                    ) * 100
                                ),
                            0
                        );

                return {
                    month: key,
                    valueMinor:
                        liveCalculatedMrr,
                };
            }
        );

        const monthBounds =
            keys.map((key) => {
                const [
                    year,
                    month,
                ] = key
                    .split("-")
                    .map(Number);

                const start =
                    startOfMonth(
                        new Date(
                            year,
                            month - 1,
                            1
                        )
                    );

                const end =
                    endOfMonth(start);

                return {
                    key,
                    start,
                    end,
                };
            });

        const churn =
            monthBounds.map(
                (bound, idx) => {
                    if (idx === 0) {
                        return {
                            month:
                                bound.key,
                            valuePct:
                                null,
                        };
                    }

                    const prev =
                        monthBounds[
                        idx - 1
                        ];

                    const prevActiveBase =
                        customers.filter(
                            (c) => {
                                const createdOk =
                                    c.createdAt <=
                                    prev.end;

                                const activeAtPrevEnd =
                                    !c.canceledAt ||
                                    c.canceledAt >
                                    prev.end;

                                return (
                                    createdOk &&
                                    activeAtPrevEnd
                                );
                            }
                        );

                    const churnedThisMonth =
                        prevActiveBase.filter(
                            (c) => {
                                return (
                                    !!c.canceledAt &&
                                    c.canceledAt >
                                    prev.end &&
                                    c.canceledAt <=
                                    bound.end
                                );
                            }
                        );

                    const valuePct =
                        prevActiveBase.length >
                            0
                            ? Math.round(
                                (churnedThisMonth.length /
                                    prevActiveBase.length) *
                                1000
                            ) / 10
                            : null;

                    return {
                        month:
                            bound.key,
                        valuePct,
                    };
                }
            );

        const mau =
            monthBounds.map(
                (bound) => {
                    const activeUsers =
                        customers.filter(
                            (c) => {
                                if (
                                    !c.lastActiveAt
                                ) {
                                    return false;
                                }

                                return (
                                    c.lastActiveAt >=
                                    bound.start &&
                                    c.lastActiveAt <=
                                    bound.end
                                );
                            }
                        ).length;

                    return {
                        month:
                            bound.key,
                        activeUsers,
                    };
                }
            );

        const activityByMonth: ActivityByMonthRow[] =
            monthBounds.map(
                (bound) => {
                    const totalSubscribers =
                        customers.filter(
                            (c) => {
                                const createdOk =
                                    c.createdAt <=
                                    bound.end;

                                const active =
                                    !c.canceledAt ||
                                    c.canceledAt >
                                    bound.end;

                                return (
                                    createdOk &&
                                    active
                                );
                            }
                        ).length;

                    const newCustomersThisMonth =
                        customers.filter(
                            (c) => {
                                return (
                                    c.createdAt >=
                                    bound.start &&
                                    c.createdAt <=
                                    bound.end
                                );
                            }
                        );

                    const newTrials =
                        newCustomersThisMonth.filter(
                            (c) => {
                                const status =
                                    String(
                                        c.status ||
                                        ""
                                    ).toLowerCase();

                                return status.includes(
                                    "trial"
                                );
                            }
                        ).length;

                    const newSubscriptions =
                        newCustomersThisMonth.length -
                        newTrials;

                    const unsubscribes =
                        customers.filter(
                            (c) => {
                                return (
                                    !!c.canceledAt &&
                                    c.canceledAt >=
                                    bound.start &&
                                    c.canceledAt <=
                                    bound.end
                                );
                            }
                        ).length;

                    return {
                        month: bound.key,
                        churned: unsubscribes,

                        retained: totalSubscribers - unsubscribes,

                        newSubscribers: newSubscriptions,

                        trials: newTrials,
                        totalSubscribers,
                    };
                }
            );

        const currentMrr =
            mrr[mrr.length - 1]
                ?.valueMinor ?? 0;

        const prevMrr =
            mrr.length > 1
                ? mrr[
                    mrr.length - 2
                ]?.valueMinor ??
                null
                : null;

        const deltaMinor =
            typeof prevMrr ===
                "number"
                ? currentMrr -
                prevMrr
                : null;

        const deltaPct =
            typeof prevMrr ===
                "number" &&
                prevMrr > 0
                ? Math.round(
                    ((currentMrr -
                        prevMrr) /
                        prevMrr) *
                    1000
                ) / 10
                : null;

        const currentChurn =
            churn[
                churn.length - 1
            ]?.valuePct ?? null;

        const prevChurn =
            churn.length > 1
                ? churn[
                    churn.length - 2
                ]?.valuePct ??
                null
                : null;

        const deltaPp =
            typeof currentChurn ===
                "number" &&
                typeof prevChurn ===
                "number"
                ? Math.round(
                    (currentChurn -
                        prevChurn) *
                    10
                ) / 10
                : null;

        const driverAccountsMap =
            new Map<
                string,
                DriverAccountRow
            >();

        for (const event of events) {
            const customer =
                event.customer;

            if (!customer) {
                continue;
            }

            const type = String(
                event.type || ""
            ).toLowerCase();

            const amountMinor =
                typeof event.value ===
                    "number" &&
                    Number.isFinite(
                        event.value
                    )
                    ? Math.round(
                        event.value *
                        100
                    )
                    : Math.round(
                        Number(
                            customer.mrr ||
                            0
                        ) * 100
                    );

            if (amountMinor <= 0) {
                continue;
            }

            let label:
                | string
                | null = null;

            if (
                type.includes(
                    "new_subscription"
                ) ||
                type.includes(
                    "subscription_created"
                ) ||
                type ===
                "new_subscription"
            ) {
                label =
                    "New subscription started";
            } else if (
                type.includes(
                    "upgrade"
                ) ||
                type.includes(
                    "seat_increase"
                ) ||
                type.includes(
                    "expansion"
                ) ||
                type ===
                "plan_upgraded"
            ) {
                label =
                    "Plan upgrade";
            }

            if (!label) {
                continue;
            }

            const existing =
                driverAccountsMap.get(
                    customer.id
                );

            const existingValue =
                existing?.valueMinor ||
                0;

            const eventTime =
                event.occurredAt
                    ? event.occurredAt.toISOString()
                    : null;

            const lastEventAt =
                existing
                    ?.lastEventAt &&
                    eventTime
                    ? new Date(
                        existing.lastEventAt
                    ) >
                        new Date(
                            eventTime
                        )
                        ? existing.lastEventAt
                        : eventTime
                    : existing
                        ?.lastEventAt ||
                    eventTime;

            driverAccountsMap.set(
                customer.id,
                {
                    id: customer.id,

                    accountName:
                        customer.name ||
                        "Unnamed account",

                    email:
                        customer.email ||
                        null,

                    label,

                    valueMinor:
                        existingValue +
                        amountMinor,

                    tone: "positive",

                    lastEventAt,
                }
            );
        }

        for (const invoice of invoices) {
            const customer =
                invoice.customer;

            if (!customer) {
                continue;
            }

            const recoveredMinor =
                Math.round(
                    Number(
                        invoice.amount ||
                        0
                    )
                );

            if (
                recoveredMinor <= 0
            ) {
                continue;
            }

            const existing =
                driverAccountsMap.get(
                    customer.id
                );

            const existingValue =
                existing?.valueMinor ||
                0;

            const paidTime =
                invoice.paidAt
                    ? invoice.paidAt.toISOString()
                    : null;

            const lastEventAt =
                existing
                    ?.lastEventAt &&
                    paidTime
                    ? new Date(
                        existing.lastEventAt
                    ) >
                        new Date(
                            paidTime
                        )
                        ? existing.lastEventAt
                        : paidTime
                    : existing
                        ?.lastEventAt ||
                    paidTime;

            driverAccountsMap.set(
                customer.id,
                {
                    id: customer.id,

                    accountName:
                        customer.name ||
                        "Unnamed account",

                    email:
                        customer.email ||
                        null,

                    label:
                        existing?.label ||
                        "Recovered successful payment",

                    valueMinor:
                        existingValue +
                        recoveredMinor,

                    tone: "positive",

                    lastEventAt,
                }
            );
        }

        const driverAccounts =
            Array.from(
                driverAccountsMap.values()
            )
                .sort(
                    (a, b) =>
                        b.valueMinor -
                        a.valueMinor
                )
                .slice(0, 12);

        const newMinor =
            driverAccounts
                .filter((row) =>
                    row.label
                        .toLowerCase()
                        .includes(
                            "new subscription"
                        )
                )
                .reduce(
                    (sum, row) =>
                        sum +
                        row.valueMinor,
                    0
                );

        const expansionMinor =
            driverAccounts
                .filter((row) =>
                    row.label
                        .toLowerCase()
                        .includes(
                            "upgrade"
                        )
                )
                .reduce(
                    (sum, row) =>
                        sum +
                        row.valueMinor,
                    0
                );

        const recoveredMinor =
            driverAccounts
                .filter((row) =>
                    row.label
                        .toLowerCase()
                        .includes(
                            "payment"
                        )
                )
                .reduce(
                    (sum, row) =>
                        sum +
                        row.valueMinor,
                    0
                );

        const churnedAccounts: ChurnedAccountRow[] =
            riskRows
                .filter(
                    (r) =>
                        r.riskScore >=
                        70
                )
                .slice(0, 8)
                .map((r) => ({
                    id:
                        r.customerId ||
                        r.id,

                    name:
                        r.companyName,

                    email:
                        r.customer
                            ?.email ||
                        null,

                    mrrMinor:
                        Math.round(
                            Number(
                                r.mrr || 0
                            ) * 100
                        ),

                    lastEventAt:
                        r.updatedAt
                            ? r.updatedAt.toISOString()
                            : null,
                }));

        const churnedMinor =
            churnedAccounts.reduce(
                (sum, row) =>
                    sum +
                    row.mrrMinor,
                0
            );

        const topMovers: TopMoverRow[] =
            [
                ...driverAccounts.map(
                    (row) => ({
                        id: row.id,
                        name: row.accountName,
                        email:
                            row.email,
                        deltaMinor:
                            row.valueMinor,
                        label:
                            row.label,
                    })
                ),

                ...churnedAccounts.map(
                    (row) => ({
                        id: row.id,
                        name: row.name,
                        email:
                            row.email,
                        deltaMinor:
                            -row.mrrMinor,
                        label:
                            "High churn risk",
                    })
                ),
            ]
                .sort(
                    (a, b) =>
                        Math.abs(
                            b.deltaMinor
                        ) -
                        Math.abs(
                            a.deltaMinor
                        )
                )
                .slice(0, 12);

        const expansionRows: ExpansionRow[] =
            [];

        for (const row of driverAccounts) {
            if (
                row.valueMinor <= 0
            ) {
                continue;
            }

            const upsideMinor =
                Math.round(
                    row.valueMinor *
                    0.6
                );

            expansionRows.push({
                id: row.id,

                name: row.accountName,

                email: row.email,

                upsideMinor,

                action:
                    pickExpansionAction(
                        row.label
                    ),

                lastEventAt:
                    row.lastEventAt ||
                    null,

                reason:
                    getExpansionReason(
                        row.label,
                        upsideMinor
                    ),

                confidence:
                    getExpansionConfidence(
                        upsideMinor
                    ),
            });
        }

        for (const c of customers) {
            const mrrMinor =
                Math.round(
                    Number(
                        c.mrr || 0
                    ) * 100
                );

            if (mrrMinor <= 0) {
                continue;
            }

            const inactiveDays =
                daysSince(
                    c.lastActiveAt
                );

            const riskScore =
                Number(
                    c.churnRisk || 0
                );

            const isActive =
                inactiveDays <= 14;

            const notHighRisk =
                riskScore < 70;

            const notCanceled =
                !c.canceledAt;

            const notPastDue =
                String(
                    c.status || ""
                ).toLowerCase() !==
                "past_due";

            if (
                !isActive ||
                !notHighRisk ||
                !notCanceled ||
                !notPastDue
            ) {
                continue;
            }

            if (
                expansionRows.find(
                    (e) =>
                        e.id === c.id
                )
            ) {
                continue;
            }

            const upsideMinor =
                estimateUpsideMinor(
                    mrrMinor
                );

            expansionRows.push({
                id: c.id,

                name:
                    c.name ||
                    "Unnamed account",

                email:
                    c.email || null,

                upsideMinor,

                action:
                    "Send expansion email",

                lastEventAt:
                    c.lastActiveAt
                        ? c.lastActiveAt.toISOString()
                        : null,

                reason:
                    getExpansionReason(
                        "active customer",
                        upsideMinor
                    ),

                confidence:
                    getExpansionConfidence(
                        upsideMinor
                    ),
            });
        }

        const finalExpansionRows =
            expansionRows
                .sort(
                    (a, b) =>
                        b.upsideMinor -
                        a.upsideMinor
                )
                .slice(0, 6);

        const businessHealth =
            currentChurn !== null &&
                currentChurn < 3
                ? "Strong"
                : currentChurn !==
                    null &&
                    currentChurn <
                    6
                    ? "Healthy"
                    : "At Risk";

        const revenueNarrative =
            deltaMinor !== null
                ? deltaMinor >= 0
                    ? `Revenue increased ${Math.abs(
                        deltaPct || 0
                    ).toFixed(1)}% month over month driven by subscription growth and expansion activity.`
                    : `Revenue declined ${Math.abs(
                        deltaPct || 0
                    ).toFixed(1)}% month over month due to churn and contraction.`
                : "Revenue movement unavailable.";

        const churnNarrative =
            currentChurn !== null
                ? currentChurn >= 5
                    ? "Churn pressure is elevated and retention intervention is recommended."
                    : "Churn remains within a relatively healthy range."
                : "Churn data unavailable.";

        const projectedMrrNextMonth =
            currentMrr +
            (deltaMinor || 0);

        const projectedChurnNextMonth =
            currentChurn !==
                null &&
                deltaPp !== null
                ? Math.max(
                    0,
                    currentChurn +
                    deltaPp
                )
                : null;


        return NextResponse.json({
            ok: true,

            mode: trialActive
                ? "trial"
                : "live",

            currency: workspaceCurrency,
            workspaceCurrency,
            billingCurrency: workspaceCurrency,

            rangeUsed,

            mrr,

            churn,

            mau,

            activityByMonth,

            expansionRows:
                finalExpansionRows,

            insights: {
                mrr: {
                    currentMinor:
                        currentMrr,

                    prevMinor:
                        prevMrr,

                    deltaMinor,

                    deltaPct,

                    drivers: {
                        newMinor,

                        expansionMinor:
                            expansionMinor +
                            recoveredMinor,

                        contractionMinor: 0,

                        churnedMinor,

                        driverAccounts,
                    },

                    topMovers,
                },

                churn: {
                    currentPct:
                        currentChurn,

                    prevPct:
                        prevChurn,

                    deltaPp,

                    churnedAccounts,
                },

                months:
                    getBusinessMonthLabel(
                        keys
                    ),
            },

            aiNarrative: {
                headline: revenueNarrative,
                summary: revenueNarrative,
                businessHealth,
                churnPrediction: churnNarrative,
                engagementAnalysis: churnNarrative,
                revenueForecast: revenueNarrative,

                health: {
                    overallScore:
                        currentChurn !== null
                            ? currentChurn < 3
                                ? 82
                                : currentChurn < 6
                                    ? 68
                                    : 44
                            : 65,
                    label: businessHealth,
                    summary:
                        currentChurn !== null && currentChurn < 6
                            ? "Business retention health is stable."
                            : "Retention health needs attention.",
                },

                forecast: {
                    nextMonthMrr: projectedMrrNextMonth,
                    projectedGrowthPct: deltaPct ?? 0,
                    predictedChurnPct: projectedChurnNextMonth ?? currentChurn ?? 0,
                    confidence: "Medium",
                },

                mrrDrivers: [],
                riskAccounts: [],
                engagementScore: 70,
            },
            forecast: {
                projectedMrrNextMonth,
                projectedChurnNextMonth,
            },
        });
    } catch (e: any) {
        console.error(
            "dashboard/analytics/timeseries GET failed:",
            e
        );

        return NextResponse.json(
            {
                ok: false,

                error:
                    e?.message ??
                    "Failed to load analytics timeseries",
            },
            { status: 500 }
        );
    }
}