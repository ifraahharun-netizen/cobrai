// next.config.js
// Next.js loads this file (a next.config.ts next to it would be ignored),
// so every setting lives here.

const withBundleAnalyzer = require("@next/bundle-analyzer")({
    enabled: process.env.ANALYZE === "true",
});

/**
 * Policy directives that cannot break the app: no other site may frame it
 * (clickjacking), no plugins, no <base> hijacking, and forms only post back
 * here. Scripts and connections are not restricted yet because the app loads
 * Firebase, Stripe and an inline config script; tightening those needs a
 * nonce-based policy and a test pass.
 */
const contentSecurityPolicy = [
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
    // Browsers only ever use HTTPS for this site and its subdomains (2 years).
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
    { key: "Content-Security-Policy", value: contentSecurityPolicy },
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

module.exports = withBundleAnalyzer(nextConfig);
