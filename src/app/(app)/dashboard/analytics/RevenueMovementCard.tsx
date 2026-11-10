"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { EChartsOption } from "echarts";
import { Sparkles } from "lucide-react";
import { computeRetention, monthName, type MovementMonth } from "./metricsExtras";
import InfoTip from "./InfoTip";
import styles from "./metrics.module.css";

const EChart = dynamic(() => import("@/components/charts/EChart"), { ssr: false });

// All blues: deep blue for totals, the page's blue for new customers,
// lighter blues for upgrades, and pale blues for losses.
const COLOURS = {
    total: "#1e4aa8",
    newMrr: "#3b6fe0",
    expansion: "#8fb0f2",
    contraction: "#d8e3fa",
    churned: "#b4c8f3",
};

/** Plain-English names for each part of the bridge. */
const LABELS = {
    start: "Started with",
    newMrr: "New customers",
    expansion: "Upgrades",
    contraction: "Downgrades",
    churned: "Cancellations",
    end: "Now",
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
    const [mode, setMode] = useState<"bridge" | "monthly">("bridge");

    // Waterfall from opening to closing MRR across the period.
    const bridgeOption = useMemo<EChartsOption | null>(() => {
        if (!movement.length || !retention) return null;
        const start = movement[0].startMrr;
        const end = movement[movement.length - 1].endMrr;
        const { newMrr, expansion, contraction, churned } = retention;
        const afterGains = start + newMrr + expansion;
        const afterContraction = afterGains - contraction;

        const steps = [
            { name: LABELS.start, base: 0, value: start, color: COLOURS.total, sign: "", total: true, help: "Monthly revenue at the start of the period." },
            { name: LABELS.newMrr, base: start, value: newMrr, color: COLOURS.newMrr, sign: "+", total: false, help: "Monthly revenue added by customers who signed up during the period." },
            { name: LABELS.expansion, base: start + newMrr, value: expansion, color: COLOURS.expansion, sign: "+", total: false, help: "Extra monthly revenue from existing customers who moved to a bigger plan." },
            { name: LABELS.contraction, base: afterContraction, value: contraction, color: COLOURS.contraction, sign: "−", total: false, help: "Monthly revenue lost when customers moved to a smaller plan." },
            { name: LABELS.churned, base: afterContraction - churned, value: churned, color: COLOURS.churned, sign: "−", total: false, help: "Monthly revenue lost when customers cancelled." },
            { name: LABELS.end, base: 0, value: end, color: COLOURS.total, sign: "", total: true, help: "Monthly revenue now: where you started, plus gains, minus losses." },
        ];
        const low = Math.min(start, end, afterContraction - churned);
        const axisMin = Math.max(0, Math.floor((low * 0.6) / 100) * 100);
        const round = (v: number) => Math.round(v * 100) / 100;

        return {
            animation: false,
            backgroundColor: "transparent",
            grid: { top: 28, right: 8, bottom: 4, left: 0, containLabel: true },
            tooltip: {
                trigger: "item",
                backgroundColor: "#1f1e1b",
                borderWidth: 0,
                padding: [8, 11],
                textStyle: { color: "#ffffff", fontSize: 12 },
                extraCssText: "border-radius:8px;box-shadow:0 8px 24px rgba(31,30,27,.18);",
                formatter: (raw: unknown) => {
                    const step = steps[(raw as { dataIndex: number }).dataIndex];
                    if (!step) return "";
                    return `<div style="max-width:240px;white-space:normal"><div style="display:flex;justify-content:space-between;gap:14px"><span>${step.name}</span><b style="font-weight:600">${step.sign}${formatMoney(step.value)}</b></div><div style="color:rgba(255,255,255,.62);margin-top:4px;font-size:11.5px;line-height:1.45">${step.help}</div></div>`;
                },
            },
            xAxis: {
                type: "category",
                data: steps.map((step) => step.name),
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: { color: "#6f6e69", fontSize: 11.5, margin: 12 },
            },
            yAxis: {
                type: "value",
                min: axisMin,
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: { color: "#9a9893", fontSize: 10, formatter: (v: number) => formatMoney(v) },
                splitLine: { lineStyle: { color: "#ebe9e3", type: [4, 4] } },
            },
            series: [
                {
                    name: "base",
                    type: "bar",
                    stack: "bridge",
                    silent: true,
                    itemStyle: { color: "transparent" },
                    emphasis: { disabled: true },
                    data: steps.map((step) => round(step.base)),
                },
                {
                    name: "value",
                    type: "bar",
                    stack: "bridge",
                    barWidth: "52%",
                    barMaxWidth: 72,
                    data: steps.map((step) => ({
                        value: round(step.value),
                        itemStyle: {
                            color: step.color,
                            borderRadius: 4,
                        },
                    })),
                    label: {
                        show: true,
                        position: "top",
                        color: "#1f1e1b",
                        fontSize: 11.5,
                        fontWeight: 500,
                        formatter: (raw: unknown) => {
                            const step = steps[(raw as { dataIndex: number }).dataIndex];
                            return step ? `${step.sign}${formatMoney(step.value)}` : "";
                        },
                    },
                    emphasis: { focus: "none", itemStyle: { opacity: 0.85 } },
                },
            ],
        } as EChartsOption;
    }, [movement, retention, formatMoney]);

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
                { name: LABELS.newMrr, type: "bar", stack: "up", barWidth: "52%", barMaxWidth: 40, data: movement.map((m) => round(m.newMrr)), itemStyle: { color: COLOURS.newMrr, borderRadius: [0, 0, 0, 0] } },
                { name: LABELS.expansion, type: "bar", stack: "up", barWidth: "52%", barMaxWidth: 40, data: movement.map((m) => round(m.expansion)), itemStyle: { color: COLOURS.expansion, borderRadius: [4, 4, 0, 0] } },
                { name: LABELS.contraction, type: "bar", stack: "down", barWidth: "52%", barMaxWidth: 40, data: movement.map((m) => -round(m.contraction)), itemStyle: { color: COLOURS.contraction } },
                { name: LABELS.churned, type: "bar", stack: "down", barWidth: "52%", barMaxWidth: 40, data: movement.map((m) => -round(m.churned)), itemStyle: { color: COLOURS.churned, borderRadius: [0, 0, 4, 4] } },
            ],
        };
    }, [movement, formatMoney]);

    return (
        <section className={`${styles.extraCard} ${styles.gridCard} ${styles.fullRow}`} aria-labelledby="mrr-movement-title" id="metrics-movement">
            <div className={styles.extraHead}>
                <div>
                    <h3 id="mrr-movement-title">
                        Revenue movement
                        <InfoTip
                            label="Revenue movement"
                            text="Revenue gained from new customers and upgrades, against revenue lost to downgrades and cancellations. Net revenue retention above 100% means existing customers grow faster than they leave."
                        />
                    </h3>
                    <p>
                        {mode === "bridge"
                            ? "Read left to right: where you started, what you gained, what you lost, where you are now"
                            : "Gains above the line, losses below, for each month"}{" "}
                        ·{" "}
                        {periodLabel.toLowerCase()}
                        {estimated ? " · estimated from monthly totals" : ""}
                    </p>
                </div>
                <div className={styles.extraHeadTools}>
                <div className={styles.segmented} role="tablist" aria-label="Revenue movement view">
                    <button type="button" role="tab" aria-selected={mode === "bridge"} onClick={() => setMode("bridge")}>
                        Bridge
                    </button>
                    <button type="button" role="tab" aria-selected={mode === "monthly"} onClick={() => setMode("monthly")}>
                        Monthly
                    </button>
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
            </div>

            {movement.length && retention ? (
                <>


                    <div className={styles.cardHeadline}>
                        <strong>
                            {retention.net >= 0 ? "+" : "−"}
                            {formatMoney(Math.abs(retention.net))}
                        </strong>
                        {movement[0]?.startMrr ? (
                            <span className={`${styles.headBadge} ${retention.net >= 0 ? styles.headBadgeGood : styles.headBadgeBad}`}>
                                {retention.net >= 0 ? "↑" : "↓"} {Math.abs((retention.net / movement[0].startMrr) * 100).toFixed(1)}%
                            </span>
                        ) : null}
                        <span className={styles.headNote}>
                            a month in revenue · {formatMoney(movement[0]?.startMrr ?? 0)} → {formatMoney(movement[movement.length - 1]?.endMrr ?? 0)}
                        </span>
                    </div>

                    {/* The story in one sentence. */}
                    <p className={styles.chartStory}>
                        {retention.net >= 0 ? "You grew" : "You shrank"} by {formatMoney(Math.abs(retention.net))} a month.{" "}
                        New customers added {formatMoney(retention.newMrr)}
                        {retention.expansion >= 1 ? ` and upgrades ${formatMoney(retention.expansion)}` : ""}, while cancellations
                        took {formatMoney(retention.churned)}
                        {retention.contraction >= 1 ? ` and downgrades ${formatMoney(retention.contraction)}` : ""}.
                        {retention.startMrr > 0 && retention.churned / retention.startMrr >= 0.25
                            ? ` Cancellations cost ${Math.round((retention.churned / retention.startMrr) * 100)}% of what you started with, so keeping customers is the biggest lever.`
                            : ""}
                    </p>

                    <div className={`${styles.extraChart} ${styles.extraChartTall}`}>
                        {mode === "bridge" && bridgeOption ? <EChart option={bridgeOption} /> : <EChart option={option} />}
                    </div>

                    <div className={`${styles.movementLegend} ${styles.legendBottom}`}>
                        <span><i style={{ background: COLOURS.newMrr }} />{LABELS.newMrr} +{formatMoney(retention.newMrr)}</span>
                        <span><i style={{ background: COLOURS.expansion }} />{LABELS.expansion} +{formatMoney(retention.expansion)}</span>
                        <span><i style={{ background: COLOURS.contraction }} />{LABELS.contraction} −{formatMoney(retention.contraction)}</span>
                        <span><i style={{ background: COLOURS.churned }} />{LABELS.churned} −{formatMoney(retention.churned)}</span>
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
