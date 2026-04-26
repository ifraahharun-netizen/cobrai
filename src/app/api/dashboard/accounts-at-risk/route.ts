import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyFirebaseIdToken } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RiskLevel = "critical" | "high" | "medium" | "low";
type SortKey = "risk" | "mrr" | "updatedAt" | "lastActiveAt";
type SortDir = "asc" | "desc";

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
    riskTrend: "up" | "down" | "flat";
    riskLevel: RiskLevel;
    reasonKey: string;
    reasonLabel: string;
    status: string;
    lastActiveAt: string | null;
    signals: Signal[];
    nextAction: string;
    mrr: number;
    updatedAt: string;
};

const DEMO_WORKSPACE_ID = "ws_demo";

/* =========================
   Demo data
   ========================= */
function demoRows() {
    const now = Date.now();
    const daysAgo = (d: number) => new Date(now - d * 86400000).toISOString();

    return [
        {
            id: "demo-1",
            companyName: "CedarWorks",
            email: "owner@cedarworks.com",
            mrr: 219,
            riskScore: 88,
            previousRiskScore: 82,
            churnRisk: 0.88,
            lastActiveAt: daysAgo(14),
            updatedAt: daysAgo(2),
            invoiceStatus: "past_due",
        },
        {
            id: "demo-2",
            companyName: "Kite Labs",
            email: "hello@kitelabs.io",
            mrr: 129,
            riskScore: 82,
            previousRiskScore: 86,
            churnRisk: 0.82,
            lastActiveAt: daysAgo(9),
            updatedAt: daysAgo(2),
            invoiceStatus: "open",
        },
        {
            id: "demo-3",
            companyName: "BloomPay",
            email: "support@bloompay.co",
            mrr: 349,
            riskScore: 61,
            previousRiskScore: 58,
            churnRisk: 0.61,
            lastActiveAt: daysAgo(21),
            updatedAt: daysAgo(2),
            invoiceStatus: "paid",
        },
        {
            id: "demo-4",
            companyName: "Northbyte",
            email: "team@northbyte.dev",
            mrr: 499,
            riskScore: 77,
            previousRiskScore: 72,
            churnRisk: 0.77,
            lastActiveAt: daysAgo(12),
            updatedAt: daysAgo(1),
            invoiceStatus: "paid",
        },
        {
            id: "demo-5",
            companyName: "OrbitalHR",
            email: "billing@orbitalhr.com",
            mrr: 899,
            riskScore: 90,
            previousRiskScore: 93,
            churnRisk: 0.9,
            lastActiveAt: daysAgo(30),
            updatedAt: daysAgo(3),
            invoiceStatus: "unpaid",
        },
        {
            id: "demo-6",
            companyName: "SproutCRM",
            email: "admin@sproutcrm.app",
            mrr: 199,
            riskScore: 68,
            previousRiskScore: 70,
            churnRisk: 0.68,
            lastActiveAt: daysAgo(16),
            updatedAt: daysAgo(4),
            invoiceStatus: "paid",
        },
        {
            id: "demo-7",
            companyName: "VantaFlow",
            email: "contact@vantaflow.io",
            mrr: 1299,
            riskScore: 74,
            previousRiskScore: 69,
            churnRisk: 0.74,
            lastActiveAt: daysAgo(11),
            updatedAt: daysAgo(5),
            invoiceStatus: "paid",
        },
        {
            id: "demo-8",
            companyName: "RelayOps",
            email: "ops@relayops.com",
            mrr: 159,
            riskScore: 80,
            previousRiskScore: 80,
            churnRisk: 0.8,
            lastActiveAt: daysAgo(10),
            updatedAt: daysAgo(1),
            invoiceStatus: "open",
        },
        {
            id: "demo-9",
            companyName: "PulseAI",
            email: "founder@pulseai.tech",
            mrr: 299,
            riskScore: 66,
            previousRiskScore: 61,
            churnRisk: 0.66,
            lastActiveAt: daysAgo(18),
            updatedAt: daysAgo(6),
            invoiceStatus: "paid",
        },
        {
            id: "demo-10",
            companyName: "FinchDesk",
            email: "accounts@finchdesk.io",
            mrr: 749,
            riskScore: 86,
            previousRiskScore: 79,
            churnRisk: 0.86,
            lastActiveAt: daysAgo(25),
            updatedAt: daysAgo(2),
            invoiceStatus: "past_due",
        },
        {
            id: "demo-11",
            companyName: "SignalStack",
            email: "support@signalstack.dev",
            mrr: 99,
            riskScore: 62,
            previousRiskScore: 66,
            churnRisk: 0.62,
            lastActiveAt: daysAgo(13),
            updatedAt: daysAgo(7),
            invoiceStatus: "paid",
        },
        {
            id: "demo-12",
            companyName: "BreezeForms",
            email: "hello@breezeforms.co",
            mrr: 399,
            riskScore: 71,
            previousRiskScore: 68,
            churnRisk: 0.71,
            lastActiveAt: daysAgo(8),
            updatedAt: daysAgo(3),
            invoiceStatus: "paid",
        },
    ];
}

