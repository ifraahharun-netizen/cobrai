import { NextResponse } from "next/server";

import { retentionAuditConfig } from "@/lib/retention-audit/config";
import { processRetentionAuditEmailJobs } from "@/lib/retention-audit/email-jobs";
import { safelyCompareSecrets } from "@/lib/retention-audit/review-security";

export const runtime = "nodejs";
export const maxDuration = 60;

function getWorkerSecret(request: Request) {
    const authorization =
        request.headers.get("authorization");

    if (
        authorization?.startsWith("Bearer ")
    ) {
        return authorization
            .slice("Bearer ".length)
            .trim();
    }

    return request.headers
        .get("x-retention-audit-worker-secret")
        ?.trim() ?? null;
}

export async function POST(request: Request) {
    const receivedSecret =
        getWorkerSecret(request);

    const expectedSecret =
        retentionAuditConfig.workerSecret();

    if (
        !safelyCompareSecrets(
            receivedSecret,
            expectedSecret,
        )
    ) {
        return NextResponse.json(
            {
                ok: false,
                error: "Unauthorized.",
            },
            {
                status: 401,
                headers: {
                    "Cache-Control": "no-store",
                },
            },
        );
    }

    try {
        const results =
            await processRetentionAuditEmailJobs();

        return NextResponse.json(
            {
                ok: true,
                processed: results.length,
                results,
            },
            {
                headers: {
                    "Cache-Control": "no-store",
                },
            },
        );
    } catch (error) {
        console.error(
            "Retention audit email worker failed",
            error,
        );

        return NextResponse.json(
            {
                ok: false,
                error:
                    error instanceof Error
                        ? error.message
                        : "The email worker failed.",
            },
            {
                status: 500,
                headers: {
                    "Cache-Control": "no-store",
                },
            },
        );
    }
}