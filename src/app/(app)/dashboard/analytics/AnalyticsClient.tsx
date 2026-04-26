"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./analytics.module.css";

import { getFirebaseAuth } from "@/lib/firebase.client";

type Mode = "demo" | "live";

type KPI = {
    mrr: number;
    mrrChangePct: number;
    churnRate: number;
    activeCustomers: number;
    expansion: number;
    contraction: number;
    nrr: number;
};

type Point = { label: string; value: number };
type ChurnReason = { label: string; value: number };
type Bucket = { label: string; value: number };

type Insight = { title: string; detail: string; impact?: "high" | "medium" | "low" };
type ActionRec = { title: string; detail: string; cta?: "View accounts" | "Create email" | "Open insights" };

type AnalyticsPayload = {
    mode: Mode;
    kpi: KPI;
    mrrSeries: Point[];
    churnSeries: Point[];
    churnReasons: ChurnReason[];
    riskBuckets: Bucket[];
    behaviour: {
        weeklyActivePct: number;
        inactive7d: number;
        topSignals: { label: string; value: string }[];
    };
    cohorts: {
        rows: string[];
        cols: string[];
        values: number[][]; // 0..100, 0 = empty
    };
    insights: Insight[];
    actions: ActionRec[];
    segments: {
        plans: string[];
        regions: string[];
    };
};

function formatMoney(n: number) {
    try {
        return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(n);
    } catch {
        return `£${Math.round(n).toLocaleString()}`;
    }
}
function formatPct(n: number, digits = 1) {
    return `${n.toFixed(digits)}%`;
}
function clamp(n: number, a: number, b: number) {
    return Math.max(a, Math.min(b, n));
}

/** Lightweight sparkline (no chart libs) */
function Sparkline({ data }: { data: Point[] }) {
    const w = 320;
    const h = 64;
    const pad = 8;

    const values = data.map((d) => d.value);
    const minV = Math.min(...values);
    const maxV = Math.max(...values);
    const span = maxV - minV || 1;

    const pts = data.map((d, i) => {
        const x = pad + (i * (w - pad * 2)) / Math.max(1, data.length - 1);
        const y = pad + ((maxV - d.value) * (h - pad * 2)) / span;
        return { x, y };
    });

    const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

    return (
        <svg className={styles.spark} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="trend">
            <path d={d} fill="none" stroke="currentColor" strokeWidth="2" opacity="0.85" />
            <path
                d={`${d} L ${pts[pts.length - 1]?.x ?? pad} ${h - pad} L ${pts[0]?.x ?? pad} ${h - pad} Z`}
                fill="currentColor"
                opacity="0.06"
            />
        </svg>
    );
}

function demoPayload(): AnalyticsPayload {
    const mrrSeries: Point[] = [
        { label: "W1", value: 28750 },
        { label: "W2", value: 29420 },
        { label: "W3", value: 30110 },
        { label: "W4", value: 29840 },
        { label: "W5", value: 30590 },
        { label: "W6", value: 31480 },
        { label: "W7", value: 31020 },
        { label: "W8", value: 31960 },
    ];

    const churnSeries: Point[] = [
        { label: "W1", value: 3.2 },
        { label: "W2", value: 3.5 },
        { label: "W3", value: 3.1 },
        { label: "W4", value: 3.9 },
        { label: "W5", value: 3.6 },
        { label: "W6", value: 3.4 },
        { label: "W7", value: 3.8 },
        { label: "W8", value: 3.3 },
    ];

    const cohorts = {
        rows: ["2025-11", "2025-12", "2026-01", "2026-02"],
        cols: ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8"],
        values: [
            [100, 78, 66, 60, 56, 53, 51, 49],
            [100, 81, 70, 64, 60, 58, 55, 53],
            [100, 84, 76, 70, 66, 63, 61, 59],
            [100, 86, 79, 74, 71, 0, 0, 0],
        ],
    };

    return {
        mode: "demo",
        kpi: {
            mrr: 31960,
            mrrChangePct: 5.2,
            churnRate: 3.3,
            activeCustomers: 214,
            expansion: 1420,
            contraction: 610,
            nrr: 112.4,
        },
        mrrSeries,
        churnSeries,
        churnReasons: [
            { label: "Low usage / inactive", value: 41 },
            { label: "Pricing / budget", value: 23 },
            { label: "Missing feature", value: 18 },
            { label: "Support / onboarding", value: 12 },
            { label: "Other", value: 6 },
        ],
        riskBuckets: [
            { label: "Critical", value: 9 },
            { label: "High", value: 24 },
            { label: "Medium", value: 61 },
            { label: "Low", value: 120 },
        ],
        behaviour: {
            weeklyActivePct: 64,
            inactive7d: 37,
            topSignals: [
                { label: "Avg. logins / wk", value: "2.1" },
                { label: "Feature adoption", value: "Top 3 features used by 58%" },
                { label: "Time-to-value", value: "Median 2.4 days" },
            ],
        },
        cohorts,
        insights: [
            {
                title: "Usage drop is leading churn",
                detail: "Accounts with 7+ inactive days are ~2.8× more likely to cancel in the next 30 days.",
                impact: "high",
            },
            {
                title: "Pro plan retains better",
                detail: "Pro users retain ~11–14 pts higher after week 4 compared to Starter in recent cohorts.",
                impact: "medium",
            },
            {
                title: "Onboarding gap",
                detail: "Customers who don’t complete setup in the first 72 hours churn significantly faster.",
                impact: "high",
            },
        ],
        actions: [
            { title: "Reach out to inactive high-MRR accounts", detail: "Prioritise accounts inactive 7+ days with MRR > £150.", cta: "View accounts" },
            { title: "Trigger onboarding nudge", detail: "Email users who haven’t completed setup within 48–72 hours.", cta: "Create email" },
            { title: "Review feature-gap churn", detail: "Tag + review cancellations mentioning missing features; shortlist top requests.", cta: "Open insights" },
        ],
        segments: {
            plans: ["All plans", "Starter", "Pro"],
            regions: ["All regions", "UK", "EU", "US", "Other"],
        },
    };
}

