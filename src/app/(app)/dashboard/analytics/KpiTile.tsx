"use client";

import InfoTip from "./InfoTip";
import styles from "./metrics.module.css";

/** One KPI card: label with info tip, value, change line, and a link to its chart. */
export default function KpiTile({
    label,
    value,
    info,
    change,
    changeLabel,
    better,
    actionLabel,
    onAction,
}: {
    label: string;
    value: string;
    /** One or two sentences on what this number is and why it matters. */
    info?: string;
    /** Formatted change, e.g. "4.2%" or "0.3pp"; null when unknown. */
    change: { text: string; direction: "up" | "down" | "flat" } | null;
    changeLabel: string;
    /** Which direction is good for this metric. */
    better: "up" | "down";
    actionLabel?: string;
    onAction?: () => void;
}) {
    const tone = !change || change.direction === "flat" ? "neutral" : change.direction === better ? "good" : "bad";

    return (
        <div className={styles.kpiTile}>
            <div className={styles.kpiTileTop}>
                <span className={styles.kpiTileLabel}>
                    {label}
                    {info ? <InfoTip text={info} label={label} /> : null}
                </span>
                {onAction && actionLabel ? (
                    <button type="button" className={styles.kpiTileLink} onClick={onAction}>
                        {actionLabel}
                    </button>
                ) : null}
            </div>
            <div className={styles.kpiTileValue}>{value}</div>
            <div className={styles.kpiTileSub}>
                {change ? (
                    <span className={`${styles.changeBadge} ${styles[`change_${tone}`]}`}>
                        {change.direction === "up" ? "↑" : change.direction === "down" ? "↓" : "→"} {change.text}
                    </span>
                ) : null}
                <span>{changeLabel}</span>
            </div>
        </div>
    );
}
