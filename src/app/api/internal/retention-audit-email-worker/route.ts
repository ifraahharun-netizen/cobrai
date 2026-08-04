import { NextResponse } from "next/server";

import { retentionAuditConfig } from "@/lib/retention-audit/config";
import { processRetentionAuditEmailJobs } from "@/lib/retention-audit/email-jobs";
import { deleteExpiredRateLimits } from "@/lib/retention-audit/rate-limit";
import { safelyCompareSecrets } from "@/lib/retention-audit/review-security";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function isAuthorised(request: Request) {
    const authorisation =
        request.headers.get("authorization");

    const receivedSecret =
        authorisation?.startsWith("Bearer ")
            ? authorisation.slice(7).trim()
            : null;

    const expectedSecret =
        retentionAuditConfig.workerSecret().trim();

    console.log("Worker auth debug", {
        hasAuthorisationHeader: Boolean(authorisation),
        receivedLength: receivedSecret?.length ?? 0,
        expectedLength: expectedSecret.length,
        receivedPreview: receivedSecret
            ? `${receivedSecret.slice(0, 4)}...${receivedSecret.slice(-4)}`
            : null,
        expectedPreview: `${expectedSecret.slice(0, 4)}...${expectedSecret.slice(-4)}`,
    });

    return safelyCompareSecrets(
        receivedSecret,
        expectedSecret,
    );
}

async function runWorker(request: Request) {
    if (!isAuthorised(request)) {
        return NextResponse.json(
            {
                error: "Unauthorised.",
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
        const [results] = await Promise.all([
            processRetentionAuditEmailJobs(),
            deleteExpiredRateLimits(),
        ]);

        return NextResponse.json(
            {
                success: true,
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
            {
                error:
                    error instanceof Error
                        ? {
                              name: error.name,
                              message: error.message,
                              stack:
                                  process.env.NODE_ENV ===
                                  "development"
                                      ? error.stack
                                      : undefined,
                          }
                        : {
                              name: "UnknownError",
                              message:
                                  "An unknown worker error occurred.",
                          },
            },
        );

        return NextResponse.json(
            {
                error:
                    "The retention audit email worker failed.",
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

/*
 * Vercel Cron invokes the configured path with GET.
 */
export async function GET(request: Request) {
    return runWorker(request);
}

/*
 * POST is retained for manual and external scheduler calls.
 */
export async function POST(request: Request) {
    return runWorker(request);
}