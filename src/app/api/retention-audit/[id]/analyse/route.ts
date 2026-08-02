import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { generateAuditNarrative } from "@/lib/retention-audit/ai";
import { analyseRetentionDataset } from "@/lib/retention-audit/scoring";
import { createSecureToken, hashToken, tokenMatches } from "@/lib/retention-audit/security";
import type { NormalisedCustomer } from "@/lib/retention-audit/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type Context = {
    params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: Context) {
    const { id } = await context.params;

    try {
        const body = (await request.json()) as { token?: string };
        const token = body.token ?? "";

        const audit = await prisma.retentionAuditRequest.findUnique({
            where: { id },
            include: { dataset: true, report: true },
        });

        if (!audit || !token || !tokenMatches(token, audit.uploadTokenHash)) {
            return NextResponse.json(
                { error: "This analysis link is invalid." },
                { status: 403 },
            );
        }

        if (audit.report) {
            return NextResponse.json({
                ok: true,
                status: audit.status,
                alreadyAnalysed: true,
            });
        }

        if (!audit.dataset) {
            return NextResponse.json(
                { error: "Upload customer data before running the analysis." },
                { status: 409 },
            );
        }

        await prisma.retentionAuditRequest.update({
            where: { id },
            data: { status: "ANALYSING", failureReason: null },
        });

        const rows = audit.dataset.rows as unknown as NormalisedCustomer[];
        const warnings = audit.dataset.warnings as unknown as string[];

        const deterministic = analyseRetentionDataset({
            rows,
            rowsReceived: audit.dataset.rowCount + warnings.length,
            warnings,
        });

        const narrative = await generateAuditNarrative(deterministic);
        const publicToken = createSecureToken();

        await prisma.$transaction([
            prisma.retentionAuditReport.create({
                data: {
                    auditId: id,
                    healthScore: deterministic.totals.healthScore,
                    totalCustomers: deterministic.totals.totalCustomers,
                    healthyCustomers: deterministic.totals.healthyCustomers,
                    atRiskCustomers: deterministic.totals.atRiskCustomers,
                    criticalCustomers: deterministic.totals.criticalCustomers,
                    totalMrrMinor: deterministic.totals.totalMrrMinor,
                    revenueAtRiskMinor:
                        deterministic.totals.revenueAtRiskMinor,
                    failedPaymentMinor:
                        deterministic.totals.failedPaymentMinor,
                    deterministicData: deterministic,
                    narrative,
                },
            }),
            prisma.retentionAuditRequest.update({
                where: { id },
                data: {
                    status: "PENDING_REVIEW",
                    analysedAt: new Date(),
                    publicTokenHash: hashToken(publicToken),
                },
            }),
        ]);

        return NextResponse.json({
            ok: true,
            status: "PENDING_REVIEW",
            publicToken,
        });
    } catch (error) {
        console.error("Retention audit analysis failed", error);

        await prisma.retentionAuditRequest
            .update({
                where: { id },
                data: {
                    status: "FAILED",
                    failureReason:
                        error instanceof Error
                            ? error.message.slice(0, 500)
                            : "Unknown analysis error",
                },
            })
            .catch(() => undefined);

        return NextResponse.json(
            { error: "Cobrai could not complete the analysis." },
            { status: 500 },
        );
    }
}
