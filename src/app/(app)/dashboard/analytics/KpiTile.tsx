"use client";

import { useId } from "react";
import { sparklinePath } from "./metricsExtras";
import styles from "./metrics.module.css";

/** One KPI in the strip: value, change badge, sparkline; click jumps to its chart. */
export default function KpiTile({
    label,
    value,
    change,
    changeLabel,
    better,
    spark,
    onClick,
    title,
}: {
    label: string;
    value: string;
    /** Formatted change, e.g. "4.2%" or "0.3pp"; null when unknown. */
    change: { text: string; direction: "up" | "down" | "flat" } | null;
    changeLabel: string;
    /** Which direction is good for this metric. */
    better: "up" | "down";
    spark?: number[];
    onClick?: () => void;
    title?: string;
}) {
    const gradientId = useId().replace(/:/g, "");
    const path = spark ? sparklinePath(spark) : null;
    const tone = !change || change.direction === "flat" ? "neutral" : change.direction === better ? "good" : "bad";
    const colour = tone === "bad" ? "#d9534f" : "#3b6fe0";

    const body = (
        <>
            <div className={styles.kpiTileTop}>
                <span className={styles.kpiTileLabel}>{label}</span>
                {path ? (
                    <svg className={styles.kpiSpark} viewBox="0 0 96 28" preserveAspectRatio="none" aria-hidden="true">
                        <defs>
                            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={colour} stopOpacity="0.16" />
                                <stop offset="100%" stopColor={colour} stopOpacity="0" />
                            </linearGradient>
                        </defs>
                        <path d={path.area} fill={`url(#${gradientId})`} />
                        <path d={path.line} fill="none" stroke={colour} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                    </svg>
                ) : null}
            </div>
            <div className={styles.kpiTileValue}>{value}</div>
            <div className={styles.kpiTileSub}>
                {change ? (
                    <span className={`${styles.changeBadge} ${styles[`change_${tone}`]}`}>
                        {change.direction === "up" ? "▲" : change.direction === "down" ? "▼" : "→"} {change.text}
                    </span>
                ) : null}
                <span>{changeLabel}</span>
            </div>
        </>
    );

    return onClick ? (
        <button type="button" className={styles.kpiTile} onClick={onClick} title={title}>
            {body}
        </button>
    ) : (
        <div className={styles.kpiTile}>{body}</div>
    );
}
