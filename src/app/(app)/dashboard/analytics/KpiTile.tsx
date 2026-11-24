"use client";

import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import InfoTip from "./InfoTip";
import styles from "./metrics.module.css";

/** One KPI card: label with info tip, value, change line, and a link to its detail. */
export default function KpiTile({
    label,
    value,
    info,
    change,
    changeLabel,
    better,
    actionLabel,
    onAction,
    icon,
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
    /** Icon shown in a small box at the top right, as on the main Dashboard. */
    icon?: ReactNode;
}) {
    const tone = !change || change.direction === "flat" ? "neutral" : change.direction === better ? "good" : "bad";

    return (
        <div className={styles.kpiTile}>
            <div className={styles.kpiTileTop}>
                <span className={styles.kpiTileLabel}>
                    <span className={styles.kpiTileLabelText}>{label}</span>
                    {info ? <InfoTip text={info} label={label} /> : null}
                </span>
                {onAction && actionLabel ? (
                    <button
                        type="button"
                        className={`${styles.kpiTileLink} ${icon ? styles.kpiIconBox : ""}`}
                        onClick={onAction}
                        aria-label={`${actionLabel}: ${label}`}
                        title={actionLabel}
                    >
                        {icon ?? <ArrowUpRight size={14} strokeWidth={1.8} aria-hidden="true" />}
                    </button>
                ) : icon ? (
                    <span className={styles.kpiIconBox} aria-hidden="true">
                        {icon}
                    </span>
                ) : null}
            </div>
            <div className={styles.kpiTileBody}>
                <div className={styles.kpiTileFigures}>
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
            </div>
        </div>
    );
}
