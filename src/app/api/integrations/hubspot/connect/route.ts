import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getAppBaseUrl(req: NextRequest) {
    const envUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "";

    if (envUrl) {
        return envUrl.replace(/\/$/, "");
    }

    return req.nextUrl.origin.replace(/\/$/, "");
}

function safeRedirect(appBaseUrl: string, path: string) {
    return NextResponse.redirect(new URL(path, appBaseUrl));
}

function base64Url(buffer: Buffer) {
    return buffer
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");
}

function createCodeVerifier() {
    return base64Url(crypto.randomBytes(32));
}

function createCodeChallenge(verifier: string) {
    return base64Url(crypto.createHash("sha256").update(verifier).digest());
}

export async function GET(req: NextRequest) {
    const uid = req.nextUrl.searchParams.get("uid");
    const appBaseUrl = getAppBaseUrl(req);

    if (!uid || uid.length > 128) {
        return safeRedirect(appBaseUrl, "/dashboard/settings?error=missing_uid");
    }

    const clientId = process.env.HUBSPOT_CLIENT_ID;

    if (!clientId) {
        console.error("Missing HUBSPOT_CLIENT_ID");
        return safeRedirect(
            appBaseUrl,
            "/dashboard/settings?error=hubspot_not_configured"
        );
    }

    const redirectUri =
        process.env.HUBSPOT_REDIRECT_URI ||
        `${appBaseUrl}/api/integrations/hubspot/callback`;

    const state = crypto.randomUUID();

    const codeVerifier = createCodeVerifier();
    const codeChallenge = createCodeChallenge(codeVerifier);

    const scopes = "crm.objects.contacts.write oauth crm.objects.contacts.read";

    const authUrl =
        "https://app.hubspot.com/oauth/authorize" +
        `?client_id=${encodeURIComponent(clientId)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&state=${encodeURIComponent(state)}` +
        `&code_challenge=${encodeURIComponent(codeChallenge)}` +
        `&code_challenge_method=S256`;

    const response = NextResponse.redirect(authUrl);

    response.cookies.set("hubspot_uid", uid, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 10,
    });

    response.cookies.set("hubspot_oauth_state", state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 10,
    });

    response.cookies.set("hubspot_code_verifier", codeVerifier, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 10,
    });

    return response;
}