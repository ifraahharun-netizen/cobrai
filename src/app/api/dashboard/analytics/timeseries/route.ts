import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyFirebaseIdToken } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RangeKey = "auto" | "12m" | "ytd" | "24m";

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


function getExpansionReason(label?: string, upsideMinor?: number) {
    const l = (label || "").toLowerCase();
    const upside = Number(upsideMinor || 0);

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

function getExpansionConfidence(upsideMinor?: number): "High" | "Medium" | "Low" {
    const upside = Number(upsideMinor || 0);

    if (upside >= 20000) return "High";
    if (upside >= 8000) return "Medium";
    return "Low";
}

function getBearerToken(req: Request) {
    const h = req.headers.get("authorization") || "";
    const m = h.match(/^Bearer\s+(.+)$/i);
    return m?.[1] || null;
}

function monthKey(date: Date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function endOfMonth(date: Date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function startOfMonth(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function resolveRange(input: string | null): RangeKey {
    if (input === "12m" || input === "ytd" || input === "24m") return input;
    return "12m";
}

function buildMonthKeys(range: RangeKey): string[] {
    const now = new Date();
    const keys: string[] = [];

    if (range === "ytd") {
        for (let m = 0; m <= now.getMonth(); m++) {
            keys.push(`${now.getFullYear()}-${String(m + 1).padStart(2, "0")}`);
        }
        return keys;
    }

    const count = range === "24m" ? 24 : 12;
    const cursor = new Date(now.getFullYear(), now.getMonth(), 1);

    for (let i = count - 1; i >= 0; i--) {
        const d = new Date(cursor.getFullYear(), cursor.getMonth() - i, 1);
        keys.push(monthKey(d));
    }

    return keys;
}

function getBusinessMonthLabel(keys: string[]) {
    const current = keys[keys.length - 1];
    const previous = keys.length > 1 ? keys[keys.length - 2] : null;
    return { current, previous };
}

function daysSince(date?: Date | null) {
    if (!date) return 999;
    const diff = Date.now() - new Date(date).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function estimateUpsideMinor(mrrMinor: number) {
    return Math.round(mrrMinor * 0.25);
}

function pickExpansionAction(label?: string) {
    const l = (label || "").toLowerCase();

    if (l.includes("upgrade")) return "Upsell premium plan";
    if (l.includes("new")) return "Expand usage / upsell";
    if (l.includes("payment")) return "Convert to annual plan";
    if (l.includes("expansion")) return "Offer upgrade based on usage";

    return "Send expansion email";
}

function buildDemoSeries(keys: string[]) {
    const count = keys.length;

    const mrrStart = count >= 12 ? 41200 : 64200;
    const mrrEnd = 78600;

    const churnStart = count >= 12 ? 2.1 : 3.1;
    const churnEnd = count >= 12 ? 4.6 : 4.2;

    const mauStart = count >= 12 ? 12 : 18;
    const mauEnd = count >= 12 ? 34 : 31;

    const mrr = keys.map((key, idx) => {
        const t = count === 1 ? 1 : idx / (count - 1);
        const eased = Math.pow(t, 0.92);
        const valueMinor = Math.round(mrrStart + (mrrEnd - mrrStart) * eased);
        return { month: key, valueMinor };
    });

    const churn = keys.map((key, idx) => {
        const t = count === 1 ? 1 : idx / (count - 1);
        const eased = Math.pow(t, 1.08);
        const raw = churnStart + (churnEnd - churnStart) * eased;
        return { month: key, valuePct: Math.round(raw * 10) / 10 };
    });

    const mau = keys.map((key, idx) => {
        const t = count === 1 ? 1 : idx / (count - 1);
        const eased = Math.pow(t, 0.95);
        const activeUsers = Math.round(mauStart + (mauEnd - mauStart) * eased);
        return { month: key, activeUsers };
    });

    const currentMrr = mrr[mrr.length - 1]?.valueMinor ?? 0;
    const prevMrr = mrr.length > 1 ? mrr[mrr.length - 2]?.valueMinor ?? null : null;
    const deltaMinor = typeof prevMrr === "number" ? currentMrr - prevMrr : null;
    const deltaPct =
        typeof prevMrr === "number" && prevMrr > 0
            ? Math.round(((currentMrr - prevMrr) / prevMrr) * 1000) / 10
            : null;

    const currentChurn = churn[churn.length - 1]?.valuePct ?? null;
    const prevChurn = churn.length > 1 ? churn[churn.length - 2]?.valuePct ?? null : null;
    const deltaPp =
        typeof currentChurn === "number" && typeof prevChurn === "number"
            ? Math.round((currentChurn - prevChurn) * 10) / 10
            : null;

    const driverAccounts: DriverAccountRow[] = [
        {
            id: "brightops",
            accountName: "BrightOps",
            email: "ops@brightops.com",
            label: "Annual plan upgrade",
            valueMinor: 13300,
            tone: "positive",
            lastEventAt: new Date(`${keys[keys.length - 1]}-18T10:20:00.000Z`).toISOString(),
        },
        {
            id: "kitecrm",
            accountName: "KiteCRM",
            email: "finance@kitecrm.com",
            label: "New subscription started",
            valueMinor: 12400,
            tone: "positive",
            lastEventAt: new Date(`${keys[keys.length - 1]}-12T09:10:00.000Z`).toISOString(),
        },
        {
            id: "cedarworks",
            accountName: "CedarWorks",
            email: "hello@cedarworks.io",
            label: "Recovered failed payment",
            valueMinor: 6800,
            tone: "positive",
            lastEventAt: new Date(`${keys[keys.length - 1]}-22T14:35:00.000Z`).toISOString(),
        },
    ];

    const topMovers: TopMoverRow[] = [
        {
            id: "orbitalhr",
            name: "OrbitalHR",
            email: "team@orbitalhr.com",
            deltaMinor: -8990,
            label: "High churn risk",
        },
        {
            id: "brightops",
            name: "BrightOps",
            email: "ops@brightops.com",
            deltaMinor: 5200,
            label: "Expansion",
        },
        {
            id: "pulsedesk",
            name: "PulseDesk",
            email: "ops@pulsedesk.io",
            deltaMinor: -3100,
            label: "Contraction risk",
        },
        {
            id: "kitecrm",
            name: "KiteCRM",
            email: "finance@kitecrm.com",
            deltaMinor: 2600,
            label: "New subscription",
        },
    ];

    const churnedAccounts: ChurnedAccountRow[] = [
        {
            id: "orbitalhr",
            name: "OrbitalHR",
            email: "team@orbitalhr.com",
            mrrMinor: 8990,
            lastEventAt: new Date(`${keys[keys.length - 1]}-24T11:00:00.000Z`).toISOString(),
        },
        {
            id: "atlasworks",
            name: "AtlasWorks",
            email: "hello@atlasworks.io",
            mrrMinor: 4500,
            lastEventAt: new Date(`${keys[keys.length - 1]}-19T15:25:00.000Z`).toISOString(),
        },
        {
            id: "novainbox",
            name: "NovaInbox",
            email: "support@novainbox.com",
            mrrMinor: 2800,
            lastEventAt: new Date(`${keys[keys.length - 1]}-15T08:45:00.000Z`).toISOString(),
        },
    ];

    const expansionRows: ExpansionRow[] = [
        {
            id: "brightops",
            name: "BrightOps",
            email: "ops@brightops.com",
            upsideMinor: 13300,
            action: "Upsell premium plan",
            lastEventAt: new Date(`${keys[keys.length - 1]}-18T10:20:00.000Z`).toISOString(),
            reason: "Recent upgrade activity suggests more expansion potential",
            confidence: "Medium",
        },
        {
            id: "kitecrm",
            name: "KiteCRM",
            email: "finance@kitecrm.com",
            upsideMinor: 9800,
            action: "Expand usage / upsell",
            lastEventAt: new Date(`${keys[keys.length - 1]}-12T09:10:00.000Z`).toISOString(),
            reason: "Strong recent activation suggests room to expand usage",
            confidence: "Medium",
        },
        {
            id: "cedarworks",
            name: "CedarWorks",
            email: "hello@cedarworks.io",
            upsideMinor: 6400,
            action: "Convert to annual plan",
            lastEventAt: new Date(`${keys[keys.length - 1]}-22T14:35:00.000Z`).toISOString(),
            reason: "Recovered revenue suggests a good conversion window",
            confidence: "Low",
        },
    ];

    return {
        mrr,
        churn,
        mau,
        expansionRows,
        insights: {
            mrr: {
                currentMinor: currentMrr,
                prevMinor: prevMrr,
                deltaMinor,
                deltaPct,
                drivers: {
                    newMinor: 12400,
                    expansionMinor: 6800,
                    contractionMinor: 5900,
                    churnedMinor: 13300,
                    driverAccounts,
                },
                topMovers,
            },
            churn: {
                currentPct: currentChurn,
                prevPct: prevChurn,
                deltaPp,
                churnedAccounts,
            },
            months: getBusinessMonthLabel(keys),
        },
    };
}

export async function GET(req: Request) {
    try {
        const token = getBearerToken(req);
        if (!token) {
            return NextResponse.json(
                { ok: false, error: "Missing Authorization Bearer token" },
                { status: 401 }
            );
        }

        const decoded = await verifyFirebaseIdToken(token);
        const firebaseUid = decoded.uid;

        const user = await prisma.user.findUnique({
            where: { firebaseUid },
            select: { workspaceId: true },
        });

        if (!user?.workspaceId) {
            return NextResponse.json(
                { ok: false, error: "No workspace for user" },
                { status: 404 }
            );
        }

        const workspaceId = user.workspaceId;

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { demoMode: true },
        });

        const url = new URL(req.url);
        const rangeUsed = resolveRange(url.searchParams.get("range"));
        const keys = buildMonthKeys(rangeUsed);

        if (workspace?.demoMode) {
            const demo = buildDemoSeries(keys);

            return NextResponse.json({
                ok: true,
                mode: "demo",
                rangeUsed,
                mrr: demo.mrr,
                churn: demo.churn,
                mau: demo.mau,
                expansionRows: demo.expansionRows,
                insights: demo.insights,
            });
        }

        const customers = await prisma.customer.findMany({
            where: { workspaceId },
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
        });

        const riskRows = await prisma.accountRisk.findMany({
            where: { workspaceId },
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
            orderBy: [{ riskScore: "desc" }, { updatedAt: "desc" }],
            take: 20,
        });

        const events = await prisma.event.findMany({
            where: {
                workspaceId,
                occurredAt: {
                    gte: startOfMonth(new Date()),
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
            orderBy: { occurredAt: "desc" },
        });

        const invoices = await prisma.invoice.findMany({
            where: {
                workspaceId,
                paidAt: {
                    gte: startOfMonth(new Date()),
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
            orderBy: { paidAt: "desc" },
        });

        const snapshotRows = await prisma.mrrSnapshot.findMany({
            where: {
                workspaceId,
                month: { in: keys },
                active: true,
            },
            select: {
                month: true,
                mrrMinor: true,
            },
        });

        const snapshotSumByMonth = new Map<string, number>();
        for (const row of snapshotRows) {
            snapshotSumByMonth.set(
                row.month,
                (snapshotSumByMonth.get(row.month) || 0) + Number(row.mrrMinor || 0)
            );
        }

        const mrr = keys.map((key) => ({
            month: key,
            valueMinor: snapshotSumByMonth.get(key) || 0,
        }));

        const churn = keys.map((key, idx) => {
            if (idx === 0) {
                return { month: key, valuePct: null };
            }

            const [year, month] = key.split("-").map(Number);
            const monthEnd = endOfMonth(new Date(year, month - 1, 1));

            const prevKey = keys[idx - 1];
            const [prevYear, prevMonth] = prevKey.split("-").map(Number);
            const prevMonthEnd = endOfMonth(new Date(prevYear, prevMonth - 1, 1));

            const prevActiveBase = customers.filter((c) => {
                const createdOk = c.createdAt <= prevMonthEnd;
                const activeAtPrevEnd = !c.canceledAt || c.canceledAt > prevMonthEnd;
                return createdOk && activeAtPrevEnd;
            });

            const churnedThisMonth = prevActiveBase.filter((c) => {
                return !!c.canceledAt && c.canceledAt > prevMonthEnd && c.canceledAt <= monthEnd;
            });

            const valuePct =
                prevActiveBase.length > 0
                    ? Math.round((churnedThisMonth.length / prevActiveBase.length) * 1000) / 10
                    : null;

            return { month: key, valuePct };
        });

        const mau = keys.map((key) => {
            const [year, month] = key.split("-").map(Number);
            const monthStart = new Date(year, month - 1, 1);
            const monthEnd = endOfMonth(monthStart);

            const activeUsers = customers.filter((c) => {
                if (!c.lastActiveAt) return false;
                return c.lastActiveAt >= monthStart && c.lastActiveAt <= monthEnd;
            }).length;

            return { month: key, activeUsers };
        });

        const currentMrr = mrr[mrr.length - 1]?.valueMinor ?? 0;
        const prevMrr = mrr.length > 1 ? mrr[mrr.length - 2]?.valueMinor ?? null : null;
        const deltaMinor = typeof prevMrr === "number" ? currentMrr - prevMrr : null;
        const deltaPct =
            typeof prevMrr === "number" && prevMrr > 0
                ? Math.round(((currentMrr - prevMrr) / prevMrr) * 1000) / 10
                : null;

        const currentChurn = churn[churn.length - 1]?.valuePct ?? null;
        const prevChurn = churn.length > 1 ? churn[churn.length - 2]?.valuePct ?? null : null;
        const deltaPp =
            typeof currentChurn === "number" && typeof prevChurn === "number"
                ? Math.round((currentChurn - prevChurn) * 10) / 10
                : null;

        const driverAccountsMap = new Map<string, DriverAccountRow>();

        for (const event of events) {
            const customer = event.customer;
            if (!customer) continue;

            const type = String(event.type || "").toLowerCase();
            const amountMinor =
                typeof event.value === "number" && Number.isFinite(event.value)
                    ? Math.round(event.value * 100)
                    : Math.round(Number(customer.mrr || 0) * 100);

            if (amountMinor <= 0) continue;

            let label: string | null = null;

            if (
                type.includes("new_subscription") ||
                type.includes("subscription_created") ||
                type === "new_subscription"
            ) {
                label = "New subscription started";
            } else if (
                type.includes("upgrade") ||
                type.includes("seat_increase") ||
                type.includes("expansion") ||
                type === "plan_upgraded"
            ) {
                label = "Plan upgrade";
            }

            if (!label) continue;

            const existing = driverAccountsMap.get(customer.id);
            const nextValue = (existing?.valueMinor || 0) + amountMinor;

            let nextLastEventAt = event.occurredAt ? event.occurredAt.toISOString() : null;
            if (existing?.lastEventAt && nextLastEventAt) {
                nextLastEventAt =
                    new Date(existing.lastEventAt) > new Date(nextLastEventAt)
                        ? existing.lastEventAt
                        : nextLastEventAt;
            } else if (existing?.lastEventAt) {
                nextLastEventAt = existing.lastEventAt;
            }

            driverAccountsMap.set(customer.id, {
                id: customer.id,
                accountName: customer.name || "Unnamed account",
                email: customer.email || null,
                label,
                valueMinor: nextValue,
                tone: "positive",
                lastEventAt: nextLastEventAt,
            });
        }

        for (const invoice of invoices) {
            const customer = invoice.customer;
            if (!customer) continue;

            const recoveredMinor = Math.round(Number(invoice.amount || 0));
            if (recoveredMinor <= 0) continue;

            const existing = driverAccountsMap.get(customer.id);
            const existingValue = existing?.valueMinor || 0;

            let nextLastEventAt = invoice.paidAt ? invoice.paidAt.toISOString() : null;
            if (existing?.lastEventAt && nextLastEventAt) {
                nextLastEventAt =
                    new Date(existing.lastEventAt) > new Date(nextLastEventAt)
                        ? existing.lastEventAt
                        : nextLastEventAt;
            } else if (existing?.lastEventAt) {
                nextLastEventAt = existing.lastEventAt;
            }

            driverAccountsMap.set(customer.id, {
                id: customer.id,
                accountName: customer.name || "Unnamed account",
                email: customer.email || null,
                label: existing?.label || "Recovered successful payment",
                valueMinor: existingValue + recoveredMinor,
                tone: "positive",
                lastEventAt: nextLastEventAt,
            });
        }

        const driverAccounts = Array.from(driverAccountsMap.values())
            .sort((a, b) => b.valueMinor - a.valueMinor)
            .slice(0, 12);

        const newMinor = driverAccounts
            .filter((row) => row.label.toLowerCase().includes("new subscription"))
            .reduce((sum, row) => sum + row.valueMinor, 0);

        const expansionMinor = driverAccounts
            .filter((row) => row.label.toLowerCase().includes("upgrade"))
            .reduce((sum, row) => sum + row.valueMinor, 0);

        const recoveredMinor = driverAccounts
            .filter((row) => row.label.toLowerCase().includes("payment"))
            .reduce((sum, row) => sum + row.valueMinor, 0);

        const churnedAccounts: ChurnedAccountRow[] = riskRows
            .filter((r) => r.riskScore >= 70)
            .slice(0, 8)
            .map((r) => ({
                id: r.customerId || r.id,
                name: r.companyName,
                email: r.customer?.email || null,
                mrrMinor: Math.round(Number(r.mrr || 0) * 100),
                lastEventAt: r.updatedAt ? r.updatedAt.toISOString() : null,
            }));

        const churnedMinor = churnedAccounts.reduce((sum, row) => sum + row.mrrMinor, 0);

        const topMovers: TopMoverRow[] = [
            ...driverAccounts.map((row) => ({
                id: row.id,
                name: row.accountName,
                email: row.email,
                deltaMinor: row.valueMinor,
                label: row.label,
            })),
            ...churnedAccounts.map((row) => ({
                id: row.id,
                name: row.name,
                email: row.email,
                deltaMinor: -row.mrrMinor,
                label: "High churn risk",
            })),
        ]
            .sort((a, b) => Math.abs(b.deltaMinor) - Math.abs(a.deltaMinor))
            .slice(0, 12);

        const expansionRows: ExpansionRow[] = [];

        for (const row of driverAccounts) {
            if (row.valueMinor <= 0) continue;

            const upsideMinor = Math.round(row.valueMinor * 0.6);

            expansionRows.push({
                id: row.id,
                name: row.accountName,
                email: row.email,
                upsideMinor,
                action: pickExpansionAction(row.label),
                lastEventAt: row.lastEventAt || null,
                reason: getExpansionReason(row.label, upsideMinor),
                confidence: getExpansionConfidence(upsideMinor),
            });
        }

        for (const c of customers) {
            const mrrMinor = Math.round(Number(c.mrr || 0) * 100);
            if (mrrMinor <= 0) continue;

            const inactiveDays = daysSince(c.lastActiveAt);
            const riskScore = Number(c.churnRisk || 0);

            const isActive = inactiveDays <= 14;
            const notHighRisk = riskScore < 70;
            const notCanceled = !c.canceledAt;
            const notPastDue = (c.status || "").toLowerCase() !== "past_due";

            if (!isActive || !notHighRisk || !notCanceled || !notPastDue) continue;
            if (expansionRows.find((e) => e.id === c.id)) continue;

            const upsideMinor = estimateUpsideMinor(mrrMinor);

            expansionRows.push({
                id: c.id,
                name: c.name || "Unnamed account",
                email: c.email || null,
                upsideMinor,
                action: "Send expansion email",
                lastEventAt: c.lastActiveAt ? c.lastActiveAt.toISOString() : null,
                reason: getExpansionReason("active customer", upsideMinor),
                confidence: getExpansionConfidence(upsideMinor),
            });
        }

        const finalExpansionRows = expansionRows
            .sort((a, b) => b.upsideMinor - a.upsideMinor)
            .slice(0, 6);

        return NextResponse.json({
            ok: true,
            mode: "live",
            rangeUsed,
            mrr,
            churn,
            mau,
            expansionRows: finalExpansionRows,
            insights: {
                mrr: {
                    currentMinor: currentMrr,
                    prevMinor: prevMrr,
                    deltaMinor,
                    deltaPct,
                    drivers: {
                        newMinor,
                        expansionMinor: expansionMinor + recoveredMinor,
                        contractionMinor: 0,
                        churnedMinor,
                        driverAccounts,
                    },
                    topMovers,
                },
                churn: {
                    currentPct: currentChurn,
                    prevPct: prevChurn,
                    deltaPp,
                    churnedAccounts,
                },
                months: getBusinessMonthLabel(keys),
            },
        });
    } catch (e: any) {
        console.error("dashboard/analytics/timeseries GET failed:", e);
        return NextResponse.json(
            { ok: false, error: e?.message ?? "Failed to load analytics timeseries" },
            { status: 500 }
        );
    }
}