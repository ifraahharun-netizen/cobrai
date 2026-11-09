"use client";

import { useMemo, useState } from "react";

import styles from "./marketing-charts.module.css";

type RevenuePoint = {

    label: string;

    revenue: number;

    forecast?: boolean;

};

type ChurnPoint = {

    label: string;

    churn: number;

    forecast?: boolean;

};

type TooltipState = {

    x: number;

    y: number;

    label: string;

    title: string;

    value: string;

    detail?: string;

} | null;

const revenueData: RevenuePoint[] = [
    { label: "1 Aug", revenue: 2392 },
    { label: "1 Aug", revenue: 2418 },
    { label: "2 Aug", revenue: 2406 },
    { label: "2 Aug", revenue: 2441 },
    { label: "3 Aug", revenue: 2434 },
    { label: "3 Aug", revenue: 2472 },
    { label: "4 Aug", revenue: 2486 },
    { label: "4 Aug", revenue: 2469 },
    { label: "5 Aug", revenue: 2498 },
    { label: "5 Aug", revenue: 2526 },
    { label: "6 Aug", revenue: 2512 },
    { label: "6 Aug", revenue: 2539 },
    { label: "7 Aug", revenue: 2561 },
    { label: "7 Aug", revenue: 2548 },
    { label: "8 Aug", revenue: 2583 },
    { label: "8 Aug", revenue: 2617 },
    { label: "9 Aug", revenue: 2599 },
    { label: "9 Aug", revenue: 2638 },
    { label: "10 Aug", revenue: 2662 },
    { label: "10 Aug", revenue: 2641 },
    { label: "11 Aug", revenue: 2614 },
    { label: "11 Aug", revenue: 2588 },
    { label: "12 Aug", revenue: 2621 },
    { label: "12 Aug", revenue: 2657 },
    { label: "13 Aug", revenue: 2646 },
    { label: "13 Aug", revenue: 2689 },
    { label: "14 Aug", revenue: 2714 },
    { label: "14 Aug", revenue: 2691 },
    { label: "15 Aug", revenue: 2736 },
    { label: "15 Aug", revenue: 2761 },
    { label: "16 Aug", revenue: 2722 },
    { label: "16 Aug", revenue: 2684 },
    { label: "17 Aug", revenue: 2651 },
    { label: "17 Aug", revenue: 2696 },
    { label: "18 Aug", revenue: 2731 },
    { label: "18 Aug", revenue: 2758 },
    { label: "19 Aug", revenue: 2727 },
    { label: "19 Aug", revenue: 2693 },
    { label: "20 Aug", revenue: 2742 },
    { label: "20 Aug", revenue: 2783 },
    { label: "21 Aug", revenue: 2764 },
    { label: "21 Aug", revenue: 2721 },
    { label: "22 Aug", revenue: 2676 },
    { label: "22 Aug", revenue: 2709 },
    { label: "23 Aug", revenue: 2751 },
    { label: "23 Aug", revenue: 2787 },
    { label: "24 Aug", revenue: 2759 },
    { label: "24 Aug", revenue: 2724 },
    { label: "25 Aug", revenue: 2768 },
    { label: "25 Aug", revenue: 2680 },
    { label: "26 Aug", revenue: 2716, forecast: true },
    { label: "26 Aug", revenue: 2748, forecast: true },
    { label: "27 Aug", revenue: 2729, forecast: true },
    { label: "27 Aug", revenue: 2767, forecast: true },
    { label: "28 Aug", revenue: 2751, forecast: true },
    { label: "28 Aug", revenue: 2791, forecast: true },
    { label: "29 Aug", revenue: 2773, forecast: true },
    { label: "29 Aug", revenue: 2810, forecast: true },
    { label: "30 Aug", revenue: 2794, forecast: true },
    { label: "30 Aug", revenue: 2824, forecast: true },
    { label: "31 Aug", revenue: 2811, forecast: true },
    { label: "31 Aug", revenue: 2842, forecast: true },
];

