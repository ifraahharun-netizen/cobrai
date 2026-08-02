import { timingSafeEqual } from "node:crypto";

const LOCAL_HOSTS = new Set([
    "localhost",
    "127.0.0.1",
    "::1",
]);

function normaliseOrigin(value: string) {
    return value.trim().replace(/\/+$/, "");
}

function parseOrigin(value: string) {
    try {
        return new URL(value).origin;
    } catch {
        return null;
    }
}

function isLocalOrigin(origin: string) {
    try {
        const url = new URL(origin);
        return LOCAL_HOSTS.has(url.hostname);
    } catch {
        return false;
    }
}

function configuredApplicationUrl() {
    const configuredUrl =
        process.env.APP_URL ??
        process.env.NEXT_PUBLIC_APP_URL;

    if (!configuredUrl) {
        return null;
    }

    const normalised = normaliseOrigin(configuredUrl);
    const parsed = parseOrigin(normalised);

    if (!parsed) {
        throw new Error(
            "APP_URL must contain a valid absolute URL.",
        );
    }

    if (
        process.env.NODE_ENV === "production" &&
        !parsed.startsWith("https://")
    ) {
        throw new Error(
            "APP_URL must use HTTPS in production.",
        );
    }

    return parsed;
}

export function getApplicationUrl(request: Request) {
    const configured = configuredApplicationUrl();

    if (configured) {
        return configured;
    }

    const requestOrigin = new URL(request.url).origin;

    if (
        process.env.NODE_ENV === "production" &&
        !isLocalOrigin(requestOrigin)
    ) {
        throw new Error(
            "APP_URL must be configured in production.",
        );
    }

    return requestOrigin;
}

export function isTrustedMutationRequest(request: Request) {
    const method = request.method.toUpperCase();

    if (
        method === "GET" ||
        method === "HEAD" ||
        method === "OPTIONS"
    ) {
        return true;
    }

    const expectedOrigin = getApplicationUrl(request);

    const originHeader = request.headers.get("origin");

    if (originHeader) {
        const receivedOrigin = parseOrigin(originHeader);

        return receivedOrigin === expectedOrigin;
    }

    /*
     * Some clients omit Origin but provide Referer.
     */
    const refererHeader = request.headers.get("referer");

    if (refererHeader) {
        const receivedOrigin = parseOrigin(refererHeader);

        return receivedOrigin === expectedOrigin;
    }

    /*
     * Modern browsers normally include Origin for POST/PATCH requests.
     * Reject missing headers in production.
     */
    return process.env.NODE_ENV !== "production";
}

export function assertTrustedMutationRequest(request: Request) {
    if (!isTrustedMutationRequest(request)) {
        throw new Error("UNTRUSTED_ORIGIN");
    }
}

export function safelyCompareSecrets(
    received: string | null,
    expected: string | undefined,
) {
    if (!received || !expected) {
        return false;
    }

    const receivedBuffer = Buffer.from(received);
    const expectedBuffer = Buffer.from(expected);

    if (receivedBuffer.length !== expectedBuffer.length) {
        return false;
    }

    return timingSafeEqual(
        receivedBuffer,
        expectedBuffer,
    );
}

export function getRequestIp(request: Request) {
    const forwardedFor =
        request.headers.get("x-forwarded-for");

    if (forwardedFor) {
        return forwardedFor
            .split(",")[0]
            ?.trim()
            .slice(0, 100) || null;
    }

    return (
        request.headers
            .get("x-real-ip")
            ?.trim()
            .slice(0, 100) || null
    );
}

export function logAuditReviewError(input: {
    operation: string;
    auditId?: string;
    request: Request;
    error: unknown;
}) {
    const error =
        input.error instanceof Error
            ? {
                name: input.error.name,
                message: input.error.message,
                stack:
                    process.env.NODE_ENV === "development"
                        ? input.error.stack
                        : undefined,
            }
            : {
                name: "UnknownError",
                message: "An unknown error occurred.",
            };

    console.error("Retention audit review operation failed", {
        operation: input.operation,
        auditId: input.auditId,
        method: input.request.method,
        pathname: new URL(input.request.url).pathname,
        ipAddress: getRequestIp(input.request),
        error,
    });
}