// Sentry in the browser. Off until NEXT_PUBLIC_SENTRY_DSN is set.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
    // Errors are always sent; performance traces for 10% of page loads.
    tracesSampleRate: 0.1,
    // Privacy: no user info, cookies, headers, request/response bodies or URL
    // query params (password-reset and sign-in links carry tokens there).
    dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: false,
        httpBodies: [],
        urlQueryParams: false,
    },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
