import { createHash } from "node:crypto";

import {
    consumeRateLimit,
    type RateLimitResult,
} from "@/lib/retention-audit/rate-limit";
import { getRequestIp } from "@/lib/retention-audit/review-security";

function hashIdentifier(value: string) {
    return createHash("sha256")
        .update(value)
        .digest("hex");
}

export async function rateLimitAuditMutation(input: {
    request: Request;
    auditId: string;
    operation: "approve" | "reject" | "resend";
    limit: number;
    windowSeconds: number;
}): Promise<RateLimitResult> {
    const ipAddress =
        getRequestIp(input.request) ?? "unknown";
    const identifier = hashIdentifier(
        `${ipAddress}:${input.auditId}`,
    );

    return consumeRateLimit({
        key: `retention-audit:${input.operation}:${identifier}`,
        limit: input.limit,
        windowSeconds: input.windowSeconds,
    });
}
