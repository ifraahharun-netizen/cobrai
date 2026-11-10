import type { EChartsOption } from "echarts";

const FALLBACK_LOCALE = "en-GB";

const REGION_CURRENCY: Record<string, string> = {
    GB: "GBP",
    US: "USD",
    CA: "CAD",
    AU: "AUD",
    NZ: "NZD",
    IE: "EUR",
    FR: "EUR",
    DE: "EUR",
    ES: "EUR",
    IT: "EUR",
    NL: "EUR",
    BE: "EUR",
    PT: "EUR",
    AT: "EUR",
    FI: "EUR",
    GR: "EUR",
    LU: "EUR",
    CY: "EUR",
    MT: "EUR",
    SK: "EUR",
    SI: "EUR",
    EE: "EUR",
    LV: "EUR",
    LT: "EUR",
    IN: "INR",
    AE: "AED",
    SA: "SAR",
    QA: "QAR",
    KW: "KWD",
    NG: "NGN",
    ZA: "ZAR",
    KE: "KES",
    JP: "JPY",
    CN: "CNY",
    SG: "SGD",
};

function getUserLocale() {
    if (typeof navigator !== "undefined" && navigator.language) {
        return navigator.language;
    }

    return FALLBACK_LOCALE;
}

function getCurrencyFromLocale(locale: string) {
    try {
        const region = new Intl.Locale(locale).region;

        if (region && REGION_CURRENCY[region]) {
            return REGION_CURRENCY[region];
        }
    } catch {
        return REGION_CURRENCY.GB;
    }

    return REGION_CURRENCY.GB;
}

const userLocale = getUserLocale();
const userCurrency = getCurrencyFromLocale(userLocale);

function formatCurrency(value: number) {
    return new Intl.NumberFormat(userLocale, {
        style: "currency",
        currency: userCurrency,
        maximumFractionDigits: 0,
    }).format(Number(value || 0));
}

function formatPercent(value: number) {
    return `${Number(value).toFixed(1)}%`;
}

function sanitizeValues(values: number[]) {
    if (!Array.isArray(values)) {
        return [];
    }

    return values.map((value) =>
        typeof value === "number" && Number.isFinite(value)
            ? value
            : 0
    );
}

function niceStep(rough: number) {
    if (!Number.isFinite(rough) || rough <= 0) return 1;
    const power = Math.pow(10, Math.floor(Math.log10(rough)));
    const fraction = rough / power;
    const nice =
        fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
    return nice * power;
}

/**
 * Evenly spaced y-axis: min, max and interval all land on round numbers,
 * so tick labels never bunch up or overlap.
 */
function niceAxis(
    values: number[],
    options: { floor?: number; minimumSpan?: number; ticks?: number } = {}
) {
    const ticks = options.ticks ?? 4;
    const floor = options.floor ?? 0;

    if (!values.length) {
        return { min: floor, max: floor + ticks, interval: 1 };
    }

    const lowest = Math.min(...values);
    const highest = Math.max(...values);
    const span = Math.max(highest - lowest, options.minimumSpan ?? 1);
    const interval = niceStep((span * 1.3) / ticks);

    const min = Math.max(
        floor,
        Math.floor((lowest - span * 0.12) / interval) * interval
    );
    let max = Math.ceil((highest + span * 0.12) / interval) * interval;

    if (max <= min) max = min + interval;

    return { min, max, interval };
}

function formatCompactCurrency(value: number) {
    if (Math.abs(value) < 10000) return formatCurrency(value);

    return new Intl.NumberFormat(userLocale, {
        style: "currency",
        currency: userCurrency,
        notation: "compact",
        maximumFractionDigits: 1,
    }).format(value);
}

function getPreviousValue(
    values: number[],
    index: number
) {
    if (index <= 0 || index >= values.length) {
        return null;
    }

    return values[index - 1];
}


function findNearestPeriodLabel(
    labels: string[],
    index: number
) {
    for (let currentIndex = index; currentIndex >= 0; currentIndex -= 1) {
        const value = labels[currentIndex]?.trim();

        if (value) {
            return value;
        }
    }

    return labels[index]?.trim() || "";
}

function formatTooltipPeriodLabel(
    labels: string[],
    index: number
) {
    const rawLabel = findNearestPeriodLabel(labels, index);

    if (!rawLabel) {
        return "Selected date";
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(rawLabel)) {
        const date = new Date(`${rawLabel}T00:00:00`);

        if (!Number.isNaN(date.getTime())) {
            return new Intl.DateTimeFormat(userLocale, {
                day: "numeric",
                month: "short",
                year: "numeric",
            }).format(date);
        }
    }

    if (/^\d{4}-\d{2}$/.test(rawLabel)) {
        const date = new Date(`${rawLabel}-01T00:00:00`);

        if (!Number.isNaN(date.getTime())) {
            return new Intl.DateTimeFormat(userLocale, {
                month: "long",
                year: "numeric",
            }).format(date);
        }
    }

    return rawLabel;
}

