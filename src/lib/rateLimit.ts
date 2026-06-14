// src/lib/rateLimit.ts

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const hasUpstash =
    Boolean(process.env.UPSTASH_REDIS_REST_URL) &&
    Boolean(process.env.UPSTASH_REDIS_REST_TOKEN);

const redis = hasUpstash
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL!,
        token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
    : null;

export const ratelimit = hasUpstash
    ? new Ratelimit({
        redis: redis!,
        limiter: Ratelimit.slidingWindow(10, "1 m"),
        analytics: true,
        prefix: "cobrai",
    })
    : {
        async limit() {
            return {
                success: true,
                limit: 10,
                remaining: 10,
                reset: Date.now() + 60_000,
            };
        },
    };