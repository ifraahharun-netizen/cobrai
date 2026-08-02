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

    for (const [key, value] of Object.entries(
        parameters ?? {},
    )) {
        url.searchParams.set(key, value);
    }

    return url;
}

function errorRedirect(
    request: Request,
    auditId: string,
    message: string,
) {
    return NextResponse.redirect(
        auditUrl(request, auditId, {
            error: message,
        }),
        303,
    );
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
            request,
        });

        return NextResponse.redirect(
            auditUrl(request, id, {
                email: "resent",
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
            const messages: Record<
                AuditReviewError["code"],
                string
            > = {
                NOT_FOUND:
                    "The audit could not be found.",
                REPORT_MISSING:
                    "The report has not been generated.",
                INVALID_STATUS:
                    "Only an approved audit with an active report link can be emailed.",
                CONCURRENT_UPDATE:
                    "The audit changed while the email was being prepared. Refresh and try again.",
                EMAIL_UNAVAILABLE:
                    "The audit remains approved, but the email could not be sent.",
            };

            return errorRedirect(
                request,
                id,
                messages[error.code],
            );
        }

        return errorRedirect(
            request,
            id,
            "The approval email could not be sent. Please try again.",
        );
    }
}