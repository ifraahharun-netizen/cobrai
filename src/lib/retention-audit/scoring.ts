import type {
    AnalysedCustomer,
    DeterministicAudit,
    NormalisedCustomer,
    RiskReason,
} from "./types";

const DAY_MS = 86_400_000;

function daysBetween(from: Date, to: Date) {
    return Math.floor(
        (to.getTime() - from.getTime()) / DAY_MS,
    );
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function riskBandForScore(
    score: number,
): AnalysedCustomer["riskBand"] {
    if (score >= 60) {
        return "CRITICAL";
    }

    if (score >= 30) {
        return "AT_RISK";
    }

    return "HEALTHY";
}

function buildReasons(
    customer: NormalisedCustomer,
    now: Date,
): RiskReason[] {
    const reasons: RiskReason[] = [];

    if (customer.lastActiveAt) {
        const inactiveDays = Math.max(
            0,
            daysBetween(
                new Date(customer.lastActiveAt),
                now,
            ),
        );

        if (inactiveDays >= 45) {
            reasons.push({
                code: "INACTIVE_45",
                label: "Long inactivity",
                points: 30,
                evidence: `No recorded activity for ${inactiveDays} days.`,
            });
        } else if (inactiveDays >= 30) {
            reasons.push({
                code: "INACTIVE_30",
                label: "Extended inactivity",
                points: 24,
                evidence: `No recorded activity for ${inactiveDays} days.`,
            });
        } else if (inactiveDays >= 14) {
            reasons.push({
                code: "INACTIVE_14",
                label: "Recent inactivity",
                points: 12,
                evidence: `No recorded activity for ${inactiveDays} days.`,
            });
        }
    }

    if (customer.productUsageScore !== null) {
        if (customer.productUsageScore < 25) {
            reasons.push({
                code: "USAGE_CRITICAL",
                label: "Very low product usage",
                points: 26,
                evidence:
                    `Product usage score is ` +
                    `${customer.productUsageScore}/100.`,
            });
        } else if (customer.productUsageScore < 50) {
            reasons.push({
                code: "USAGE_LOW",
                label: "Low product usage",
                points: 17,
                evidence:
                    `Product usage score is ` +
                    `${customer.productUsageScore}/100.`,
            });
        }
    }

    if (customer.usageChange30d !== null) {
        if (customer.usageChange30d <= -50) {
            reasons.push({
                code: "USAGE_DROP_50",
                label: "Severe usage decline",
                points: 25,
                evidence:
                    `Usage fell ` +
                    `${Math.abs(customer.usageChange30d)}% over 30 days.`,
            });
        } else if (customer.usageChange30d <= -25) {
            reasons.push({
                code: "USAGE_DROP_25",
                label: "Usage decline",
                points: 15,
                evidence:
                    `Usage fell ` +
                    `${Math.abs(customer.usageChange30d)}% over 30 days.`,
            });
        }
    }

    if (customer.failedPayments30d > 0) {
        reasons.push({
            code: "FAILED_PAYMENT",
            label: "Failed payment",
            points:
                customer.failedPayments30d >= 2
                    ? 24
                    : 18,
            evidence:
                `${customer.failedPayments30d} failed payment` +
                `${customer.failedPayments30d === 1 ? "" : "s"}` +
                " in the last 30 days.",
        });
    }

    if (customer.supportTickets30d >= 5) {
        reasons.push({
            code: "SUPPORT_HIGH",
            label: "High support volume",
            points: 12,
            evidence:
                `${customer.supportTickets30d} support tickets ` +
                "in the last 30 days.",
        });
    } else if (customer.supportTickets30d >= 3) {
        reasons.push({
            code: "SUPPORT_ELEVATED",
            label: "Elevated support volume",
            points: 7,
            evidence:
                `${customer.supportTickets30d} support tickets ` +
                "in the last 30 days.",
        });
    }

    if (customer.npsScore !== null) {
        if (customer.npsScore <= 0) {
            reasons.push({
                code: "NPS_DETRACTOR",
                label: "Detractor NPS",
                points: 15,
                evidence: `Latest NPS is ${customer.npsScore}.`,
            });
        } else if (customer.npsScore <= 6) {
            reasons.push({
                code: "NPS_LOW",
                label: "Low satisfaction",
                points: 10,
                evidence: `Latest NPS is ${customer.npsScore}.`,
            });
        }
    }

    if (customer.renewalAt) {
        const renewalDays = daysBetween(
            now,
            new Date(customer.renewalAt),
        );

        if (renewalDays >= 0 && renewalDays <= 14) {
            reasons.push({
                code: "RENEWAL_14",
                label: "Renewal approaching",
                points: 10,
                evidence:
                    `Renewal is due in ${renewalDays} days.`,
            });
        } else if (
            renewalDays >= 0 &&
            renewalDays <= 30
        ) {
            reasons.push({
                code: "RENEWAL_30",
                label: "Renewal within 30 days",
                points: 5,
                evidence:
                    `Renewal is due in ${renewalDays} days.`,
            });
        }
    }

    const status =
        customer.subscriptionStatus?.toLowerCase();

    if (
        status &&
        ["past_due", "past due", "unpaid"].includes(status)
    ) {
        reasons.push({
            code: "PAST_DUE",
            label: "Subscription past due",
            points: 22,
            evidence:
                `Subscription status is ` +
                `${customer.subscriptionStatus}.`,
        });
    }

    return reasons;
}

function actionFor(
    customer: NormalisedCustomer,
    reasons: RiskReason[],
) {
    const codes = new Set(
        reasons.map((reason) => reason.code),
    );

    if (
        codes.has("FAILED_PAYMENT") ||
        codes.has("PAST_DUE")
    ) {
        return "Retry payment and contact the billing owner today.";
    }

    if (codes.has("RENEWAL_14")) {
        return "Arrange a renewal check-in before the renewal date.";
    }

    if (
        codes.has("USAGE_DROP_50") ||
        codes.has("USAGE_CRITICAL") ||
        codes.has("INACTIVE_45")
    ) {
        return "Send a personal re-engagement message and offer a success call.";
    }

    if (
        codes.has("SUPPORT_HIGH") ||
        codes.has("NPS_DETRACTOR")
    ) {
        return "Review unresolved support issues and schedule an escalation call.";
    }

    if (customer.mrrMinor >= 100_000) {
        return "Review the account with customer success and confirm the next value milestone.";
    }

    return "Monitor the account and send a targeted product-value reminder.";
}

function defaultActionForProvidedScore(score: number) {
    if (score >= 80) {
        return "Contact the account owner today and resolve the highest-impact risk signal.";
    }

    if (score >= 60) {
        return "Schedule a personal customer-success check-in within 48 hours.";
    }

    if (score >= 30) {
        return "Send a targeted value reminder and review engagement this week.";
    }

    return "Maintain the normal check-in cadence and monitor for new risk signals.";
}

function providedReasonFor(
    customer: NormalisedCustomer,
    score: number,
): RiskReason {
    const level =
        customer.providedRiskLevel ??
        (score >= 60
            ? "CRITICAL"
            : score >= 30
                ? "MEDIUM"
                : "LOW");

    return {
        code: `PROVIDED_${level}`,
        label: `${level.charAt(0)}${level
            .slice(1)
            .toLowerCase()} risk`,
        points: score,
        evidence:
            customer.providedReason ??
            "Risk assessment supplied in the uploaded customer list.",
    };
}

function analyseCustomer(
    customer: NormalisedCustomer,
    now: Date,
): AnalysedCustomer {
    if (customer.providedRiskScore !== null) {
        const riskScore = Math.round(
            clamp(customer.providedRiskScore, 0, 100),
        );

        const reasons = [
            providedReasonFor(customer, riskScore),
        ];

        return {
            ...customer,
            riskScore,
            riskBand: riskBandForScore(riskScore),
            reasons,
            recommendedAction:
                customer.providedNextAction ??
                defaultActionForProvidedScore(riskScore),
        };
    }

    const reasons = buildReasons(customer, now);
    const rawRisk = reasons.reduce(
        (total, reason) => total + reason.points,
        0,
    );
    const riskScore = clamp(rawRisk, 0, 100);

    return {
        ...customer,
        riskScore,
        riskBand: riskBandForScore(riskScore),
        reasons: reasons.sort(
            (a, b) => b.points - a.points,
        ),
        recommendedAction: actionFor(customer, reasons),
    };
}

export function analyseRetentionDataset(args: {
    rows: NormalisedCustomer[];
    rowsReceived: number;
    warnings: string[];
    now?: Date;
}): DeterministicAudit {
    const now = args.now ?? new Date();

    const allAccounts = args.rows.map((row) =>
        analyseCustomer(row, now),
    );

    const healthyCustomers = allAccounts.filter(
        (account) => account.riskBand === "HEALTHY",
    ).length;

    const atRiskCustomers = allAccounts.filter(
        (account) => account.riskBand === "AT_RISK",
    ).length;

    const criticalCustomers = allAccounts.filter(
        (account) => account.riskBand === "CRITICAL",
    ).length;

    const totalMrrMinor = allAccounts.reduce(
        (total, account) => total + account.mrrMinor,
        0,
    );

    const revenueAtRiskMinor = allAccounts
        .filter(
            (account) => account.riskBand !== "HEALTHY",
        )
        .reduce(
            (total, account) =>
                total + account.mrrMinor,
            0,
        );

    const failedPaymentMinor = allAccounts
        .filter((account) =>
            account.reasons.some((reason) =>
                ["FAILED_PAYMENT", "PAST_DUE"].includes(
                    reason.code,
                ),
            ),
        )
        .reduce(
            (total, account) =>
                total + account.mrrMinor,
            0,
        );

    const averageRisk =
        allAccounts.reduce(
            (total, account) =>
                total + account.riskScore,
            0,
        ) / Math.max(1, allAccounts.length);

    const healthScore = Math.round(
        clamp(100 - averageRisk, 0, 100),
    );

    const signalMap = new Map<
        string,
        {
            code: string;
            label: string;
            affectedCustomers: number;
            affectedMrrMinor: number;
        }
    >();

    for (const account of allAccounts) {
        for (const reason of account.reasons) {
            const current = signalMap.get(reason.code) ?? {
                code: reason.code,
                label: reason.label,
                affectedCustomers: 0,
                affectedMrrMinor: 0,
            };

            current.affectedCustomers += 1;
            current.affectedMrrMinor += account.mrrMinor;

            signalMap.set(reason.code, current);
        }
    }

    const topSignals = [...signalMap.values()]
        .sort(
            (a, b) =>
                b.affectedMrrMinor -
                a.affectedMrrMinor ||
                b.affectedCustomers -
                a.affectedCustomers,
        )
        .slice(0, 8);

    const priorityAccounts = [...allAccounts]
        .sort(
            (a, b) =>
                b.riskScore - a.riskScore ||
                b.mrrMinor - a.mrrMinor,
        )
        .slice(0, 20);

    return {
        generatedAt: now.toISOString(),
        totals: {
            totalCustomers: allAccounts.length,
            totalMrrMinor,
            healthyCustomers,
            atRiskCustomers,
            criticalCustomers,
            revenueAtRiskMinor,
            failedPaymentMinor,
            healthScore,
        },
        topSignals,
        priorityAccounts,
        allAccounts,
        dataQuality: {
            rowsReceived: args.rowsReceived,
            rowsAnalysed: allAccounts.length,
            rowsExcluded:
                args.rowsReceived - allAccounts.length,
            warnings: args.warnings.slice(0, 50),
        },
    };
}
