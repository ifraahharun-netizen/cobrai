"use client";

import { Sparkles } from "lucide-react";
import { monthName, type Cohort } from "./metricsExtras";
import styles from "./metrics.module.css";

/** Cell colour: deeper blue for higher retention. */
function cellStyle(value: number) {
    const t = Math.max(0, Math.min(1, (value - 50) / 50));
    const alpha = 0.08 + t * 0.62;
    return {
        background: `rgba(59, 111, 224, ${alpha.toFixed(3)})`,
        color: alpha > 0.45 ? "#ffffff" : "#1f1e1b",
    };
}

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

    return (
        <section className={styles.extraCard} aria-labelledby="cohort-title" id="metrics-cohorts">
            <div className={styles.extraHead}>
                <div>
                    <h3 id="cohort-title">Cohort retention</h3>
                    <p>
                        Share of each month&apos;s new subscribers still active, by months since joining
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
                <div className={styles.cohortScroll}>
                    <table className={styles.cohortTable}>
                        <thead>
                            <tr>
                                <th scope="col">Joined</th>
                                <th scope="col">New</th>
                                {Array.from({ length: width }, (_, k) => (
                                    <th key={k} scope="col">
                                        {k === 0 ? "M0" : `M${k}`}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {cohorts.map((cohort) => (
                                <tr key={cohort.month}>
                                    <th scope="row">{monthName(cohort.month)}</th>
                                    <td className={styles.cohortSize}>{cohort.size}</td>
                                    {Array.from({ length: width }, (_, k) => {
                                        const value = cohort.retention[k];
                                        return typeof value === "number" ? (
                                            <td key={k}>
                                                <span
                                                    className={styles.cohortCell}
                                                    style={cellStyle(value)}
                                                    title={`${monthName(cohort.month)} cohort, month ${k}: ${value.toFixed(1)}% retained`}
                                                >
                                                    {Math.round(value)}%
                                                </span>
                                            </td>
                                        ) : (
                                            <td key={k} aria-hidden="true" />
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
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