/* =========================
   Helpers
   ========================= */
function bearer(req: Request) {
    const auth = req.headers.get("authorization") || "";
    const m = auth.match(/^Bearer\s+(.+)$/i);
    return m ? m[1] : null;
}

function clampInt(n: number, min: number, max: number) {
    return Math.min(max, Math.max(min, n));
}

function riskLevelFromScore(score: number): RiskLevel {
    if (score >= 85) return "critical";
    if (score >= 70) return "high";
    if (score >= 50) return "medium";
    return "low";
}

function buildSignals(c: {
    churnRisk: number;
    invoices: { status: string; dueAt: Date; paidAt: Date | null }[];
    lastActiveAt: Date | null;
}) {
    const signals: Signal[] = [];

    if (c.churnRisk >= 0.85) signals.push({ key: "churn_risk_high", label: "High churn risk" });
    else if (c.churnRisk >= 0.7) signals.push({ key: "churn_risk_elevated", label: "Elevated churn risk" });

    const billingBad = c.invoices.some((inv) => {
        const s = (inv.status || "").toLowerCase();
        return s === "past_due" || s === "unpaid" || s === "open";
    });
    if (billingBad) signals.push({ key: "billing_issue", label: "Billing issue" });

    const inactiveDays =
        c.lastActiveAt ? Math.floor((Date.now() - c.lastActiveAt.getTime()) / 86400000) : null;
    if (inactiveDays !== null && inactiveDays >= 10) {
        signals.push({ key: "inactive", label: `No activity in ${inactiveDays} days` });
    }

    if (!signals.length) signals.push({ key: "early_signals", label: "Early risk signals" });
    return signals;
}

function primaryReasonKey(signals: Signal[]) {
    const keys = new Set(signals.map((s) => s.key));
    if (keys.has("billing_issue")) return "billing_issue";
    if (keys.has("inactive")) return "inactive";
    if (keys.has("churn_risk_high")) return "churn_risk_high";
    if (keys.has("churn_risk_elevated")) return "churn_risk_elevated";
    return signals[0]?.key || "early_signals";
}

function buildReasonText(signals: Signal[]) {
    return signals.slice(0, 2).map((s) => s.label).join(" • ");
}

function nextActionFromSignals(signals: Signal[]) {
    const keys = new Set(signals.map((s) => s.key));
    if (keys.has("billing_issue")) return "Resolve billing issue + confirm billing contact today.";
    if (keys.has("inactive")) {
        return "Reach out with a quick check-in + offer a 10-min walkthrough to re-activate usage.";
    }
    if (keys.has("churn_risk_high") || keys.has("churn_risk_elevated")) {
        return "Schedule a short call with the champion and align on outcomes for the next 2 weeks.";
    }
    return "Review recent activity and contact the account champion within 24h.";
}

