import { NextResponse } from "next/server";

import { isRetentionAuditAdmin } from "@/lib/retention-audit/admin-auth";
import { retentionAuditConfig } from "@/lib/retention-audit/config";
import {
    approveRetentionAudit,
    AuditReviewError,
} from "@/lib/retention-audit/review-service";
import {
    assertTrustedMutationRequest,
    logAuditReviewError,
} from "@/lib/retention-audit/review-security";
import { rateLimitAuditMutation } from "@/lib/retention-audit/route-rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

type Context = {
    params: Promise<{
        id: string;
    }>;
};

function auditUrl(
    request: Request,
    auditId: string,
    parameters?: Record<string, string>,
) {
    const url = new URL(
        `/admin/retention-audits/${encodeURIComponent(auditId)}`,
        request.url,
    );

    for (const [key, value] of Object.entries(parameters ?? {})) {
        url.searchParams.set(key, value);
    }

    return url;
}

function errorCode(error: AuditReviewError) {
    const codes: Record<AuditReviewError["code"], string> = {
        NOT_FOUND: "not_found",
        REPORT_MISSING: "report_missing",
        INVALID_STATUS: "invalid_status",
        CONCURRENT_UPDATE: "concurrent_update",
    };

    return codes[error.code];
}

export async function POST(
    request: Request,
    context: Context,
) {
    const { id } = await context.params;

    if (!(await isRetentionAuditAdmin())) {
        return NextResponse.redirect(
            new URL(
                "/admin/retention-audits/login",
                request.url,
            ),
            303,
        );
    }

    try {
        assertTrustedMutationRequest(request);

        const rateConfig =
            retentionAuditConfig.approveRateLimit();

        const rateLimit = await rateLimitAuditMutation({
            request,
            auditId: id,
            operation: "approve",
            ...rateConfig,
        });

        if (!rateLimit.allowed) {
            return new NextResponse(
                "Too many approval attempts.",
                {
                    status: 429,
                    headers: {
                        "Retry-After": String(
                            rateLimit.retryAfterSeconds,
                        ),
                        "Cache-Control": "no-store",
                    },
                },
            );
        }

        const formData = await request.formData();

        const notes = String(
            formData.get("notes") ?? "",
        )
            .trim()
            .slice(0, 1000);

        await approveRetentionAudit({
            auditId: id,
            notes: notes || null,
            reviewerId: null,
        });

        return NextResponse.redirect(
            auditUrl(request, id, {
                approved: "1",
                email: "queued",
            }),
            303,
        );
    } catch (error) {
        logAuditReviewError({
            operation: "approve",
            auditId: id,
            request,
            error,
        });

        if (
            error instanceof Error &&
            error.message === "UNTRUSTED_ORIGIN"
        ) {
            return new NextResponse("Forbidden", {
                status: 403,
                headers: {
                    "Cache-Control": "no-store",
                },
            });
        }

        return NextResponse.redirect(
            auditUrl(request, id, {
                error:
                    error instanceof AuditReviewError
                        ? errorCode(error)
                        : "approval_failed",
            }),
            303,
        );
    }
}