const churnData: ChurnPoint[] = [
    { label: "1 Aug", churn: 3.74 },
    { label: "1 Aug", churn: 3.61 },
    { label: "2 Aug", churn: 3.66 },
    { label: "2 Aug", churn: 3.47 },
    { label: "3 Aug", churn: 3.56 },
    { label: "3 Aug", churn: 3.38 },
    { label: "4 Aug", churn: 3.45 },
    { label: "4 Aug", churn: 3.29 },
    { label: "5 Aug", churn: 3.33 },
    { label: "5 Aug", churn: 3.41 },
    { label: "6 Aug", churn: 3.27 },
    { label: "6 Aug", churn: 3.18 },
    { label: "7 Aug", churn: 3.24 },
    { label: "7 Aug", churn: 3.11 },
    { label: "8 Aug", churn: 3.16 },
    { label: "8 Aug", churn: 3.04 },
    { label: "9 Aug", churn: 3.09 },
    { label: "9 Aug", churn: 2.96 },
    { label: "10 Aug", churn: 3.02 },
    { label: "10 Aug", churn: 3.14 },
    { label: "11 Aug", churn: 3.27 },
    { label: "11 Aug", churn: 3.08 },
    { label: "12 Aug", churn: 3.15 },
    { label: "12 Aug", churn: 2.99 },
    { label: "13 Aug", churn: 3.04 },
    { label: "13 Aug", churn: 2.91 },
    { label: "14 Aug", churn: 2.95 },
    { label: "14 Aug", churn: 2.79 },
    { label: "15 Aug", churn: 2.87 },
    { label: "15 Aug", churn: 2.74 },
    { label: "16 Aug", churn: 2.81 },
    { label: "16 Aug", churn: 2.93 },
    { label: "17 Aug", churn: 3.07 },
    { label: "17 Aug", churn: 2.88 },
    { label: "18 Aug", churn: 2.94 },
    { label: "18 Aug", churn: 2.73 },
    { label: "19 Aug", churn: 2.78 },
    { label: "19 Aug", churn: 2.66 },
    { label: "20 Aug", churn: 2.72 },
    { label: "20 Aug", churn: 2.58 },
    { label: "21 Aug", churn: 2.63 },
    { label: "21 Aug", churn: 2.71 },
    { label: "22 Aug", churn: 2.84 },
    { label: "22 Aug", churn: 2.69 },
    { label: "23 Aug", churn: 2.75 },
    { label: "23 Aug", churn: 2.57 },
    { label: "24 Aug", churn: 2.64 },
    { label: "24 Aug", churn: 2.51 },
    { label: "25 Aug", churn: 2.59 },
    { label: "25 Aug", churn: 2.46 },
    { label: "26 Aug", churn: 2.53, forecast: true },
    { label: "26 Aug", churn: 2.61, forecast: true },
    { label: "27 Aug", churn: 2.55, forecast: true },
    { label: "27 Aug", churn: 2.48, forecast: true },
    { label: "28 Aug", churn: 2.52, forecast: true },
    { label: "28 Aug", churn: 2.43, forecast: true },
    { label: "29 Aug", churn: 2.47, forecast: true },
    { label: "29 Aug", churn: 2.39, forecast: true },
    { label: "30 Aug", churn: 2.44, forecast: true },
    { label: "30 Aug", churn: 2.36, forecast: true },
    { label: "31 Aug", churn: 2.41, forecast: true },
    { label: "31 Aug", churn: 2.34, forecast: true },
];

function formatMoney(value: number) {

    return new Intl.NumberFormat("en-GB", {

        style: "currency",

        currency: "GBP",

        maximumFractionDigits: 0,

    }).format(value);

}

function formatMoneyWithDecimals(value: number) {

    return new Intl.NumberFormat("en-GB", {

        style: "currency",

        currency: "GBP",

        minimumFractionDigits: 2,

        maximumFractionDigits: 2,

    }).format(value);

}

function createLinePath(points: Array<{ x: number; y: number }>) {

    if (points.length === 0) return "";

    return points

        .map(

            (point, index) =>

                `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`,

        )

        .join(" ");

}

function CalendarIcon() {

    return (

        <svg

            width="15"

            height="15"

            viewBox="0 0 24 24"

            fill="none"

            aria-hidden="true"

        >

            <path

                d="M7 3V6M17 3V6M4 9H20M5 5H19C20.1 5 21 5.9 21 7V19C21 20.1 20.1 21 19 21H5C3.9 21 3 20.1 3 19V7C3 5.9 3.9 5 5 5Z"

                stroke="currentColor"

                strokeWidth="1.6"

                strokeLinecap="round"

                strokeLinejoin="round"

            />

        </svg>

    );

}

