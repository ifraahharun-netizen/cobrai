import Link from "next/link";
import {
    notFound,
    redirect,
} from "next/navigation";
import {
    ArrowLeft,
    Check,
    CircleAlert,
    Download,
    FileText,
    Mail,
    ShieldCheck,
    X,
} from "lucide-react";

import RetentionAuditReport from "@/components/retention-audit/RetentionAuditReport";
import { prisma } from "@/lib/prisma";
import { isRetentionAuditAdmin } from "@/lib/retention-audit/admin-auth";
import { formatRegionalDateTime } from "@/lib/retention-audit/regional";
import type {
    AuditNarrative,
    DeterministicAudit,
} from "@/lib/retention-audit/types";

import styles from "./review.module.css";

export const dynamic = "force-dynamic";

type Props = {
    params: Promise<{
        id: string;
    }>;
    searchParams: Promise<{
        approved?: string;
        rejected?: string;
        error?: string;
        email?: string;
    }>;
};

const REVIEW_ERROR_MESSAGES: Record<
    string,
    string
> = {
    not_found:
        "The audit could not be found.",
    report_missing:
        "The audit report has not been generated yet.",
    invalid_status:
        "This audit cannot be changed from its current status.",
    concurrent_update:
        "The audit changed in another request. Refresh and try again.",
    email_unavailable:
        "The audit is approved, but the email could not be sent.",
    approval_failed:
        "The audit could not be approved.",
    rejection_failed:
        "The audit could not be rejected.",
    email_failed:
        "The approval email could not be sent.",
};

function statusLabel(status: string) {
    return status
        .toLowerCase()
        .split("_")
        .map(
            (part) =>
                part.charAt(0).toUpperCase() +
                part.slice(1),
        )
        .join(" ");
}

