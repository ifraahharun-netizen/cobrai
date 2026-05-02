import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED_APP_PREFIXES = ["/dashboard"];

const PROTECTED_API_PREFIXES = [
    "/api/dashboard",
    "/api/automation",
    "/api/progress",
    "/api/email",
    "/api/stripe",
    "/api/integrations",
];

function isProtectedPath(pathname: string) {
    return [...PROTECTED_APP_PREFIXES, ...PROTECTED_API_PREFIXES].some((prefix) =>
        pathname.startsWith(prefix)
    );
}

export function middleware(req: NextRequest) {
    const { pathname } = req.nextUrl;

    if (!isProtectedPath(pathname)) {
        return NextResponse.next();
    }

    const authHeader = req.headers.get("authorization");
    const hasBearerToken = authHeader?.startsWith("Bearer ");

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
        "/api/stripe/:path*",
        "/api/integrations/:path*",
    ],
};