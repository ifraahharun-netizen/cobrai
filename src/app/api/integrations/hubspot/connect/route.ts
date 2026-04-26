import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function getAppBaseUrl(req: NextRequest) {
    const envUrl =
        process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "";

    if (envUrl) {
        return envUrl.replace(/\/$/, "");
    }

    return req.nextUrl.origin.replace(/\/$/, "");
}

export async function GET(req: NextRequest) {
    const uid = req.nextUrl.searchParams.get("uid");

    console.log("=== HUBSPOT CONNECT ROUTE RUNNING ===");
    console.log("[HubSpot Connect] uid:", uid);

    if (!uid) {
        return NextResponse.redirect(
            new URL("/dashboard/settings?error=missing_uid", req.url)
        );
    }

    const clientId = process.env.HUBSPOT_CLIENT_ID;

    if (!clientId) {
        return NextResponse.redirect(
            new URL("/dashboard/settings?error=missing_client_id", req.url)
        );
    }

    const appBaseUrl = getAppBaseUrl(req);

    const redirectUri =
        process.env.HUBSPOT_REDIRECT_URI ||
        `${appBaseUrl}/api/integrations/hubspot/callback`;

    const scopes = [
        "oauth",
        "crm.objects.contacts.read",
        "crm.objects.contacts.write",
    ].join(" ");

    const authUrl =
        `https://app.hubspot.com/oauth/authorize` +
        `?client_id=${encodeURIComponent(clientId)}` +
        `&scope=${encodeURIComponent(scopes)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&state=${encodeURIComponent(uid)}`;

    console.log("[HubSpot Connect] redirectUri:", redirectUri);
    console.log("[HubSpot Connect] scopes:", scopes);
    console.log("[HubSpot Connect] authUrl:", authUrl);

    const response = NextResponse.redirect(authUrl);

    response.cookies.set("hubspot_uid", uid, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 10,
    });

    return response;
}