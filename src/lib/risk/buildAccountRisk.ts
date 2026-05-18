import { computeRiskScore } from "@/lib/risk/computeRiskScore";

type CustomerInput = {
    id: string;
    name: string;
    email?: string | null;

    mrr?: number | null;

    churnRisk?: number | null;
    healthScore?: number | null;

    lastActiveAt?: Date | null;

    invoices?: {
        status: string;
        dueAt?: Date | null;
        paidAt?: Date | null;
    }[];

    previousRiskScore?: number | null;

    supportTicketsOpen?: number | null;

    usageDropPct?: number | null;

    seatDropPct?: number | null;

    recentSuccessActions?: number | null;
};

function primaryReason(signals: { key: string; label: string }[]) {
    return (
        signals[0] || {
            key: "early_risk_signals",
            label: "Early risk signals detected",
        }
    );
}

export function buildAccountRisk(
    customer: CustomerInput
) {
    const result = computeRiskScore({
        churnRisk:
            customer.churnRisk,

        healthScore:
            customer.healthScore,

        previousRiskScore:
            customer.previousRiskScore,

        invoices:
            customer.invoices,

        lastActiveAt:
            customer.lastActiveAt,

        mrr:
            customer.mrr,

        supportTicketsOpen:
            customer.supportTicketsOpen,

        usageDropPct:
            customer.usageDropPct,

        seatDropPct:
            customer.seatDropPct,

        recentSuccessActions:
            customer.recentSuccessActions,
    });

    const primary =
        primaryReason(
            result.signals
        );

    return {
        customerId:
            customer.id,

        companyName:
            customer.name,

        riskScore:
            result.riskScore,

        previousRiskScore:
            customer.previousRiskScore ||
            null,

        riskLevel:
            result.riskLevel,

        confidence:
            result.confidence,

        trend:
            result.trend,

        velocity:
            result.velocity,

        reasonKey:
            primary.key,

        reasonLabel:
            primary.label,

        signals:
            result.signals,

        nextActions:
            result.nextActions,

        summary:
            result.summary,

        mrr:
            Number(
                customer.mrr || 0
            ),
    };
}