// src/lib/rateLimit.ts
//
// 10 requests per minute per key. Uses Upstash Redis when it's configured and
// reachable. If it isn't (no credentials, deleted database, network error),
// requests are still limited by an in-memory sliding window instead of being
// let through unchecked. The in-memory limit is per server instance, so it's
// a safety net, not a replacement for Upstash.

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const LIMIT = 10;
const WINDOW_MS = 60_000;

type LimitResult = {
    success: boolean;
    limit: number;
    remaining: number;
    reset: number;
};

const hasUpstash =
    Boolean(process.env.UPSTASH_REDIS_REST_URL) &&
    Boolean(process.env.UPSTASH_REDIS_REST_TOKEN);

const upstash = hasUpstash
    ? new Ratelimit({
        redis: new Redis({
            url: process.env.UPSTASH_REDIS_REST_URL!,
            token: process.env.UPSTASH_REDIS_REST_TOKEN!,
        }),
        limiter: Ratelimit.slidingWindow(LIMIT, "1 m"),
        analytics: true,
        prefix: "cobrai",
    })
    : null;

// After Upstash fails, skip it for a while instead of waiting on it every request.
const UPSTASH_RETRY_MS = 5 * 60_000;
let upstashDownUntil = 0;
let warned = false;

const hits = new Map<string, number[]>();

function limitInMemory(key: string, now = Date.now()): LimitResult {
    const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
    const success = recent.length < LIMIT;
    if (success) recent.push(now);
    hits.set(key, recent);

    // Keep the map from growing without bound.
    if (hits.size > 5000) {
        for (const [k, times] of hits) {
            if (!times.length || now - times[times.length - 1] >= WINDOW_MS) hits.delete(k);
        }
    }

    return {
        success,
        limit: LIMIT,
        remaining: Math.max(0, LIMIT - recent.length),
        reset: (recent[0] ?? now) + WINDOW_MS,
    };
}

async function limit(key: string): Promise<LimitResult> {
    if (upstash && Date.now() >= upstashDownUntil) {
        try {
            const result = await upstash.limit(key);
            return {
                success: result.success,
                limit: result.limit,
                remaining: result.remaining,
                reset: result.reset,
            };
        } catch (error) {
            upstashDownUntil = Date.now() + UPSTASH_RETRY_MS;
            if (!warned) {
                warned = true;
                console.warn(
                    "Upstash rate limiter unavailable; using the in-memory limit. Check UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.",
                    error instanceof Error ? error.message : error
                );
            }
        }
    }

    return limitInMemory(key);
}

export const ratelimit = { limit };
