import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/retention-audit/security";
import type {
    AuditNarrative,
    DeterministicAudit,
} from "@/lib/retention-audit/types";

import styles from "./report.module.css";

type Props = {
    params: Promise<{ token: string }>;
};

function money(valueMinor: number) {
    return new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "GBP",
        maximumFractionDigits: 0,
    }).format(valueMinor / 100);
}

export default async function RetentionAuditReportPage({ params }: Props) {
    const { token } = await params;

    const audit = await prisma.retentionAuditRequest.findFirst({
        where: {
            publicTokenHash: hashToken(token),
            status: "APPROVED",
        },
        include: { report: true },
    });

    if (!audit?.report) notFound();

    const deterministic =
        audit.report.deterministicData as unknown as DeterministicAudit;
    const narrative = audit.report.narrative as unknown as AuditNarrative;

    return (
        <main className={styles.page}>
            <header className={styles.header}>
                <strong>Cobrai</strong>
                <span>Confidential retention analysis</span>
            </header>

            <section className={styles.hero}>
                <span>Retention audit for {audit.website}</span>
                <h1>{narrative.headline}</h1>
                <p>{narrative.executiveSummary}</p>
            </section>

            <section className={styles.metrics}>
                <article>
                    <span>Retention health</span>
                    <strong>{audit.report.healthScore}/100</strong>
                </article>
                <article>
                    <span>Revenue at risk</span>
                    <strong>{money(audit.report.revenueAtRiskMinor)}</strong>
                </article>
                <article>
                    <span>Critical accounts</span>
                    <strong>{audit.report.criticalCustomers}</strong>
                </article>
                <article>
                    <span>Failed-payment exposure</span>
                    <strong>{money(audit.report.failedPaymentMinor)}</strong>
                </article>
            </section>

            <section className={styles.grid}>
                <div className={styles.panel}>
                    <span className={styles.label}>Key findings</span>
                    {narrative.keyFindings.map((finding) => (
                        <article key={finding.title} className={styles.finding}>
                            <h2>{finding.title}</h2>
                            <p>{finding.explanation}</p>
                        </article>
                    ))}
                </div>

                <div className={styles.panel}>
                    <span className={styles.label}>Immediate actions</span>
                    {narrative.immediateActions.map((action, index) => (
                        <article key={action.title} className={styles.action}>
                            <span>{String(index + 1).padStart(2, "0")}</span>
                            <div>
                                <h2>{action.title}</h2>
                                <p>{action.explanation}</p>
                                {action.accountNames.length > 0 ? (
                                    <small>
                                        Accounts:{" "}
                                        {action.accountNames.join(", ")}
                                    </small>
                                ) : null}
                            </div>
                        </article>
                    ))}
                </div>
            </section>

            <section className={styles.accounts}>
                <div className={styles.accountsHeader}>
                    <div>
                        <span className={styles.label}>Priority accounts</span>
                        <h2>Start with the revenue most exposed</h2>
                    </div>
                    <p>
                        Showing the highest-risk accounts from the uploaded
                        dataset.
                    </p>
                </div>

                <div className={styles.tableWrap}>
                    <div className={styles.tableHead}>
                        <span>Account</span>
                        <span>MRR</span>
                        <span>Risk</span>
                        <span>Reason</span>
                        <span>Recommended action</span>
                    </div>

                    {deterministic.priorityAccounts.slice(0, 12).map((account) => (
                        <div className={styles.tableRow} key={account.customerName}>
                            <strong>{account.customerName}</strong>
                            <span>{money(account.mrrMinor)}</span>
                            <span
                                className={`${styles.risk} ${account.riskBand === "CRITICAL"
                                        ? styles.critical
                                        : account.riskBand === "AT_RISK"
                                            ? styles.atRisk
                                            : styles.healthy
                                    }`}
                            >
                                {account.riskScore}
                            </span>
                            <span>
                                {account.reasons[0]?.evidence ??
                                    "No material risk signal detected."}
                            </span>
                            <span>{account.recommendedAction}</span>
                        </div>
                    ))}
                </div>
            </section>

            <section className={styles.cta}>
                <div>
                    <span>Turn this snapshot into continuous protection</span>
                    <h2>Know what changed before another customer leaves.</h2>
                    <p>{narrative.conversionMessage}</p>
                </div>
                <a href="/signup">Start your 14-day trial</a>
            </section>

            {narrative.caveats.length > 0 ? (
                <footer className={styles.caveats}>
                    <strong>Important context</strong>
                    {narrative.caveats.map((caveat) => (
                        <p key={caveat}>{caveat}</p>
                    ))}
                </footer>
            ) : null}
        </main>
    );
}
