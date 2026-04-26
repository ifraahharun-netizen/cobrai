import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED_APP_PREFIXES = ["/dashboard"];
const PROTECTED_API_PREFIXES = [
    "/api/dashboard",
    "/api/automation",
    "/api/progress",
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

    if (
        pathname.startsWith("/_next") ||
        pathname.startsWith("/favicon") ||
        pathname.startsWith("/public")
    ) {
        return NextResponse.next();
    }

    const authHeader = req.headers.get("authorization");
    const hasBearerToken = !!authHeader?.startsWith("Bearer ");

    // For API routes, require Authorization header early.
    if (pathname.startsWith("/api")) {
        if (!hasBearerToken) {
            return NextResponse.json(
                { ok: false, error: "Unauthorized" },
                { status: 401 }
            );
        }

        return NextResponse.next();
    }

    // For app routes, let the client-side auth flow handle redirect.
    return NextResponse.next();
}

export const config = {
    matcher: ["/dashboard/:path*", "/api/dashboard/:path*", "/api/automation/:path*", "/api/progress"],
};