function ChevronIcon() {

    return (

        <svg

            width="14"

            height="14"

            viewBox="0 0 20 20"

            fill="none"

            aria-hidden="true"

        >

            <path

                d="M6.5 8L10 11.5L13.5 8"

                stroke="currentColor"

                strokeWidth="1.5"

                strokeLinecap="round"

                strokeLinejoin="round"

            />

        </svg>

    );

}

function RevenueChart() {

    const [tooltip, setTooltip] = useState<TooltipState>(null);

    const width = 760;

    const height = 305;

    const padding = {

        top: 18,

        right: 12,

        bottom: 36,

        left: 52,

    };

    const min = 2360;

    const max = 2780;

    const chartWidth = width - padding.left - padding.right;

    const chartHeight = height - padding.top - padding.bottom;

    const points = useMemo(

        () =>

            revenueData.map((item, index) => ({

                ...item,

                x:

                    padding.left +

                    (index / (revenueData.length - 1)) * chartWidth,

                y:

                    padding.top +

                    ((max - item.revenue) / (max - min)) * chartHeight,

            })),

        [chartWidth, chartHeight],

    );

    const actualPoints = points.filter((point) => !point.forecast);

    const firstForecastIndex = points.findIndex(

        (point) => point.forecast,

    );

    const forecastPoints =

        firstForecastIndex > 0

            ? points.slice(firstForecastIndex - 1)

            : [];

    const yTicks = [2400, 2480, 2560, 2640, 2720];

    const xTickIndexes = [0, 8, 18, 28, 38, 48, 60];

    return (

        <div className={styles.chartWrap}>

            <svg

                viewBox={`0 0 ${width} ${height}`}

                className={styles.chart}

                role="img"

                aria-label="Revenue trend"

            >

                <defs>

                    <linearGradient

                        id="revenueArea"

                        x1="0"

                        y1="0"

                        x2="0"

                        y2="1"

                    >

                        <stop

                            offset="0%"

                            stopColor="#397fc2"

                            stopOpacity="0.10"

                        />

                        <stop

                            offset="100%"

                            stopColor="#397fc2"

                            stopOpacity="0"

                        />

                    </linearGradient>

                </defs>

                {yTicks.map((tick) => {

                    const y =

                        padding.top +

                        ((max - tick) / (max - min)) * chartHeight;

                    return (

                        <g key={tick}>

                            <line

                                x1={padding.left}

                                x2={width - padding.right}

                                y1={y}

                                y2={y}

                                className={styles.gridLine}

                            />

                            <text

                                x={padding.left - 12}

                                y={y + 4}

                                textAnchor="end"

                                className={styles.axisText}

                            >

                                {tick.toLocaleString("en-GB")}

                            </text>

                        </g>

                    );

                })}

                {xTickIndexes.map((index) => {

                    const point = points[index];

                    if (!point) return null;

                    return (

                        <text

                            key={index}

                            x={point.x}

                            y={height - 8}

                            textAnchor={

                                index === 0

                                    ? "start"

                                    : index ===

                                        revenueData.length - 1

                                        ? "end"

                                        : "middle"

                            }

                            className={styles.axisText}

                        >

                            {point.label}

                        </text>

                    );

                })}

                <path

                    d={`${createLinePath(actualPoints)} L ${actualPoints[actualPoints.length - 1].x

                        } ${padding.top + chartHeight} L ${actualPoints[0].x

                        } ${padding.top + chartHeight} Z`}

                    fill="url(#revenueArea)"

                    className={styles.areaFill}

                />

                <path

                    d={createLinePath(actualPoints)}

                    className={styles.revenueLine}

                />

                <path

                    d={createLinePath(forecastPoints)}

                    className={styles.revenueForecastLine}

                />

                {points.map((point, index) => (

                    <circle

                        key={`${point.label}-${index}`}

                        cx={point.x}

                        cy={point.y}

                        r="12"

                        className={styles.hoverPoint}

                        onMouseEnter={() =>

                            setTooltip({

                                x: point.x,

                                y: point.y,

                                label: point.label,

                                title: point.forecast

                                    ? "Forecast revenue"

                                    : "Revenue",

                                value: formatMoney(point.revenue),

                                detail: point.forecast

                                    ? "AI forecast"

                                    : "Actual revenue",

                            })

                        }

                        onMouseLeave={() => setTooltip(null)}

                    />

                ))}

                {tooltip && (

                    <circle

                        cx={tooltip.x}

                        cy={tooltip.y}

                        r="4"

                        className={styles.revenueDot}

                    />

                )}

            </svg>

            {tooltip && (

                <div

                    className={styles.tooltip}

                    style={{

                        left: `${(tooltip.x / width) * 100}%`,

                        top: `${(tooltip.y / height) * 100}%`,

                    }}

                >

                    <div className={styles.tooltipDate}>

                        {tooltip.label}

                    </div>

                    <div className={styles.tooltipRow}>

                        <span

                            className={`${styles.tooltipDot} ${styles.blueDot}`}

                        />

                        <span>{tooltip.title}</span>

                        <strong>{tooltip.value}</strong>

                    </div>

                    {tooltip.detail && (

                        <div className={styles.tooltipDetail}>

                            {tooltip.detail}

                        </div>

                    )}

                </div>

            )}

        </div>

    );

}

