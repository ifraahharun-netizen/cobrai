/**
 * Realistic, deterministic demo analytics used by the analytics dashboard.
 *
 * Nothing in this file calls an API and the values do not change between
 * renders. The dashboard page can continue importing `buildDemoSeries`
 * exactly as it already does.
 */

export type DemoMrrPoint = {
    month: string;
    valueMinor: number;
};

export type DemoChurnPoint = {
    month: string;
    valuePct: number;
};

export type DemoMauPoint = {
    month: string;
    activeUsers: number;
};

export type DemoActivityPoint = {
    month: string;
    churned: number;
    retained: number;
    trials: number;
    totalSubscribers: number;
    newSubscribers: number;
    upgrades: number;
};

export type DemoAnalyticsSeries = {
    mrr: DemoMrrPoint[];
    churn: DemoChurnPoint[];
    mau: DemoMauPoint[];
    activityByMonth: DemoActivityPoint[];
};

/**
 * Twelve-month B2B SaaS demo history ending in June 2026.
 *
 * The values intentionally include slower months, small contractions,
 * recoveries and uneven growth so the charts feel like operating data rather
 * than a perfectly generated trend.
 */
const DEMO_ANALYTICS: DemoAnalyticsSeries = {
    mrr: [
        { month: "2025-07", valueMinor: 146800 },
        { month: "2025-08", valueMinor: 151200 },
        { month: "2025-09", valueMinor: 149500 },
        { month: "2025-10", valueMinor: 157900 },
        { month: "2025-11", valueMinor: 163400 },
        { month: "2025-12", valueMinor: 171800 },
        { month: "2026-01", valueMinor: 168900 },
        { month: "2026-02", valueMinor: 179600 },
        { month: "2026-03", valueMinor: 187300 },
        { month: "2026-04", valueMinor: 183700 },
        { month: "2026-05", valueMinor: 207600 },
        { month: "2026-06", valueMinor: 223000 },
    ],

    churn: [
        { month: "2025-07", valuePct: 4.2 },
        { month: "2025-08", valuePct: 3.9 },
        { month: "2025-09", valuePct: 4.4 },
        { month: "2025-10", valuePct: 3.7 },
        { month: "2025-11", valuePct: 3.5 },
        { month: "2025-12", valuePct: 3.8 },
        { month: "2026-01", valuePct: 4.1 },
        { month: "2026-02", valuePct: 3.4 },
        { month: "2026-03", valuePct: 3.2 },
        { month: "2026-04", valuePct: 3.6 },
        { month: "2026-05", valuePct: 2.9 },
        { month: "2026-06", valuePct: 2.6 },
    ],

    mau: [
        { month: "2025-07", activeUsers: 147 },
        { month: "2025-08", activeUsers: 152 },
        { month: "2025-09", activeUsers: 149 },
        { month: "2025-10", activeUsers: 158 },
        { month: "2025-11", activeUsers: 166 },
        { month: "2025-12", activeUsers: 174 },
        { month: "2026-01", activeUsers: 170 },
        { month: "2026-02", activeUsers: 181 },
        { month: "2026-03", activeUsers: 191 },
        { month: "2026-04", activeUsers: 186 },
        { month: "2026-05", activeUsers: 211 },
        { month: "2026-06", activeUsers: 229 },
    ],

    activityByMonth: [
        {
            month: "2025-07",
            churned: 6,
            retained: 136,
            trials: 18,
            totalSubscribers: 147,
            newSubscribers: 11,
            upgrades: 4,
        },
        {
            month: "2025-08",
            churned: 6,
            retained: 141,
            trials: 20,
            totalSubscribers: 152,
            newSubscribers: 11,
            upgrades: 5,
        },
        {
            month: "2025-09",
            churned: 7,
            retained: 137,
            trials: 16,
            totalSubscribers: 149,
            newSubscribers: 4,
            upgrades: 3,
        },
        {
            month: "2025-10",
            churned: 6,
            retained: 147,
            trials: 22,
            totalSubscribers: 158,
            newSubscribers: 15,
            upgrades: 6,
        },
        {
            month: "2025-11",
            churned: 6,
            retained: 154,
            trials: 24,
            totalSubscribers: 166,
            newSubscribers: 14,
            upgrades: 7,
        },
        {
            month: "2025-12",
            churned: 7,
            retained: 162,
            trials: 26,
            totalSubscribers: 174,
            newSubscribers: 15,
            upgrades: 7,
        },
        {
            month: "2026-01",
            churned: 7,
            retained: 157,
            trials: 19,
            totalSubscribers: 170,
            newSubscribers: 3,
            upgrades: 4,
        },
        {
            month: "2026-02",
            churned: 6,
            retained: 168,
            trials: 27,
            totalSubscribers: 181,
            newSubscribers: 17,
            upgrades: 8,
        },
        {
            month: "2026-03",
            churned: 6,
            retained: 178,
            trials: 29,
            totalSubscribers: 191,
            newSubscribers: 16,
            upgrades: 9,
        },
        {
            month: "2026-04",
            churned: 7,
            retained: 172,
            trials: 21,
            totalSubscribers: 186,
            newSubscribers: 2,
            upgrades: 5,
        },
        {
            month: "2026-05",
            churned: 6,
            retained: 197,
            trials: 33,
            totalSubscribers: 211,
            newSubscribers: 31,
            upgrades: 12,
        },
        {
            month: "2026-06",
            churned: 6,
            retained: 214,
            trials: 35,
            totalSubscribers: 229,
            newSubscribers: 24,
            upgrades: 14,
        },
    ],
};

function cloneDemoAnalytics(): DemoAnalyticsSeries {
    return {
        mrr: DEMO_ANALYTICS.mrr.map((point) => ({ ...point })),
        churn: DEMO_ANALYTICS.churn.map((point) => ({ ...point })),
        mau: DEMO_ANALYTICS.mau.map((point) => ({ ...point })),
        activityByMonth: DEMO_ANALYTICS.activityByMonth.map((point) => ({
            ...point,
        })),
    };
}

/**
 * Keep this export name unchanged because the current analytics page already
 * imports and uses it.
 */
export function buildDemoSeries(): DemoAnalyticsSeries {
    return cloneDemoAnalytics();
}
