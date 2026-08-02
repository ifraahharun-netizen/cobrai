import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import {
    MAX_UPLOAD_BYTES,
    parseRetentionCsv,
} from "@/lib/retention-audit/csv";
import { tokenMatches } from "@/lib/retention-audit/security";

export const runtime = "nodejs";

type Context = {
    params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: Context) {
    try {
        const { id } = await context.params;
        const form = await request.formData();
        const token = String(form.get("token") ?? "");
        const file = form.get("file");

        if (!(file instanceof File)) {
            return NextResponse.json(
                { error: "Select a CSV file." },
                { status: 400 },
            );
        }

        if (
            file.type !== "text/csv" &&
            !file.name.toLowerCase().endsWith(".csv")
        ) {
            return NextResponse.json(
                { error: "Only CSV files are supported." },
                { status: 415 },
            );
        }

        if (file.size > MAX_UPLOAD_BYTES) {
            return NextResponse.json(
                { error: "The CSV must be 5 MB or smaller." },
                { status: 413 },
            );
        }

        const audit = await prisma.retentionAuditRequest.findUnique({
            where: { id },
            select: { uploadTokenHash: true, status: true },
        });

        if (!audit || !token || !tokenMatches(token, audit.uploadTokenHash)) {
            return NextResponse.json(
                { error: "This upload link is invalid or expired." },
                { status: 403 },
            );
        }

        const csvText = await file.text();
        const parsed = parseRetentionCsv(csvText);

        await prisma.$transaction([
            prisma.retentionAuditDataset.upsert({
                where: { auditId: id },
                create: {
                    auditId: id,
                    originalName: file.name.slice(0, 255),
                    rowCount: parsed.rows.length,
                    columns: parsed.columns,
                    rows: parsed.rows,
                    warnings: parsed.warnings,
                },
                update: {
                    originalName: file.name.slice(0, 255),
                    rowCount: parsed.rows.length,
                    columns: parsed.columns,
                    rows: parsed.rows,
                    warnings: parsed.warnings,
                },
            }),
            prisma.retentionAuditRequest.update({
                where: { id },
                data: {
                    status: "DATA_UPLOADED",
                    uploadedAt: new Date(),
                    failureReason: null,
                },
            }),
        ]);

        return NextResponse.json({
            ok: true,
            rowCount: parsed.rows.length,
            warnings: parsed.warnings,
        });
    } catch (error) {
        console.error("Retention audit upload failed", error);
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "The CSV could not be processed.",
            },
            { status: 400 },
        );
    }
}
