import { notFound } from "next/navigation";

import RetentionAuditReport from "@/components/retention-audit/RetentionAuditReport";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/retention-audit/security";
import type {
    AuditNarrative,
    DeterministicAudit,
} from "@/lib/retention-audit/types";

type Props = {
    params: Promise<{
        token: string;
    }>;
};

export default async function RetentionAuditReportPage({
    params,
}: Props) {
    const { token } = await params;

    const now = new Date();

    const audit =
        await prisma.retentionAuditRequest.findFirst({
            where: {
                publicTokenHash: hashToken(token),
                status: "APPROVED",
                publicTokenRevokedAt: null,
                OR: [
                    {
                        publicTokenExpiresAt: null,
                    },
                    {
                        publicTokenExpiresAt: {
                            gt: now,
                        },
                    },
                ],
            },
            include: {
                report: true,
            },
        });

    if (!audit?.report) {
        notFound();
    }

    const deterministic =
        audit.report
            .deterministicData as unknown as DeterministicAudit;

    const narrative =
        audit.report
            .narrative as unknown as AuditNarrative;

    return (
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
                    audit.report
                        .revenueAtRiskMinor,
                criticalCustomers:
                    audit.report
                        .criticalCustomers,
                failedPaymentMinor:
                    audit.report
                        .failedPaymentMinor,
            }}
            deterministic={deterministic}
            narrative={narrative}
        />
    );
}