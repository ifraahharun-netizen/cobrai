import {
    ArrowRight,
    BarChart3,
    Inbox,
    LayoutGrid,
    Sparkles,
    Users,
} from "lucide-react";

import styles from "./overview.module.css";

const kpis = [
    { label: "MRR at risk", value: "£50,400", delta: "14 accounts", tone: "bad" },
    { label: "Revenue recovered", value: "£18,250", delta: "+£6,100 this month", tone: "good" },
    { label: "Net revenue retention", value: "104%", delta: "+2.1 pts", tone: "good" },
] as const;

/* MRR in £k: six months of actuals, then three forecast months either way. */
const months = ["Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb"];
const actual = [352, 360, 366, 371, 379, 389];
const withAction = [389, 397, 405, 413];
const withoutAction = [389, 377, 366, 359];

const W = 520;
const H = 170;
const PAD = { top: 12, right: 8, bottom: 22, left: 8 };
const MIN = 340;
const MAX = 420;

const x = (i: number) => PAD.left + (i / (months.length - 1)) * (W - PAD.left - PAD.right);
const y = (v: number) => PAD.top + ((MAX - v) / (MAX - MIN)) * (H - PAD.top - PAD.bottom);
const line = (values: number[], start: number) =>
    values.map((v, i) => `${i === 0 ? "M" : "L"}${x(start + i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");

function ForecastChart() {
    const last = actual.length - 1;
    const actualLine = line(actual, 0);
    const area = `${actualLine} L${x(last)} ${H - PAD.bottom} L${x(0)} ${H - PAD.bottom} Z`;
    const gap =
        line(withAction, last) +
        " " +
        [...withoutAction]
            .map((v, i) => [v, last + i] as const)
            .reverse()
            .map(([v, i]) => `L${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
            .join(" ") +
        " Z";

    return (
        <svg
            className={styles.chartSvg}
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label="MRR forecast: £413k by February with action, £359k without"
        >
            <defs>
                <linearGradient id="ovArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#2563eb" stopOpacity="0.14" />
                    <stop offset="1" stopColor="#2563eb" stopOpacity="0" />
                </linearGradient>
            </defs>

            {[360, 380, 400].map((v) => (
                <line key={v} x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className={styles.grid} />
            ))}
            <line x1={x(last)} x2={x(last)} y1={PAD.top} y2={H - PAD.bottom} className={styles.today} />

            <path d={gap} className={styles.gap} />
            <path d={area} fill="url(#ovArea)" />
            <path d={actualLine} className={styles.actual} />
            <path d={line(withAction, last)} className={styles.withAction} />
            <path d={line(withoutAction, last)} className={styles.withoutAction} />

            <circle cx={x(last)} cy={y(actual[last])} r="3.5" className={styles.dot} />
            <circle cx={x(months.length - 1)} cy={y(withAction[3])} r="3" className={styles.dot} />
            <circle cx={x(months.length - 1)} cy={y(withoutAction[3])} r="3" className={styles.dotBad} />

            {months.map((m, i) => (
                <text key={m} x={x(i)} y={H - 6} className={styles.axis} textAnchor="middle">
                    {m}
                </text>
            ))}
        </svg>
    );
}

export default function OverviewPreview() {
    return (
        <div className={styles.window} aria-label="Cobrai Metrics overview">
            <div className={styles.windowBar}>
                <span />
                <span />
                <span />
                <div className={styles.windowUrl}>app.cobrai.uk/metrics</div>
            </div>

            <div className={styles.app}>
                <aside className={styles.nav}>
                    <div className={styles.navGroup}>Metrics</div>
                    <span className={styles.navActive}><LayoutGrid size={14} /> Overview</span>
                    <span><BarChart3 size={14} /> Retention</span>
                    <span><Users size={14} /> Accounts</span>
                    <span><Sparkles size={14} /> Ask Claude</span>
                    <div className={styles.navGroup}>Engage</div>
                    <span><Inbox size={14} /> Inbox</span>
                </aside>

                <div className={styles.main}>
                    <div className={styles.head}>
                        <div>
                            <div className={styles.title}>Overview</div>
                            <div className={styles.sub}>Synced from Stripe and HubSpot · 4 minutes ago</div>
                        </div>
                    </div>

                    <div className={styles.kpis}>
                        {kpis.map((k) => (
                            <div className={styles.kpi} key={k.label}>
                                <div className={styles.kpiLabel}>{k.label}</div>
                                <div className={styles.kpiValue}>{k.value}</div>
                                <div className={k.tone === "bad" ? styles.deltaBad : styles.deltaGood}>{k.delta}</div>
                            </div>
                        ))}
                    </div>

                    <div className={styles.split}>
                        <section className={styles.card}>
                            <div className={styles.cardHead}>
                                <div>
                                    <div className={styles.cardTitle}>MRR forecast</div>
                                    <div className={styles.cardSub}>Next 3 months, based on current risk</div>
                                </div>
                                <div className={styles.protected}>
                                    <strong>+£54k</strong>
                                    <span>MRR protected by acting now</span>
                                </div>
                            </div>
                            <ForecastChart />
                            <div className={styles.legend}>
                                <span><i className={styles.keyActual} /> Actual</span>
                                <span><i className={styles.keyWith} /> If you act · £413k</span>
                                <span><i className={styles.keyWithout} /> If you don&rsquo;t · £359k</span>
                            </div>
                        </section>

                        <section className={`${styles.card} ${styles.claude}`}>
                            <div className={styles.claudeHead}>
                                <Sparkles size={14} /> Claude&rsquo;s read
                            </div>
                            <p className={styles.claudeLead}>
                                <strong>Two accounts hold 69% of the revenue at risk.</strong>{" "}
                                CedarWorks&rsquo; card is failing and Kite Labs&rsquo; usage
                                dropped after their admin left.
                            </p>
                            <p className={styles.claudeText}>
                                Reaching out this week protects £34,800 MRR.
                            </p>
                            <div className={styles.claudeActions}>
                                <span className={styles.claudePrimary}>
                                    Draft emails <ArrowRight size={13} />
                                </span>
                            </div>
                        </section>
                    </div>

                </div>
            </div>
        </div>
    );
}
