import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

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

    const isProtectedApi = startsWithAny(pathname, PROTECTED_API_PREFIXES);

    if (!isProtectedApi) {
        return NextResponse.next();
    }

    const authHeader = req.headers.get("authorization") ?? "";
   const hasBearerToken = authHeader.toLowerCase().startsWith("bearer ");

if (!hasBearerToken) {
        return NextResponse.json(
            { ok: false, error: "Unauthorized" },
            { status: 401 }
        );
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
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