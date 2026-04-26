export type RiskTrendPoint = {
    date: string;
    riskScore: number;
    churnProb?: number;
    mrrAtRisk?: number;
};

export type RiskTrendResponse = {
    ok: boolean;
    rangeDays: 7 | 30 | 90;
    series: RiskTrendPoint[];

    delta: number;
    direction: "up" | "down" | "flat";
    volatility: number;
};
