import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
    ArrowLeft,
    Check,
    CircleAlert,
    ChevronLeft,
    ChevronRight,
    FileText,
    Mail,
    ShieldCheck,
    Sparkles,
    X,
} from "lucide-react";

import { prisma } from "@/lib/prisma";
import { isRetentionAuditAdmin } from "@/lib/retention-audit/admin-auth";
import {
    formatMinorCurrency,
    formatRegionalDateTime,
} from "@/lib/retention-audit/regional";
import type {
    AuditNarrative,
    DeterministicAudit,
} from "@/lib/retention-audit/types";

import styles from "../retention-audits.module.css";

export const dynamic = "force-dynamic";

type Props = {
    params: Promise<{
        id: string;
    }>;
    searchParams: Promise<{
        approved?: string;
        rejected?: string;
        error?: string;
        page?: string;
        email?: string;
    }>;
};

type RiskDriver = {
    label: string;
    count: number;
    tone: "red" | "orange" | "blue" | "purple" | "teal";
};

const REVIEW_ERROR_MESSAGES: Record<string, string> = {
    not_found: "The audit could not be found.",
    report_missing: "The audit report has not been generated yet.",
    invalid_status: "This audit cannot be changed from its current status.",
    concurrent_update: "The audit changed in another request. Refresh and try again.",
    email_unavailable: "The audit is approved, but the email could not be sent.",
    approval_failed: "The audit could not be approved.",
    rejection_failed: "The audit could not be rejected.",
    email_failed: "The approval email could not be sent.",
};

