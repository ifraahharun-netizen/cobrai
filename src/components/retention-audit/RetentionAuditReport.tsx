import { Inter } from "next/font/google";
import {
    ChartNoAxesCombined,
    CircleDollarSign,
    Lightbulb,
    TrendingUp,
} from "lucide-react";

import type {
    AuditNarrative,
    DeterministicAudit,
} from "@/lib/retention-audit/types";

import styles from "./RetentionAuditReport.module.css";

const inter = Inter({
    subsets: ["latin"],
    weight: ["400", "500", "600", "700"],
    display: "swap",
});

type ReportSummary = {
    healthScore: number;
    revenueAtRiskMinor: number;
    criticalCustomers: number;
    failedPaymentMinor: number;
};

type RetentionAuditReportProps = {
    website: string;
    currencyCode: string | null;
    locale: string | null;
    timeZone: string | null;
    generatedAt: Date | string;
    report: ReportSummary;
    deterministic: DeterministicAudit;
    narrative: AuditNarrative;
};

function normaliseCurrencyCode(
    currencyCode: string | null,
) {
    const normalised =
        currencyCode?.trim().toUpperCase();

    if (
        normalised &&
        /^[A-Z]{3}$/.test(normalised)
    ) {
        return normalised;
    }

    return "GBP";
}

function formatMoney(
    valueMinor: number,
    currencyCode: string,
    locale: string | null,
) {
    try {
        return new Intl.NumberFormat(
            locale?.trim() || undefined,
            {
                style: "currency",
                currency: currencyCode,
                maximumFractionDigits: 0,
            },
        ).format(valueMinor / 100);
    } catch {
        return new Intl.NumberFormat("en-GB", {
            style: "currency",
            currency: currencyCode,
            maximumFractionDigits: 0,
        }).format(valueMinor / 100);
    }
}

function formatAuditDate(
    value: Date | string,
    locale: string | null,
    timeZone: string | null,
) {
    const date =
        value instanceof Date
            ? value
            : new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "";
    }

    try {
        return new Intl.DateTimeFormat(
            locale?.trim() || undefined,
            {
                day: "numeric",
                month: "long",
                year: "numeric",
                timeZone:
                    timeZone?.trim() ||
                    undefined,
            },
        ).format(date);
    } catch {
        return new Intl.DateTimeFormat(
            "en-GB",
            {
                day: "numeric",
                month: "long",
                year: "numeric",
                timeZone: "UTC",
            },
        ).format(date);
    }
}

function createExecutiveInsights(
    report: ReportSummary,
    deterministic: DeterministicAudit,
    currencyCode: string,
    locale: string | null,
) {
    const priorityAccounts =
        deterministic.priorityAccounts;

    const criticalAccounts =
        priorityAccounts.filter(
            (account) =>
                account.riskBand === "CRITICAL",
        );

    const highestRiskAccounts =
        criticalAccounts.length > 0
            ? criticalAccounts
            : priorityAccounts;

    const topFiveAccounts =
        highestRiskAccounts.slice(0, 5);

    const topFiveRevenueMinor =
        topFiveAccounts.reduce(
            (total, account) =>
                total + account.mrrMinor,
            0,
        );

    const revenueConcentration =
        report.revenueAtRiskMinor > 0
            ? Math.min(
                100,
                Math.round(
                    (topFiveRevenueMinor /
                        report.revenueAtRiskMinor) *
                    100,
                ),
            )
            : 0;

    const engagementTerms = [
        "activity",
        "usage",
        "engagement",
        "adoption",
        "inactive",
        "product",
        "feature",
    ];

    const paymentTerms = [
        "billing",
        "payment",
        "invoice",
        "card",
    ];

    const engagementSignals =
        criticalAccounts.filter((account) => {
            const evidence =
                account.reasons
                    .map(
                        (reason) =>
                            reason.evidence ?? "",
                    )
                    .join(" ")
                    .toLowerCase();

            return engagementTerms.some((term) =>
                evidence.includes(term),
            );
        }).length;

    const paymentSignals =
        criticalAccounts.filter((account) => {
            const evidence =
                account.reasons
                    .map(
                        (reason) =>
                            reason.evidence ?? "",
                    )
                    .join(" ")
                    .toLowerCase();

            return paymentTerms.some((term) =>
                evidence.includes(term),
            );
        }).length;

    const churnDriver =
        engagementSignals > paymentSignals
            ? "Most critical accounts show declining engagement or product usage rather than payment failure, suggesting that adoption and customer activity are the primary retention risks."
            : paymentSignals > engagementSignals
                ? "Payment and billing issues appear more frequently across the critical accounts, making revenue recovery and payment resolution the most immediate retention priority."
                : "The critical accounts show a mixture of engagement and payment-related risks, meaning the recovery plan should combine customer outreach with operational follow-up.";

    const highestPriorityAccounts =
        highestRiskAccounts.slice(0, 2);

    const highestPriorityNames =
        highestPriorityAccounts
            .map(
                (account) =>
                    account.customerName,
            )
            .join(" and ");

    const highestPriorityAnnualMinor =
        highestPriorityAccounts.reduce(
            (total, account) =>
                total + account.mrrMinor * 12,
            0,
        );

    const highestRoiDescription =
        highestPriorityAccounts.length > 0
            ? `Prioritising ${highestPriorityNames} would address ${formatMoney(
                highestPriorityAnnualMinor,
                currencyCode,
                locale,
            )} in annualised recurring revenue exposure across the two highest-risk accounts.`
            : "Begin with the highest-risk accounts and address the most immediate retention signals before expanding outreach to the wider customer base.";

    return [
        {
            title: "Revenue Concentration Risk",
            description:
                topFiveAccounts.length > 0
                    ? `${revenueConcentration}% of the revenue currently flagged at risk is concentrated across only ${topFiveAccounts.length} high-priority accounts. Losing even one of these customers could materially affect recurring revenue.`
                    : "No material revenue concentration risk was identified in the supplied dataset.",
            icon: TrendingUp,
        },
        {
            title: "Churn Driver",
            description: churnDriver,
            icon: Lightbulb,
        },
        {
            title: "Highest ROI Action",
            description:
                highestRoiDescription,
            icon: CircleDollarSign,
        },
    ];
}

