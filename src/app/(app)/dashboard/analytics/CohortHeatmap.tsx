"use client";

import { useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { averageRetentionCurve, monthName, type Cohort } from "./metricsExtras";
import InfoTip from "./InfoTip";
import styles from "./metrics.module.css";

/**
 * Tile colour on an indigo scale: deeper for higher retention, scaled to the
 * range shown (60-100%) so differences are easy to see.
 */
function tileColour(value: number, month: number) {
    if (month === 0) return "#f4f3ef";
    const t = Math.max(0, Math.min(1, (value - 60) / 40));
    // From a warm off-white to the page's blue.
    const from = [238, 241, 248];
    const to = [59, 111, 224];
    const mix = from.map((c, i) => Math.round(c + (to[i] - c) * t));
    return `rgb(${mix[0]},${mix[1]},${mix[2]})`;
}

type Hover = { cohort: Cohort; month: number; value: number; x: number; y: number };

/** Subscriber retention by the month customers joined. */
export default function CohortHeatmap({
    cohorts,
    isDemo,
    onExplain,
}: {
    cohorts: Cohort[];
    isDemo: boolean;
    onExplain: (question: string) => void;
}) {
    const width = Math.max(0, ...cohorts.map((c) => c.retention.length));
    const cardRef = useRef<HTMLElement>(null);
    const [hover, setHover] = useState<Hover | null>(null);
    const [showNumbers, setShowNumbers] = useState(false);

    // One-sentence takeaway: when most customers leave, and when it settles.
    const takeaway = (() => {
        const curve = averageRetentionCurve(cohorts);
        if (curve.length < 3) return null;
        let worst = { month: 1, drop: -Infinity };
        for (let i = 1; i < curve.length; i += 1) {
            const drop = curve[i - 1].value - curve[i].value;
            if (drop > worst.drop) worst = { month: curve[i].month, drop };
        }
        // First month from which every later monthly drop is under 3 points.
        let settles: number | null = null;
        for (let i = 1; i < curve.length; i += 1) {
            if (curve.slice(i).every((p, j) => j === 0 || curve[i + j - 1].value - p.value < 3)) {
                settles = curve[i].month;
                break;
            }
        }
        const firstMonth = worst.month === 1 ? "in their first month" : `in month ${worst.month}`;
        return `Customers are most likely to leave ${firstMonth} (−${worst.drop.toFixed(1)} points on average)${
            settles !== null && settles > worst.month ? `; from month ${settles} on, only a few leave each month` : ""
        }.`;
    })();

    function show(target: HTMLElement, cohort: Cohort, month: number, value: number) {
        const card = cardRef.current?.getBoundingClientRect();
        const tile = target.getBoundingClientRect();
        if (!card) return;
        setHover({
            cohort,
            month,
            value,
            x: tile.left - card.left + tile.width / 2,
            y: tile.top - card.top,
        });
    }

    // Headline: average retention at the oldest month most cohorts have reached.
    const latestShared = (() => {
        for (let k = width - 1; k > 0; k -= 1) {
            const reached = cohorts.filter((c) => typeof c.retention[k] === "number");
            if (reached.length >= Math.min(3, cohorts.length)) {
                const total = reached.reduce((sum, c) => sum + c.size, 0) || reached.length;
                const avg = reached.reduce((sum, c) => sum + c.retention[k] * (c.size || 1), 0) / total;
                return { month: k, value: avg };
            }
        }
        return null;
    })();

    return (
        <section ref={cardRef} className={`${styles.extraCard} ${styles.cohortCard}`} aria-labelledby="cohort-title" id="metrics-cohorts">
            <div className={styles.extraHead}>
                <div>
                    <h3 id="cohort-title">
                        Retention by sign-up month
                        <InfoTip
                            label="Retention by sign-up month"
                            text="Each row is the customers who joined in that month. Each column shows the share still subscribed that many months later. Numbers that stay high mean customers stick around."
                        />
                    </h3>
                    <p>
                        How many customers from each sign-up month are still paying, month by month
                        {isDemo ? " · demo data" : ""}
                    </p>
                </div>
                {cohorts.length ? (
                    <button
                        type="button"
                        className={styles.explainButton}
                        onClick={() =>
                            onExplain(
                                "Looking at our cohort retention, when do new customers drop off most, and what should onboarding do about it?"
                            )
                        }
                    >
                        <Sparkles size={13} strokeWidth={1.8} aria-hidden="true" />
                        Explain
                    </button>
                ) : null}
            </div>

            {cohorts.length ? (
                <>
                {latestShared ? (
                    <div className={styles.cardHeadline}>
                        <strong>{latestShared.value.toFixed(0)}%</strong>
                        <span className={styles.headNote}>
                            of customers are still paying {latestShared.month} months after they sign up (average)
                        </span>
                    </div>
                ) : null}
                {takeaway ? <p className={styles.chartStory}>{takeaway}</p> : null}
                <div className={styles.tileToolbar}>
                    <span>Each row is a group of customers who signed up in the same month. Darker squares mean more of them are still paying.</span>
                    <label className={styles.switchLabel}>
                        <input
                            type="checkbox"
                            checked={showNumbers}
                            onChange={(event) => setShowNumbers(event.target.checked)}
                        />
                        Show numbers
                    </label>
                </div>
                <div className={styles.cohortScroll} onScroll={() => setHover(null)}>
                    <div
                        className={styles.tileGrid}
                        style={{ gridTemplateColumns: `76px 44px repeat(${width}, minmax(34px, 1fr))` }}
                        role="table"
                        aria-label="Share of each sign-up month still subscribed, by months since joining"
                        onMouseLeave={() => setHover(null)}
                    >
                        <span className={styles.tileHead} role="columnheader">Signed up</span>
                        <span className={styles.tileHead} role="columnheader">People</span>
                        {Array.from({ length: width }, (_, k) => (
                            <span key={k} className={styles.tileHead} role="columnheader">
                                {k === 0 ? "Joined" : `${k} mo`}
                            </span>
                        ))}

                        {cohorts.map((cohort) => (
                            <div key={cohort.month} className={styles.tileRow} role="row">
                                <span className={styles.tileLabel} role="rowheader">{monthName(cohort.month)}</span>
                                <span className={styles.tileSize} role="cell">{cohort.size}</span>
                                {Array.from({ length: width }, (_, k) => {
                                    const value = cohort.retention[k];
                                    if (typeof value !== "number") return <span key={k} role="cell" aria-hidden="true" />;
                                    const active = hover?.cohort.month === cohort.month && hover.month === k;
                                    return (
                                        <span
                                            key={k}
                                            role="cell"
                                            tabIndex={0}
                                            className={`${styles.tile} ${active ? styles.tileActive : ""}`}
                                            style={{
                                                background: tileColour(value, k),
                                                color: k > 0 && value >= 85 ? "#ffffff" : "#3d3c38",
                                            }}
                                            aria-label={`${monthName(cohort.month)} sign-ups, month ${k}: ${value.toFixed(1)}% still subscribed`}
                                            onMouseEnter={(event) => show(event.currentTarget, cohort, k, value)}
                                            onFocus={(event) => show(event.currentTarget, cohort, k, value)}
                                            onBlur={() => setHover(null)}
                                        >
                                            {showNumbers ? `${Math.round(value)}%` : null}
                                        </span>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </div>

                <div className={styles.tileScale} aria-hidden="true">
                    <span>Fewer stay</span>
                    <i />
                    <span>More stay</span>
                </div>

                {hover ? (
                    <div
                        className={styles.tileCard}
                        style={{ left: hover.x, top: hover.y }}
                        role="status"
                    >
                        <div className={styles.tileCardHead}>
                            Signed up in {monthName(hover.cohort.month)} ·{" "}
                            {hover.month === 0 ? "the month they joined" : `${hover.month} month${hover.month === 1 ? "" : "s"} later`}
                        </div>
                        <div className={styles.tileCardRow}>
                            <span>Signed up</span>
                            <b>{hover.cohort.size}</b>
                        </div>
                        <div className={styles.tileCardRow}>
                            <span>Still paying</span>
                            <b>{Math.round((hover.cohort.size * hover.value) / 100)}</b>
                        </div>
                        <div className={styles.tileCardFoot}>{hover.value.toFixed(1)}% still paying</div>
                    </div>
                ) : null}
                </>
            ) : (
                <div className={styles.emptyState}>
                    <strong>Cohorts need subscription history</strong>
                    <span>
                        Once your billing connection has synced individual subscriptions with start and cancel dates,
                        Cobrai groups customers by the month they joined here.
                    </span>
                </div>
            )}
        </section>
    );
}
