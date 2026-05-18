export type RiskLevel =
    | "low"
    | "medium"
    | "high"
    | "critical";

export type RiskTrend =
    | "up"
    | "down"
    | "flat";

export type RiskSignal = {
    key: string;
    label: string;
    impact: number;
};

export type ComputeRiskScoreArgs = {
    churnRisk?: number | null;

    healthScore?: number | null;

    previousRiskScore?: number | null;

    mrr?: number | null;

    invoices?: {
        status: string;
        dueAt?: Date | null;
        paidAt?: Date | null;
    }[];

    lastActiveAt?: Date | null;

    supportTicketsOpen?: number | null;

    failedPayments?: number | null;

    usageDropPct?: number | null;

    seatDropPct?: number | null;

    recentSuccessActions?: number | null;
};

export type ComputeRiskScoreResult = {
    riskScore: number;

    riskLevel: RiskLevel;

    confidence: number;

    trend: RiskTrend;

    velocity: number;

    signals: RiskSignal[];

    nextActions: string[];

    summary: string;
};

function clamp(
    value: number,
    min: number,
    max: number
) {
    return Math.min(
        max,
        Math.max(min, value)
    );
}

function normalizeRisk(
    value: number | null | undefined
) {
    const n = Number(value || 0);

    if (!Number.isFinite(n)) {
        return 0;
    }

    if (n <= 1) {
        return clamp(
            Math.round(n * 100),
            0,
            100
        );
    }

    return clamp(
        Math.round(n),
        0,
        100
    );
}

function daysInactive(
    lastActiveAt?: Date | null
) {
    if (!lastActiveAt) {
        return null;
    }

    return Math.floor(
        (Date.now() -
            lastActiveAt.getTime()) /
        86400000
    );
}

function getRiskLevel(
    score: number
): RiskLevel {
    if (score >= 85) {
        return "critical";
    }

    if (score >= 70) {
        return "high";
    }

    if (score >= 50) {
        return "medium";
    }

    return "low";
}

function getTrend(
    delta: number
): RiskTrend {
    if (delta >= 8) {
        return "up";
    }

    if (delta <= -8) {
        return "down";
    }

    return "flat";
}

export function computeRiskScore(
    args: ComputeRiskScoreArgs
): ComputeRiskScoreResult {
    const signals: RiskSignal[] = [];

    let score = 0;

    const churnRisk =
        normalizeRisk(
            args.churnRisk
        );

    score += churnRisk * 0.45;

    if (churnRisk >= 85) {
        signals.push({
            key: "high_churn",
            label:
                "Very high churn probability",
            impact: 25,
        });
    }

    const healthScore = clamp(
        Number(
            args.healthScore ?? 100
        ),
        0,
        100
    );

    if (healthScore <= 40) {
        score += 18;

        signals.push({
            key: "low_health",
            label:
                "Low customer health score",
            impact: 18,
        });
    }

    const inactive =
        daysInactive(
            args.lastActiveAt
        );

    if (
        inactive !== null &&
        inactive >= 7
    ) {
        const inactivityImpact =
            clamp(
                inactive * 1.4,
                0,
                22
            );

        score += inactivityImpact;

        signals.push({
            key: "inactive",
            label: `No activity for ${inactive} days`,
            impact:
                inactivityImpact,
        });
    }

    const failedPayments =
        Number(
            args.failedPayments ?? 0
        );

    if (failedPayments > 0) {
        const impact = clamp(
            failedPayments * 14,
            0,
            30
        );

        score += impact;

        signals.push({
            key: "failed_payment",
            label:
                "Recent failed payment activity",
            impact,
        });
    }

    const invoices =
        args.invoices || [];

    const billingIssues =
        invoices.some((inv) => {
            const s = (
                inv.status || ""
            ).toLowerCase();

            return (
                s === "past_due" ||
                s === "open" ||
                s === "unpaid" ||
                s === "failed"
            );
        });

    if (billingIssues) {
        score += 16;

        signals.push({
            key: "billing_issue",
            label:
                "Outstanding billing issue",
            impact: 16,
        });
    }

    const usageDropPct =
        Number(
            args.usageDropPct ?? 0
        );

    if (usageDropPct >= 25) {
        const impact = clamp(
            usageDropPct * 0.4,
            0,
            18
        );

        score += impact;

        signals.push({
            key: "usage_drop",
            label: `${usageDropPct}% usage decline detected`,
            impact,
        });
    }

    const seatDropPct =
        Number(
            args.seatDropPct ?? 0
        );

    if (seatDropPct >= 20) {
        const impact = clamp(
            seatDropPct * 0.35,
            0,
            14
        );

        score += impact;

        signals.push({
            key: "seat_reduction",
            label:
                "Seat count reduction detected",
            impact,
        });
    }

    const supportTickets =
        Number(
            args.supportTicketsOpen ?? 0
        );

    if (supportTickets >= 3) {
        const impact = clamp(
            supportTickets * 2,
            0,
            10
        );

        score += impact;

        signals.push({
            key: "support_friction",
            label:
                "Multiple unresolved support issues",
            impact,
        });
    }

    const successActions =
        Number(
            args.recentSuccessActions ??
            0
        );

    if (successActions > 0) {
        const recoveryBoost =
            clamp(
                successActions * 6,
                0,
                18
            );

        score -= recoveryBoost;

        signals.push({
            key: "successful_recovery",
            label:
                "Recent retention recovery success",
            impact:
                -recoveryBoost,
        });
    }

    const mrr = Number(
        args.mrr ?? 0
    );

    if (mrr >= 10000) {
        score += 5;

        signals.push({
            key: "high_value_account",
            label:
                "High MRR account requires prioritisation",
            impact: 5,
        });
    }

    const finalScore =
        clamp(
            Math.round(score),
            0,
            100
        );

    const previous =
        Number(
            args.previousRiskScore ??
            finalScore
        );

    const velocity =
        finalScore - previous;

    const trend =
        getTrend(velocity);

    const confidence =
        clamp(
            Math.round(
                55 +
                signals.length * 6
            ),
            55,
            98
        );

    const nextActions: string[] =
        [];

    if (billingIssues) {
        nextActions.push(
            "Trigger billing recovery workflow"
        );
    }

    if (
        inactive !== null &&
        inactive >= 10
    ) {
        nextActions.push(
            "Send re-engagement sequence"
        );
    }

    if (churnRisk >= 80) {
        nextActions.push(
            "Schedule urgent customer success outreach"
        );
    }

    if (
        usageDropPct >= 25
    ) {
        nextActions.push(
            "Review feature adoption decline"
        );
    }

    if (!nextActions.length) {
        nextActions.push(
            "Continue monitoring account health"
        );
    }

    const summary =
        signals.length
            ? signals
                .slice(0, 3)
                .map(
                    (s) => s.label
                )
                .join(" • ")
            : "No major retention risks detected";

    return {
        riskScore: finalScore,

        riskLevel:
            getRiskLevel(
                finalScore
            ),

        confidence,

        trend,

        velocity,

        signals,

        nextActions,

        summary,
    };
}