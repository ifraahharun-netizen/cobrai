import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyFirebaseIdToken } from "@/lib/firebaseAdmin";

import { buildDemoSeries } from "@/lib/demo/analytics";
import { computeMonthlyMetrics, type MonthMetrics } from "@/lib/stripe-connect/metrics";
import { paymentRequiredResponse } from "@/lib/billing/access";

/*
 * Units: Customer.mrr and MrrSnapshot.mrrMinor are MINOR units (pence).
 * Event.value and AccountRisk.mrr are MAJOR units. Every *Minor field in the
 * response is minor units of `currency`.
 *
 * With MRR snapshots (connected Stripe), every figure comes from per-customer
 * monthly snapshots via computeMonthlyMetrics, so MRR, churn, movement and
 * NRR/GRR reconcile exactly.
 */
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

function shiftMonthKey(key: string, delta: number) {
    const [y, m] = key.split("-").map(Number);
    return monthKey(new Date(y, m - 1 + delta, 1));
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
                                currency: true,
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

        // Billing: trial ended without a paid plan → 402.
        const locked = await paymentRequiredResponse(workspaceId);
        if (locked) return locked;


        const trialActive =
            !!user.workspace
                ?.trialEndsAt &&
            new Date(
                user.workspace.trialEndsAt
            ).getTime() > Date.now();

        const workspaceCurrency = (
            user.workspace?.currency || "GBP"
        ).toUpperCase();

        if (
            user.workspace?.demoMode
        ) {
            const demo =
                buildDemoSeries();

            const demoWithExtras = demo as typeof demo & {
                expansionRows?: ExpansionRow[];
                insights?: unknown;
            };

            const demoExpansionRows =
                Array.isArray(
                    demoWithExtras.expansionRows
                )
                    ? demoWithExtras.expansionRows
                    : [];

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
                    demoExpansionRows,
                insights:
                    demoWithExtras.insights ?? null,
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
                },

                select: {
                    id: true,
                    name: true,
                    email: true,
                    createdAt: true,
                    customerSince: true,
                    stripeCustomerId: true,
                    currency: true,
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
                    failedAt: true,

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

            // Snapshots from 12 months before the range, so the first
            // month has a starting point and reactivations are recognised.
            prisma.mrrSnapshot.findMany({
                where: {
                    workspaceId,

                    month: {
                        gte: shiftMonthKey(firstKey, -12),
                        lte: lastKey,
                    },
                },

                select: {
                    stripeCustomerId: true,
                    month: true,
                    mrrMinor: true,
                    trialMrrMinor: true,
                    currency: true,
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

            const demoWithExtras = demo as typeof demo & {
                expansionRows?: ExpansionRow[];
                insights?: unknown;
            };

            const demoExpansionRows =
                Array.isArray(
                    demoWithExtras.expansionRows
                )
                    ? demoWithExtras.expansionRows
                    : [];

            return NextResponse.json({
                ok: true,
                mode: "demo",
                rangeUsed,
                mrr: demo.mrr,
                churn: demo.churn,
                mau: demo.mau,
                activityByMonth: demo.activityByMonth,
                expansionRows: demoExpansionRows,
                insights: demoWithExtras.insights ?? null,
            });
        }

        // Only sum one currency: the workspace's.
        const currencySnapshotRows =
            snapshotRows.filter(
                (r) =>
                    !r.currency ||
                    r.currency.toUpperCase() ===
                    workspaceCurrency
            );

        const otherCurrencyMrrMinor: Record<string, number> = {};
        for (const r of snapshotRows) {
            if (
                r.month === lastKey &&
                r.currency &&
                r.currency.toUpperCase() !== workspaceCurrency
            ) {
                const c = r.currency.toUpperCase();
                otherCurrencyMrrMinor[c] =
                    (otherCurrencyMrrMinor[c] || 0) + Number(r.mrrMinor || 0);
            }
        }

        const customerSince = (c: (typeof customers)[number]) =>
            c.customerSince ?? c.createdAt;

        const monthBounds =
            keys.map((key) => {
                const [year, month] = key.split("-").map(Number);
                const start = startOfMonth(new Date(year, month - 1, 1));
                const end = endOfMonth(start);
                return { key, start, end };
            });

        const mau =
            monthBounds.map((bound) => ({
                month: bound.key,
                activeUsers: customers.filter(
                    (c) =>
                        !!c.lastActiveAt &&
                        c.lastActiveAt >= bound.start &&
                        c.lastActiveAt <= bound.end
                ).length,
            }));

        let monthMetrics: MonthMetrics[];

        if (currencySnapshotRows.length > 0) {
            monthMetrics = computeMonthlyMetrics(
                currencySnapshotRows,
                keys
            );
        } else {
            // No snapshots (no Stripe connection, e.g. HubSpot only):
            // approximate from Customer rows. Customer.mrr is minor units.
            const sumMrr = (rows: typeof customers) =>
                rows.reduce((t, c) => t + Number(c.mrr || 0), 0);
            const activeAt = (end: Date) =>
                customers.filter(
                    (c) =>
                        customerSince(c) <= end &&
                        (!c.canceledAt || c.canceledAt > end) &&
                        Number(c.mrr || 0) > 0
                );

            monthMetrics = monthBounds.map((bound, idx) => {
                const active = activeAt(bound.end);
                const prevEnd = idx > 0 ? monthBounds[idx - 1].end : null;
                const prev = prevEnd ? activeAt(prevEnd) : null;
                const churned =
                    prev && prevEnd
                        ? prev.filter(
                            (c) =>
                                !!c.canceledAt &&
                                c.canceledAt > prevEnd &&
                                c.canceledAt <= bound.end
                        )
                        : [];
                const fresh = customers.filter(
                    (c) =>
                        customerSince(c) >= bound.start &&
                        customerSince(c) <= bound.end &&
                        Number(c.mrr || 0) > 0
                );
                return {
                    month: bound.key,
                    mrrMinor: sumMrr(active),
                    trialMrrMinor: 0,
                    payingCustomers: active.length,
                    trialingCustomers: 0,
                    startMrrMinor: prev ? sumMrr(prev) : null,
                    newMinor: prev ? sumMrr(fresh) : 0,
                    reactivationMinor: 0,
                    expansionMinor: 0,
                    contractionMinor: 0,
                    churnedMinor: prev ? sumMrr(churned) : 0,
                    newCustomers: prev ? fresh.length : 0,
                    reactivatedCustomers: 0,
                    churnedCustomers: churned.length,
                    upgrades: 0,
                    downgrades: 0,
                    newTrials: 0,
                    churnPct:
                        prev && prev.length > 0
                            ? Math.round((churned.length / prev.length) * 1000) / 10
                            : null,
                    nrrPct: null,
                    grrPct: null,
                    moves: [],
                };
            });
        }

        const mrr = monthMetrics.map((m) => ({
            month: m.month,
            valueMinor: m.mrrMinor,
        }));

        const churn = monthMetrics.map((m) => ({
            month: m.month,
            valuePct: m.churnPct,
        }));

        const activityByMonth = monthMetrics.map((m) => ({
            month: m.month,
            churned: m.churnedCustomers,
            retained: Math.max(
                0,
                m.payingCustomers - m.newCustomers - m.reactivatedCustomers
            ),
            newSubscribers: m.newCustomers + m.reactivatedCustomers,
            trials: m.newTrials,
            totalSubscribers: m.payingCustomers,
            upgrades: m.upgrades,
            downgrades: m.downgrades,
            trialingSubscribers: m.trialingCustomers,

            // Exact MRR movement (minor units), from per-customer snapshots.
            startMrrMinor: m.startMrrMinor,
            endMrrMinor: m.mrrMinor,
            trialMrrMinor: m.trialMrrMinor,
            newMrrMinor: m.newMinor + m.reactivationMinor,
            reactivationMrrMinor: m.reactivationMinor,
            expansionMrrMinor: m.expansionMinor,
            contractionMrrMinor: m.contractionMinor,
            churnedMrrMinor: m.churnedMinor,
            nrrPct: m.nrrPct,
            grrPct: m.grrPct,
        }));

        const currentMetrics = monthMetrics[monthMetrics.length - 1];

        const currentMrr = currentMetrics?.mrrMinor ?? 0;

        const prevMrr = currentMetrics?.startMrrMinor ?? null;

        const deltaMinor =
            typeof prevMrr === "number" ? currentMrr - prevMrr : null;

        const deltaPct =
            typeof prevMrr === "number" && prevMrr > 0
                ? Math.round(((currentMrr - prevMrr) / prevMrr) * 1000) / 10
                : null;

        const currentChurn = churn[churn.length - 1]?.valuePct ?? null;

        const prevChurn =
            churn.length > 1 ? churn[churn.length - 2]?.valuePct ?? null : null;

        const deltaPp =
            typeof currentChurn === "number" && typeof prevChurn === "number"
                ? Math.round((currentChurn - prevChurn) * 10) / 10
                : null;

        // This month's per-customer MRR moves.
        const customerByStripeId = new Map(
            customers
                .filter((c) => c.stripeCustomerId)
                .map((c) => [c.stripeCustomerId as string, c])
        );

        const moveLabel: Record<string, string> = {
            new: "New subscription started",
            reactivation: "Reactivated subscription",
            expansion: "Plan upgrade",
            contraction: "Plan downgrade",
            churned: "Cancelled",
        };

        const lastEventFor = (id: string) => {
            const e = events.find((ev) => ev.customerId === id);
            return e?.occurredAt ? e.occurredAt.toISOString() : null;
        };

        const namedMoves = (currentMetrics?.moves ?? []).map((move) => {
            const c = customerByStripeId.get(move.stripeCustomerId);
            return {
                move,
                id: c?.id ?? move.stripeCustomerId,
                name: c?.name || "Unnamed account",
                email: c?.email ?? null,
                lastEventAt: c ? lastEventFor(c.id) : null,
            };
        });

        const driverAccounts: DriverAccountRow[] = namedMoves
            .filter((m) => m.move.deltaMinor > 0)
            .slice(0, 12)
            .map((m) => ({
                id: m.id,
                accountName: m.name,
                email: m.email,
                label: moveLabel[m.move.kind],
                valueMinor: m.move.deltaMinor,
                tone: "positive" as const,
                lastEventAt: m.lastEventAt,
            }));

        const newMinor =
            (currentMetrics?.newMinor ?? 0) +
            (currentMetrics?.reactivationMinor ?? 0);
        const expansionMinor = currentMetrics?.expansionMinor ?? 0;
        const contractionMinor = currentMetrics?.contractionMinor ?? 0;
        const churnedMinor = currentMetrics?.churnedMinor ?? 0;

        // Payments collected this month after a failed attempt are cash, not
        // MRR movement, so they're reported apart from the drivers.
        const recoveredMinor = invoices
            .filter((invoice) => !!invoice.failedAt)
            .reduce(
                (sum, invoice) => sum + Math.round(Number(invoice.amount || 0)),
                0
            );

        const churnedAccounts: ChurnedAccountRow[] = namedMoves
            .filter((m) => m.move.kind === "churned")
            .slice(0, 8)
            .map((m) => ({
                id: m.id,
                name: m.name,
                email: m.email,
                mrrMinor: m.move.fromMinor,
                lastEventAt: m.lastEventAt,
            }));

        const topMovers: TopMoverRow[] = namedMoves.slice(0, 12).map((m) => ({
            id: m.id,
            name: m.name,
            email: m.email,
            deltaMinor: m.move.deltaMinor,
            label: moveLabel[m.move.kind],
        }));

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
                    )
                );

            if (mrrMinor <= 0) {
                continue;
            }

            const inactiveDays =
                daysSince(
                    c.lastActiveAt
                );

            // churnRisk is 0..1.
            const riskScore =
                Number(
                    c.churnRisk || 0
                ) * 100;

            // No activity data = unknown, which doesn't rule a customer out.
            const isActive =
                !c.lastActiveAt ||
                inactiveDays <= 14;

            const notHighRisk =
                riskScore < 70;

            const notCanceled =
                !c.canceledAt;

            const notPastDue =
                !["past_due", "unpaid", "canceled", "trialing"].includes(
                    String(
                        c.status || ""
                    ).toLowerCase()
                );

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

                        expansionMinor,

                        contractionMinor,

                        churnedMinor,

                        driverAccounts,
                    },

                    trialMrrMinor:
                        currentMetrics?.trialMrrMinor ?? 0,

                    recoveredPaymentsMinor:
                        recoveredMinor,

                    nrrPct:
                        currentMetrics?.nrrPct ?? null,

                    grrPct:
                        currentMetrics?.grrPct ?? null,

                    otherCurrencyMrrMinor,

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

                error: "Failed to load analytics timeseries",
            },
            { status: 500 }
        );
    }
}