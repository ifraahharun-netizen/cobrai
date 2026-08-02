import Link from "next/link";
import { redirect } from "next/navigation";
import {
    AlertTriangle,
    CheckCircle2,
    Clock3,
    Database,
    Search,
    ShieldCheck,
} from "lucide-react";

import { prisma } from "@/lib/prisma";
import { isRetentionAuditAdmin } from "@/lib/retention-audit/admin-auth";

import styles from "./retention-audits.module.css";

export const dynamic = "force-dynamic";

type Props = {
    searchParams: Promise<{
        status?: string;
        q?: string;
    }>;
};

const statuses = [
    "ALL",
    "NEW",
    "DATA_UPLOADED",
    "ANALYSING",
    "PENDING_REVIEW",
    "APPROVED",
    "REJECTED",
    "FAILED",
] as const;

function money(valueMinor: number) {
    return new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "GBP",
        maximumFractionDigits: 0,
    }).format(valueMinor / 100);
}

function dateTime(value: Date) {
    return new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Europe/London",
    }).format(value);
}

function statusLabel(status: string) {
    return status
        .toLowerCase()
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

export default async function RetentionAuditsAdminPage({
    searchParams,
}: Props) {
    if (!(await isRetentionAuditAdmin())) {
        redirect("/admin/retention-audits/login");
    }

    const params = await searchParams;
    const requestedStatus = (params.status ?? "ALL").toUpperCase();
    const status = statuses.includes(
        requestedStatus as (typeof statuses)[number],
    )
        ? requestedStatus
        : "ALL";

    const query = (params.q ?? "").trim();

    const audits = await prisma.retentionAuditRequest.findMany({
        where: {
            ...(status !== "ALL"
                ? {
                    status: status as Exclude<
                        (typeof statuses)[number],
                        "ALL"
                    >,
                }
                : {}),
            ...(query
                ? {
                    OR: [
                        {
                            name: {
                                contains: query,
                                mode: "insensitive",
                            },
                        },
                        {
                            email: {
                                contains: query,
                                mode: "insensitive",
                            },
                        },
                        {
                            website: {
                                contains: query,
                                mode: "insensitive",
                            },
                        },
                    ],
                }
                : {}),
        },
        include: {
            dataset: {
                select: {
                    rowCount: true,
                    originalName: true,
                },
            },
            report: {
                select: {
                    healthScore: true,
                    totalCustomers: true,
                    criticalCustomers: true,
                    revenueAtRiskMinor: true,
                },
            },
        },
        orderBy: {
            createdAt: "desc",
        },
        take: 100,
    });

    const [
        total,
        pendingReview,
        approved,
        failed,
    ] = await Promise.all([
        prisma.retentionAuditRequest.count(),
        prisma.retentionAuditRequest.count({
            where: { status: "PENDING_REVIEW" },
        }),
        prisma.retentionAuditRequest.count({
            where: { status: "APPROVED" },
        }),
        prisma.retentionAuditRequest.count({
            where: { status: "FAILED" },
        }),
    ]);

    return (
        <main className={styles.page}>
            <header className={styles.topbar}>
                <div>
                    <span className={styles.eyebrow}>Cobrai admin</span>
                    <h1>Retention audits</h1>
                    <p>
                        Review generated findings before customers receive
                        their private report.
                    </p>
                </div>

                <form
                    action="/api/admin/retention-audits/logout"
                    method="POST"
                >
                    <button className={styles.secondaryButton} type="submit">
                        Sign out
                    </button>
                </form>
            </header>

            <section className={styles.metrics}>
                <article>
                    <span className={styles.metricIcon}>
                        <Database size={18} />
                    </span>
                    <div>
                        <span>Total requests</span>
                        <strong>{total}</strong>
                    </div>
                </article>

                <article>
                    <span className={styles.metricIcon}>
                        <Clock3 size={18} />
                    </span>
                    <div>
                        <span>Awaiting review</span>
                        <strong>{pendingReview}</strong>
                    </div>
                </article>

                <article>
                    <span className={styles.metricIcon}>
                        <CheckCircle2 size={18} />
                    </span>
                    <div>
                        <span>Approved</span>
                        <strong>{approved}</strong>
                    </div>
                </article>

                <article>
                    <span className={styles.metricIcon}>
                        <AlertTriangle size={18} />
                    </span>
                    <div>
                        <span>Failed</span>
                        <strong>{failed}</strong>
                    </div>
                </article>
            </section>

            <section className={styles.panel}>
                <div className={styles.toolbar}>
                    <form className={styles.searchForm}>
                        <input
                            type="hidden"
                            name="status"
                            value={status}
                        />

                        <Search size={16} />

                        <input
                            name="q"
                            defaultValue={query}
                            placeholder="Search name, email or website"
                        />

                        <button type="submit">Search</button>
                    </form>

                    <nav className={styles.filters}>
                        {statuses.map((item) => {
                            const href =
                                `/admin/retention-audits?status=${item}` +
                                (query
                                    ? `&q=${encodeURIComponent(query)}`
                                    : "");

                            return (
                                <Link
                                    key={item}
                                    href={href}
                                    className={
                                        item === status
                                            ? styles.activeFilter
                                            : undefined
                                    }
                                >
                                    {item === "ALL"
                                        ? "All"
                                        : statusLabel(item)}
                                </Link>
                            );
                        })}
                    </nav>
                </div>

                <div className={styles.tableWrap}>
                    <div className={styles.tableHead}>
                        <span>Company</span>
                        <span>Status</span>
                        <span>Dataset</span>
                        <span>Health</span>
                        <span>Revenue at risk</span>
                        <span>Submitted</span>
                        <span />
                    </div>

                    {audits.length === 0 ? (
                        <div className={styles.emptyState}>
                            <ShieldCheck size={24} />
                            <h2>No audits found</h2>
                            <p>
                                No requests match the selected filters.
                            </p>
                        </div>
                    ) : (
                        audits.map((audit) => (
                            <div
                                className={styles.tableRow}
                                key={audit.id}
                            >
                                <div className={styles.companyCell}>
                                    <strong>{audit.website}</strong>
                                    <span>{audit.name}</span>
                                    <small>{audit.email}</small>
                                </div>

                                <span
                                    className={`${styles.status} ${styles[
                                        `status${audit.status}` as keyof typeof styles
                                        ] ?? ""
                                        }`}
                                >
                                    {statusLabel(audit.status)}
                                </span>

                                <div className={styles.datasetCell}>
                                    <strong>
                                        {audit.dataset
                                            ? `${audit.dataset.rowCount} accounts`
                                            : "Not uploaded"}
                                    </strong>
                                    <span>
                                        {audit.dataset?.originalName ??
                                            audit.mrrRange}
                                    </span>
                                </div>

                                <strong className={styles.numeric}>
                                    {audit.report
                                        ? `${audit.report.healthScore}/100`
                                        : "—"}
                                </strong>

                                <strong className={styles.numeric}>
                                    {audit.report
                                        ? money(
                                            audit.report
                                                .revenueAtRiskMinor,
                                        )
                                        : "—"}
                                </strong>

                                <span className={styles.dateCell}>
                                    {dateTime(audit.createdAt)}
                                </span>

                                <Link
                                    className={styles.reviewLink}
                                    href={`/admin/retention-audits/${audit.id}`}
                                >
                                    Review
                                </Link>
                            </div>
                        ))
                    )}
                </div>
            </section>
        </main>
    );
}
