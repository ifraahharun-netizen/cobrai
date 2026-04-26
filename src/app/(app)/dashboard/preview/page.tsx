// src/app/dashboard/preview/page.tsx
"use client";

import React from "react";
import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
    AreaChart,
    Area,
} from "recharts";
import {
    Sparkles,
    Users,
    AlertTriangle,
    TrendingUp,
    RefreshCcw,
    ArrowUpRight,
    Search,
    Filter,
    CheckCircle2,
    ChevronRight,
    Shield,
    Zap,
} from "lucide-react";

/**
 * Cobrai Dashboard Preview (safe sandbox page)
 * Route: /dashboard/preview
 * File: src/app/dashboard/preview/page.tsx
 *
 * Notes:
 * - Uses only Tailwind + recharts + lucide-react.
 * - NO shadcn imports to avoid breaking your app if you haven't installed shadcn components.
 * - Demo data is included. Later we can swap to your real APIs.
 */

type RiskReason = "Low usage" | "Billing failed" | "No logins" | "Support backlog" | "Downgrade intent";

type RiskRow = {
    id: string;
    account: string;
    mrr: number;
    risk: "High" | "Medium" | "Low";
    score: number; // 0-100
    reason: RiskReason;
    lastSeenDays: number;
};

type ActionRow = {
    id: string;
    title: string;
    account?: string;
    impact: "Save MRR" | "Prevent churn" | "Expansion";
    status: "Todo" | "In progress" | "Done";
};

const kpis = {
    customers: 4820,
    atRisk: 126,
    churnRate: 4.2,
    aiRunsLeft: 134,
    refresh: "Last refresh: 2h ago",
};

const churnTrend = [
    { label: "W1", churn: 3.2, retention: 92.1 },
    { label: "W2", churn: 3.7, retention: 91.6 },
    { label: "W3", churn: 4.4, retention: 90.8 },
    { label: "W4", churn: 4.1, retention: 91.2 },
    { label: "W5", churn: 4.2, retention: 91.0 },
    { label: "W6", churn: 3.9, retention: 91.5 },
];

const riskRows: RiskRow[] = [
    { id: "1", account: "Acme Ltd", mrr: 349, risk: "High", score: 88, reason: "Low usage", lastSeenDays: 12 },
    { id: "2", account: "Nova SaaS", mrr: 799, risk: "High", score: 83, reason: "Billing failed", lastSeenDays: 3 },
    { id: "3", account: "FlowApp", mrr: 129, risk: "Medium", score: 71, reason: "No logins", lastSeenDays: 14 },
    { id: "4", account: "BrightCRM", mrr: 499, risk: "Medium", score: 66, reason: "Support backlog", lastSeenDays: 6 },
    { id: "5", account: "KiteOps", mrr: 199, risk: "Low", score: 52, reason: "Downgrade intent", lastSeenDays: 2 },
];

const actionRows: ActionRow[] = [
    { id: "a1", title: "Send usage nudge email sequence", account: "Acme Ltd", impact: "Prevent churn", status: "Todo" },
    { id: "a2", title: "Retry failed payment + in-app banner", account: "Nova SaaS", impact: "Save MRR", status: "In progress" },
    { id: "a3", title: "Book success call + onboarding checklist", account: "FlowApp", impact: "Prevent churn", status: "Todo" },
    { id: "a4", title: "Escalate top tickets + SLA follow-up", account: "BrightCRM", impact: "Prevent churn", status: "Done" },
    { id: "a5", title: "Offer annual plan upgrade with incentive", account: "KiteOps", impact: "Expansion", status: "Todo" },
];

const insights = [
    {
        title: "Billing failures are spiking",
        detail: "7% of at-risk accounts had a payment retry failure in the last 24h. Prioritize dunning + in-app prompts.",
        tag: "High impact",
    },
    {
        title: "Low-usage cohort is most likely to churn",
        detail: "Accounts with <3 sessions/week show 2.1× churn risk. Trigger activation playbook on day 7.",
        tag: "Recommendation",
    },
    {
        title: "Support backlog correlates with downgrades",
        detail: "Accounts with >5 open tickets had 18% higher downgrade intent. Add VIP triage rules.",
        tag: "Insight",
    },
];

function fmtNumber(n: number) {
    return new Intl.NumberFormat("en-GB").format(n);
}

function fmtGBP(n: number) {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(n);
}