function ChurnChart() {

    const [tooltip, setTooltip] = useState<TooltipState>(null);

    const width = 760;

    const height = 305;

    const padding = {

        top: 18,

        right: 12,

        bottom: 36,

        left: 52,

    };

    const min = 2.2;

    const max = 3.9;

    const chartWidth = width - padding.left - padding.right;

    const chartHeight = height - padding.top - padding.bottom;

    const points = useMemo(

        () =>

            churnData.map((item, index) => ({

                ...item,

                x:

                    padding.left +

                    (index / (churnData.length - 1)) * chartWidth,

                y:

                    padding.top +

                    ((max - item.churn) / (max - min)) * chartHeight,

            })),

        [chartWidth, chartHeight],

    );

    const actualPoints = points.filter((point) => !point.forecast);

    const firstForecastIndex = points.findIndex(

        (point) => point.forecast,

    );

    const forecastPoints =

        firstForecastIndex > 0

            ? points.slice(firstForecastIndex - 1)

            : [];

    const yTicks = [2.3, 2.7, 3.1, 3.5, 3.9];

    const xTickIndexes = [0, 8, 18, 28, 38, 48, 60];

    return (

        <div className={styles.chartWrap}>

            <svg

                viewBox={`0 0 ${width} ${height}`}

                className={styles.chart}

                role="img"

                aria-label="Customer churn trend"

            >

                <defs>

                    <linearGradient

                        id="churnArea"

                        x1="0"

                        y1="0"

                        x2="0"

                        y2="1"

                    >

                        <stop

                            offset="0%"

                            stopColor="#6558c7"

                            stopOpacity="0.09"

                        />

                        <stop

                            offset="100%"

                            stopColor="#6558c7"

                            stopOpacity="0"

                        />

                    </linearGradient>

                </defs>

                {yTicks.map((tick) => {

                    const y =

                        padding.top +

                        ((max - tick) / (max - min)) * chartHeight;

                    return (

                        <g key={tick}>

                            <line

                                x1={padding.left}

                                x2={width - padding.right}

                                y1={y}

                                y2={y}

                                className={styles.gridLine}

                            />

                            <text

                                x={padding.left - 12}

                                y={y + 4}

                                textAnchor="end"

                                className={styles.axisText}

                            >

                                {tick.toFixed(1)}%

                            </text>

                        </g>

                    );

                })}

                {xTickIndexes.map((index) => {

                    const point = points[index];

                    if (!point) return null;

                    return (

                        <text

                            key={index}

                            x={point.x}

                            y={height - 8}

                            textAnchor={

                                index === 0

                                    ? "start"

                                    : index ===

                                        churnData.length - 1

                                        ? "end"

                                        : "middle"

                            }

                            className={styles.axisText}

                        >

                            {point.label}

                        </text>

                    );

                })}

                <path

                    d={`${createLinePath(actualPoints)} L ${actualPoints[actualPoints.length - 1].x

                        } ${padding.top + chartHeight} L ${actualPoints[0].x

                        } ${padding.top + chartHeight} Z`}

                    fill="url(#churnArea)"

                    className={styles.areaFill}

                />

                <path

                    d={createLinePath(actualPoints)}

                    className={styles.churnLine}

                />

                <path

                    d={createLinePath(forecastPoints)}

                    className={styles.churnForecastLine}

                />

                {points.map((point, index) => (

                    <circle

                        key={`${point.label}-${index}`}

                        cx={point.x}

                        cy={point.y}

                        r="12"

                        className={styles.hoverPoint}

                        onMouseEnter={() =>

                            setTooltip({

                                x: point.x,

                                y: point.y,

                                label: point.label,

                                title: point.forecast

                                    ? "Forecast churn"

                                    : "Customer churn",

                                value: `${point.churn.toFixed(2)}%`,

                                detail: point.forecast

                                    ? "AI forecast"

                                    : "Observed churn",

                            })

                        }

                        onMouseLeave={() => setTooltip(null)}

                    />

                ))}

                {tooltip && (

                    <circle

                        cx={tooltip.x}

                        cy={tooltip.y}

                        r="4"

                        className={styles.churnDot}

                    />

                )}

            </svg>

            {tooltip && (

                <div

                    className={styles.tooltip}

                    style={{

                        left: `${(tooltip.x / width) * 100}%`,

                        top: `${(tooltip.y / height) * 100}%`,

                    }}

                >

                    <div className={styles.tooltipDate}>

                        {tooltip.label}

                    </div>

                    <div className={styles.tooltipRow}>

                        <span

                            className={`${styles.tooltipDot} ${styles.purpleDot}`}

                        />

                        <span>{tooltip.title}</span>

                        <strong>{tooltip.value}</strong>

                    </div>

                    {tooltip.detail && (

                        <div className={styles.tooltipDetail}>

                            {tooltip.detail}

                        </div>

                    )}

                </div>

            )}

        </div>

    );

}

