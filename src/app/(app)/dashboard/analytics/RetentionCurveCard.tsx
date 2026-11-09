"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import type { EChartsOption } from "echarts";
import { Sparkles } from "lucide-react";
import { averageRetentionCurve, type Cohort } from "./metricsExtras";
import InfoTip from "./InfoTip";
import styles from "./metrics.module.css";

const EChart = dynamic(() => import("@/components/charts/EChart"), { ssr: false });

const BLUE = "#3b6fe0";

/** Months averaged over fewer sign-up months than this are hatched (less reliable). */
const RELIABLE_COHORTS = 3;

/** Share of customers still subscribed by months since joining, averaged across cohorts. */
export default function RetentionCurveCard({
    cohorts,
    isDemo,
    onExplain,
}: {
    cohorts: Cohort[];
    isDemo: boolean;
    onExplain: (question: string) => void;
}) {
    const curve = useMemo(() => averageRetentionCurve(cohorts), [cohorts]);
    const last = curve[curve.length - 1];
    // Biggest single-month drop after joining.
    const steepest = useMemo(() => {
        let best: { month: number; drop: number } | null = null;
        for (let i = 1; i < curve.length; i += 1) {
            const drop = curve[i - 1].value - curve[i].value;
            if (!best || drop > best.drop) best = { month: curve[i].month, drop };
        }
        return best;
    }, [curve]);

    const option = useMemo<EChartsOption>(() => {
        const values = curve.map((p) => Math.round(p.value * 10) / 10);
        return {
            animation: false,
            backgroundColor: "transparent",
            grid: { top: 16, right: 8, bottom: 4, left: 0, containLabel: true },
            tooltip: {
                trigger: "axis",
                axisPointer: { type: "shadow", shadowStyle: { color: "rgba(31,30,27,0.035)" } },
                backgroundColor: "#ffffff",
                borderColor: "#e8e6df",
                borderWidth: 1,
                padding: [10, 12],
                textStyle: { color: "#1f1e1b", fontSize: 12 },
                extraCssText: "border-radius:10px;box-shadow:0 10px 30px rgba(31,30,27,.10);",
                formatter: (raw: unknown) => {
                    const item = (Array.isArray(raw) ? raw[0] : raw) as { dataIndex: number };
                    const point = curve[item?.dataIndex ?? 0];
                    if (!point) return "";
                    const prev = curve[(item?.dataIndex ?? 0) - 1];
                    const drop = prev ? prev.value - point.value : null;
                    return `<div style="min-width:180px"><div style="color:#6f6e69;margin-bottom:8px">${point.month === 0 ? "Joining month" : `${point.month} month${point.month === 1 ? "" : "s"} after joining`}</div><div style="display:flex;justify-content:space-between;gap:18px"><span>Still subscribed</span><b style="font-weight:600">${point.value.toFixed(1)}%</b></div><div style="display:flex;justify-content:space-between;gap:18px;margin-top:4px"><span>Sign-up months</span><b style="font-weight:600">${point.cohorts}</b></div>${drop !== null ? `<div style="height:1px;background:#f0eee8;margin:8px 0"></div><div style="color:${drop > 0 ? "#b8423e" : "#237a54"}">${drop > 0 ? "−" : "+"}${Math.abs(drop).toFixed(1)}pp vs previous month</div>` : ""}${point.cohorts < RELIABLE_COHORTS ? `<div style="color:#9a9893;margin-top:4px;font-size:11px">Few sign-up months yet, so less reliable</div>` : ""}</div>`;
                },
            },
            xAxis: {
                type: "category",
                data: curve.map((p) => `M${p.month}`),
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: { color: "#9a9893", fontSize: 10.5, margin: 12 },
            },
            yAxis: {
                type: "value",
                min: 0,
                max: 100,
                interval: 25,
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: { color: "#9a9893", fontSize: 10, formatter: (v: number) => `${v}%` },
                splitLine: { show: true, lineStyle: { color: "#ebe9e3", type: [4, 4] } },
            },
            series: [
                {
                    name: "Still subscribed",
                    type: "bar",
                    barWidth: "56%",
                    barMaxWidth: 38,
                    data: curve.map((p, index) => ({
                        value: values[index],
                        itemStyle: {
                            borderRadius: [4, 4, 0, 0],
                            color: p.cohorts < RELIABLE_COHORTS ? "#e4e2db" : BLUE,
                            // Diagonal hatching for months with little data behind them.
                            decal:
                                p.cohorts < RELIABLE_COHORTS
                                    ? {
                                        symbol: "rect",
                                        symbolSize: 1,
                                        color: "rgba(111,110,105,0.45)",
                                        dashArrayX: [1, 0],
                                        dashArrayY: [2, 5],
                                        rotation: -Math.PI / 4,
                                    }
                                    : undefined,
                        },
                    })),
                    emphasis: { focus: "none", itemStyle: { opacity: 0.9 } },
                },
            ],
        } as EChartsOption;
    }, [curve]);

    return (
        <section className={styles.extraCard} aria-labelledby="curve-title" id="metrics-curve">
            <div className={styles.extraHead}>
                <div>
                    <h3 id="curve-title">
                        Retention curve
                        <InfoTip
                            label="Retention curve"
                            text="Of the customers who sign up, the share still subscribed each month afterwards, averaged across sign-up months. A curve that flattens out means customers who get past the first months tend to stay."
                        />
                    </h3>
                    <p>Customers still subscribed, by months since joining{isDemo ? " · demo data" : ""}</p>
                </div>
                {curve.length > 1 ? (
                    <button
                        type="button"
                        className={styles.explainButton}
                        onClick={() =>
                            onExplain(
                                `Our retention curve shows ${last ? `${last.value.toFixed(0)}% of customers still subscribed after ${last.month} months` : "how long customers stay"}${steepest ? `, with the biggest drop in month ${steepest.month}` : ""}. Why do customers leave then, and what should onboarding change?`
                            )
                        }
                    >
                        <Sparkles size={13} strokeWidth={1.8} aria-hidden="true" />
                        Explain
                    </button>
                ) : null}
            </div>

            {curve.length > 1 ? (
                <>
                    <div className={styles.cardHeadline}>
                        <strong>{last ? `${last.value.toFixed(0)}%` : "—"}</strong>
                        {steepest ? (
                            <span className={`${styles.headBadge} ${styles.headBadgeBad}`}>
                                ↓ {steepest.drop.toFixed(1)}pp in month {steepest.month}
                            </span>
                        ) : null}
                        <span className={styles.headNote}>still subscribed after {last?.month} months</span>
                    </div>
                    <div className={styles.extraChart}>
                        <EChart option={option} />
                    </div>
                    <div className={`${styles.movementLegend} ${styles.legendBottom}`}>
                        <span><i style={{ background: BLUE }} />Share still subscribed</span>
                        <span><i className={styles.hatchSwatch} />Based on fewer than {RELIABLE_COHORTS} sign-up months</span>
                    </div>
                </>
            ) : (
                <div className={styles.emptyState}>
                    <strong>Needs subscription history</strong>
                    <span>The curve appears once Cobrai has start and cancel dates for individual subscriptions.</span>
                </div>
            )}
        </section>
    );
}
