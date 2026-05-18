import type { EChartsOption } from "echarts";
import * as echarts from "echarts";

function formatCurrency(value: number) {
    return `£${value.toLocaleString()}`;
}

function formatPercent(value: number) {
    return `${value.toFixed(1)}%`;
}

function getDeltaMeta(delta: number, lowerIsBetter = false) {
    if (delta === 0) {
        return {
            arrow: "•",
            color: "#6b7280",
        };
    }

    const isUp = delta > 0;
    const isGood = lowerIsBetter ? delta < 0 : delta > 0;

    return {
        arrow: isUp ? "↑" : "↓",
        color: isGood ? "#16a34a" : "#dc2626",
    };
}

function getMrrDeltaMeta(delta: number) {
    if (delta === 0) {
        return {
            arrow: "•",
            color: "#6b7280",
        };
    }

    return {
        arrow: delta > 0 ? "↑" : "↓",
        color: delta > 0 ? "#16a34a" : "#dc2626",
    };
}

export function churnTrendOption(
    months: string[],
    values: number[],
    _isPro?: boolean
): EChartsOption {
    const safeMonths = Array.isArray(months) ? months : [];
    const safeValues = Array.isArray(values) ? values : [];

    const minValue = safeValues.length ? Math.min(...safeValues) : 0;
    const maxValue = safeValues.length ? Math.max(...safeValues) : 0;

    const padding = 0.5;

    const yMinBase = Math.max(0, Number((minValue - padding).toFixed(1)));
    const yMaxBase = Number((maxValue + padding).toFixed(1));

    const range = yMaxBase - yMinBase;
    const interval = Number((range / 4).toFixed(1));

    return {
        animationDuration: 700,
        animationEasing: "cubicOut",

        grid: {
            top: 20,
            right: 18,
            bottom: 22,
            left: 8,
            containLabel: true,
        },

        tooltip: {
            trigger: "axis",

            axisPointer: {
                type: "line",
                lineStyle: {
                    color: "rgba(95, 143, 220, 0.25)",
                    width: 1,
                },
            },

            backgroundColor: "#ffffff",
            borderColor: "#edf1f5",
            borderWidth: 1,

            textStyle: {
                color: "#111827",
                fontFamily: "inherit",
            },

            padding: 10,

            extraCssText:
                "border-radius:16px; box-shadow:0 10px 30px rgba(15,23,42,0.08);",

            formatter: (params: any) => {
                const point = Array.isArray(params) ? params[0] : params;

                const index = point?.dataIndex ?? 0;
                const month = safeMonths[index] ?? "";
                const value = Number(point?.value ?? 0);

                if (index === 0) {
                    return `
<div style="display:flex;flex-direction:column;gap:6px;">
<div style="font-size:12px;color:#6b7280;font-weight:600;">
${month}
</div>

<div style="font-size:14px;font-weight:700;color:#111827;">
${formatPercent(value)} churn
</div>

<div style="font-size:12px;color:#6b7280;font-weight:600;">
• No previous month value
</div>
</div>
`;
                }

                const previousMonth = safeMonths[index - 1] ?? "";
                const previous = Number(safeValues[index - 1] ?? value);

                const delta = Number((value - previous).toFixed(1));

                const meta = getDeltaMeta(delta, true);

                return `
<div style="display:flex;flex-direction:column;gap:6px;">
<div style="font-size:12px;color:#6b7280;font-weight:600;">
${month}
</div>

<div style="font-size:14px;font-weight:700;color:#111827;">
${formatPercent(value)} churn
</div>

<div style="font-size:12px;font-weight:700;color:${meta.color};">
${meta.arrow} ${formatPercent(Math.abs(delta))} vs ${previousMonth} (${formatPercent(previous)})
</div>
</div>
`;
            },
        },

        xAxis: {
            type: "category",

            data: safeMonths,

            boundaryGap: false,

            axisTick: {
                show: false,
            },

            axisLine: {
                lineStyle: {
                    color: "#eef2f7",
                },
            },

            axisLabel: {
                color: "#7b8494",
                fontSize: 12,
                margin: 8,
            },
        },

        yAxis: {
            type: "value",

            min: yMinBase,
            max: yMaxBase,
            interval,

            axisLine: {
                show: false,
            },

            axisTick: {
                show: false,
            },

            axisLabel: {
                color: "#7b8494",
                fontSize: 12,
                margin: 8,

                formatter: (value: number) => {
                    const roundedMax = Number(yMaxBase.toFixed(1));

                    if (Number(value.toFixed(1)) >= roundedMax) {
                        return "";
                    }

                    return `${value}%`;
                },
            },

            splitLine: {
                lineStyle: {
                    color: "rgba(148, 163, 184, 0.08)",
                },
            },
        },

        series: [
            {
                type: "line",

                smooth: true,

                data: safeValues,

                showSymbol: false,

                symbol: "circle",

                symbolSize: 8,

                lineStyle: {
                    width: 3,
                    color: "#5f8fdc",
                },

                itemStyle: {
                    color: "#5f8fdc",
                    borderColor: "#ffffff",
                    borderWidth: 3,
                },

                emphasis: {
                    focus: "series",

                    scale: true,

                    itemStyle: {
                        color: "#5f8fdc",
                        borderColor: "#ffffff",
                        borderWidth: 4,
                    },
                },

                areaStyle: {
                    opacity: 1,

                    color: new echarts.graphic.LinearGradient(
                        0,
                        0,
                        0,
                        1,
                        [
                            {
                                offset: 0,
                                color: "rgba(95,143,220,0.30)",
                            },
                            {
                                offset: 1,
                                color: "rgba(95,143,220,0.02)",
                            },
                        ]
                    ),
                },
            },
        ],
    };
}
export function mrrProtectedOption(
    months: string[],
    values: number[],
    _isPro?: boolean
): EChartsOption {
    const safeMonths = Array.isArray(months) ? months : [];
    const safeValues = Array.isArray(values) ? values : [];

    const minValue = safeValues.length ? Math.min(...safeValues) : 0;
    const maxValue = safeValues.length ? Math.max(...safeValues) : 0;

    const roundedMin = Math.floor(minValue / 100) * 100;
    const roundedMax = Math.ceil(maxValue / 100) * 100;

    /* tighter chart range */

    let yMin = Math.max(0, roundedMin - 60);

    /* reduce empty top space */
    let yMax = roundedMax + 10;

    if (yMax - yMin < 180) {
        yMax = yMin + 180;
    }

    const interval = Math.max(
        50,
        Math.round((yMax - yMin) / 4 / 50) * 50
    );

    return {
        animationDuration: 700,
        animationEasing: "cubicOut",

        grid: {
            top: 0,
            right: 18,
            bottom: 14,
            left: 8,
            containLabel: true,
        },

        tooltip: {
            trigger: "axis",

            axisPointer: {
                type: "line",

                lineStyle: {
                    color: "rgba(95, 143, 220, 0.25)",
                    width: 1,
                },
            },

            backgroundColor: "#ffffff",
            borderColor: "#edf1f5",
            borderWidth: 1,

            textStyle: {
                color: "#111827",
                fontFamily: "inherit",
            },

            padding: 10,

            extraCssText:
                "border-radius:16px; box-shadow:0 10px 30px rgba(15,23,42,0.08);",

            formatter: (params: any) => {
                const point = Array.isArray(params) ? params[0] : params;

                const index = point?.dataIndex ?? 0;
                const month = safeMonths[index] ?? "";
                const value = Number(point?.value ?? 0);

                if (index === 0) {
                    return `
<div style="display:flex;flex-direction:column;gap:6px;">
<div style="font-size:12px;color:#6b7280;font-weight:600;">
${month}
</div>

<div style="font-size:14px;font-weight:700;color:#111827;">
${formatCurrency(value)} protected
</div>

<div style="font-size:12px;color:#6b7280;font-weight:600;">
• No previous month value
</div>
</div>
`;
                }

                const previousMonth = safeMonths[index - 1] ?? "";
                const previous = Number(safeValues[index - 1] ?? value);

                const delta = value - previous;

                const meta = getMrrDeltaMeta(delta);

                return `
<div style="display:flex;flex-direction:column;gap:6px;">
<div style="font-size:12px;color:#6b7280;font-weight:600;">
${month}
</div>

<div style="font-size:14px;font-weight:700;color:#111827;">
${formatCurrency(value)} protected
</div>

<div style="font-size:12px;font-weight:700;color:${meta.color};">
${meta.arrow} ${formatCurrency(Math.abs(delta))} vs ${previousMonth} (${formatCurrency(previous)})
</div>
</div>
`;
            },
        },

        xAxis: {
            type: "category",

            data: safeMonths,

            boundaryGap: false,

            axisTick: {
                show: false,
            },

            axisLine: {
                lineStyle: {
                    color: "#eef2f7",
                },
            },

            axisLabel: {
                color: "#7b8494",
                fontSize: 12,
                margin: 8,
            },
        },

        yAxis: {
            type: "value",

            min: yMin,
            max: yMax,
            interval,

            axisLine: {
                show: false,
            },

            axisTick: {
                show: false,
            },

            axisLabel: {
                color: "#7b8494",
                fontSize: 12,
                margin: 8,

                formatter: (value: number) => {
                    const roundedMax = yMax;

                    if (value >= roundedMax) {
                        return "";
                    }

                    return `£${value}`;
                },
            },

            splitLine: {
                lineStyle: {
                    color: "rgba(148, 163, 184, 0.08)",
                },
            },
        },

        series: [
            {
                type: "line",

                smooth: true,

                data: safeValues,

                showSymbol: false,

                symbol: "circle",

                symbolSize: 8,

                lineStyle: {
                    width: 3,
                    color: "#5f8fdc",
                },

                itemStyle: {
                    color: "#5f8fdc",
                    borderColor: "#ffffff",
                    borderWidth: 3,
                },

                emphasis: {
                    focus: "series",

                    scale: true,

                    itemStyle: {
                        color: "#5f8fdc",
                        borderColor: "#ffffff",
                        borderWidth: 4,
                    },
                },

                areaStyle: {
                    opacity: 1,

                    color: new echarts.graphic.LinearGradient(
                        0,
                        0,
                        0,
                        1,
                        [
                            {
                                offset: 0,
                                color: "rgba(95,143,220,0.26)",
                            },
                            {
                                offset: 1,
                                color: "rgba(95,143,220,0.02)",
                            },
                        ]
                    ),
                },
            },
        ],
    };
}