function pillClass(kind: string) {
    switch (kind) {
        case "High":
            return "bg-red-50 text-red-700 border-red-200";
        case "Medium":
            return "bg-amber-50 text-amber-700 border-amber-200";
        case "Low":
            return "bg-emerald-50 text-emerald-700 border-emerald-200";
        case "Todo":
            return "bg-slate-50 text-slate-700 border-slate-200";
        case "In progress":
            return "bg-blue-50 text-blue-700 border-blue-200";
        case "Done":
            return "bg-emerald-50 text-emerald-700 border-emerald-200";
        case "Save MRR":
            return "bg-purple-50 text-purple-700 border-purple-200";
        case "Prevent churn":
            return "bg-amber-50 text-amber-700 border-amber-200";
        case "Expansion":
            return "bg-blue-50 text-blue-700 border-blue-200";
        default:
            return "bg-slate-50 text-slate-700 border-slate-200";
    }
}

function Pill({ text }: { text: string }) {
    return <span className={`inline-flex items-center px-2 py-1 text-xs border rounded-full ${pillClass(text)}`}>{text}</span>;
}

function Card({
    children,
    className = "",
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>
            {children}
        </div>
    );
}

function CardHeader({
    title,
    right,
    subtitle,
}: {
    title: string;
    subtitle?: string;
    right?: React.ReactNode;
}) {
    return (
        <div className="flex items-start justify-between gap-3 p-4 border-b border-slate-100">
            <div>
                <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
                {subtitle ? <p className="text-xs text-slate-500 mt-1">{subtitle}</p> : null}
            </div>
            {right ? <div className="shrink-0">{right}</div> : null}
        </div>
    );
}

function StatCard({
    label,
    value,
    icon,
    hint,
}: {
    label: string;
    value: string;
    icon: React.ReactNode;
    hint?: string;
}) {
    return (
        <Card className="p-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-xs text-slate-500">{label}</p>
                    <p className="text-2xl font-semibold text-slate-900 mt-1">{value}</p>
                    {hint ? <p className="text-xs text-slate-500 mt-2">{hint}</p> : null}
                </div>
                <div className="p-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-700">{icon}</div>
            </div>
        </Card>
    );
}

function Button({
    children,
    onClick,
    variant = "primary",
    className = "",
}: {
    children: React.ReactNode;
    onClick?: () => void;
    variant?: "primary" | "secondary" | "ghost";
    className?: string;
}) {
    const base =
        "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium transition border";
    const styles =
        variant === "primary"
            ? "bg-slate-900 text-white border-slate-900 hover:bg-slate-800"
            : variant === "secondary"
                ? "bg-white text-slate-900 border-slate-200 hover:bg-slate-50"
                : "bg-transparent text-slate-700 border-transparent hover:bg-slate-100";
    return (
        <button onClick={onClick} className={`${base} ${styles} ${className}`}>
            {children}
        </button>
    );
}

