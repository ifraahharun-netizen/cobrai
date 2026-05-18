export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyFirebaseIdToken } from "@/lib/firebaseAdmin";

import { buildAccountRisk } from "@/lib/risk/buildAccountRisk";
import { buildRiskForecast } from "@/lib/risk/buildRiskForecast";

type RiskLevel =
    | "critical"
    | "high"
    | "medium"
    | "low";

type SortKey =
    | "risk"
    | "mrr"
    | "updatedAt"
    | "lastActiveAt";

type SortDir =
    | "asc"
    | "desc";

type Signal = {
    key: string;
    label: string;
};

type RiskRow = {
    id: string;

    companyName: string;

    email?: string | null;

    riskScore: number;

    riskDelta: number;

    riskTrend:
    | "up"
    | "down"
    | "flat";

    riskLevel: RiskLevel;

    reasonKey: string;
    reasonLabel: string;

    status: string;

    lastActiveAt: string | null;

    signals: Signal[];

    nextAction: string;

    mrr: number;

    updatedAt: string;

    velocityScore?: number;
    accelerationScore?: number;
    momentumScore?: number;

    predictedRisk7d?: number;
    predictedRisk14d?: number;
    predictedRisk30d?: number;

    escalationDetected?: boolean;
};

function bearer(req: Request) {
    const auth =
        req.headers.get("authorization") || "";

    const m =
        auth.match(/^Bearer\s+(.+)$/i);

    return m ? m[1] : null;
}

function clampInt(
    n: number,
    min: number,
    max: number
) {
    return Math.min(
        max,
        Math.max(min, n)
    );
}

function riskLevelFromScore(
    score: number
): RiskLevel {
    if (score >= 85) return "critical";
    if (score >= 70) return "high";
    if (score >= 50) return "medium";
    return "low";
}

function inferStatusFromInvoices(
    invoices: { status: string }[]
) {
    const s =
        (
            invoices?.[0]?.status || ""
        ).toLowerCase();

    if (!s) {
        return "Active";
    }

    if (
        s === "past_due" ||
        s === "unpaid"
    ) {
        return "Past due";
    }

    if (s === "open") {
        return "Invoice open";
    }

    if (s === "paid") {
        return "Active";
    }

    return s
        .replaceAll("_", " ")
        .replace(
            /\b\w/g,
            (m) => m.toUpperCase()
        );
}

function applyQuerySortPage(args: {
    rows: RiskRow[];

    q: string;

    sort: SortKey;

    dir: SortDir;

    page: number;

    pageSize: number;

    lastActiveWithinDays:
    | number
    | null;
}) {
    const {
        q,
        sort,
        dir,
        page,
        pageSize,
        lastActiveWithinDays,
    } = args;

    const skip =
        (page - 1) * pageSize;

    let base =
        args.rows.filter(
            (r) =>
                (r.riskScore || 0) >= 60
        );

    if (
        lastActiveWithinDays &&
        !Number.isNaN(
            lastActiveWithinDays
        )
    ) {
        const maxMs =
            lastActiveWithinDays *
            86400000;

        base =
            base.filter((r) => {
                if (!r.lastActiveAt) {
                    return false;
                }

                const t =
                    new Date(
                        r.lastActiveAt
                    ).getTime();

                return (
                    Date.now() - t <=
                    maxMs
                );
            });
    }

    const mrrAtRisk =
        base.reduce(
            (sum, r) =>
                sum + (r.mrr || 0),
            0
        );

    const accountsAtRisk =
        base.length;

    const avgRisk =
        base.length
            ? Math.round(
                base.reduce(
                    (s, r) =>
                        s +
                        (r.riskScore || 0),
                    0
                ) / base.length
            )
            : 0;

    const totalMrr =
        base.reduce(
            (s, r) =>
                s + (r.mrr || 0),
            0
        );

    const weighted =
        totalMrr > 0
            ? Math.round(
                base.reduce(
                    (s, r) =>
                        s +
                        (r.riskScore || 0) *
                        (r.mrr || 0),
                    0
                ) / totalMrr
            )
            : avgRisk;

    const summary = {
        mrrAtRisk,

        accountsAtRisk,

        riskScore:
            weighted || avgRisk,
    };

    let filtered = base;

    if (q) {
        filtered =
            filtered.filter((r) => {
                const hay =
                    `${r.companyName} ${r.email || ""
                        } ${r.reasonLabel} ${r.status || ""
                        } ${r.signals
                            ?.map(
                                (s) =>
                                    s.label
                            )
                            .join(" ")}`
                        .toLowerCase();

                return hay.includes(q);
            });
    }

    filtered.sort((a, b) => {
        const mul =
            dir === "asc"
                ? 1
                : -1;

        if (sort === "risk") {
            return (
                (a.riskScore -
                    b.riskScore) *
                mul
            );
        }

        if (sort === "mrr") {
            return (
                (a.mrr - b.mrr) *
                mul
            );
        }

        if (
            sort ===
            "lastActiveAt"
        ) {
            const ta =
                a.lastActiveAt
                    ? new Date(
                        a.lastActiveAt
                    ).getTime()
                    : 0;

            const tb =
                b.lastActiveAt
                    ? new Date(
                        b.lastActiveAt
                    ).getTime()
                    : 0;

            return (
                (ta - tb) * mul
            );
        }

        return (
            (new Date(
                a.updatedAt
            ).getTime() -
                new Date(
                    b.updatedAt
                ).getTime()) *
            mul
        );
    });

    const total =
        filtered.length;

    const rows =
        filtered.slice(
            skip,
            skip + pageSize
        );

    return {
        total,
        rows,
        summary,
    };
}

