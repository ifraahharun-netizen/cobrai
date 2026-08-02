import { NextResponse } from "next/server";

import { isRetentionAuditAdmin } from "@/lib/retention-audit/admin-auth";
import {
    AuditReviewError,
    resendRetentionAuditApprovalEmail,
} from "@/lib/retention-audit/review-service";
import {
    assertTrustedMutationRequest,
    logAuditReviewError,
} from "@/lib/retention-audit/review-security";

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

function errorRedirect(
    request: Request,
    auditId: string,
    errorCode: string,
) {
    return NextResponse.redirect(
        auditUrl(request, auditId, {
            error: errorCode,
        }),
        303,
    );
}

function reviewErrorCode(error: AuditReviewError) {
    const codes: Record<
        AuditReviewError["code"],
        string
    > = {
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

        await resendRetentionAuditApprovalEmail({
            auditId: id,
            reviewerId: null,
        });

        return NextResponse.redirect(
            auditUrl(request, id, {
                email: "queued",
            }),
            303,
        );
    } catch (error) {
        logAuditReviewError({
            operation: "resend-approval-email",
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
                    "X-Content-Type-Options": "nosniff",
                },
            });
        }

        if (error instanceof AuditReviewError) {
            return errorRedirect(
                request,
                id,
                reviewErrorCode(error),
            );
        }

        return errorRedirect(
            request,
            id,
            "email_failed",
        );
    }
}