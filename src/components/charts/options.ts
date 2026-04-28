import type { EChartsOption } from "echarts";

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
            text: "in line with previous month",
            description: lowerIsBetter
                ? "retention trend is holding steady"
                : "performance is holding steady",
            color: "#6b7280",
        };
    }

    const isUp = delta > 0;
    const isGood = lowerIsBetter ? delta < 0 : delta > 0;

    if (lowerIsBetter) {
        return {
            arrow: isUp ? "↑" : "↓",
            text: isUp ? "above previous month" : "below previous month",
            description: isUp
                ? "churn pressure increased month over month"
                : "retention trend improved month over month",
            color: isGood ? "#16a34a" : "#dc2626",
        };
    }

    return {
        arrow: isUp ? "↑" : "↓",
        text: isUp ? "above previous month" : "below previous month",
        description: isUp
            ? "performance improved month over month"
            : "performance softened month over month",
        color: isGood ? "#16a34a" : "#dc2626",
    };
}

function getMrrDeltaMeta(delta: number) {
    if (delta === 0) {
        return {
            arrow: "•",
            text: "in line with previous month",
            description: "revenue protection is holding steady",
            color: "#6b7280",
        };
    }

    return {
        arrow: delta > 0 ? "↑" : "↓",
        text: delta > 0 ? "above previous month" : "below previous month",
        description:
            delta > 0
                ? "revenue protection improved month over month"
                : "revenue protection softened month over month",
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
        animationDuration: 500,
        grid: {
            top: 20,
            right: 16,
            bottom: 28,
            left: 44,
            containLabel: true,
        },
        tooltip: {
            trigger: "axis",
            axisPointer: {
                type: "none",
                shadowStyle: {
                    color: "rgba(15, 23, 42, 0.06)",
                },
            },
            backgroundColor: "#ffffff",
            borderColor: "#e5e7eb",
            borderWidth: 1,
            textStyle: {
                color: "#111827",
                fontFamily: "inherit",
            },
            padding: 8,
            extraCssText:
                "border-radius: 8px; box-shadow: 0 6px 15px rgba(0,0,0,0.08);",
            formatter: (params: any) => {
                const point = Array.isArray(params) ? params[0] : params;
                const index = point?.dataIndex ?? 0;
                const month = safeMonths[index] ?? "";
                const value = Number(point?.value ?? 0);

                if (index === 0) {
                    return `
          <div style="min-width: 0; display: flex; flex-direction: column; gap: 4px;">
            <div style="font-size: 12px; font-weight: 600; color: #6b7280;">
              ${month}
            </div>

            <div style="font-size: 13px; font-weight: 700; color: #111827;">
              ${formatPercent(value)} churn
            </div>

            <div style="font-size: 12px; font-weight: 600; color: #6b7280;">
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
          <div style="min-width: 0; display: flex; flex-direction: column; gap: 4px;">
            <div style="font-size: 12px; font-weight: 600; color: #6b7280;">
              ${month}
            </div>

            <div style="font-size: 13px; font-weight: 700; color: #111827;">
              ${formatPercent(value)} churn
            </div>

            <div style="font-size: 12px; font-weight: 600; color: ${meta.color};">
              ${meta.arrow} ${formatPercent(Math.abs(delta))} vs ${previousMonth} (${formatPercent(previous)})
            </div>
          </div>
        `;
            },
        },
        xAxis: {
            type: "category",
            data: safeMonths,
            boundaryGap: true,
            axisTick: {
                show: false,
            },
            axisLine: {
                lineStyle: {
                    color: "#e5e7eb",
                },
            },
            axisLabel: {
                color: "#6b7280",
                fontSize: 12,
                margin: 12,
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
                color: "#6b7280",
                fontSize: 12,
                formatter: (value: number) => `${value}%`,
                margin: 10,
            },
            splitLine: {
                lineStyle: {
                    color: "#f1f5f9",
                },
            },
        },
        series: [
            {
                type: "bar",
                data: safeValues,
                barWidth: 28,
                itemStyle: {
                    borderRadius: [10, 10, 0, 0],
                    color: "#5f8fdcff",
                },
                emphasis: {
                    itemStyle: {
                        color: "#5f8fdcff",
                    },
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

    let yMin = Math.max(0, roundedMin - 100);
    let yMax = roundedMax + 100;

    if (yMax - yMin < 300) {
        yMax = yMin + 300;
    }

    const interval = Math.max(100, Math.round((yMax - yMin) / 4 / 100) * 100);

    return {
        animationDuration: 500,
        grid: {
            top: 20,
            right: 16,
            bottom: 28,
            left: 52,
            containLabel: true,
        },
        tooltip: {
            trigger: "axis",
            axisPointer: {
                type: "none",
                shadowStyle: {
                    color: "rgba(15, 23, 42, 0.06)",
                },
            },
            backgroundColor: "#ffffff",
            borderColor: "#e5e7eb",
            borderWidth: 1,
            textStyle: {
                color: "#111827",
                fontFamily: "inherit",
            },
            padding: 8,
            extraCssText:
                "border-radius: 8px; box-shadow: 0 6px 15px rgba(0,0,0,0.08);",
            formatter: (params: any) => {
                const point = Array.isArray(params) ? params[0] : params;
                const index = point?.dataIndex ?? 0;
                const month = safeMonths[index] ?? "";
                const value = Number(point?.value ?? 0);

                if (index === 0) {
                    return `
          <div style="min-width: 0; display: flex; flex-direction: column; gap: 4px;">
            <div style="font-size: 12px; font-weight: 600; color: #6b7280;">
              ${month}
            </div>

            <div style="font-size: 13px; font-weight: 700; color: #111827;">
              ${formatCurrency(value)} protected
            </div>

            <div style="font-size: 12px; font-weight: 600; color: #6b7280;">
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
          <div style="min-width: 0; display: flex; flex-direction: column; gap: 4px;">
            <div style="font-size: 12px; font-weight: 600; color: #6b7280;">
              ${month}
            </div>

            <div style="font-size: 13px; font-weight: 700; color: #111827;">
              ${formatCurrency(value)} protected
            </div>

            <div style="font-size: 12px; font-weight: 600; color: ${meta.color};">
              ${meta.arrow} ${formatCurrency(Math.abs(delta))} vs ${previousMonth} (${formatCurrency(previous)})
            </div>
          </div>
        `;
            },
        },
        xAxis: {
            type: "category",
            data: safeMonths,
            boundaryGap: true,
            axisTick: {
                show: false,
            },
            axisLine: {
                lineStyle: {
                    color: "#e5e7eb",
                },
            },
            axisLabel: {
                color: "#6b7280",
                fontSize: 12,
                margin: 12,
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
                color: "#6b7280",
                fontSize: 12,
                formatter: (value: number) => `£${value}`,
                margin: 10,
            },
            splitLine: {
                lineStyle: {
                    color: "#f1f5f9",
                },
            },
        },
        series: [
            {
                type: "bar",
                data: safeValues,
                barWidth: 28,
                itemStyle: {
                    borderRadius: [10, 10, 0, 0],
                    color: "#5f8fdcff",
                },
                emphasis: {
                    itemStyle: {
                        color: "#5f8fdcff",
                    },
                },
            },
        ],
    };
}