export default function RetentionAuditReport({
    website,
    currencyCode,
    locale,
    timeZone,
    generatedAt,
    report,
    deterministic,
    narrative,
}: RetentionAuditReportProps) {
    const resolvedCurrencyCode =
        normaliseCurrencyCode(currencyCode);

    const money = (valueMinor: number) =>
        formatMoney(
            valueMinor,
            resolvedCurrencyCode,
            locale,
        );

    const auditDate = formatAuditDate(
        generatedAt,
        locale,
        timeZone,
    );

    const executiveInsights =
        createExecutiveInsights(
            report,
            deterministic,
            resolvedCurrencyCode,
            locale,
        );

    return (
        <div
            className={`${inter.className} ${styles.report}`}
        >
            <section className={styles.summaryCard}>
                <div className={styles.summaryCopy}>
                    <div
                        className={
                            styles.summaryHeading
                        }
                    >
                        <span
                            className={
                                styles.summaryIcon
                            }
                        >
                            <ChartNoAxesCombined
                                size={18}
                            />
                        </span>

                        <div>
                            <span
                                className={
                                    styles.label
                                }
                            >
                                Executive summary
                            </span>

                            <h1>
                                {narrative.headline}
                            </h1>
                        </div>
                    </div>

                    <p>
                        {
                            narrative.executiveSummary
                        }
                    </p>

                    <span
                        className={
                            styles.websiteLabel
                        }
                    >
                        Retention audit for{" "}
                        {website}
                        {auditDate
                            ? ` · Generated ${auditDate}`
                            : ""}
                    </span>
                </div>

                <div
                    className={
                        styles.summaryMetrics
                    }
                >
                    <article>
                        <span>
                            Retention health
                        </span>

                        <strong>
                            {report.healthScore}%
                        </strong>
                    </article>

                    <article>
                        <span>
                            Revenue at risk
                        </span>

                        <strong
                            className={
                                styles.revenueMetric
                            }
                        >
                            {money(
                                report.revenueAtRiskMinor,
                            )}
                        </strong>
                    </article>

                    <article>
                        <span>
                            Critical accounts
                        </span>

                        <strong>
                            {
                                report.criticalCustomers
                            }
                        </strong>
                    </article>

                    <article>
                        <span>
                            Failed-payment exposure
                        </span>

                        <strong>
                            {money(
                                report.failedPaymentMinor,
                            )}
                        </strong>
                    </article>
                </div>
            </section>

            <section className={styles.grid}>
                <div className={styles.panel}>
                    <span className={styles.label}>
                        Executive findings
                    </span>

                    {narrative.keyFindings.map(
                        (finding, index) => (
                            <article
                                key={`${finding.title}-${index}`}
                                className={
                                    styles.finding
                                }
                            >
                                <h2>
                                    {finding.title}
                                </h2>

                                <p>
                                    {
                                        finding.explanation
                                    }
                                </p>
                            </article>
                        ),
                    )}
                </div>

                <div className={styles.panel}>
                    <span className={styles.label}>
                        Recommended actions
                    </span>

                    {narrative.immediateActions.map(
                        (action, index) => (
                            <article
                                key={`${action.title}-${index}`}
                                className={
                                    styles.action
                                }
                            >
                                <span>
                                    {String(
                                        index + 1,
                                    ).padStart(
                                        2,
                                        "0",
                                    )}
                                </span>

                                <div>
                                    <h2>
                                        {action.title}
                                    </h2>

                                    <p>
                                        {
                                            action.explanation
                                        }
                                    </p>

                                    {action
                                        .accountNames
                                        .length >
                                        0 ? (
                                        <small>
                                            Accounts:{" "}
                                            {action.accountNames.join(
                                                ", ",
                                            )}
                                        </small>
                                    ) : null}
                                </div>
                            </article>
                        ),
                    )}
                </div>
            </section>

            <section
                className={
                    styles.executiveInsights
                }
            >
                <div
                    className={
                        styles.executiveInsightsHeader
                    }
                >
                    <div>
                        <span
                            className={
                                styles.label
                            }
                        >
                            AI executive insights
                        </span>

                        <h2>
                            What the data means for
                            the business
                        </h2>
                    </div>

                    <p>
                        Consultant-style analysis
                        generated from the uploaded
                        customer data.
                    </p>
                </div>

                <div
                    className={
                        styles.executiveInsightsGrid
                    }
                >
                    {executiveInsights.map(
                        (insight) => {
                            const Icon =
                                insight.icon;

                            return (
                                <article
                                    key={
                                        insight.title
                                    }
                                    className={
                                        styles.executiveInsightCard
                                    }
                                >
                                    <span
                                        className={
                                            styles.executiveInsightIcon
                                        }
                                    >
                                        <Icon
                                            size={
                                                17
                                            }
                                        />
                                    </span>

                                    <div>
                                        <h3>
                                            {
                                                insight.title
                                            }
                                        </h3>

                                        <p>
                                            {
                                                insight.description
                                            }
                                        </p>
                                    </div>
                                </article>
                            );
                        },
                    )}
                </div>
            </section>

            <section className={styles.accounts}>
                <div
                    className={
                        styles.accountsHeader
                    }
                >
                    <div>
                        <span
                            className={
                                styles.label
                            }
                        >
                            Highest priority accounts
                        </span>

                        <h2>
                            Start with the revenue
                            most exposed
                        </h2>
                    </div>

                    <p>
                        Showing the highest-risk
                        accounts from the uploaded
                        dataset.
                    </p>
                </div>

                <div
                    className={styles.tableWrap}
                >
                    <div
                        className={
                            styles.tableHead
                        }
                    >
                        <span>Account</span>
                        <span>MRR</span>
                        <span>Risk</span>
                        <span>Reason</span>
                        <span>
                            Recommended action
                        </span>
                    </div>

                    {deterministic.priorityAccounts
                        .slice(0, 12)
                        .map(
                            (
                                account,
                                index,
                            ) => (
                                <div
                                    className={
                                        styles.tableRow
                                    }
                                    key={`${account.customerName}-${account.email ?? index}`}
                                >
                                    <strong>
                                        {
                                            account.customerName
                                        }
                                    </strong>

                                    <span>
                                        {money(
                                            account.mrrMinor,
                                        )}
                                    </span>

                                    <span
                                        className={`${styles.risk} ${account.riskBand ===
                                                "CRITICAL"
                                                ? styles.critical
                                                : account.riskBand ===
                                                    "AT_RISK"
                                                    ? styles.atRisk
                                                    : styles.healthy
                                            }`}
                                    >
                                        {
                                            account.riskScore
                                        }
                                    </span>

                                    <span>
                                        {account
                                            .reasons[0]
                                            ?.evidence ??
                                            "No material risk signal detected."}
                                    </span>

                                    <span>
                                        {
                                            account.recommendedAction
                                        }
                                    </span>
                                </div>
                            ),
                        )}
                </div>
            </section>

            <section className={styles.cta}>
                <div>
                    <span>
                        Turn this snapshot into
                        continuous protection
                    </span>

                    <h2>
                        Know what changed before
                        another customer leaves.
                    </h2>

                    <p>
                        {
                            narrative.conversionMessage
                        }
                    </p>
                </div>

                <a href="/signup">
                    Start your 14-day trial
                </a>
            </section>

            {narrative.caveats.length > 0 ? (
                <footer
                    className={styles.caveats}
                >
                    <strong>
                        Important context
                    </strong>

                    {narrative.caveats.map(
                        (caveat, index) => (
                            <p
                                key={`${caveat}-${index}`}
                            >
                                {caveat}
                            </p>
                        ),
                    )}
                </footer>
            ) : null}
        </div>
    );
}