import type { EChartsOption } from "echarts";
import * as echarts from "echarts";

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

function getDynamicRange(
    values: number[],
    options?: {
        minimumFloor?: number;
        minimumPadding?: number;
        percentagePadding?: number;
    }
) {
    if (!values.length) {
        return {
            min: options?.minimumFloor ?? 0,
            max: (options?.minimumFloor ?? 0) + 1,
        };
    }

    const lowest = Math.min(...values);
    const highest = Math.max(...values);
    const spread = highest - lowest;

    const padding = Math.max(
        options?.minimumPadding ?? 1,
        spread * (options?.percentagePadding ?? 0.22),
        Math.abs(highest) * 0.025
    );

    return {
        min: Math.max(
            options?.minimumFloor ?? 0,
            lowest - padding
        ),
        max: highest + padding,
    };
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

    const range = getDynamicRange(safeValues, {
        minimumFloor: 0,
        minimumPadding: 0.35,
        percentagePadding: 0.28,
    });

    const yMin = Math.max(
        0,
        Math.floor(range.min * 10) / 10
    );

    const yMax = Math.max(
        yMin + 1,
        Math.ceil(range.max * 10) / 10
    );

    return {
        animation: false,
        backgroundColor: "transparent",

        grid: {
            top: 22,
            right: 14,
            bottom: 28,
            left: 8,
            containLabel: true,
        },

        tooltip: {
            trigger: "axis",
            confine: true,

            axisPointer: {
                type: "line",
                lineStyle: {
                    color: "rgba(139,92,246,0.20)",
                    width: 1,
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

            axisLabel: {
                color: "#9ca3af",
                fontSize: 10.5,
                margin: 12,
                fontWeight: 500,
                hideOverlap: true,
                formatter: (value: string) => value || "",
            },
        },

        yAxis: {
            type: "value",
            min: yMin,
            max: yMax,
            splitNumber: 4,

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
                    `${Number(value).toFixed(1)}%`,
            },

            splitLine: {
                lineStyle: {
                    color: "rgba(148,163,184,0.10)",
                    type: "dashed",
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
                symbolSize: isSinglePoint ? 7 : 5,

                lineStyle: {
                    width: 2.6,
                    color: "#8b5cf6",
                    cap: "round",
                    join: "round",
                },

                itemStyle: {
                    color: "#8b5cf6",
                    borderColor: "#ffffff",
                    borderWidth: 2,
                },

                emphasis: {
                    scale: true,
                    itemStyle: {
                        shadowBlur: 12,
                        shadowColor: "rgba(139,92,246,0.24)",
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
                                color: "rgba(139,92,246,0.16)",
                            },
                            {
                                offset: 1,
                                color: "rgba(139,92,246,0.01)",
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
    const safeMonths = Array.isArray(months)
        ? months
        : [];

    const safeValues = sanitizeValues(values);
    const isSinglePoint = safeValues.length === 1;

    const range = getDynamicRange(safeValues, {
        minimumFloor: 0,
        minimumPadding: 120,
        percentagePadding: 0.24,
    });

    const scale =
        Math.max(...safeValues, 0) >= 10000
            ? 1000
            : 100;

    const yMin = Math.max(
        0,
        Math.floor(range.min / scale) * scale
    );

    const yMax = Math.max(
        yMin + scale,
        Math.ceil(range.max / scale) * scale
    );

    return {
        animation: false,
        backgroundColor: "transparent",

        grid: {
            top: 22,
            right: 14,
            bottom: 28,
            left: 4,
            containLabel: true,
        },

        tooltip: {
            trigger: "axis",
            confine: true,

            axisPointer: {
                type: "line",
                lineStyle: {
                    color: "rgba(29,155,240,0.20)",
                    width: 1,
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

            axisLabel: {
                color: "#9ca3af",
                fontSize: 10.5,
                margin: 12,
                fontWeight: 500,
                hideOverlap: true,
                formatter: (value: string) => value || "",
            },
        },

        yAxis: {
            type: "value",
            min: yMin,
            max: yMax,
            splitNumber: 4,

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
                    formatCurrency(value),
            },

            splitLine: {
                lineStyle: {
                    color: "rgba(148,163,184,0.10)",
                    type: "dashed",
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
                symbolSize: isSinglePoint ? 7 : 5,

                lineStyle: {
                    width: 2.6,
                    color: "#1d9bf0",
                    cap: "round",
                    join: "round",
                },

                itemStyle: {
                    color: "#1d9bf0",
                    borderColor: "#ffffff",
                    borderWidth: 2,
                },

                emphasis: {
                    scale: true,
                    itemStyle: {
                        shadowBlur: 12,
                        shadowColor: "rgba(29,155,240,0.24)",
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
                                color: "rgba(29,155,240,0.16)",
                            },
                            {
                                offset: 1,
                                color: "rgba(29,155,240,0.01)",
                            },
                        ]
                    ),
                },
            },
        ],
    };
}