function inferStatusFromInvoices(invoices: { status: string }[]) {
    const s = (invoices?.[0]?.status || "").toLowerCase();
    if (!s) return "Active";
    if (s === "past_due" || s === "unpaid") return "Past due";
    if (s === "open") return "Invoice open";
    if (s === "paid") return "Active";
    return s.replaceAll("_", " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function buildDemoComputedRows(): RiskRow[] {
    return demoRows().map((d) => {
        const signals = buildSignals({
            churnRisk: d.churnRisk,
            invoices: [{ status: d.invoiceStatus, dueAt: new Date(), paidAt: null }],
            lastActiveAt: d.lastActiveAt ? new Date(d.lastActiveAt) : null,
        });

        const prev = d.previousRiskScore ?? d.riskScore;
        const riskDelta = d.riskScore - prev;
        const riskTrend = riskDelta > 0 ? "up" : riskDelta < 0 ? "down" : "flat";

        return {
            id: d.id,
            companyName: d.companyName,
            email: d.email,
            riskScore: d.riskScore,
            riskDelta,
            riskTrend,
            riskLevel: riskLevelFromScore(d.riskScore),
            reasonKey: primaryReasonKey(signals),
            reasonLabel: buildReasonText(signals),
            status: inferStatusFromInvoices([{ status: d.invoiceStatus }]),
            lastActiveAt: d.lastActiveAt,
            signals,
            nextAction: nextActionFromSignals(signals),
            mrr: d.mrr,
            updatedAt: d.updatedAt,
        };
    });
}

function applyQuerySortPage(args: {
    rows: RiskRow[];
    q: string;
    sort: SortKey;
    dir: SortDir;
    page: number;
    pageSize: number;
    lastActiveWithinDays: number | null;
}) {
    const { q, sort, dir, page, pageSize, lastActiveWithinDays } = args;
    const skip = (page - 1) * pageSize;

    let base = args.rows.filter((r) => (r.riskScore || 0) >= 60);

    if (lastActiveWithinDays && !Number.isNaN(lastActiveWithinDays)) {
        const maxMs = lastActiveWithinDays * 86400000;
        base = base.filter((r) => {
            if (!r.lastActiveAt) return false;
            const t = new Date(r.lastActiveAt).getTime();
            return Date.now() - t <= maxMs;
        });
    }

    const mrrAtRisk = base.reduce((sum, r) => sum + (r.mrr || 0), 0);
    const accountsAtRisk = base.length;

    const avgRisk = base.length
        ? Math.round(base.reduce((s, r) => s + (r.riskScore || 0), 0) / base.length)
        : 0;

    const totalMrr = base.reduce((s, r) => s + (r.mrr || 0), 0);
    const weighted =
        totalMrr > 0
            ? Math.round(base.reduce((s, r) => s + (r.riskScore || 0) * (r.mrr || 0), 0) / totalMrr)
            : avgRisk;

    const summary = { mrrAtRisk, accountsAtRisk, riskScore: weighted || avgRisk };

    let filtered = base;

    if (q) {
        filtered = filtered.filter((r) => {
            const hay =
                `${r.companyName} ${r.email || ""} ${r.reasonLabel} ${r.status || ""} ${r.signals
                    ?.map((s) => s.label)
                    .join(" ")}`.toLowerCase();
            return hay.includes(q);
        });
    }

    filtered.sort((a, b) => {
        const mul = dir === "asc" ? 1 : -1;
        if (sort === "risk") return (a.riskScore - b.riskScore) * mul;
        if (sort === "mrr") return (a.mrr - b.mrr) * mul;
        if (sort === "lastActiveAt") {
            const ta = a.lastActiveAt ? new Date(a.lastActiveAt).getTime() : 0;
            const tb = b.lastActiveAt ? new Date(b.lastActiveAt).getTime() : 0;
            return (ta - tb) * mul;
        }
        return (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()) * mul;
    });

    const total = filtered.length;
    const rows = filtered.slice(skip, skip + pageSize);

    return { total, rows, summary };
}

async function getWorkspaceIdFromRequest(req: Request): Promise<string> {
    const token = bearer(req);

    if (!token || token === "null" || token === "undefined") {
        throw new Error("Unauthorized");
    }

    const decoded = await verifyFirebaseIdToken(token);

    const user = await prisma.user.findFirst({
        where: {
            OR: [
                { firebaseUid: decoded.uid },
                ...(decoded.email ? [{ email: decoded.email }] : []),
            ],
        },
        select: { workspaceId: true },
    });

    if (!user?.workspaceId) {
        throw new Error("Workspace not found");
    }

    return user.workspaceId;
}

/* =========================
   Route
   ========================= */
export async function GET(req: Request) {
    try {
        const url = new URL(req.url);

        const q = (url.searchParams.get("q") || "").trim().toLowerCase();
        const sort = (url.searchParams.get("sort") || "risk") as SortKey;
        const dir = (url.searchParams.get("dir") || "desc") as SortDir;

        const page = clampInt(Number(url.searchParams.get("page") || "1"), 1, 9999);
        const pageSize = clampInt(Number(url.searchParams.get("pageSize") || "10"), 5, 50);

        const lastActiveWithinDaysRaw = (url.searchParams.get("lastActiveWithinDays") || "").trim();
        const lastActiveWithinDays = lastActiveWithinDaysRaw ? Number(lastActiveWithinDaysRaw) : null;

        const workspaceId = await getWorkspaceIdFromRequest(req);

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { id: true, demoMode: true },
        });

        if (!workspace) {
            throw new Error("Workspace not found");
        }

        const mode: "demo" | "live" = workspace.demoMode === true ? "demo" : "live";

        if (mode === "demo") {
            const demo = buildDemoComputedRows();
            const { total, rows, summary } = applyQuerySortPage({
                rows: demo,
                q,
                sort,
                dir,
                page,
                pageSize,
                lastActiveWithinDays,
            });

            return NextResponse.json({
                ok: true,
                mode: "demo",
                page,
                pageSize,
                total,
                rows,
                summary,
            });
        }

        const customers = await prisma.customer.findMany({
            where: { workspaceId: workspace.id },
            take: 500,
            orderBy: { updatedAt: "desc" },
            select: {
                id: true,
                name: true,
                email: true,
                mrr: true,
                churnRisk: true,
                lastActiveAt: true,
                updatedAt: true,
                status: true,
                invoices: {
                    select: { status: true, dueAt: true, paidAt: true },
                    orderBy: { dueAt: "desc" },
                    take: 5,
                },
            },
        });

        const existingRisks = await prisma.accountRisk.findMany({
            where: { workspaceId: workspace.id },
            select: {
                id: true,
                customerId: true,
                riskScore: true,
            },
        });

        const riskByCustomerId = new Map(
            existingRisks
                .filter((r) => r.customerId)
                .map((r) => [r.customerId as string, r.riskScore])
        );

        const computed: RiskRow[] = customers.map((c) => {
            const riskScore = Math.round((c.churnRisk || 0) * 100);
            const signals = buildSignals({
                churnRisk: c.churnRisk || 0,
                invoices: c.invoices,
                lastActiveAt: c.lastActiveAt,
            });

            const prev = riskByCustomerId.has(c.id) ? (riskByCustomerId.get(c.id) as number) : riskScore;
            const riskDelta = riskScore - prev;
            const riskTrend = riskDelta > 0 ? "up" : riskDelta < 0 ? "down" : "flat";

            return {
                id: c.id,
                companyName: c.name || "Unknown",
                email: c.email,
                riskScore,
                riskDelta,
                riskTrend,
                riskLevel: riskLevelFromScore(riskScore),
                reasonKey: primaryReasonKey(signals),
                reasonLabel: buildReasonText(signals),
                status: inferStatusFromInvoices(c.invoices),
                lastActiveAt: c.lastActiveAt ? c.lastActiveAt.toISOString() : null,
                signals,
                nextAction: nextActionFromSignals(signals),
                mrr: Number(c.mrr || 0),
                updatedAt: (c.updatedAt || new Date()).toISOString(),
            };
        });

        const { total, rows, summary } = applyQuerySortPage({
            rows: computed,
            q,
            sort,
            dir,
            page,
            pageSize,
            lastActiveWithinDays,
        });

        return NextResponse.json({
            ok: true,
            mode: "live",
            page,
            pageSize,
            total,
            rows,
            summary,
        });
    } catch (e: any) {
        const msg = e?.message || "Failed to load accounts at risk";
        const status =
            msg === "Unauthorized"
                ? 401
                : msg === "Workspace not found"
                    ? 404
                    : 500;

        return NextResponse.json({ ok: false, error: msg }, { status });
    }
}