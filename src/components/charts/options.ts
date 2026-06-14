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

function getDeltaMeta(
    delta: number,
    lowerIsBetter = false
) {
    if (!Number.isFinite(delta) || delta === 0) {
        return {
            arrow: "•",
            color: "#6b7280",
        };
    }

    const isUp = delta > 0;

    const isGood = lowerIsBetter
        ? delta < 0
        : delta > 0;

    return {
        arrow: isUp ? "↑" : "↓",
        color: isGood
            ? "#16a34a"
            : "#dc2626",
    };
}

function sanitizeValues(
    values: number[]
) {
    if (!Array.isArray(values)) {
        return [];
    }

    return values.map((v) =>
        typeof v === "number" &&
            Number.isFinite(v)
            ? v
            : 0
    );
}
export function churnTrendOption(
    months: string[],
    values: number[],
    _isPro?: boolean
): EChartsOption {
    const safeMonths = Array.isArray(months)
        ? months
        : [];

    const safeValues =
        sanitizeValues(values);

    const maxValue =
        safeValues.length > 0
            ? Math.max(...safeValues)
            : 6;

    const isSinglePoint =
        safeValues.length === 1;

    return {
        animation: false,

        backgroundColor: "transparent",

        grid: {
            top: 18,
            right: 12,
            bottom: 26,
            left: 8,
            containLabel: true,
        },

        tooltip: {
            trigger: "axis",

            axisPointer: {
                type: "line",

                lineStyle: {
                    color: "rgba(239,68,68,0.12)",
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
                "border-radius:14px; box-shadow:0 10px 30px rgba(15,23,42,0.06);",

            formatter: (params: any) => {
                const point =
                    Array.isArray(params)
                        ? params[0]
                        : params;

                const value =
                    Number(point?.value ?? 0);

                return `
<div style="display:flex;flex-direction:column;gap:4px;">
<div style="font-size:12px;color:#6b7280;font-weight:500;">
${point?.axisValue ?? ""}
</div>

<div style="font-size:14px;font-weight:650;color:#111827;">
${formatPercent(value)} churn
</div>
</div>
`;
            },
        },

        xAxis: {
            type: "category",

            data: safeMonths,

            boundaryGap: isSinglePoint,

            axisTick: {
                show: false,
            },

            axisLine: {
                show: false,
            },

            axisLabel: {
                color: "#9ca3af",
                fontSize: 11,
                margin: 12,
                fontWeight: 500,
            },
        },

        yAxis: {
            type: "value",

            min: 0,

            max: Math.max(
                6,
                Math.ceil(maxValue)
            ),

            interval: 1,

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

                formatter: (
                    value: number
                ) => `${value}%`,
            },

            splitLine: {
                lineStyle: {
                    color:
                        "rgba(148,163,184,0.06)",
                    width: 1,
                },
            },
        },

        series: [
            {
                type: "line",

                smooth: false,

                data: safeValues,

                showSymbol: isSinglePoint,

                symbol: isSinglePoint
                    ? "circle"
                    : "none",

                symbolSize: isSinglePoint
                    ? 8
                    : 0,

                lineStyle: {
                    width: 3,
                    color: "#e85d75",
                    cap: "round",
                    join: "round",
                },

                itemStyle: {
                    color: "#e85d75",
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

    const safeValues =
        sanitizeValues(values);

    const maxValue =
        safeValues.length > 0
            ? Math.max(...safeValues)
            : 2500;

    const yMax = Math.max(
        2500,
        Math.ceil(maxValue / 250) *
        250
    );

    const isSinglePoint =
        safeValues.length === 1;

    return {
        animation: false,

        backgroundColor: "transparent",

        grid: {
            top: 24,
            right: 10,
            bottom: 18,
            left: 0,
            containLabel: true,
        },

        tooltip: {
            trigger: "axis",

            axisPointer: {
                type: "line",

                lineStyle: {
                    color:
                        "rgba(29,155,240,0.14)",

                    width: 1,
                },
            },

            backgroundColor:
                "#ffffff",

            borderColor:
                "#edf1f5",

            borderWidth: 1,

            textStyle: {
                color: "#111827",
                fontFamily: "inherit",
            },

            padding: 10,

            extraCssText:
                "border-radius:14px; box-shadow:0 10px 30px rgba(15,23,42,0.06);",

            formatter: (params: any) => {
                const point =
                    Array.isArray(params)
                        ? params[0]
                        : params;

                const value =
                    Number(point?.value ?? 0);

                return `
<div style="display:flex;flex-direction:column;gap:4px;">
<div style="font-size:12px;color:#6b7280;font-weight:500;">
${point?.axisValue ?? ""}
</div>

<div style="font-size:14px;font-weight:650;color:#111827;">
${formatCurrency(value)}
</div>
</div>
`;
            },
        },

        xAxis: {
            type: "category",

            data: safeMonths,

            boundaryGap: isSinglePoint,

            axisTick: {
                show: false,
            },

            axisLine: {
                show: false,
            },

            axisLabel: {
                color: "#9ca3af",
                fontSize: 11,
                margin: 12,
                fontWeight: 500,
            },
        },

        yAxis: {
            type: "value",

            min: 0,

            max: yMax,

            interval:
                Math.ceil(yMax / 5),

            axisLine: {
                show: false,
            },

            axisTick: {
                show: false,
            },

            axisLabel: {
                color: "#9ca3af",
                fontSize: 11,
                margin: 10,

                formatter: (
                    value: number
                ) =>
                    formatCurrency(value),
            },

            splitLine: {
                lineStyle: {
                    color:
                        "rgba(148,163,184,0.06)",
                    width: 1,
                },
            },
        },

        series: [
            {
                type: "line",

                smooth: false,

                data: safeValues,

                showSymbol: isSinglePoint,

                symbol: isSinglePoint
                    ? "circle"
                    : "none",

                symbolSize: isSinglePoint
                    ? 8
                    : 0,

                lineStyle: {
                    width: 3,
                    color: "#1d9bf0",
                    cap: "round",
                    join: "round",
                },

                itemStyle: {
                    color: "#1d9bf0",
                },

              
            },
        ],
    };
}