function getComparisonLabel(
    labels: string[],
    index: number
) {
    const currentRaw = findNearestPeriodLabel(labels, index);

    if (/^\d{4}-\d{2}-\d{2}$/.test(currentRaw)) {
        return "Yesterday";
    }

    const currentLabelAtIndex = labels[index]?.trim();

    if (/^\d{4}-\d{2}$/.test(currentLabelAtIndex)) {
        return "Previous month";
    }

    if (/^\d{4}-\d{2}$/.test(currentRaw)) {
        return "Previous reading";
    }

    return "Previous value";
}

function getDeltaPresentation(
    current: number,
    previous: number | null,
    lowerIsBetter: boolean
) {
    if (
        previous === null ||
        !Number.isFinite(previous) ||
        !Number.isFinite(current)
    ) {
        return null;
    }

    const delta = current - previous;

    if (delta === 0) {
        return {
            arrow: "→",
            color: "#64748b",
            text: "No change vs previous period",
        };
    }

    const improved = lowerIsBetter
        ? delta < 0
        : delta > 0;

    const percentage =
        previous !== 0
            ? Math.abs((delta / previous) * 100)
            : null;

    return {
        arrow: delta > 0 ? "↑" : "↓",
        color: improved ? "#16a34a" : "#dc2626",
        text:
            percentage !== null && Number.isFinite(percentage)
                ? `${Math.abs(percentage).toFixed(1)}%`
                : "Changed",
    };
}

