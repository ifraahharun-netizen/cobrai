import { prisma } from "@/lib/prisma";

type RateLimitInput = {
    key: string;
    limit: number;
    windowSeconds: number;
};

export type RateLimitResult = {
    allowed: boolean;
    remaining: number;
    retryAfterSeconds: number;
};

function currentWindow(
    now: Date,
    windowSeconds: number,
) {
    const windowMilliseconds = windowSeconds * 1000;
    const startMilliseconds =
        Math.floor(now.getTime() / windowMilliseconds) *
        windowMilliseconds;

    return {
        windowStart: new Date(startMilliseconds),
        expiresAt: new Date(
            startMilliseconds + windowMilliseconds,
        ),
    };
}

export async function consumeRateLimit({
    key,
    limit,
    windowSeconds,
}: RateLimitInput): Promise<RateLimitResult> {
    const now = new Date();
    const { windowStart, expiresAt } = currentWindow(
        now,
        windowSeconds,
    );

    const bucket = await prisma.retentionAuditRateLimit.upsert({
        where: {
            key_windowStart: {
                key,
                windowStart,
            },
        },
        create: {
            key,
            windowStart,
            expiresAt,
            count: 1,
        },
        update: {
            count: {
                increment: 1,
            },
            expiresAt,
        },
        select: {
            count: true,
            expiresAt: true,
        },
    });

    const retryAfterSeconds = Math.max(
        1,
        Math.ceil(
            (bucket.expiresAt.getTime() - now.getTime()) /
            1000,
        ),
    );

    return {
        allowed: bucket.count <= limit,
        remaining: Math.max(0, limit - bucket.count),
        retryAfterSeconds,
    };
}

export async function deleteExpiredRateLimits() {
    return prisma.retentionAuditRateLimit.deleteMany({
        where: {
            expiresAt: {
                lte: new Date(),
            },
        },
    });
}