type MetricIconName =
    | "forecast"
    | "acquired"
    | "retained"
    | "protected"
    | "expansion"
    | "confidence"
    | "churn"
    | "saved"
    | "health"
    | "risk"
    | "lost";

type MetricProps = {
    label: string;
    value: string;
    change?: string;
    tone?: "positive" | "negative" | "neutral";
    footer?: string;
    icon: MetricIconName;
};

function MetricIcon({ name }: { name: MetricIconName }) {
    const common = {
        width: 17,
        height: 17,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 1.7,
        strokeLinecap: "round" as const,
        strokeLinejoin: "round" as const,
        "aria-hidden": true,
    };

    if (name === "forecast") {
        return (
            <svg {...common}>
                <path d="M4 19V10" />
                <path d="M10 19V5" />
                <path d="M16 19v-7" />
                <path d="M3 19h18" />
            </svg>
        );
    }

    if (name === "acquired") {
        return (
            <svg {...common}>
                <circle cx="10" cy="8" r="3" />
                <path d="M4.5 19c.5-3.3 2.4-5 5.5-5s5 1.7 5.5 5" />
                <path d="M18.5 8.5v6" />
                <path d="M15.5 11.5h6" />
            </svg>
        );
    }

    if (name === "retained") {
        return (
            <svg {...common}>
                <circle cx="9" cy="8" r="3" />
                <path d="M3.8 19c.5-3.2 2.3-5 5.2-5 2.1 0 3.7.9 4.6 2.5" />
                <path d="M16.5 7.5a2.5 2.5 0 1 1 0 5" />
                <path d="M16 15c2.8.2 4.3 1.5 4.7 4" />
            </svg>
        );
    }

    if (name === "protected") {
        return (
            <svg {...common}>
                <path d="M12 3 5 6v5c0 4.6 2.8 7.8 7 10 4.2-2.2 7-5.4 7-10V6l-7-3Z" />
                <path d="m9 12 2 2 4-4" />
            </svg>
        );
    }

    if (name === "expansion") {
        return (
            <svg {...common}>
                <path d="M4 17 9 12l3 3 7-8" />
                <path d="M14 7h5v5" />
            </svg>
        );
    }

    if (name === "confidence") {
        return (
            <svg {...common}>
                <path d="m12 3 1.2 3.4L16.5 8l-3.3 1.5L12 13l-1.2-3.5L7.5 8l3.3-1.6L12 3Z" />
                <path d="m18.5 13 .7 2 2 .8-2 .8-.7 2-.8-2-2-.8 2-.8.8-2Z" />
                <path d="m6 14 .7 1.7 1.8.8-1.8.7L6 19l-.8-1.8-1.7-.7 1.7-.8L6 14Z" />
            </svg>
        );
    }

    if (name === "churn") {
        return (
            <svg {...common}>
                <path d="M4 7 9 12l3-3 7 8" />
                <path d="M14 17h5v-5" />
            </svg>
        );
    }

    if (name === "saved") {
        return (
            <svg {...common}>
                <circle cx="9" cy="8" r="3" />
                <path d="M3.8 19c.5-3.3 2.3-5 5.2-5 1.7 0 3.1.5 4.1 1.5" />
                <path d="m15 16 2 2 4-4" />
            </svg>
        );
    }

    if (name === "health") {
        return (
            <svg {...common}>
                <path d="M12 20s-7-4.3-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.7-7 10-7 10Z" />
                <path d="M7.5 12h2l1-2.2 2.2 4.5 1.1-2.3h2.7" />
            </svg>
        );
    }

    if (name === "risk") {
        return (
            <svg {...common}>
                <path d="M12 4 3.8 19h16.4L12 4Z" />
                <path d="M12 9v4" />
                <path d="M12 16.5h.01" />
            </svg>
        );
    }

    return (
        <svg {...common}>
            <rect x="4" y="6" width="16" height="12" rx="3" />
            <path d="M4 10h16" />
            <path d="M14.5 14h3" />
        </svg>
    );
}

