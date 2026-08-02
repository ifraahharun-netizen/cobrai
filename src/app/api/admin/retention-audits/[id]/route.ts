import { NextResponse } from "next/server";

import { isRetentionAuditAdmin } from "@/lib/retention-audit/admin-auth";
import { retentionAuditConfig } from "@/lib/retention-audit/config";
import {
    AuditReviewError,
    resendRetentionAuditApprovalEmail,
} from "@/lib/retention-audit/review-service";
import {
    assertTrustedMutationRequest,
    logAuditReviewError,
} from "@/lib/retention-audit/review-security";
import { rateLimitAuditMutation } from "@/lib/retention-audit/route-rate-limit";

export const runtime = "nodejs";

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
            retentionAuditConfig.resendRateLimit();
        const rateLimit =
            await rateLimitAuditMutation({
                request,
                auditId: id,
                operation: "resend",
                ...rateConfig,
            });

        if (!rateLimit.allowed) {
            return new NextResponse(
                "Too many resend attempts.",
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
                },
            });
        }

        return NextResponse.redirect(
            auditUrl(request, id, {
                error:
                    error instanceof AuditReviewError
                        ? error.code.toLowerCase()
                        : "email_failed",
            }),
            303,
        );
    }
}