async function getWorkspaceIdFromRequest(
    req: Request
): Promise<string> {
    const token =
        bearer(req);

    if (
        !token ||
        token === "null" ||
        token === "undefined"
    ) {
        throw new Error(
            "Unauthorized"
        );
    }

    const decoded =
        await verifyFirebaseIdToken(
            token
        );

    const user =
        await prisma.user.findFirst({
            where: {
                OR: [
                    {
                        firebaseUid:
                            decoded.uid,
                    },

                    ...(decoded.email
                        ? [
                            {
                                email:
                                    decoded.email,
                            },
                        ]
                        : []),
                ],
            },

            select: {
                workspaceId: true,
            },
        });

    if (!user?.workspaceId) {
        throw new Error(
            "Workspace not found"
        );
    }

    return user.workspaceId;
}

export async function GET(
    req: Request
) {
    try {
        const url =
            new URL(req.url);

        const q =
            (
                url.searchParams.get(
                    "q"
                ) || ""
            )
                .trim()
                .toLowerCase();

        const sort =
            (
                url.searchParams.get(
                    "sort"
                ) || "risk"
            ) as SortKey;

        const dir =
            (
                url.searchParams.get(
                    "dir"
                ) || "desc"
            ) as SortDir;

        const page =
            clampInt(
                Number(
                    url.searchParams.get(
                        "page"
                    ) || "1"
                ),
                1,
                9999
            );

        const pageSize =
            clampInt(
                Number(
                    url.searchParams.get(
                        "pageSize"
                    ) || "10"
                ),
                5,
                50
            );

        const lastActiveWithinDaysRaw =
            (
                url.searchParams.get(
                    "lastActiveWithinDays"
                ) || ""
            ).trim();

        const lastActiveWithinDays =
            lastActiveWithinDaysRaw
                ? Number(
                    lastActiveWithinDaysRaw
                )
                : null;

        const workspaceId =
            await getWorkspaceIdFromRequest(
                req
            );

        const workspace =
            await prisma.workspace.findUnique(
                {
                    where: {
                        id: workspaceId,
                    },

                    select: {
                        id: true,
                        demoMode: true,
                    },
                }
            );

        if (!workspace) {
            throw new Error(
                "Workspace not found"
            );
        }

        const customers =
            await prisma.customer.findMany(
                {
                    where: {
                        workspaceId:
                            workspace.id,
                    },

                    take: 500,

                    orderBy: {
                        updatedAt:
                            "desc",
                    },

                    select: {
                        id: true,
                        name: true,
                        email: true,

                        mrr: true,

                        churnRisk: true,

                        lastActiveAt:
                            true,

                        updatedAt:
                            true,

                        status: true,

                        invoices: {
                            select: {
                                status:
                                    true,

                                dueAt:
                                    true,

                                paidAt:
                                    true,
                            },

                            orderBy: {
                                dueAt:
                                    "desc",
                            },

                            take: 5,
                        },
                    },
                }
            );

        const snapshots =
            await prisma.accountRiskSnapshot.findMany(
                {
                    where: {
                        workspaceId:
                            workspace.id,
                    },

                    orderBy: {
                        snapshotDate:
                            "desc",
                    },
                }
            );

        const computed: RiskRow[] =
            [];

        for (const c of customers) {
            const customerSnapshots =
                snapshots.filter(
                    (s) =>
                        s.accountRiskId ===
                        c.id
                );

            const previousSnapshot =
                customerSnapshots[1];

            const computedRisk =
                buildAccountRisk({
                    id: c.id,

                    name: c.name,

                    email: c.email,

                    mrr: c.mrr,

                    churnRisk:
                        c.churnRisk,

                    lastActiveAt:
                        c.lastActiveAt,

                    invoices:
                        c.invoices,

                    previousRiskScore:
                        previousSnapshot?.riskScore ??
                        null,
                });

            const riskScore =
                computedRisk.riskScore;

            const previousRisk =
                previousSnapshot?.riskScore ??
                riskScore;

            const forecast =
                buildRiskForecast({
                    currentRisk:
                        riskScore,

                    previousRisk,

                    latestSnapshot:
                        customerSnapshots[0]
                            ? {
                                riskScore:
                                    customerSnapshots[0]
                                        .riskScore,

                                snapshotDate:
                                    customerSnapshots[0]
                                        .snapshotDate,

                                velocityScore:
                                    customerSnapshots[0]
                                        .velocityScore,
                            }
                            : null,

                    previousSnapshot:
                        customerSnapshots[1]
                            ? {
                                riskScore:
                                    customerSnapshots[1]
                                        .riskScore,

                                snapshotDate:
                                    customerSnapshots[1]
                                        .snapshotDate,

                                velocityScore:
                                    customerSnapshots[1]
                                        .velocityScore,
                            }
                            : null,
                });

            const riskDelta =
                riskScore -
                previousRisk;

            const riskTrend =
                riskDelta > 0
                    ? "up"
                    : riskDelta < 0
                        ? "down"
                        : "flat";

            const signals =
                computedRisk.signals.map(
                    (s) => ({
                        key: s.key,
                        label: s.label,
                    })
                );

            computed.push({
                id: c.id,

                companyName:
                    c.name ||
                    "Unknown",

                email: c.email,

                riskScore,

                riskDelta,

                riskTrend,

                riskLevel:
                    riskLevelFromScore(
                        riskScore
                    ),

                reasonKey:
                    computedRisk.reasonKey,

                reasonLabel:
                    computedRisk.reasonLabel,

                status:
                    inferStatusFromInvoices(
                        c.invoices
                    ),

                lastActiveAt:
                    c.lastActiveAt
                        ? c.lastActiveAt.toISOString()
                        : null,

                signals,

                nextAction:
                    computedRisk
                        .nextActions?.[0] ||
                    "Review account",

                mrr:
                    Number(
                        c.mrr || 0
                    ),

                updatedAt:
                    (
                        c.updatedAt ||
                        new Date()
                    ).toISOString(),

                velocityScore:
                    forecast.velocityScore,

                accelerationScore:
                    forecast.accelerationScore,

                momentumScore:
                    forecast.momentumScore,

                predictedRisk7d:
                    forecast.predictedRisk7d,

                predictedRisk14d:
                    forecast.predictedRisk14d,

                predictedRisk30d:
                    forecast.predictedRisk30d,

                escalationDetected:
                    forecast.escalationDetected,
            });

            const latestSnapshot =
                customerSnapshots[0];

            const shouldCreateSnapshot =
                !latestSnapshot ||
                Date.now() -
                new Date(
                    latestSnapshot.snapshotDate
                ).getTime() >
                1000 *
                60 *
                60 *
                12;

            if (shouldCreateSnapshot) {
                await prisma.accountRiskSnapshot.create(
                    {
                        data: {
                            workspaceId:
                                workspace.id,

                            accountRiskId:
                                c.id,

                            companyName:
                                c.name ||
                                "Unknown",

                            riskScore,

                            reasonKey:
                                computedRisk.reasonKey,

                            reasonLabel:
                                computedRisk.reasonLabel,

                            velocityScore:
                                forecast.velocityScore,

                            accelerationScore:
                                forecast.accelerationScore,

                            momentumScore:
                                forecast.momentumScore,

                            predictedRisk7d:
                                forecast.predictedRisk7d,

                            predictedRisk14d:
                                forecast.predictedRisk14d,

                            predictedRisk30d:
                                forecast.predictedRisk30d,

                            escalationDetected:
                                forecast.escalationDetected,

                            mrrMinor:
                                Number(
                                    c.mrr ||
                                    0
                                ),

                            snapshotDate:
                                new Date(),
                        },
                    }
                );
            }
        }

        const {
            total,
            rows,
            summary,
        } =
            applyQuerySortPage({
                rows:
                    computed,

                q,

                sort,

                dir,

                page,

                pageSize,

                lastActiveWithinDays,
            });

        return NextResponse.json({
            ok: true,

            mode:
                workspace.demoMode
                    ? "demo"
                    : "live",

            page,

            pageSize,

            total,

            rows,

            summary,
        });
    } catch (e: any) {
        const msg =
            e?.message ||
            "Failed to load accounts at risk";

        const status =
            msg ===
                "Unauthorized"
                ? 401
                : msg ===
                    "Workspace not found"
                    ? 404
                    : 500;

        return NextResponse.json(
            {
                ok: false,
                error: msg,
            },
            {
                status,
            }
        );
    }
}