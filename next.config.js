// next.config.js
// Next.js loads this file (a next.config.ts next to it would be ignored),
// so every setting lives here.

// Sentry 11 ships its build helper on a separate entry point.
const { withSentryConfig } = require("@sentry/nextjs/config");

const withBundleAnalyzer = require("@next/bundle-analyzer")({
    enabled: process.env.ANALYZE === "true",
});

/**
 * Enforced policy: only directives that cannot break the app. No other site
 * may frame it (clickjacking), no plugins, no <base> hijacking, and forms only
 * post back here.
 */
const contentSecurityPolicy = [
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
].join("; ");

/**
 * Sentry's CSP report endpoint, worked out from the DSN
 * (https://<key>@o<org>.ingest.<region>.sentry.io/<project>).
 */
function sentryCspReportUri() {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
    if (!dsn) return null;
    try {
        const url = new URL(dsn);
        const projectId = url.pathname.replace(/^\//, "");
        if (!url.username || !projectId) return null;
        return `${url.protocol}//${url.host}/api/${projectId}/security/?sentry_key=${url.username}`;
    } catch {
        return null;
    }
}

/**
 * Report-only policy: what the strict policy will be. The browser applies
 * nothing, it only reports what would have been blocked (to Sentry when a DSN
 * is set, otherwise to the browser console). Once the reports are clean,
 * switch it to Content-Security-Policy.
 *
 * Allowed sources are the services the app really uses: Firebase sign-in and
 * Firestore (*.googleapis.com), Google Fonts, Flaticon icons, Termly policy
 * embeds and Sentry. Stripe and HubSpot are full-page redirects, which a CSP
 * does not restrict. Inline scripts are still allowed because Next.js and the
 * Firebase config use them; removing that needs a nonce on every page.
 *
 * Known report before enforcing: Termly's embed-policy.min.js uses eval()
 * (Settings → Support & Compliance → Terms/Privacy). Either link to Termly's
 * hosted policy pages instead of embedding them, or add 'unsafe-eval'.
 */
const reportUri = sentryCspReportUri();
const strictPolicyReportOnly = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://app.termly.io",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn-uicons.flaticon.com",
    "font-src 'self' data: https://fonts.gstatic.com https://cdn-uicons.flaticon.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://*.googleapis.com https://*.ingest.sentry.io https://*.ingest.de.sentry.io https://*.ingest.us.sentry.io https://app.termly.io",
    "frame-src 'self' https://app.termly.io https://*.firebaseapp.com",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    ...(reportUri ? [`report-uri ${reportUri}`] : []),
].join("; ");

const securityHeaders = [
    // Browsers only ever use HTTPS for this site and its subdomains (2 years).
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
    { key: "Content-Security-Policy", value: contentSecurityPolicy },
    { key: "Content-Security-Policy-Report-Only", value: strictPolicyReportOnly },
    // Older browsers' version of frame-ancestors 'none'.
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
    // Isolates the window from other sites; still allows opening Stripe in a new tab.
    { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
];

const nextConfig = {
    reactStrictMode: true,
    // Don't advertise the framework in every response.
    poweredByHeader: false,

    async headers() {
        return [{ source: "/:path*", headers: securityHeaders }];
    },
};

module.exports = withSentryConfig(withBundleAnalyzer(nextConfig), {
    // Source maps upload only when these are set in Vercel, so stack traces in
    // Sentry show the original code. Without them Sentry still works.
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    silent: !process.env.CI,
    sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
    widenClientFileUpload: true,
    // Send browser events through this site so ad blockers don't drop them.
    tunnelRoute: "/monitoring",
});
