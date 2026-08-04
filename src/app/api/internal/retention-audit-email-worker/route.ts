import { NextResponse } from "next/server";

import { processRetentionAuditEmailJobs } from "@/lib/retention-audit/email-jobs";
import { deleteExpiredRateLimits } from "@/lib/retention-audit/rate-limit";
import { safelyCompareSecrets } from "@/lib/retention-audit/review-security";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function getBearerToken(request: Request) {
    const authorization =
        request.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
        return null;
    }

    return authorization
        .slice("Bearer ".length)
        .trim();
}

function isAuthorised(request: Request) {
    const receivedSecret =
        getBearerToken(request);

    if (!receivedSecret) {
        return false;
    }

    const cronSecret =
        process.env.CRON_SECRET?.trim();

    const workerSecret =
        process.env
            .RETENTION_AUDIT_WORKER_SECRET
            ?.trim();

    const matchesCronSecret =
        cronSecret
            ? safelyCompareSecrets(
                receivedSecret,
                cronSecret,
            )
            : false;

    const matchesWorkerSecret =
        workerSecret
            ? safelyCompareSecrets(
                receivedSecret,
                workerSecret,
            )
            : false;

    return (
        matchesCronSecret ||
        matchesWorkerSecret
    );
}

async function runWorker(
    request: Request,
) {
    try {
        if (!isAuthorised(request)) {
            return NextResponse.json(
                {
                    success: false,
                    error: "Unauthorised.",
                },
                {
                    status: 401,
                    headers: {
                        "Cache-Control":
                            "no-store",
                    },
                },
            );
        }

        const [results] =
            await Promise.all([
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
                status: 200,
                headers: {
                    "Cache-Control":
                        "no-store",
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
                success: false,
                error:
                    error instanceof Error
                        ? error.message
                        : "The retention audit email worker failed.",
            },
            {
                status: 500,
                headers: {
                    "Cache-Control":
                        "no-store",
                },
            },
        );
    }
}

/*
 * Vercel Cron calls the route with GET and uses CRON_SECRET.
 */
export async function GET(
    request: Request,
) {
    return runWorker(request);
}

/*
 * Manual calls can use RETENTION_AUDIT_WORKER_SECRET.
 */
export async function POST(
    request: Request,
) {
    return runWorker(request);
}