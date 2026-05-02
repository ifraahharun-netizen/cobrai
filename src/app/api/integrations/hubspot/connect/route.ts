import { NextRequest, NextResponse } from "next/server";

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

export async function GET(req: NextRequest) {
    const uid = req.nextUrl.searchParams.get("uid");
    const appBaseUrl = getAppBaseUrl(req);

    if (!uid || uid.length > 128) {
        return safeRedirect(appBaseUrl, "/dashboard/settings?error=missing_uid");
    }

    const clientId = process.env.HUBSPOT_CLIENT_ID;

    if (!clientId) {
        console.error("Missing HUBSPOT_CLIENT_ID");
        return safeRedirect(appBaseUrl, "/dashboard/settings?error=hubspot_not_configured");
    }

    const redirectUri =
        process.env.HUBSPOT_REDIRECT_URI ||
        `${appBaseUrl}/api/integrations/hubspot/callback`;

    const scopes = [
        "oauth",
        "crm.objects.contacts.read",
        "crm.objects.contacts.write",
    ].join(" ");

    const state = crypto.randomUUID();

    const authUrl =
        `https://app.hubspot.com/oauth/authorize` +
        `?client_id=${encodeURIComponent(clientId)}` +
        `&scope=${encodeURIComponent(scopes)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&state=${encodeURIComponent(state)}`;

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

    return response;
}