export function churnTrendOption(
    months: string[],
    values: number[],
    _isPro?: boolean
): EChartsOption {
    const safeMonths = Array.isArray(months)
        ? months
        : [];

    const safeValues = sanitizeValues(values);
    const isSinglePoint = safeValues.length === 1;

    const axis = niceAxis(safeValues, {
        floor: 0,
        minimumSpan: 1,
    });

    return {
        animation: false,
        backgroundColor: "transparent",

        grid: {
            top: 12,
            right: 0,
            bottom: 4,
            left: 0,
            containLabel: true,
        },

        tooltip: {
            trigger: "axis",
            confine: true,

            axisPointer: {
                type: "line",
                lineStyle: {
                    color: "rgba(139,92,246,0.45)",
                    width: 1,
                    type: "dashed",
                },
            },

            backgroundColor: "rgba(255,255,255,0.98)",
            borderColor: "#e8edf4",
            borderWidth: 1,
            padding: 0,

            textStyle: {
                color: "#111827",
                fontFamily: "inherit",
            },

            extraCssText:
                "border-radius:16px; overflow:hidden; box-shadow:0 18px 45px rgba(15,23,42,0.12);",

            formatter: (params: any) => {
                const point =
                    Array.isArray(params)
                        ? params[0]
                        : params;

                const index = Number(point?.dataIndex ?? 0);
                const value = Number(point?.value ?? 0);
                const previous = getPreviousValue(safeValues, index);

                const delta = getDeltaPresentation(
                    value,
                    previous,
                    true
                );

                return `
<div style="min-width:190px;">
    <div style="padding:11px 13px 9px;border-bottom:1px solid #f0f3f7;">
        <div style="font-size:11px;color:#8b95a5;font-weight:500;">
            ${formatTooltipPeriodLabel(safeMonths, index)}
        </div>
        <div style="margin-top:4px;font-size:18px;line-height:1;color:#111827;font-weight:650;letter-spacing:-0.03em;">
            ${formatPercent(value)}
            <span style="font-size:11px;color:#8b95a5;font-weight:500;letter-spacing:0;"> churn</span>
        </div>
    </div>

    <div style="padding:10px 13px 11px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:22px;">
            <span style="color:#667085;font-size:11.5px;">${getComparisonLabel(safeMonths, index)}</span>
            <strong style="color:#111827;font-size:12px;font-weight:650;">
                ${previous === null ? "—" : formatPercent(previous)}
            </strong>
        </div>

        ${delta
                        ? `
        <div style="height:1px;background:#f0f3f7;margin:10px 0 8px;"></div>
        <div style="font-size:10.5px;color:${delta.color};font-weight:650;">
            ${delta.arrow} ${delta.text} vs ${getComparisonLabel(safeMonths, index).toLowerCase()}
        </div>
        `
                        : ""
                    }
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
                show: false,
            },

            // Dates are deliberately hidden; the tooltip still shows the period.
            axisLabel: {
                show: false,
            },
        },

        yAxis: {
            type: "value",
            position: "left",
            min: axis.min,
            max: axis.max,
            interval: axis.interval,

            axisLine: {
                show: false,
            },

            axisTick: {
                show: false,
            },

            axisLabel: {
                color: "#9ca3af",
                fontSize: 10,
                margin: 10,
                formatter: (value: number) =>
                    `${Number.isInteger(value) ? value : Number(value).toFixed(1)}%`,
            },

            splitLine: {
                lineStyle: {
                    color: "#eef1f5",
                    type: "solid",
                    width: 1,
                },
            },
        },

        series: [
            {
                name: "Churn",
                type: "line",
                smooth: false,
                data: safeValues,

                showSymbol: isSinglePoint,
                symbol: "circle",
                symbolSize: isSinglePoint ? 7 : 9,

                lineStyle: {
                    width: 1.8,
                    color: "#8b5cf6",
                    cap: "round",
                    join: "round",
                },

                itemStyle: {
                    color: "#8b5cf6",
                    borderColor: "#ffffff",
                    borderWidth: 2.5,
                },

                emphasis: {
                    scale: true,
                    itemStyle: {
                        shadowBlur: 12,
                        shadowColor: "rgba(139,92,246,0.24)",
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
    const safeMonths = Array.isArray(months)
        ? months
        : [];

    const safeValues = sanitizeValues(values);
    const isSinglePoint = safeValues.length === 1;

    const axis = niceAxis(safeValues, {
        floor: 0,
        minimumSpan: 100,
    });

    return {
        animation: false,
        backgroundColor: "transparent",

        grid: {
            top: 12,
            right: 0,
            bottom: 4,
            left: 0,
            containLabel: true,
        },

        tooltip: {
            trigger: "axis",
            confine: true,

            axisPointer: {
                type: "line",
                lineStyle: {
                    color: "rgba(59,111,224,0.45)",
                    width: 1,
                    type: "dashed",
                },
            },

            backgroundColor: "rgba(255,255,255,0.98)",
            borderColor: "#e8edf4",
            borderWidth: 1,
            padding: 0,

            textStyle: {
                color: "#111827",
                fontFamily: "inherit",
            },

            extraCssText:
                "border-radius:16px; overflow:hidden; box-shadow:0 18px 45px rgba(15,23,42,0.12);",

            formatter: (params: any) => {
                const point =
                    Array.isArray(params)
                        ? params[0]
                        : params;

                const index = Number(point?.dataIndex ?? 0);
                const value = Number(point?.value ?? 0);
                const previous = getPreviousValue(safeValues, index);

                const delta = getDeltaPresentation(
                    value,
                    previous,
                    false
                );

                return `
<div style="min-width:205px;">
    <div style="padding:11px 13px 9px;border-bottom:1px solid #f0f3f7;">
        <div style="font-size:11px;color:#8b95a5;font-weight:500;">
            ${formatTooltipPeriodLabel(safeMonths, index)}
        </div>
        <div style="margin-top:4px;font-size:18px;line-height:1;color:#111827;font-weight:650;letter-spacing:-0.03em;">
            ${formatCurrency(value)}
            <span style="font-size:11px;color:#8b95a5;font-weight:500;letter-spacing:0;"> protected</span>
        </div>
    </div>

    <div style="padding:10px 13px 11px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:22px;">
            <span style="color:#667085;font-size:11.5px;">${getComparisonLabel(safeMonths, index)}</span>
            <strong style="color:#111827;font-size:12px;font-weight:650;">
                ${previous === null ? "—" : formatCurrency(previous)}
            </strong>
        </div>

        ${delta
                        ? `
        <div style="height:1px;background:#f0f3f7;margin:10px 0 8px;"></div>
        <div style="font-size:10.5px;color:${delta.color};font-weight:650;">
            ${delta.arrow} ${delta.text} vs ${getComparisonLabel(safeMonths, index).toLowerCase()}
        </div>
        `
                        : ""
                    }
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
                show: false,
            },

            // Dates are deliberately hidden; the tooltip still shows the period.
            axisLabel: {
                show: false,
            },
        },

        yAxis: {
            type: "value",
            position: "left",
            min: axis.min,
            max: axis.max,
            interval: axis.interval,

            axisLine: {
                show: false,
            },

            axisTick: {
                show: false,
            },

            axisLabel: {
                color: "#9ca3af",
                fontSize: 10,
                margin: 10,
                formatter: (value: number) =>
                    formatCompactCurrency(value),
            },

            splitLine: {
                lineStyle: {
                    color: "#eef1f5",
                    type: "solid",
                    width: 1,
                },
            },
        },

        series: [
            {
                name: "MRR protected",
                type: "line",
                smooth: false,
                data: safeValues,

                showSymbol: isSinglePoint,
                symbol: "circle",
                symbolSize: isSinglePoint ? 7 : 9,

                lineStyle: {
                    width: 1.8,
                    color: "#3b6fe0",
                    cap: "round",
                    join: "round",
                },

                itemStyle: {
                    color: "#3b6fe0",
                    borderColor: "#ffffff",
                    borderWidth: 2.5,
                },

                emphasis: {
                    scale: true,
                    itemStyle: {
                        shadowBlur: 12,
                        shadowColor: "rgba(59,111,224,0.24)",
                    },
                },

            },
        ],
    };
}