export default function PreviewDashboardPage() {
    return (
        <div className="min-h-screen bg-slate-50">
            {/* Top bar */}
            <div className="sticky top-0 z-10 bg-slate-50/80 backdrop-blur border-b border-slate-200">
                <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-semibold">
                            C
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-lg font-semibold text-slate-900">Cobrai</h1>
                                <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                                    Preview
                                </span>
                            </div>
                            <p className="text-xs text-slate-500">{kpis.refresh}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="hidden md:flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2">
                            <Search size={16} className="text-slate-500" />
                            <input
                                className="outline-none text-sm w-56 placeholder:text-slate-400"
                                placeholder="Search accounts…"
                            />
                        </div>
                        <Button variant="secondary">
                            <Filter size={16} />
                            Filters
                        </Button>
                        <Button
                            onClick={() => {
                                // Later connect this to POST /api/ai/insights
                                alert("Demo: AI insights generated (wire to /api/ai/insights next).");
                            }}
                            className="relative overflow-hidden"
                        >
                            <span className="absolute inset-0 opacity-20 bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500" />
                            <span className="relative inline-flex items-center gap-2">
                                <Sparkles size={16} />
                                Generate AI Insights
                            </span>
                        </Button>
                    </div>
                </div>
            </div>

            {/* Layout */}
            <div className="mx-auto max-w-7xl px-4 py-6">
                <div className="grid grid-cols-12 gap-6">
                    {/* Sidebar */}
                    <div className="col-span-12 lg:col-span-3">
                        <Card className="p-3">
                            <nav className="space-y-1 text-sm">
                                {[
                                    { label: "Overview", active: true },
                                    { label: "At-risk accounts" },
                                    { label: "Actions" },
                                    { label: "Churn drivers (Pro)" },
                                    { label: "Customer profiles (Pro)" },
                                    { label: "Integrations" },
                                    { label: "Settings" },
                                ].map((item) => (
                                    <button
                                        key={item.label}
                                        className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-left border ${item.active
                                                ? "bg-slate-900 text-white border-slate-900"
                                                : "bg-white text-slate-700 border-transparent hover:bg-slate-50"
                                            }`}
                                        onClick={() => alert(`Demo nav: ${item.label}`)}
                                    >
                                        <span>{item.label}</span>
                                        <ChevronRight size={16} className={item.active ? "text-white/80" : "text-slate-400"} />
                                    </button>
                                ))}
                            </nav>

                            <div className="mt-3 p-3 rounded-xl border border-slate-200 bg-slate-50">
                                <p className="text-xs text-slate-600 font-medium">Plan</p>
                                <div className="mt-1 flex items-center justify-between">
                                    <p className="text-sm font-semibold text-slate-900">Pro</p>
                                    <span className="text-xs px-2 py-1 rounded-full border border-slate-200 bg-white text-slate-700">
                                        {kpis.aiRunsLeft} AI runs left
                                    </span>
                                </div>
                                <div className="mt-2 flex gap-2">
                                    <Button variant="secondary" className="w-full">
                                        Upgrade
                                        <ArrowUpRight size={16} />
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    </div>

                    {/* Main */}
                    <div className="col-span-12 lg:col-span-9 space-y-6">
                        {/* KPIs */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                            <StatCard
                                label="Customers"
                                value={fmtNumber(kpis.customers)}
                                icon={<Users size={18} />}
                                hint="Across connected workspaces"
                            />
                            <StatCard
                                label="At-risk"
                                value={fmtNumber(kpis.atRisk)}
                                icon={<AlertTriangle size={18} />}
                                hint="Needs attention this week"
                            />
                            <StatCard
                                label="Churn rate"
                                value={`${kpis.churnRate.toFixed(1)}%`}
                                icon={<TrendingUp size={18} />}
                                hint="Rolling 30 days"
                            />
                            <StatCard
                                label="Refresh cycle"
                                value="Every 6h"
                                icon={<RefreshCcw size={18} />}
                                hint="Pro data cadence"
                            />
                        </div>

                        {/* Charts row */}
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                            <Card>
                                <CardHeader
                                    title="Churn trend"
                                    subtitle="Rolling churn % (weekly)"
                                    right={<Pill text="Starter+" />}
                                />
                                <div className="p-4">
                                    <div className="h-56">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={churnTrend}>
                                                <CartesianGrid strokeDasharray="3 3" />
                                                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                                                <YAxis tick={{ fontSize: 12 }} />
                                                <Tooltip />
                                                <Line type="monotone" dataKey="churn" strokeWidth={2} dot={false} />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            </Card>

                            <Card>
                                <CardHeader
                                    title="Retention trend"
                                    subtitle="Retention % (weekly)"
                                    right={<Pill text="Starter+" />}
                                />
                                <div className="p-4">
                                    <div className="h-56">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={churnTrend}>
                                                <CartesianGrid strokeDasharray="3 3" />
                                                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                                                <YAxis tick={{ fontSize: 12 }} />
                                                <Tooltip />
                                                <Area type="monotone" dataKey="retention" strokeWidth={2} fillOpacity={0.15} />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            </Card>
                        </div>

                        {/* At-risk + Insights */}
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                            <Card>
                                <CardHeader
                                    title="At-risk accounts"
                                    subtitle="Ranked by churn risk score"
                                    right={<Pill text="Starter+" />}
                                />
                                <div className="p-2">
                                    <div className="overflow-hidden rounded-xl border border-slate-200">
                                        <table className="w-full text-sm">
                                            <thead className="bg-slate-50 text-slate-600">
                                                <tr>
                                                    <th className="text-left font-medium px-3 py-2">Account</th>
                                                    <th className="text-left font-medium px-3 py-2">MRR</th>
                                                    <th className="text-left font-medium px-3 py-2">Risk</th>
                                                    <th className="text-left font-medium px-3 py-2">Reason</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {riskRows.map((r) => (
                                                    <tr key={r.id} className="hover:bg-slate-50">
                                                        <td className="px-3 py-2">
                                                            <div className="font-medium text-slate-900">{r.account}</div>
                                                            <div className="text-xs text-slate-500">
                                                                Score {r.score}/100 • Last seen {r.lastSeenDays}d
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-2 text-slate-900">{fmtGBP(r.mrr)}</td>
                                                        <td className="px-3 py-2">
                                                            <Pill text={r.risk} />
                                                        </td>
                                                        <td className="px-3 py-2 text-slate-700">{r.reason}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    <div className="p-2">
                                        <Button variant="secondary" className="w-full" onClick={() => alert("Demo: go to /dashboard/at-risk")}>
                                            View full list
                                            <ArrowUpRight size={16} />
                                        </Button>
                                    </div>
                                </div>
                            </Card>

                            <Card>
                                <CardHeader
                                    title="AI Insights"
                                    subtitle="What Cobrai would surface automatically"
                                    right={<Pill text="Starter+" />}
                                />
                                <div className="p-4 space-y-3">
                                    {insights.map((x) => (
                                        <div key={x.title} className="rounded-2xl border border-slate-200 bg-white p-4">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <p className="text-sm font-semibold text-slate-900">{x.title}</p>
                                                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">{x.detail}</p>
                                                </div>
                                                <span className="text-[11px] px-2 py-1 rounded-full border border-slate-200 bg-slate-50 text-slate-700">
                                                    {x.tag}
                                                </span>
                                            </div>

                                            <div className="mt-3 flex gap-2">
                                                <Button variant="secondary" className="text-xs px-3 py-1.5">
                                                    Create action
                                                    <Zap size={14} />
                                                </Button>
                                                <Button variant="ghost" className="text-xs px-3 py-1.5">
                                                    View evidence
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        </div>

                        {/* Actions */}
                        <Card>
                            <CardHeader
                                title="Action checklist"
                                subtitle="Operational tasks to reduce churn"
                                right={<Pill text="Starter+" />}
                            />
                            <div className="p-4">
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                    {actionRows.map((a) => (
                                        <div key={a.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex items-start gap-3">
                                                    <div className="mt-0.5">
                                                        <CheckCircle2 size={18} className="text-slate-400" />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-semibold text-slate-900">{a.title}</p>
                                                        {a.account ? (
                                                            <p className="text-xs text-slate-500 mt-1">Account: {a.account}</p>
                                                        ) : null}
                                                    </div>
                                                </div>

                                                <div className="flex flex-col items-end gap-2">
                                                    <Pill text={a.status} />
                                                    <Pill text={a.impact} />
                                                </div>
                                            </div>

                                            <div className="mt-3 flex gap-2">
                                                <Button variant="secondary" className="text-xs px-3 py-1.5">
                                                    Mark done
                                                </Button>
                                                <Button variant="ghost" className="text-xs px-3 py-1.5">
                                                    Open
                                                    <ArrowUpRight size={14} />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </Card>

                        {/* Pro / Scale feature teaser row */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <Card>
                                <CardHeader title="Churn drivers (Pro)" subtitle="Top causes + recommendations" right={<Pill text="Pro" />} />
                                <div className="p-4 space-y-3">
                                    {[
                                        { name: "Low usage after onboarding", pct: "34%" },
                                        { name: "Billing failures / dunning", pct: "21%" },
                                        { name: "Support backlog & response time", pct: "18%" },
                                        { name: "Missing key integration", pct: "12%" },
                                    ].map((d) => (
                                        <div key={d.name} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                            <span className="text-sm text-slate-800">{d.name}</span>
                                            <span className="text-sm font-semibold text-slate-900">{d.pct}</span>
                                        </div>
                                    ))}
                                    <Button variant="secondary" className="w-full" onClick={() => alert("Demo: /dashboard/churn-drivers")}>
                                        Open churn drivers
                                        <ArrowUpRight size={16} />
                                    </Button>
                                </div>
                            </Card>

                            <Card>
                                <CardHeader title="Roles & permissions (Scale)" subtitle="Access control for teams" right={<Pill text="Scale" />} />
                                <div className="p-4">
                                    <div className="flex items-start gap-3 p-4 rounded-2xl border border-slate-200 bg-white">
                                        <div className="p-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-700">
                                            <Shield size={18} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-slate-900">Role-based access</p>
                                            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                                                Give Finance access to billing + MRR, Customer Success access to playbooks and accounts,
                                                and restrict settings to Admins.
                                            </p>
                                        </div>
                                    </div>
                                    <Button variant="secondary" className="w-full mt-3" onClick={() => alert("Demo: /dashboard/settings/roles")}>
                                        Manage roles
                                        <ArrowUpRight size={16} />
                                    </Button>
                                </div>
                            </Card>
                        </div>

                        {/* Footer note */}
                        <div className="text-xs text-slate-500">
                            This is a preview layout. Next step: wire the cards to your real endpoints (e.g. <span className="font-medium">/api/customers/at-risk</span>,{" "}
                            <span className="font-medium">/api/metrics/churn-trend</span>, <span className="font-medium">/api/ai/insights</span>).
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
