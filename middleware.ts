import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED_APP_PREFIXES = ["/dashboard"];

const PROTECTED_API_PREFIXES = [
    "/api/dashboard",
    "/api/automation",
    "/api/progress",
    "/api/email",
];

const PUBLIC_API_PREFIXES = [
    "/api/auth",
    "/api/stripe/webhook",
    "/api/integrations/hubspot/connect",
    "/api/integrations/hubspot/callback",
];

function startsWithAny(pathname: string, prefixes: string[]) {
    return prefixes.some((prefix) => pathname.startsWith(prefix));
}

export function middleware(req: NextRequest) {
    const { pathname } = req.nextUrl;

    if (startsWithAny(pathname, PUBLIC_API_PREFIXES)) {
        return NextResponse.next();
    }

    const isProtectedApp = startsWithAny(pathname, PROTECTED_APP_PREFIXES);
    const isProtectedApi = startsWithAny(pathname, PROTECTED_API_PREFIXES);

    if (!isProtectedApp && !isProtectedApi) {
        return NextResponse.next();
    }

    const authHeader = req.headers.get("authorization") ?? "";
    const hasBearerToken = authHeader.startsWith("Bearer ");
    const hasSessionCookie = Boolean(req.cookies.get("session")?.value);

    if (pathname.startsWith("/api")) {
        if (!hasBearerToken && !hasSessionCookie) {
            return NextResponse.json(
                { ok: false, error: "Unauthorized" },
                { status: 401 }
            );
        }

        return NextResponse.next();
    }

    if (!hasSessionCookie) {
        const loginUrl = new URL("/login", req.url);
        loginUrl.searchParams.set("next", pathname);
        return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        "/dashboard/:path*",
        "/api/dashboard/:path*",
        "/api/automation/:path*",
        "/api/progress/:path*",
        "/api/email/:path*",
        "/api/auth/:path*",
        "/api/stripe/webhook",
        "/api/integrations/hubspot/connect",
        "/api/integrations/hubspot/callback",
    ],
};