function Metric({
    label,
    value,
    change,
    tone = "neutral",
    footer = "vs previous month",
    icon,
}: MetricProps) {
    const changeColor =
        tone === "positive"
            ? "#4f9a76"
            : tone === "negative"
                ? "#b66a6a"
                : "#737b86";

    return (
        <div
            className={styles.metric}
            style={{
                position: "relative",
                minHeight: 126,
                padding: "17px 52px 14px 18px",
                border: "1px solid #e7e9ed",
                borderRadius: 14,
                background: "#ffffff",
                boxShadow: "0 1px 2px rgba(16, 24, 40, 0.02)",
                overflow: "hidden",
            }}
        >
            <div
                aria-hidden="true"
                style={{
                    position: "absolute",
                    top: 14,
                    right: 14,
                    width: 34,
                    height: 34,
                    borderRadius: 999,
                    border: "1px solid #e4e7eb",
                    background: "#fbfcfd",
                    display: "grid",
                    placeItems: "center",
                    color: "#7b838e",
                }}
            >
                <MetricIcon name={icon} />
            </div>

            <p
                className={styles.metricLabel}
                style={{
                    margin: 0,
                    fontSize: 11.5,
                    lineHeight: 1.2,
                    fontWeight: 600,
                    letterSpacing: "0.075em",
                    textTransform: "uppercase",
                    color: "#7a818c",
                }}
            >
                {label}
            </p>

            <div
                className={styles.metricValue}
                style={{
                    marginTop: 11,
                    fontSize: 27,
                    lineHeight: 1.05,
                    fontWeight: 500,
                    letterSpacing: "-0.035em",
                    color: "#34383f",
                }}
            >
                {value}
            </div>

            {change && (
                <div
                    className={styles.metricChange}
                    style={{
                        marginTop: 10,
                        fontSize: 12.5,
                        lineHeight: 1.25,
                        fontWeight: 500,
                        color: changeColor,
                    }}
                >
                    {change}
                    <span
                        style={{
                            marginLeft: 5,
                            fontWeight: 400,
                            color: "#8b919a",
                        }}
                    >
                        vs previous month
                    </span>
                </div>
            )}

            <div
                className={styles.metricFooter}
                style={{
                    marginTop: 5,
                    fontSize: 11.5,
                    lineHeight: 1.25,
                    color: "#9a9fa7",
                }}
            >
                {footer}
            </div>
        </div>
    );
}

