import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { encrypt } from "@/lib/crypto";
import { syncHubSpotWorkspace } from "@/lib/hubspot/sync";

export const dynamic = "force-dynamic";

function getAppBaseUrl(req: NextRequest): string {
    const envUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL;

    if (envUrl && typeof envUrl === "string") {
        return envUrl.replace(/\/$/, "");
    }

    return req.nextUrl.origin.replace(/\/$/, "");
}

function safeRedirect(appBaseUrl: string, path: string) {
    return NextResponse.redirect(new URL(path, appBaseUrl));
}

function getScope(data: any) {
    if (Array.isArray(data?.scopes)) return data.scopes.join(" ");
    if (typeof data?.scope === "string") return data.scope;
    return "";
}

function clearOAuthCookies(response: NextResponse) {
    response.cookies.set("hubspot_uid", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
    });

    response.cookies.set("hubspot_oauth_state", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
    });
}

export async function GET(req: NextRequest) {
    const code = req.nextUrl.searchParams.get("code");
    const state = req.nextUrl.searchParams.get("state");
    const error = req.nextUrl.searchParams.get("error");

    const cookieUid = req.cookies.get("hubspot_uid")?.value || "";
    const cookieState = req.cookies.get("hubspot_oauth_state")?.value || "";

    const appBaseUrl = getAppBaseUrl(req);

    if (error) {
        const response = safeRedirect(
            appBaseUrl,
            "/dashboard/settings?error=hubspot_oauth_error"
        );
        clearOAuthCookies(response);
        return response;
    }

    if (!code) {
        const response = safeRedirect(appBaseUrl, "/dashboard/settings?error=no_code");
        clearOAuthCookies(response);
        return response;
    }

    if (!cookieUid || !cookieState || !state || state !== cookieState) {
        const response = safeRedirect(
            appBaseUrl,
            "/dashboard/settings?error=invalid_oauth_state"
        );
        clearOAuthCookies(response);
        return response;
    }

    const clientId = process.env.HUBSPOT_CLIENT_ID;
    const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;
    const redirectUri =
        process.env.HUBSPOT_REDIRECT_URI ||
        `${appBaseUrl}/api/integrations/hubspot/callback`;

    if (!clientId || !clientSecret) {
        console.error("Missing HubSpot OAuth environment variables");

        const response = safeRedirect(
            appBaseUrl,
            "/dashboard/settings?error=hubspot_not_configured"
        );
        clearOAuthCookies(response);
        return response;
    }

    try {
        const tokenRes = await fetch("https://api.hubapi.com/oauth/v1/token", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
            },
            body: new URLSearchParams({
                grant_type: "authorization_code",
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri,
                code,
            }).toString(),
            cache: "no-store",
        });

        const data = await tokenRes.json();

        if (!tokenRes.ok) {
            console.error("[HubSpot Callback] token exchange failed:", {
                status: tokenRes.status,
                error: data?.error,
                message: data?.message,
            });

            const response = safeRedirect(
                appBaseUrl,
                "/dashboard/settings?error=oauth_failed"
            );
            clearOAuthCookies(response);
            return response;
        }

        const accessToken =
            typeof data?.access_token === "string" ? data.access_token : "";

        const refreshToken =
            typeof data?.refresh_token === "string" ? data.refresh_token : "";

        if (!accessToken || !refreshToken) {
            console.error("[HubSpot Callback] missing OAuth tokens");

            const response = safeRedirect(
                appBaseUrl,
                "/dashboard/settings?error=oauth_failed"
            );
            clearOAuthCookies(response);
            return response;
        }

        const user = await prisma.user.findUnique({
            where: { firebaseUid: cookieUid },
            select: { workspaceId: true },
        });

        if (!user?.workspaceId) {
            const response = safeRedirect(
                appBaseUrl,
                "/dashboard/settings?error=no_workspace"
            );
            clearOAuthCookies(response);
            return response;
        }

        const scope = getScope(data);
        const hubId = data?.hub_id ? String(data.hub_id) : null;
        const connectedAt = new Date().toISOString();

        const adminDb = getAdminDb();

        await adminDb
            .collection("users")
            .doc(cookieUid)
            .collection("integrations")
            .doc("main")
            .set(
                {
                    hubspot: {
                        connected: true,
                        accountName: hubId ? `Hub ID ${hubId}` : "HubSpot Connected",
                        hubId,
                        scope,
                        connectedAt,
                    },
                },
                { merge: true }
            );

        await prisma.integration.upsert({
            where: {
                workspaceId_provider: {
                    workspaceId: user.workspaceId,
                    provider: "hubspot",
                },
            },
            create: {
                workspaceId: user.workspaceId,
                provider: "hubspot",
                status: "connected",
                accessTokenEnc: encrypt(accessToken),
                refreshTokenEnc: encrypt(refreshToken),
                externalAccountId: hubId,
                metadata: {
                    scope,
                    connectedAt,
                },
                lastSyncedAt: null,
                lastSyncError: null,
            },
            update: {
                status: "connected",
                accessTokenEnc: encrypt(accessToken),
                refreshTokenEnc: encrypt(refreshToken),
                externalAccountId: hubId,
                metadata: {
                    scope,
                    connectedAt,
                },
                lastSyncError: null,
            },
        });

        try {
            const syncResult = await syncHubSpotWorkspace({
                workspaceId: user.workspaceId,
                accessToken,
            });

            await prisma.integration.update({
                where: {
                    workspaceId_provider: {
                        workspaceId: user.workspaceId,
                        provider: "hubspot",
                    },
                },
                data: {
                    lastSyncedAt: new Date(),
                    lastSyncError: null,
                    metadata: {
                        scope,
                        connectedAt,
                        lastSyncSummary: syncResult,
                    },
                },
            });
        } catch (syncError) {
            console.error("[HubSpot Callback] sync error:", syncError);

            await prisma.integration.update({
                where: {
                    workspaceId_provider: {
                        workspaceId: user.workspaceId,
                        provider: "hubspot",
                    },
                },
                data: {
                    lastSyncError: "HubSpot sync failed",
                },
            });
        }

        const response = safeRedirect(
            appBaseUrl,
            "/dashboard/settings?hubspot=connected"
        );

        clearOAuthCookies(response);
        return response;
    } catch (error) {
        console.error("[HubSpot Callback] error:", error);

        const response = safeRedirect(
            appBaseUrl,
            "/dashboard/settings?error=server_error"
        );

        clearOAuthCookies(response);
        return response;
    }
}