/* -------------------------------------------------------------------------- */
/* Widget-style line charts (Active users, Acquired & retained)               */
/* Sharp lines, day labels, dashed horizontal grid, dark hover bubble.        */
/* -------------------------------------------------------------------------- */

function compactNumber(value: number) {
    return new Intl.NumberFormat(userLocale, {
        notation: "compact",
        maximumFractionDigits: 1,
    }).format(value);
}

function widgetAxes(
    labels: string[],
    max: number,
    range?: { min: number; max: number; interval: number }
): Pick<EChartsOption, "grid" | "xAxis" | "yAxis"> {
    const step = niceStep((Math.max(max, 1) * 1.1) / 4);
    const yRange = range ?? {
        min: 0,
        max: Math.ceil((Math.max(max, 1) * 1.1) / step) * step,
        interval: step,
    };

    return {
        // Same frame as the Revenue / Churn charts: scale on the right, no dates.
        grid: { top: 12, right: 0, bottom: 4, left: 0, containLabel: true },
        xAxis: {
            type: "category",
            data: labels,
            boundaryGap: false,
            axisTick: { show: false },
            axisLine: { show: false },
            axisLabel: { show: false },
            splitLine: { show: false },
        },
        yAxis: {
            type: "value",
            position: "left",
            min: yRange.min,
            max: yRange.max,
            interval: yRange.interval,
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: {
                color: "#9ca3af",
                fontSize: 10,
                margin: 10,
                formatter: (value: number) => compactNumber(value),
            },
            splitLine: { lineStyle: { color: "#eef1f5", type: "solid", width: 1 } },
        },
    };
}

const DARK_TOOLTIP = {
    backgroundColor: "#101828",
    borderWidth: 0,
    padding: [6, 10] as [number, number],
    textStyle: { color: "#ffffff", fontSize: 12 },
    extraCssText: "border-radius:8px; box-shadow:0 8px 20px rgba(16,24,40,0.18);",
};

/** Active users per day: one blue line with a soft fill. */
export function activeUsersLineOption(
    labels: string[],
    tooltipLabels: string[],
    values: number[]
): EChartsOption {
    const safeValues = sanitizeValues(values);

    return {
        animation: false,
        backgroundColor: "transparent",
        // Fit the scale to the data so day-to-day movement is visible.
        ...widgetAxes(
            labels,
            Math.max(...safeValues, 0),
            niceAxis(safeValues, { floor: 0, minimumSpan: 10 })
        ),
        tooltip: {
            trigger: "axis",
            confine: true,
            ...DARK_TOOLTIP,
            axisPointer: {
                type: "shadow",
                shadowStyle: { color: "rgba(14,165,233,0.06)" },
            },
            formatter: (params: unknown) => {
                const item = (Array.isArray(params) ? params[0] : params) as {
                    dataIndex?: number;
                    value?: number;
                };
                const index = Number(item?.dataIndex ?? 0);
                return `<span style="opacity:.7">${tooltipLabels[index] ?? ""}</span><br/><b>${Number(
                    item?.value ?? 0
                ).toLocaleString(userLocale)}</b> active users`;
            },
        },
        series: [
            {
                name: "Active users",
                type: "line",
                data: safeValues,
                smooth: false,
                showSymbol: false,
                symbol: "circle",
                symbolSize: 8,
                lineStyle: { width: 1.8, color: "#0ea5e9", join: "round" },
                itemStyle: { color: "#0ea5e9", borderColor: "#ffffff", borderWidth: 2 },
            },
        ],
    };
}