export default function AnalyticsClient() {
    const router = useRouter();

    const [uid, setUid] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<AnalyticsPayload>(demoPayload());

    // UI filters (ready for live API later)
    const [plan, setPlan] = useState("All plans");
    const [region, setRegion] = useState("All regions");
    const [range, setRange] = useState<"8w" | "12w" | "6m">("8w");

    useEffect(() => {
        const auth = getFirebaseAuth();
        const unsub = auth.onAuthStateChanged((user) => setUid(user?.uid ?? null));
        return () => unsub();
    }, []);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            setLoading(true);
            let next: AnalyticsPayload = demoPayload();

            try {
                const auth = getFirebaseAuth();
                const user = auth.currentUser;

                if (user) {
                    const token = await user.getIdToken();

                    // optional: if endpoint exists, it can return { mode: "demo" | "live", ... }
                    const res = await fetch("/api/dashboard/analytics", {
                        method: "GET",
                        headers: { Authorization: `Bearer ${token}` },
                    });

                    if (res.ok) {
                        const json = (await res.json()) as Partial<AnalyticsPayload>;
                        next = { ...demoPayload(), ...(json as any) } as AnalyticsPayload;
                        // if server returns mode, respect it
                        if (json.mode) next.mode = json.mode as Mode;
                    }
                }
            } catch {
                // stay in demo
            }

            if (!cancelled) {
                setData(next);
                setLoading(false);
            }
        }

        load();
        return () => {
            cancelled = true;
        };
    }, [uid]);

    const mode: Mode = data.mode ?? "demo";

    const title = useMemo(() => (mode === "demo" ? "Analytics (Demo)" : "Analytics"), [mode]);
    const subtitle = useMemo(
        () =>
            mode === "demo"
                ? "Showing sample analytics. Connect your tools to start collecting real retention and revenue data."
                : "Revenue + retention intelligence across your connected tools.",
        [mode]
    );

    const kpi = data.kpi;

    return (
        <div className={styles.page}>
            {/* Header */}
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>{title}</h1>
                    <p className={styles.subtitle}>{subtitle}</p>

                    <div className={styles.badgeRow}>
                        <span className={styles.badge}>{loading ? "Loading…" : mode === "demo" ? "Demo workspace" : "Live workspace"}</span>
                        <span className={styles.badge}>
                            Auth: {uid ? `signed in (${uid.slice(0, 6)}…)` : "not signed in"}
                        </span>
                    </div>

                    {mode === "demo" && (
                        <div className={styles.demoBanner}>
                            <strong>Demo mode</strong> • Connect Stripe/GA4/HubSpot to replace this with your live analytics.
                        </div>
                    )}
                </div>

                <div className={styles.headerRight}>
                    <button className={styles.btn} onClick={() => router.push("/dashboard/integrations")}>
                        Connect tools
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className={styles.filters}>
                <div className={styles.filter}>
                    <div className={styles.filterLabel}>Plan</div>
                    <select className={styles.select} value={plan} onChange={(e) => setPlan(e.target.value)}>
                        {data.segments.plans.map((p) => (
                            <option key={p} value={p}>
                                {p}
                            </option>
                        ))}
                    </select>
                </div>

                <div className={styles.filter}>
                    <div className={styles.filterLabel}>Region</div>
                    <select className={styles.select} value={region} onChange={(e) => setRegion(e.target.value)}>
                        {data.segments.regions.map((r) => (
                            <option key={r} value={r}>
                                {r}
                            </option>
                        ))}
                    </select>
                </div>

                <div className={styles.filter}>
                    <div className={styles.filterLabel}>Range</div>
                    <select className={styles.select} value={range} onChange={(e) => setRange(e.target.value as any)}>
                        <option value="8w">Last 8 weeks</option>
                        <option value="12w">Last 12 weeks</option>
                        <option value="6m">Last 6 months</option>
                    </select>
                </div>

                <div className={styles.filterHint}>
                    Filters are ready — when live analytics is wired, pass these to the API.
                </div>
            </div>

            {/* KPI Strip */}
            <div className={styles.kpiRow}>
                <div className={styles.kpiCard}>
                    <div className={styles.kpiLabel}>MRR</div>
                    <div className={styles.kpiValue}>{formatMoney(kpi.mrr)}</div>
                    <div className={styles.kpiHint}>
                        {kpi.mrrChangePct >= 0 ? "+" : ""}
                        {formatPct(kpi.mrrChangePct, 1)} vs prev
                    </div>
                </div>

                <div className={styles.kpiCard}>
                    <div className={styles.kpiLabel}>Churn rate</div>
                    <div className={styles.kpiValue}>{formatPct(kpi.churnRate, 1)}</div>
                    <div className={styles.kpiHint}>Monthly logo churn</div>
                </div>

                <div className={styles.kpiCard}>
                    <div className={styles.kpiLabel}>Active customers</div>
                    <div className={styles.kpiValue}>{kpi.activeCustomers.toLocaleString()}</div>
                    <div className={styles.kpiHint}>Paying accounts</div>
                </div>

                <div className={styles.kpiCard}>
                    <div className={styles.kpiLabel}>Expansion</div>
                    <div className={styles.kpiValue}>{formatMoney(kpi.expansion)}</div>
                    <div className={styles.kpiHint}>Upgrades / add-ons</div>
                </div>

                <div className={styles.kpiCard}>
                    <div className={styles.kpiLabel}>Contraction</div>
                    <div className={styles.kpiValue}>{formatMoney(kpi.contraction)}</div>
                    <div className={styles.kpiHint}>Downgrades</div>
                </div>

                <div className={styles.kpiCard}>
                    <div className={styles.kpiLabel}>NRR</div>
                    <div className={styles.kpiValue}>{formatPct(kpi.nrr, 1)}</div>
                    <div className={styles.kpiHint}>Net revenue retention</div>
                </div>

                <div className={styles.kpiCard}>
                    <div className={styles.kpiLabel}>Risk distribution</div>
                    <div className={styles.bucketList}>
                        {data.riskBuckets.map((b) => (
                            <div key={b.label} className={styles.bucketRow}>
                                <span className={styles.bucketLabel}>{b.label}</span>
                                <span className={styles.bucketValue}>{b.value}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Main panels */}
            <div className={styles.grid2}>
                <div className={styles.card}>
                    <div className={styles.cardTop}>
                        <div className={styles.cardTitle}>MRR trend</div>
                        <span className={styles.badgeSmall}>{range}</span>
                    </div>
                    <div className={styles.cardBody}>
                        <Sparkline data={data.mrrSeries} />
                        <div className={styles.cardNote}>
                            Insight: MRR {kpi.mrrChangePct >= 0 ? "grew" : "dropped"} {formatPct(Math.abs(kpi.mrrChangePct), 1)} — focus on preventing churn in high-risk accounts.
                        </div>
                    </div>
                </div>

                <div className={styles.card}>
                    <div className={styles.cardTop}>
                        <div className={styles.cardTitle}>Churn trend</div>
                        <span className={styles.badgeSmall}>Top reasons</span>
                    </div>
                    <div className={styles.cardBody}>
                        <Sparkline data={data.churnSeries} />
                        <div className={styles.reasonList}>
                            {data.churnReasons.map((r) => (
                                <div key={r.label} className={styles.reasonRow}>
                                    <div className={styles.reasonLabel}>{r.label}</div>
                                    <div className={styles.reasonValue}>{r.value}%</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <div className={styles.grid2b}>
                <div className={styles.card}>
                    <div className={styles.cardTop}>
                        <div className={styles.cardTitle}>Customer behaviour insights</div>
                        <span className={styles.badgeSmall}>Engagement</span>
                    </div>
                    <div className={styles.cardBody}>
                        <div className={styles.miniGrid}>
                            <div className={styles.miniStat}>
                                <div className={styles.miniLabel}>Weekly active</div>
                                <div className={styles.miniValue}>{formatPct(data.behaviour.weeklyActivePct, 0)}</div>
                                <div className={styles.miniHint}>% of paying users active</div>
                            </div>

                            <div className={styles.miniStat}>
                                <div className={styles.miniLabel}>Inactive 7+ days</div>
                                <div className={styles.miniValue}>{data.behaviour.inactive7d}</div>
                                <div className={styles.miniHint}>accounts to watch</div>
                            </div>
                        </div>

                        <div className={styles.sectionLabel}>Signals</div>
                        <div className={styles.signalList}>
                            {data.behaviour.topSignals.map((s) => (
                                <div key={s.label} className={styles.signalRow}>
                                    <div className={styles.signalLeft}>{s.label}</div>
                                    <div className={styles.signalRight}>{s.value}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className={styles.card}>
                    <div className={styles.cardTop}>
                        <div className={styles.cardTitle}>Cohort retention</div>
                        <span className={styles.badgeSmall}>Signup month</span>
                    </div>
                    <div className={styles.cardBody}>
                        <div className={styles.tableWrap}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th className={styles.th}>Cohort</th>
                                        {data.cohorts.cols.map((c) => (
                                            <th key={c} className={styles.th}>
                                                {c}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.cohorts.rows.map((row, i) => (
                                        <tr key={row}>
                                            <td className={styles.tdHead}>{row}</td>
                                            {data.cohorts.values[i].map((v, j) => {
                                                const val = clamp(v, 0, 100);
                                                const alpha = v === 0 ? 0 : 0.06 + (val / 100) * 0.24;

                                                return (
                                                    <td
                                                        key={`${row}-${j}`}
                                                        className={styles.td}
                                                        style={{
                                                            background: `rgba(11,18,32,${alpha})`,
                                                            color: alpha > 0.2 ? "#fff" : "#0b1220",
                                                            borderColor: "rgba(230,233,240,0.9)",
                                                        }}
                                                    >
                                                        {v === 0 ? "—" : `${Math.round(val)}%`}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className={styles.cardNote}>
                            Insight: cohort drop-offs highlight onboarding + activation gaps — your AI insights turn this into actions.
                        </div>
                    </div>
                </div>
            </div>

            <div className={styles.grid2}>
                <div className={styles.card}>
                    <div className={styles.cardTop}>
                        <div className={styles.cardTitle}>AI insight feed</div>
                        <span className={styles.badgeSmall}>Auto-generated</span>
                    </div>
                    <div className={styles.cardBody}>
                        <div className={styles.feed}>
                            {data.insights.map((ins, idx) => (
                                <div key={idx} className={styles.feedItem}>
                                    <div className={styles.feedTop}>
                                        <div className={styles.feedTitle}>{ins.title}</div>
                                        {ins.impact && <span className={styles.badgeSmall}>{ins.impact.toUpperCase()} impact</span>}
                                    </div>
                                    <div className={styles.feedDetail}>{ins.detail}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className={styles.card}>
                    <div className={styles.cardTop}>
                        <div className={styles.cardTitle}>Recommended actions</div>
                        <span className={styles.badgeSmall}>Do this next</span>
                    </div>
                    <div className={styles.cardBody}>
                        <div className={styles.feed}>
                            {data.actions.map((a, idx) => (
                                <div key={idx} className={styles.feedItem}>
                                    <div className={styles.feedTitle}>{a.title}</div>
                                    <div className={styles.feedDetail}>{a.detail}</div>

                                    {a.cta && (
                                        <button
                                            className={styles.btnSecondary}
                                            onClick={() => {
                                                if (a.cta === "View accounts") router.push("/dashboard/accounts-at-risk");
                                                else if (a.cta === "Create email") router.push("/dashboard/actions");
                                                else router.push("/dashboard/insights");
                                            }}
                                        >
                                            {a.cta}
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
