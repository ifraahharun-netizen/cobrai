export type DemoSeriesPoint = {
    month: string;
    valueMinor?: number;
    valuePct?: number;
    activeUsers?: number;
};

export type ActivityByMonthPoint = {
    month: string;
    retained: number;
    churned: number;
    newSubscribers: number;
    trials: number;
    totalSubscribers: number;
    upgrades?: number;
};

export type ExpansionRow = {
    id: string;
    name: string;
    email: string | null;
    upsideMinor: number;
    action: string;
    reason?: string;
    confidence?: "High" | "Medium" | "Low";
    lastEventAt?: string | null;
};

export type InsightItem = {
    title: string;
    body: string;
    severity?: "low" | "medium" | "high";
};

export type DemoAnalyticsResponse = {
    ok: boolean;
    mode: "demo";
    mrr: DemoSeriesPoint[];
    churn: DemoSeriesPoint[];
    mau: DemoSeriesPoint[];
    activityByMonth: ActivityByMonthPoint[];
    expansionRows: ExpansionRow[];
    insights: InsightItem[];
};

export function buildDemoSeries(): DemoAnalyticsResponse {
    const months = [
        "2025-06",
        "2025-07",
        "2025-08",
        "2025-09",
        "2025-10",
        "2025-11",
        "2025-12",
        "2026-01",
        "2026-02",
        "2026-03",
        "2026-04",
        "2026-05",
    ];

    const retained = [30, 34, 37, 39, 41, 40, 42, 40, 42, 44, 49, 51];
    const churned = [6, 7, 6, 8, 7, 9, 8, 4, 3, 5, 7, 8];
    const newSubscribers = [15, 18, 19, 21, 24, 20, 21, 20, 21, 19, 20, 34];
    const trials = [8, 9, 10, 11, 12, 13, 13, 11, 9, 7, 10, 17];
    const totalSubscribers = [138, 164, 182, 201, 224, 246, 238, 212, 229, 251, 278, 312];

    return {
        ok: true,
        mode: "demo",

        mrr: [
            820,
            910,
            1040,
            1180,
            1320,
            1490,
            1380,
            1570,
            1210,
            1360,
            1290,
            2230,
        ].map((v, i) => ({
            month: months[i],
            valueMinor: v * 100,
        })),

        churn: [
            2.1,
            2.4,
            1.8,
            2.7,
            3.6,
            2.9,
            4.4,
            5.2,
            3.7,
            4.1,
            3.4,
            2.6,
        ].map((v, i) => ({
            month: months[i],
            valuePct: v,
        })),

        mau: [
            120,
            138,
            164,
            182,
            201,
            224,
            246,
            238,
            212,
            229,
            251,
            278,
        ].map((v, i) => ({
            month: months[i],
            activeUsers: v,
        })),

        activityByMonth: months.map((month, i) => ({
            month,
            retained: retained[i],
            churned: churned[i],
            newSubscribers: newSubscribers[i],
            trials: trials[i],
            totalSubscribers: totalSubscribers[i],
        })),

        expansionRows: [
            {
                id: "cus_1",
                name: "Nova Studio",
                email: "team@novastudio.io",
                upsideMinor: 240000,
                action: "Sent re-engagement sequence",
                reason: "Usage dropped 34% over the last 14 days",
                confidence: "High",
                lastEventAt: "2026-05-10",
            },
            {
                id: "cus_2",
                name: "GrowthLoop",
                email: "ops@growthloop.ai",
                upsideMinor: 180000,
                action: "Retried failed billing payment",
                reason: "Card retry succeeded after failed renewal",
                confidence: "Medium",
                lastEventAt: "2026-05-14",
            },
            {
                id: "cus_3",
                name: "Elevate CRM",
                email: "success@elevatecrm.com",
                upsideMinor: 320000,
                action: "Triggered retention workflow",
                reason: "High churn probability detected from inactivity",
                confidence: "High",
                lastEventAt: "2026-05-18",
            },
        ],

        insights: [
            {
                title: "Revenue growth accelerating",
                body: "MRR increased 18% compared to the previous period driven by stronger subscriber retention.",
                severity: "low",
            },
            {
                title: "Churn spike detected in February",
                body: "Customer cancellations rose sharply after reduced platform engagement across enterprise accounts.",
                severity: "high",
            },
            {
                title: "Subscriber acquisition improving",
                body: "New subscriber growth continues trending upward with trial conversions improving month over month.",
                severity: "medium",
            },
        ],
    };
}