function RevenueCard() {

    return (

        <section className={styles.chartCard}>

            <div className={styles.cardHeader}>

                <div>

                    <p className={styles.cardEyebrow}>

                        Revenue performance

                    </p>

                    <h2>Revenue Trend</h2>

                </div>

                <button

                    type="button"

                    className={styles.dateButton}

                >

                    <CalendarIcon />

                    <span>1 Aug 2026 – 31 Aug 2026</span>

                    <ChevronIcon />

                </button>

            </div>

            <div className={styles.primaryMetric}>

                <strong>{formatMoneyWithDecimals(2680)}</strong>

                <span

                    className={`${styles.primaryTrend} ${styles.positive}`}

                >

                    ↑ 6.7%

                </span>

                <span className={styles.primaryComparison}>

                    vs previous month

                </span>

            </div>

            <div className={styles.legend}>

                <span>

                    <i

                        className={`${styles.legendBlock} ${styles.revenueBlock}`}

                    />

                    Revenue

                </span>

                <span>

                    <i

                        className={`${styles.legendLine} ${styles.revenueLegendLine}`}

                    />

                    AI forecast

                </span>

            </div>

            <RevenueChart />

            <div className={styles.metricsGrid}>

                <Metric

                    label="Forecast MRR"
                    icon="forecast"

                    value="£2,732.00"

                    change="↑ 5.9%"

                    tone="positive"

                    footer="Previous month: £2,580.00"

                />

                <Metric

                    label="Acquired users"
                    icon="acquired"

                    value="18"

                    change="↑ 12.5%"

                    tone="positive"

                    footer="Previous month: 16"

                />

                <Metric

                    label="Retained users"
                    icon="retained"

                    value="214"

                    change="↑ 3.4%"

                    tone="positive"

                    footer="Previous month: 207"

                />

                <Metric

                    label="Revenue protected"
                    icon="protected"

                    value="£1,860.00"

                    change="↑ £440"

                    tone="positive"

                    footer="Previous month: £1,420.00"

                />

                <Metric

                    label="Expansion MRR"
                    icon="expansion"

                    value="£386.00"

                    change="↑ 23.7%"

                    tone="positive"

                    footer="Previous month: £312.00"

                />

                <Metric

                    label="AI confidence"
                    icon="confidence"

                    value="91%"

                    change="↑ 4PP"

                    tone="positive"

                    footer="Previous month: 87%"

                />

            </div>

        </section>

    );

}

function ChurnCard() {

    return (

        <section className={styles.chartCard}>

            <div className={styles.cardHeader}>

                <div>

                    <p className={styles.cardEyebrow}>

                        Customer retention

                    </p>

                    <h2>Churn Trend</h2>

                </div>

                <button

                    type="button"

                    className={styles.dateButton}

                >

                    <CalendarIcon />

                    <span>1 Aug 2026 – 31 Aug 2026</span>

                    <ChevronIcon />

                </button>

            </div>

            <div className={styles.primaryMetric}>

                <strong>2.5%</strong>

                <span

                    className={`${styles.primaryTrend} ${styles.positive}`}

                >

                    ↓ 0.4PP

                </span>

                <span className={styles.primaryComparison}>

                    vs previous month

                </span>

            </div>

            <div className={styles.legend}>

                <span>

                    <i

                        className={`${styles.legendBlock} ${styles.churnBlock}`}

                    />

                    Churn

                </span>

                <span>

                    <i

                        className={`${styles.legendLine} ${styles.churnLegendLine}`}

                    />

                    AI forecast

                </span>

            </div>

            <ChurnChart />

            <div className={styles.metricsGrid}>

                <Metric

                    label="Forecast churn"
                    icon="churn"

                    value="2.4%"

                    change="↓ 0.5PP"

                    tone="positive"

                    footer="Previous month: 3.1%"

                />

                <Metric

                    label="Customers saved"
                    icon="saved"

                    value="7"

                    change="↑ 2"

                    tone="positive"

                    footer="Previous month: 5"

                />

                <Metric

                    label="Customer health"
                    icon="health"

                    value="82%"

                    change="↑ 5PP"

                    tone="positive"

                    footer="Previous month: 77%"

                />

                <Metric

                    label="Revenue at risk"
                    icon="risk"

                    value="£620.00"

                    change="↓ £290"

                    tone="positive"

                    footer="Previous month: £910.00"

                />

                <Metric

                    label="Revenue lost"
                    icon="lost"

                    value="£129.00"

                    change="↓ 45.8%"

                    tone="positive"

                    footer="Previous month: £238.00"

                />

                <Metric

                    label="AI confidence"
                    icon="confidence"

                    value="88%"

                    change="↑ 4PP"

                    tone="positive"

                    footer="Previous month: 84%"

                />

            </div>

        </section>

    );

}

export default function MarketingChartsPage() {

    return (

        <main className={styles.page}>

            <div className={styles.pageTopbar}>

                <div>

                

                </div>

            </div>

            <div className={styles.chartGrid}>

                <RevenueCard />

                <ChurnCard />

            </div>

        </main>

    );

}