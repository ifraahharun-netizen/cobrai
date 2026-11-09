"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import type { EChartsOption } from "echarts";
import { Sparkles } from "lucide-react";
import { computeRetention, monthName, type MovementMonth } from "./metricsExtras";
import styles from "./metrics.module.css";

const EChart = dynamic(() => import("@/components/charts/EChart"), { ssr: false });

const COLOURS = {
    newMrr: "#3b6fe0",
    expansion: "#a9c2f7",
    contraction: "#f0b860",
    churned: "#e0685f",
};

function pct(value: number | null | undefined) {
    return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(1)}%` : "—";
}

/** MRR movement (new, expansion, contraction, churned) with NRR and GRR. */
export default function RevenueMovementCard({
    movement,
    periodLabel,
    formatMoney,
    estimated,
    onExplain,
}: {
    movement: MovementMonth[];
    periodLabel: string;
    formatMoney: (major: number) => string;
    /** True when the split is estimated from monthly totals. */
    estimated: boolean;
    onExplain: (question: string) => void;
}) {
    const retention = useMemo(() => computeRetention(movement), [movement]);

    const option = useMemo<EChartsOption>(() => {
        const round = (v: number) => Math.round(v * 100) / 100;
        return {
            animation: false,
            backgroundColor: "transparent",
            grid: { top: 12, right: 8, bottom: 4, left: 0, containLabel: true },
            tooltip: {
                trigger: "axis",
                axisPointer: { type: "shadow", shadowStyle: { color: "rgba(31,30,27,0.035)" } },
                backgroundColor: "#1f1e1b",
                borderWidth: 0,
                padding: [10, 12],
                textStyle: { color: "#ffffff", fontSize: 12 },
                extraCssText: "border-radius:8px;box-shadow:0 8px 24px rgba(31,30,27,.18);",
                formatter: (raw: unknown) => {
                    const items = (Array.isArray(raw) ? raw : [raw]) as Array<{
                        seriesName: string;
                        value: number;
                        color: string;
                        dataIndex: number;
                    }>;
                    const m = movement[items[0]?.dataIndex ?? 0];
                    if (!m) return "";
                    const net = m.newMrr + m.expansion - m.contraction - m.churned;
                    const rows = items
                        .map(
                            (item) =>
                                `<div style="display:flex;justify-content:space-between;gap:18px"><span><i style="display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:6px;background:${item.color}"></i>${item.seriesName}</span><b style="font-weight:500">${formatMoney(Math.abs(item.value))}</b></div>`
                        )
                        .join("");
                    return `<div style="font-size:12px;min-width:170px"><div style="color:rgba(255,255,255,.62);margin-bottom:6px">${monthName(m.month)}</div>${rows}<div style="display:flex;justify-content:space-between;margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,.14)"><span>Net change</span><b style="font-weight:500">${net >= 0 ? "+" : "−"}${formatMoney(Math.abs(net))}</b></div></div>`;
                },
            },
            xAxis: {
                type: "category",
                data: movement.map((m) => monthName(m.month, false)),
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: { color: "#9ca3af", fontSize: 10.5, margin: 12, hideOverlap: true },
            },
            yAxis: {
                type: "value",
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: {
                    color: "#9ca3af",
                    fontSize: 10,
                    formatter: (v: number) => (v === 0 ? "0" : `${v < 0 ? "−" : ""}${formatMoney(Math.abs(v))}`),
                },
                splitLine: { lineStyle: { color: "#ebe9e3", type: [4, 4] } },
            },
            series: [
                { name: "New", type: "bar", stack: "up", barMaxWidth: 16, data: movement.map((m) => round(m.newMrr)), itemStyle: { color: COLOURS.newMrr, borderRadius: [0, 0, 0, 0] } },
                { name: "Expansion", type: "bar", stack: "up", barMaxWidth: 16, data: movement.map((m) => round(m.expansion)), itemStyle: { color: COLOURS.expansion, borderRadius: [5, 5, 0, 0] } },
                { name: "Contraction", type: "bar", stack: "down", barMaxWidth: 16, data: movement.map((m) => -round(m.contraction)), itemStyle: { color: COLOURS.contraction } },
                { name: "Churned", type: "bar", stack: "down", barMaxWidth: 16, data: movement.map((m) => -round(m.churned)), itemStyle: { color: COLOURS.churned, borderRadius: [0, 0, 5, 5] } },
            ],
        };
    }, [movement, formatMoney]);

    return (
        <section className={`${styles.extraCard} ${styles.gridCard}`} aria-labelledby="mrr-movement-title" id="metrics-movement">
            <div className={styles.extraHead}>
                <div>
                    <h3 id="mrr-movement-title">MRR movement</h3>
                    <p>
                        Where MRR came from and where it went · {periodLabel.toLowerCase()}
                        {estimated ? " · estimated from monthly totals" : ""}
                    </p>
                </div>
                <button
                    type="button"
                    className={styles.explainButton}
                    onClick={() =>
                        onExplain(
                            `Explain our MRR movement and retention for the ${periodLabel.toLowerCase()}: NRR is ${pct(retention?.nrr)} and GRR is ${pct(retention?.grr)}. What's driving expansion and churn, and how do we improve NRR?`
                        )
                    }
                >
                    <Sparkles size={13} strokeWidth={1.8} aria-hidden="true" />
                    Explain
                </button>
            </div>

            {movement.length && retention ? (
                <>
                    <div className={styles.retentionStats}>
                        <div>
                            <span title="Revenue kept from existing customers, including expansion">Net revenue retention</span>
                            <strong className={retention.nrr >= 100 ? styles.good : styles.bad}>{pct(retention.nrr)}</strong>
                        </div>
                        <div>
                            <span title="Revenue kept from existing customers, excluding expansion">Gross revenue retention</span>
                            <strong>{pct(retention.grr)}</strong>
                        </div>
                        <div>
                            <span>Net new MRR</span>
                            <strong className={retention.net >= 0 ? styles.good : styles.bad}>
                                {retention.net >= 0 ? "+" : "−"}
                                {formatMoney(Math.abs(retention.net))}
                            </strong>
                        </div>
                    </div>

                    <div className={styles.movementLegend}>
                        <span><i style={{ background: COLOURS.newMrr }} />New {formatMoney(retention.newMrr)}</span>
                        <span><i style={{ background: COLOURS.expansion }} />Expansion {formatMoney(retention.expansion)}</span>
                        <span><i style={{ background: COLOURS.contraction }} />Contraction {formatMoney(retention.contraction)}</span>
                        <span><i style={{ background: COLOURS.churned }} />Churned {formatMoney(retention.churned)}</span>
                    </div>

                    <div className={styles.extraChart}>
                        <EChart option={option} />
                    </div>
                </>
            ) : (
                <div className={styles.emptyState}>
                    <strong>Not enough history yet</strong>
                    <span>MRR movement appears once there are at least two months of MRR and churn data.</span>
                </div>
            )}
        </section>
    );
}