export default async function RetentionAuditReviewPage({
    params,
    searchParams,
}: Props) {
    if (!(await isRetentionAuditAdmin())) {
        redirect(
            "/admin/retention-audits/login",
        );
    }

    const { id } = await params;
    const notice = await searchParams;

    const audit =
        await prisma.retentionAuditRequest.findUnique(
            {
                where: { id },
                include: {
                    dataset: true,
                    report: true,
                },
            },
        );

    if (!audit) {
        notFound();
    }

    const regionalContext = {
        locale: audit.locale,
        timeZone: audit.timeZone,
        currency: audit.currency,
    };

    const dateTime = (
        value: Date | null,
    ) =>
        formatRegionalDateTime(
            value,
            regionalContext,
        );

    const deterministic = audit.report
        ? (audit.report
            .deterministicData as unknown as DeterministicAudit)
        : null;

    const narrative = audit.report
        ? (audit.report
            .narrative as unknown as AuditNarrative)
        : null;

    const canApprove =
        audit.status === "PENDING_REVIEW" ||
        audit.status === "REJECTED";

    const canReject =
        audit.status === "PENDING_REVIEW";

    const canResendApprovalEmail =
        audit.status === "APPROVED" &&
        Boolean(audit.publicTokenHash);

    const quality =
        deterministic?.dataQuality ?? null;

    return (
        <main className={styles.page}>
            <div className={styles.topbar}>
                <Link
                    href="/admin/retention-audits"
                    className={styles.backLink}
                >
                    <ArrowLeft size={14} />
                    All retention audits
                </Link>

                <div className={styles.topbarActions}>
                    <span
                        className={`${styles.status} ${styles[
                            `status${audit.status}` as keyof typeof styles
                        ] ?? ""
                            }`}
                    >
                        {statusLabel(audit.status)}
                    </span>

                    <a
                        href={`/api/admin/retention-audits/${audit.id}/export-csv`}
                        className={styles.exportButton}
                        download
                    >
                        <Download size={14} />
                        Export CSV
                    </a>
                </div>
            </div>

            {notice.approved ? (
                <div
                    className={
                        styles.successBanner
                    }
                >
                    <Check size={15} />

                    The audit was approved and
                    its customer email was queued.
                </div>
            ) : null}

            {notice.rejected ? (
                <div
                    className={
                        styles.warningBanner
                    }
                >
                    <X size={15} />
                    The audit was rejected.
                </div>
            ) : null}

            {notice.error ? (
                <div
                    className={
                        styles.errorBanner
                    }
                >
                    <CircleAlert size={15} />

                    {REVIEW_ERROR_MESSAGES[
                        notice.error
                    ] ??
                        "The audit request could not be completed."}
                </div>
            ) : null}

            {notice.email === "failed" ? (
                <div
                    className={
                        styles.warningBanner
                    }
                >
                    <CircleAlert size={15} />

                    The audit is approved and
                    the private report link is
                    valid, but the approval email
                    failed.
                </div>
            ) : null}

            {notice.email === "resent" ? (
                <div
                    className={
                        styles.successBanner
                    }
                >
                    <Mail size={15} />

                    The approval email was sent
                    again with a new private
                    report link.
                </div>
            ) : null}

            {notice.email === "queued" &&
                !notice.approved ? (
                <div
                    className={
                        styles.successBanner
                    }
                >
                    <Mail size={15} />

                    The approval email has been
                    queued.
                </div>
            ) : null}

            <section
                className={styles.reviewPanel}
            >
                <div
                    className={
                        styles.reviewHeader
                    }
                >
                    <div>
                        <span
                            className={
                                styles.eyebrow
                            }
                        >
                            Retention audit review
                        </span>

                        <h1>{audit.website}</h1>

                        <p>
                            Submitted by{" "}
                            {audit.name} ·{" "}
                            {audit.email}
                        </p>
                    </div>

                    <div
                        className={
                            styles.auditMetadata
                        }
                    >
                        <div>
                            <span>MRR range</span>
                            <strong>
                                {audit.mrrRange}
                            </strong>
                        </div>

                        <div>
                            <span>Submitted</span>
                            <strong>
                                {dateTime(
                                    audit.createdAt,
                                )}
                            </strong>
                        </div>

                        <div>
                            <span>Analysed</span>
                            <strong>
                                {dateTime(
                                    audit.analysedAt,
                                )}
                            </strong>
                        </div>
                    </div>
                </div>

                <div
                    className={
                        styles.reviewBody
                    }
                >
                    <section
                        className={
                            styles.qualityPanel
                        }
                    >
                        <div
                            className={
                                styles.sectionHeading
                            }
                        >
                            <ShieldCheck
                                size={17}
                            />

                            <div>
                                <span
                                    className={
                                        styles.eyebrow
                                    }
                                >
                                    Audit quality
                                </span>

                                <h2>
                                    Data-quality
                                    review
                                </h2>
                            </div>
                        </div>

                        {quality ? (
                            <>
                                <div
                                    className={
                                        styles.qualityMetrics
                                    }
                                >
                                    <div>
                                        <span>
                                            Rows
                                            analysed
                                        </span>

                                        <strong>
                                            {
                                                quality.rowsAnalysed
                                            }
                                        </strong>
                                    </div>

                                    <div>
                                        <span>
                                            Rows
                                            received
                                        </span>

                                        <strong>
                                            {
                                                quality.rowsReceived
                                            }
                                        </strong>
                                    </div>

                                    <div>
                                        <span>
                                            Warnings
                                        </span>

                                        <strong>
                                            {
                                                quality
                                                    .warnings
                                                    .length
                                            }
                                        </strong>
                                    </div>
                                </div>

                                {quality.warnings
                                    .length > 0 ? (
                                    <ul
                                        className={
                                            styles.warningList
                                        }
                                    >
                                        {quality.warnings.map(
                                            (
                                                warning,
                                                index,
                                            ) => (
                                                <li
                                                    key={`${warning}-${index}`}
                                                >
                                                    {
                                                        warning
                                                    }
                                                </li>
                                            ),
                                        )}
                                    </ul>
                                ) : (
                                    <p
                                        className={
                                            styles.qualitySuccess
                                        }
                                    >
                                        No import
                                        warnings were
                                        recorded.
                                    </p>
                                )}
                            </>
                        ) : (
                            <p
                                className={
                                    styles.emptyText
                                }
                            >
                                Data-quality
                                information will
                                appear when the
                                report is ready.
                            </p>
                        )}
                    </section>

                    <section
                        className={
                            styles.decisionPanel
                        }
                    >
                        <div
                            className={
                                styles.sectionHeading
                            }
                        >
                            <Mail size={17} />

                            <div>
                                <span
                                    className={
                                        styles.eyebrow
                                    }
                                >
                                    Review and
                                    decision
                                </span>

                                <h2>
                                    Approve the exact
                                    report shown below
                                </h2>

                                <p>
                                    Approval sends a
                                    private link to this
                                    stored report. It
                                    does not create a
                                    separate customer
                                    version.
                                </p>
                            </div>
                        </div>

                        <div
                            className={
                                styles.decisionForms
                            }
                        >
                            <form
                                action={`/api/admin/retention-audits/${audit.id}/approve`}
                                method="POST"
                                className={
                                    styles.approveForm
                                }
                            >
                                <label>
                                    Internal note

                                    <textarea
                                        name="notes"
                                        defaultValue={
                                            audit.notes ??
                                            ""
                                        }
                                        placeholder="Optional quality-review note"
                                        maxLength={
                                            1000
                                        }
                                    />
                                </label>

                                <button
                                    className={
                                        styles.approveButton
                                    }
                                    type="submit"
                                    disabled={
                                        !canApprove
                                    }
                                >
                                    <Mail
                                        size={14}
                                    />

                                    {audit.status ===
                                        "APPROVED"
                                        ? "Already approved"
                                        : canApprove
                                            ? "Approve and send"
                                            : "Approval unavailable"}
                                </button>
                            </form>

                            <form
                                action={`/api/admin/retention-audits/${audit.id}/reject`}
                                method="POST"
                                className={
                                    styles.rejectForm
                                }
                            >
                                <label>
                                    Rejection reason

                                    <textarea
                                        name="reason"
                                        placeholder="Explain what needs correction"
                                        maxLength={
                                            1000
                                        }
                                        required
                                    />
                                </label>

                                <button
                                    className={
                                        styles.rejectButton
                                    }
                                    type="submit"
                                    disabled={
                                        !canReject
                                    }
                                >
                                    <X size={14} />
                                    Reject audit
                                </button>
                            </form>

                            {canResendApprovalEmail ? (
                                <form
                                    action={`/api/admin/retention-audits/${audit.id}/resend-email`}
                                    method="POST"
                                    className={
                                        styles.resendForm
                                    }
                                >
                                    <button
                                        className={
                                            styles.secondaryButton
                                        }
                                        type="submit"
                                    >
                                        <Mail
                                            size={14}
                                        />
                                        Resend approval
                                        email
                                    </button>
                                </form>
                            ) : null}
                        </div>
                    </section>
                </div>
            </section>

            {!audit.report ||
                !deterministic ||
                !narrative ? (
                <section
                    className={styles.notReady}
                >
                    <FileText size={24} />

                    <h2>
                        The report is not ready for
                        review
                    </h2>

                    <p>
                        Current status:{" "}
                        {statusLabel(
                            audit.status,
                        )}
                        .
                        {audit.failureReason
                            ? ` ${audit.failureReason}`
                            : ""}
                    </p>
                </section>
            ) : (
                <section
                    className={
                        styles.reportPreview
                    }
                >
                    <div
                        className={
                            styles.previewDivider
                        }
                    >
                        <span>
                            Exact customer report
                        </span>
                    </div>

                    <RetentionAuditReport
                        website={audit.website}
                        currencyCode={audit.currency}
                        locale={audit.locale}
                        timeZone={audit.timeZone}
                        generatedAt={
                            audit.analysedAt ??
                            audit.approvedAt ??
                            audit.report.createdAt
                        }
                        report={{
                            healthScore:
                                audit.report.healthScore,
                            revenueAtRiskMinor:
                                audit.report.revenueAtRiskMinor,
                            criticalCustomers:
                                audit.report.criticalCustomers,
                            failedPaymentMinor:
                                audit.report.failedPaymentMinor,
                        }}
                        deterministic={deterministic}
                        narrative={narrative}
                    />
                </section>
            )}
        </main>
    );
}