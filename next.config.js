// next.config.js

const withBundleAnalyzer = require("@next/bundle-analyzer")({
    enabled: process.env.ANALYZE === "true",
});

const nextConfig = {
    reactStrictMode: true,
};

module.exports = withBundleAnalyzer(nextConfig);