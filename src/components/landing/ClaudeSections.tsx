import { Sparkles } from "lucide-react";

import styles from "./claude.module.css";

/* ---------- Behaviour → Claude's interpretation ---------- */

const signals = [
    { label: "Weekly active users", value: "−58%", source: "Product usage", bad: true },
    { label: "Admin contact removed", value: "2 Oct", source: "HubSpot", bad: true },
    { label: "Reports opened", value: "0 in 21 days", source: "Product usage", bad: true },
    { label: "Last invoice", value: "Paid on time", source: "Stripe", bad: false },
];

export function BehaviourVisual() {
    return (
        <div className={styles.pair}>
            <div className={styles.panel}>
                <div className={styles.panelHead}>
                    <span>Kite Labs</span>
                    <span className={styles.muted}>£12,900 MRR</span>
                </div>
                <ul className={styles.rows}>
                    {signals.map((s) => (
                        <li key={s.label}>
                            <div>
                                <span>{s.label}</span>
                                <em>{s.source}</em>
                            </div>
                            <b className={s.bad ? styles.bad : styles.muted}>{s.value}</b>
                        </li>
                    ))}
                </ul>
            </div>

            <div className={styles.panel}>
                <div className={styles.panelHead}>
                    <span className={styles.claudeLabel}>
                        <Sparkles size={14} /> Claude
                    </span>
                </div>
                <div className={styles.panelBody}>
                    <p className={styles.claudeTitle}>Kite Labs is quietly churning.</p>
                    <p className={styles.text}>
                        Usage fell right after their admin left on 2 October, and
                        the team that&rsquo;s left never opens reports. Billing looks
                        healthy, so a payment alert wouldn&rsquo;t catch this.
                    </p>
                    <p className={styles.text}>
                        Suggested next step: offer Priya, the new owner, a short
                        walkthrough before the 14 December renewal.
                    </p>
                    <div className={styles.stats}>
                        <div>
                            <span>Churn risk</span>
                            <strong>87%</strong>
                        </div>
                        <div>
                            <span>Renewal</span>
                            <strong>14 Dec</strong>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ---------- MRR forecast ---------- */

const months = ["Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May"];
const actual = [318, 326, 331, 340, 347, 352, 366, 379, 389];
const act = [389, 397, 405, 413, 417, 422, 426];
const noAct = [389, 377, 366, 359, 354, 351, 348];

const W = 640;
const H = 220;
const P = { t: 12, r: 12, b: 24, l: 40 };
const MIN = 300;
const MAX = 440;
const fx = (i: number) => P.l + (i / (months.length - 1)) * (W - P.l - P.r);
const fy = (v: number) => P.t + ((MAX - v) / (MAX - MIN)) * (H - P.t - P.b);
const path = (vals: number[], start: number) =>
    vals.map((v, i) => `${i ? "L" : "M"}${fx(start + i).toFixed(1)} ${fy(v).toFixed(1)}`).join(" ");

const drivers = [
    { label: "CedarWorks, card failing", value: "−£21.9k" },
    { label: "Kite Labs, usage down", value: "−£12.9k" },
    { label: "NovaPay, renewal stalled", value: "−£8.4k" },
];

export function ForecastVisual() {
    const s = actual.length - 1;
    const last = months.length - 1;

    return (
        <div className={styles.forecast}>
            <div className={styles.chartCol}>
                <div className={styles.kicker}>MRR, next 6 months</div>
                <div className={styles.bigNumber}>
                    £426k <span>if you act · £348k if you don&rsquo;t</span>
                </div>

                <svg
                    className={styles.chartSvg}
                    viewBox={`0 0 ${W} ${H}`}
                    role="img"
                    aria-label="MRR forecast: £426k by May if you act, £348k if you don't"
                >
                    {[320, 360, 400, 440].map((v) => (
                        <g key={v}>
                            <line x1={P.l} x2={W - P.r} y1={fy(v)} y2={fy(v)} className={styles.grid} />
                            <text x={P.l - 8} y={fy(v) + 3} textAnchor="end" className={styles.axis}>
                                £{v}k
                            </text>
                        </g>
                    ))}
                    <line x1={fx(s)} x2={fx(s)} y1={P.t} y2={H - P.b} className={styles.today} />

                    <path d={path(actual, 0)} className={styles.actual} />
                    <path d={path(act, s)} className={styles.act} />
                    <path d={path(noAct, s)} className={styles.noAct} />
                    <circle cx={fx(last)} cy={fy(act[act.length - 1])} r="3" className={styles.dot} />
                    <circle cx={fx(last)} cy={fy(noAct[noAct.length - 1])} r="3" className={styles.dotBad} />

                    {months.map((m, i) =>
                        i % 2 === 0 ? (
                            <text key={`${m}-${i}`} x={fx(i)} y={H - 6} textAnchor="middle" className={styles.axis}>
                                {m}
                            </text>
                        ) : null,
                    )}
                </svg>

                <div className={styles.legend}>
                    <span><i className={styles.keyActual} /> Actual</span>
                    <span><i className={styles.keyAct} /> If you act</span>
                    <span><i className={styles.keyNo} /> If you don&rsquo;t</span>
                </div>
            </div>

            <div className={styles.driversCol}>
                <span className={styles.claudeLabel}>
                    <Sparkles size={14} /> Claude
                </span>
                <p className={styles.text}>
                    Without action, MRR slides £41k by May. Most of that is three
                    accounts you can still save.
                </p>
                <ul className={styles.rows}>
                    {drivers.map((d) => (
                        <li key={d.label}>
                            <span>{d.label}</span>
                            <b className={styles.bad}>{d.value}</b>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