function statusLabel(status: string) {
    return status
        .toLowerCase()
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

function classifyRiskDriver(text: string) {
    const value = text.toLowerCase();

    if (
        value.includes("inactive") ||
        value.includes("no recorded activity") ||
        value.includes("last active")
    ) {
        return { label: "Inactive 45+ days", tone: "red" as const };
    }

    if (
        value.includes("declin") ||
        value.includes("low usage") ||
        value.includes("usage")
    ) {
        return { label: "Declining usage", tone: "orange" as const };
    }

    if (
        value.includes("payment") ||
        value.includes("billing") ||
        value.includes("invoice")
    ) {
        return { label: "Failed payments", tone: "red" as const };
    }

    if (
        value.includes("login") ||
        value.includes("sign in") ||
        value.includes("signed in")
    ) {
        return { label: "No recent login", tone: "blue" as const };
    }

    if (
        value.includes("feature") ||
        value.includes("adoption") ||
        value.includes("engagement")
    ) {
        return { label: "Low feature adoption", tone: "purple" as const };
    }

    if (
        value.includes("support") ||
        value.includes("ticket") ||
        value.includes("complaint")
    ) {
        return { label: "Support friction", tone: "teal" as const };
    }

    return { label: "Other churn signals", tone: "blue" as const };
}

function buildRiskDrivers(
    accounts: DeterministicAudit["priorityAccounts"],
): RiskDriver[] {
    const counts = new Map<string, RiskDriver>();

    accounts.forEach((account) => {
        const source = [
            account.reasons[0]?.evidence,
            account.recommendedAction,
        ]
            .filter(Boolean)
            .join(" ");

        const driver = classifyRiskDriver(source);
        const existing = counts.get(driver.label);

        counts.set(driver.label, {
            ...driver,
            count: (existing?.count ?? 0) + 1,
        });
    });

    return Array.from(counts.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
}

export default async function RetentionAuditReviewPage({
    params,
    searchParams,
}: Props) {
    if (!(await isRetentionAuditAdmin())) {
        redirect("/admin/retention-audits/login");
    }

    const { id } = await params;
    const notice = await searchParams;

    const audit = await prisma.retentionAuditRequest.findUnique({
        where: { id },
        include: {
            dataset: true,
            report: true,
        },
    });

    if (!audit) {
        notFound();
    }

    const regionalContext = {
        locale: audit.locale,
        timeZone: audit.timeZone,
        currency: audit.currency,
    };

    const money = (valueMinor: number) =>
        formatMinorCurrency(valueMinor, regionalContext);

    const dateTime = (value: Date | null) =>
        formatRegionalDateTime(value, regionalContext);

    const deterministic = audit.report
        ? (audit.report
            .deterministicData as unknown as DeterministicAudit)
        : null;

    const narrative = audit.report
        ? (audit.report.narrative as unknown as AuditNarrative)
        : null;

    const allAnalysedAccounts =
        deterministic?.priorityAccounts ?? [];
    const totalCustomers = audit.report?.totalCustomers ?? 0;
    const healthyCustomers = allAnalysedAccounts.filter(
        (account) => account.riskBand === "HEALTHY",
    ).length;
    const atRiskCustomers = allAnalysedAccounts.filter(
        (account) => account.riskBand === "AT_RISK",
    ).length;
    const criticalCustomers = allAnalysedAccounts.filter(
        (account) => account.riskBand === "CRITICAL",
    ).length;
    const churnRiskAccounts = atRiskCustomers + criticalCustomers;

    const riskDrivers = deterministic
        ? buildRiskDrivers(deterministic.priorityAccounts)
        : [];

    const narrativeProjection = narrative as
        | (AuditNarrative & {
            projectedRevenueProtectedMinor?: number;
            estimatedChurnReductionPercent?: number;
            expectedRetainedCustomers?: number;
            confidencePercent?: number;
        })
        | null;

    const projectedRevenueProtectedMinor =
        narrativeProjection?.projectedRevenueProtectedMinor ?? null;
    const estimatedChurnReductionPercent =
        narrativeProjection?.estimatedChurnReductionPercent ?? null;
    const expectedRetainedCustomers =
        narrativeProjection?.expectedRetainedCustomers ?? null;
    const projectionConfidencePercent =
        narrativeProjection?.confidencePercent ?? null;
    const maxRiskDriverCount = Math.max(
        ...riskDrivers.map((driver) => driver.count),
        1,
    );

    const accountsPerPage = 10;
    const totalPriorityAccounts = deterministic?.priorityAccounts.length ?? 0;
    const totalAccountPages = Math.max(
        1,
        Math.ceil(totalPriorityAccounts / accountsPerPage),
    );
    const requestedAccountPage = Number.parseInt(notice.page ?? "1", 10);
    const accountPage = Number.isFinite(requestedAccountPage)
        ? Math.min(Math.max(requestedAccountPage, 1), totalAccountPages)
        : 1;
    const accountStartIndex = (accountPage - 1) * accountsPerPage;
    const accountEndIndex = Math.min(
        accountStartIndex + accountsPerPage,
        totalPriorityAccounts,
    );
    const paginatedPriorityAccounts = deterministic?.priorityAccounts.slice(
        accountStartIndex,
        accountEndIndex,
    ) ?? [];

    const canApprove =
        audit.status === "PENDING_REVIEW" ||
        audit.status === "REJECTED";
    const canReject = audit.status === "PENDING_REVIEW";
    const canResendApprovalEmail =
        audit.status === "APPROVED" &&
        Boolean(audit.publicTokenHash);

    return (
        <main className={styles.page}>
            <div className={styles.detailTopbar}>
                <Link
                    href="/admin/retention-audits"
                    className={styles.backLink}
                >
                    <ArrowLeft size={14} />
                    All retention audits
                </Link>

                <span
                    className={`${styles.status} ${styles[
                        `status${audit.status}` as keyof typeof styles
                    ] ?? ""
                        }`}
                >
                    {statusLabel(audit.status)}
                </span>
            </div>

            {notice.approved ? (
                <div className={styles.successBanner}>
                    <Check size={15} />
                    {notice.email === "failed"
                        ? "The audit was approved, but the customer email could not be sent."
                        : "The audit was approved and the customer was emailed."}
                </div>
            ) : null}

            {notice.rejected ? (
                <div className={styles.warningBanner}>
                    <X size={15} />
                    The audit was rejected.
                </div>
            ) : null}

            {notice.error ? (
                <div className={styles.errorBanner}>
                    <CircleAlert size={15} />
                    {REVIEW_ERROR_MESSAGES[notice.error] ?? "The audit request could not be completed."}
                </div>
            ) : null}

            {notice.email === "failed" ? (
                <div className={styles.warningBanner}>
                    <CircleAlert size={15} />
                    The audit is approved and its report link is valid, but the approval email failed.
                </div>
            ) : null}

            {notice.email === "resent" ? (
                <div className={styles.successBanner}>
                    <Mail size={15} />
                    The approval email was sent again with a new private report link.
                </div>
            ) : null}

            <div className={styles.auditWorkspace}>
                <aside className={styles.auditSidebar}>
                    <section className={styles.detailHero}>
                        <div className={styles.heroIdentity}>
                            <span className={styles.eyebrow}>
                                Retention Audit Review
                            </span>
                            <div className={styles.heroTitleRow}>
                                <h1>{audit.website}</h1>
                                <span
                                    className={`${styles.status} ${styles[
                                        `status${audit.status}` as keyof typeof styles
                                    ] ?? ""
                                        }`}
                                >
                                    {statusLabel(audit.status)}
                                </span>
                            </div>
                            <p>
                                Submitted by {audit.name} · {audit.email}
                            </p>
                        </div>

                        <div className={styles.heroMeta}>
                            <div>
                                <span>MRR range</span>
                                <strong>{audit.mrrRange}</strong>
                            </div>
                            <div>
                                <span>Submitted</span>
                                <strong>{dateTime(audit.createdAt)}</strong>
                            </div>
                            <div>
                                <span>Analysed</span>
                                <strong>{dateTime(audit.analysedAt)}</strong>
                            </div>
                        </div>
                    </section>

                    <section className={styles.sidebarMetrics}>
                        <article className={styles.kpiSummaryCard}>
                            <div className={styles.kpiPrimaryMetric}>
                                <div className={styles.kpiMetricLabelRow}>
                                    <span>Revenue at Risk</span>

                                </div>

                                <div className={styles.kpiPrimaryValueRow}>
                                    <strong>
                                        {audit.report
                                            ? money(
                                                audit.report
                                                    .revenueAtRiskMinor,
                                            )
                                            : "—"}
                                    </strong>

                                </div>

                                <p>
                                    At risk from {churnRiskAccounts}{" "}
                                    {churnRiskAccounts === 1
                                        ? "account"
                                        : "accounts"}
                                </p>
                            </div>

                            <div className={styles.kpiSecondaryGrid}>
                                <div className={styles.kpiSecondaryMetric}>
                                    <div className={styles.kpiMetricLabelRow}>
                                        <span>Accounts at Risk</span>

                                    </div>

                                    <div className={styles.kpiSecondaryValueRow}>
                                        <strong>{churnRiskAccounts}</strong>

                                    </div>
                                </div>

                                <div className={styles.kpiSecondaryMetric}>
                                    <div className={styles.kpiMetricLabelRow}>
                                        <span>Healthy Accounts</span>

                                    </div>

                                    <div className={styles.kpiSecondaryValueRow}>
                                        <strong>{healthyCustomers}</strong>

                                    </div>
                                </div>
                            </div>
                        </article>
                    </section>

                    <article className={styles.sidebarRiskDriversCard}>
                        <div className={styles.sidebarRiskDriversHeader}>
                            <div>
                                <h2>Top risk drivers</h2>
                                <p>Accounts grouped by primary churn signal</p>
                            </div>
                            <span>{riskDrivers.length}</span>
                        </div>

                        <div className={styles.sidebarRiskDriversList}>
                            {riskDrivers.length > 0 ? (
                                riskDrivers.map((driver) => {
                                    const toneClass = styles[
                                        `riskTone${driver.tone
                                            .charAt(0)
                                            .toUpperCase()}${driver.tone.slice(
                                                1,
                                            )}` as keyof typeof styles
                                    ];

                                    return (
                                        <div
                                            className={styles.sidebarRiskDriverItem}
                                            key={driver.label}
                                        >
                                            <div
                                                className={
                                                    styles.sidebarRiskDriverTop
                                                }
                                            >
                                                <div>
                                                    <span
                                                        className={`${styles.sidebarRiskDriverDot} ${toneClass}`}
                                                        aria-hidden="true"
                                                    />
                                                    <strong>{driver.label}</strong>
                                                </div>
                                                <span>
                                                    <b>{driver.count}</b>{" "}
                                                    {driver.count === 1
                                                        ? "account"
                                                        : "accounts"}
                                                </span>
                                            </div>

                                            <div
                                                className={
                                                    styles.sidebarRiskDriverTrack
                                                }
                                                aria-hidden="true"
                                            >
                                                <span
                                                    className={`${styles.sidebarRiskDriverFill} ${toneClass}`}
                                                    style={{
                                                        width: `${Math.max(
                                                            (driver.count /
                                                                maxRiskDriverCount) *
                                                            100,
                                                            8,
                                                        )}%`,
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <p className={styles.sidebarRiskDriversEmpty}>
                                    Risk drivers will appear when the audit is
                                    complete.
                                </p>
                            )}
                        </div>

                        <div className={styles.sidebarRiskDriversFooter}>
                            <span>Showing all {riskDrivers.length} drivers</span>
                            <span>Generated analysis</span>
                        </div>
                    </article>
                </aside>

                <section className={styles.auditMainContent}>
                    <div className={styles.auditOverviewGrid}>
                        <article className={styles.aiSummaryCard}>
                            <div className={styles.aiSummaryTitle}>
                                <Sparkles size={14} strokeWidth={1.8} />
                                <span>AI summary</span>
                            </div>
                            <p>
                                {narrative?.executiveSummary ??
                                    "The retention summary will appear when the audit analysis is complete."}
                            </p>
                        </article>

                        <article className={styles.projectedImpactCard}>
                            <div className={styles.projectedImpactHeader}>
                                <span>If all recommended actions are completed</span>
                            </div>

                            <div className={styles.projectedImpactGrid}>
                                <div className={styles.projectedImpactMetric}>
                                    <span>Revenue protected</span>
                                    <strong>
                                        {projectedRevenueProtectedMinor !== null
                                            ? money(projectedRevenueProtectedMinor)
                                            : "Not calculated"}
                                    </strong>
                                </div>

                                <div className={styles.projectedImpactMetric}>
                                    <span>Estimated churn reduction</span>
                                    <strong>
                                        {estimatedChurnReductionPercent !== null
                                            ? `${estimatedChurnReductionPercent}%`
                                            : "Not calculated"}
                                    </strong>
                                </div>

                                <div className={styles.projectedImpactMetric}>
                                    <span>Expected retained customers</span>
                                    <strong>
                                        {expectedRetainedCustomers ?? "Not calculated"}
                                    </strong>
                                </div>

                                <div className={styles.projectedImpactMetric}>
                                    <span>Confidence</span>
                                    <strong>
                                        {projectionConfidencePercent !== null
                                            ? `${projectionConfidencePercent}%`
                                            : "Not calculated"}
                                    </strong>
                                </div>
                            </div>
                        </article>
                    </div>

                    {!audit.report || !deterministic || !narrative ? (
                        <section className={styles.notReady}>
                            <FileText size={24} />
                            <h2>The report is not ready for review</h2>
                            <p>
                                Current status: {statusLabel(audit.status)}.
                                {audit.failureReason
                                    ? ` ${audit.failureReason}`
                                    : ""}
                            </p>
                        </section>
                    ) : (
                        <>
                            <section className={styles.accountsPanel}>
                                <div className={styles.panelHeader}>
                                    <div>
                                        <span className={styles.panelLabel}>
                                            Priority accounts
                                        </span>
                                        <h2>
                                            Highest-risk customer revenue
                                        </h2>
                                    </div>
                                    <p>
                                        {totalPriorityAccounts > 0
                                            ? `Showing ${accountStartIndex + 1}–${accountEndIndex} of ${totalPriorityAccounts} accounts.`
                                            : "No accounts in the generated analysis."}
                                    </p>
                                </div>

                                <div className={styles.accountsTable}>
                                    <div className={styles.accountsHead}>
                                        <span>Account</span>
                                        <span>MRR</span>
                                        <span>Risk</span>
                                        <span>Evidence</span>
                                        <span>Recommended action</span>
                                    </div>

                                    {paginatedPriorityAccounts.map((account) => (
                                        <div
                                            className={styles.accountRow}
                                            key={`${account.customerName}-${account.email ?? ""}`}
                                        >
                                            <div>
                                                <strong>
                                                    {account.customerName}
                                                </strong>
                                                <span>
                                                    {account.email ??
                                                        "No email"}
                                                </span>
                                            </div>

                                            <strong>
                                                {money(account.mrrMinor)}
                                            </strong>

                                            <span
                                                className={`${styles.riskBadge} ${account.riskBand ===
                                                    "CRITICAL"
                                                    ? styles.riskCritical
                                                    : account.riskBand ===
                                                        "AT_RISK"
                                                        ? styles.riskAtRisk
                                                        : styles.riskHealthy
                                                    }`}
                                            >
                                                {account.riskScore}
                                            </span>

                                            <span>
                                                {account.reasons[0]
                                                    ?.evidence ??
                                                    "No material signal"}
                                            </span>

                                            <span>
                                                {
                                                    account.recommendedAction
                                                }
                                            </span>
                                        </div>
                                    ))}
                                </div>

                                <div className={styles.accountsPagination}>
                                    <p>
                                        {totalPriorityAccounts > 0
                                            ? `Showing ${accountStartIndex + 1} to ${accountEndIndex} of ${totalPriorityAccounts} accounts`
                                            : "Showing 0 accounts"}
                                    </p>

                                    <nav aria-label="Priority accounts pagination">
                                        {accountPage > 1 ? (
                                            <Link
                                                href={`?page=${accountPage - 1}`}
                                                className={styles.accountsPageButton}
                                                aria-label="Previous page"
                                            >
                                                <ChevronLeft size={14} />
                                            </Link>
                                        ) : (
                                            <span
                                                className={`${styles.accountsPageButton} ${styles.accountsPageButtonDisabled}`}
                                                aria-hidden="true"
                                            >
                                                <ChevronLeft size={14} />
                                            </span>
                                        )}

                                        {Array.from(
                                            { length: totalAccountPages },
                                            (_, index) => index + 1,
                                        ).map((pageNumber) => (
                                            <Link
                                                href={`?page=${pageNumber}`}
                                                className={`${styles.accountsPageButton} ${pageNumber === accountPage
                                                    ? styles.accountsPageButtonActive
                                                    : ""
                                                    }`}
                                                aria-current={
                                                    pageNumber === accountPage
                                                        ? "page"
                                                        : undefined
                                                }
                                                key={pageNumber}
                                            >
                                                {pageNumber}
                                            </Link>
                                        ))}

                                        {accountPage < totalAccountPages ? (
                                            <Link
                                                href={`?page=${accountPage + 1}`}
                                                className={styles.accountsPageButton}
                                                aria-label="Next page"
                                            >
                                                <ChevronRight size={14} />
                                            </Link>
                                        ) : (
                                            <span
                                                className={`${styles.accountsPageButton} ${styles.accountsPageButtonDisabled}`}
                                                aria-hidden="true"
                                            >
                                                <ChevronRight size={14} />
                                            </span>
                                        )}
                                    </nav>
                                </div>
                            </section>

                            <section className={styles.bottomGrid}>
                                <section className={styles.qualityPanel}>
                                    <div className={styles.bottomPanelHeading}>
                                        <ShieldCheck size={17} />
                                        <div>
                                            <span
                                                className={styles.panelLabel}
                                            >
                                                Audit quality
                                            </span>
                                            <h2>Data-quality review</h2>
                                        </div>
                                    </div>

                                    <div className={styles.qualityMetrics}>
                                        <div>
                                            <span>Rows analysed</span>
                                            <strong>
                                                {
                                                    deterministic.dataQuality
                                                        .rowsAnalysed
                                                }
                                            </strong>
                                        </div>
                                        <div>
                                            <span>Rows received</span>
                                            <strong>
                                                {
                                                    deterministic.dataQuality
                                                        .rowsReceived
                                                }
                                            </strong>
                                        </div>
                                        <div>
                                            <span>Warnings</span>
                                            <strong>
                                                {
                                                    deterministic.dataQuality
                                                        .warnings.length
                                                }
                                            </strong>
                                        </div>
                                    </div>

                                    {deterministic.dataQuality.warnings.length >
                                        0 ? (
                                        <ul className={styles.qualityWarnings}>
                                            {deterministic.dataQuality.warnings.map(
                                                (warning) => (
                                                    <li key={warning}>
                                                        {warning}
                                                    </li>
                                                ),
                                            )}
                                        </ul>
                                    ) : (
                                        <p className={styles.qualitySuccess}>
                                            No import warnings were recorded.
                                        </p>
                                    )}
                                </section>

                                <section className={styles.approvalPanel}>
                                    <div>
                                        <span className={styles.panelLabel}>
                                            Review & decision
                                        </span>
                                        <h2>Final audit decision</h2>
                                        <p>
                                            Approval sends the private report
                                            link to the customer.
                                        </p>
                                    </div>

                                    <div className={styles.decisionForms}>
                                        <form
                                            action={`/api/admin/retention-audits/${audit.id}/approve`}
                                            method="POST"
                                        >
                                            <label>
                                                Internal note
                                                <textarea
                                                    name="notes"
                                                    defaultValue={
                                                        audit.notes ?? ""
                                                    }
                                                    placeholder="Optional quality-review note"
                                                    maxLength={1000}
                                                />
                                            </label>

                                            <button
                                                className={
                                                    styles.approveButton
                                                }
                                                type="submit"
                                                disabled={!canApprove}
                                            >
                                                <Mail size={14} />
                                                {audit.status === "APPROVED"
                                                    ? "Already approved"
                                                    : canApprove
                                                        ? "Approve audit"
                                                        : "Approval unavailable"}
                                            </button>
                                        </form>

                                        <form
                                            action={`/api/admin/retention-audits/${audit.id}/reject`}
                                            method="POST"
                                        >
                                            <label>
                                                Rejection reason
                                                <textarea
                                                    name="reason"
                                                    placeholder="Explain what needs correction"
                                                    maxLength={1000}
                                                    required
                                                />
                                            </label>

                                            <button
                                                className={styles.rejectButton}
                                                type="submit"
                                                disabled={!canReject}
                                            >
                                                <X size={14} />
                                                Reject audit
                                            </button>
                                        </form>

                                        {canResendApprovalEmail ? (
                                            <form
                                                action={`/api/admin/retention-audits/${audit.id}/resend-email`}
                                                method="POST"
                                            >
                                                <button
                                                    className={styles.secondaryButton}
                                                    type="submit"
                                                >
                                                    <Mail size={14} />
                                                    Resend approval email
                                                </button>
                                            </form>
                                        ) : null}
                                    </div>
                                </section>
                            </section>
                        </>
                    )}
                </section>
            </div>
        </main>
    );
}