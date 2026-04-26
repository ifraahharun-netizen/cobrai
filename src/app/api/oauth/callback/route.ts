import { NextRequest, NextResponse } from "next/server";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { prisma } from "@/lib/prisma";
import { syncHubSpotWorkspace } from "@/lib/hubspot/sync";

export const dynamic = "force-dynamic";

function getAdminDb() {
    if (!getApps().length) {
        const projectId = process.env.FIREBASE_PROJECT_ID;
        const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

        const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY_B64
            ? Buffer.from(process.env.FIREBASE_PRIVATE_KEY_B64, "base64").toString("utf8")
            : process.env.FIREBASE_PRIVATE_KEY;

        const privateKey = privateKeyRaw?.replace(/\\n/g, "\n");

        if (!projectId || !clientEmail || !privateKey) {
            throw new Error("Missing Firebase Admin environment variables.");
        }

        initializeApp({
            credential: cert({
                projectId,
                clientEmail,
                privateKey,
            }),
        });
    }

    return getFirestore();
}

function getAppBaseUrl(req: NextRequest) {
    const envUrl =
        process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "";

    if (envUrl) {
        return envUrl.replace(/\/$/, "");
    }

    return req.nextUrl.origin.replace(/\/$/, "");
}

export async function GET(req: NextRequest) {
    console.log("=== HUBSPOT CALLBACK ROUTE RUNNING ===");

    const code = req.nextUrl.searchParams.get("code");
    const state = req.nextUrl.searchParams.get("state");
    const error = req.nextUrl.searchParams.get("error");
    const errorDescription = req.nextUrl.searchParams.get("error_description");

    const cookieUid = req.cookies.get("hubspot_uid")?.value || "";
    const uid = cookieUid || state || "";

    const appBaseUrl = getAppBaseUrl(req);

    if (error) {
        return NextResponse.redirect(
            new URL(
                `/dashboard/settings?error=hubspot_oauth_error&message=${encodeURIComponent(
                    errorDescription || error
                )}`,
                appBaseUrl
            )
        );
    }

    if (!code) {
        return NextResponse.redirect(
            new URL("/dashboard/settings?error=no_code", appBaseUrl)
        );
    }

    if (!uid) {
        return NextResponse.redirect(
            new URL("/dashboard/settings?error=missing_uid", appBaseUrl)
        );
    }

    const clientId = process.env.HUBSPOT_CLIENT_ID;
    const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;
    const redirectUri =
        process.env.HUBSPOT_REDIRECT_URI ||
        `${appBaseUrl}/api/integrations/hubspot/callback`;

    if (!clientId || !clientSecret) {
        return NextResponse.redirect(
            new URL("/dashboard/settings?error=missing_hubspot_env", appBaseUrl)
        );
    }

    try {
        const res = await fetch("https://api.hubapi.com/oauth/v1/token", {
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

        const data = await res.json();

        if (!res.ok) {
            console.error("[HubSpot Callback] token exchange failed:", data);

            return NextResponse.redirect(
                new URL("/dashboard/settings?error=oauth_failed", appBaseUrl)
            );
        }

        const db = getAdminDb();

        await db
            .collection("users")
            .doc(uid)
            .collection("integrations")
            .doc("main")
            .set(
                {
                    hubspot: {
                        connected: true,
                        accountName: data?.hub_id
                            ? `Hub ID ${data.hub_id}`
                            : "HubSpot Connected",
                        hubId: data?.hub_id || null,
                        accessToken: data?.access_token || "",
                        refreshToken: data?.refresh_token || "",
                        scope:
                            Array.isArray(data?.scopes)
                                ? data.scopes.join(" ")
                                : typeof data?.scope === "string"
                                    ? data.scope
                                    : "",
                        connectedAt: new Date().toISOString(),
                    },
                },
                { merge: true }
            );

        const user = await prisma.user.findUnique({
            where: { firebaseUid: uid },
            select: { workspaceId: true },
        });

        if (!user?.workspaceId) {
            return NextResponse.redirect(
                new URL("/dashboard/settings?error=no_workspace", appBaseUrl)
            );
        }

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
                accessTokenEnc: data?.access_token || "",
                refreshTokenEnc: data?.refresh_token || "",
                externalAccountId: data?.hub_id ? String(data.hub_id) : null,
                metadata: {
                    scope:
                        Array.isArray(data?.scopes)
                            ? data.scopes.join(" ")
                            : typeof data?.scope === "string"
                                ? data.scope
                                : "",
                    connectedAt: new Date().toISOString(),
                },
                lastSyncedAt: null,
                lastSyncError: null,
            },
            update: {
                status: "connected",
                accessTokenEnc: data?.access_token || "",
                refreshTokenEnc: data?.refresh_token || "",
                externalAccountId: data?.hub_id ? String(data.hub_id) : null,
                metadata: {
                    scope:
                        Array.isArray(data?.scopes)
                            ? data.scopes.join(" ")
                            : typeof data?.scope === "string"
                                ? data.scope
                                : "",
                    connectedAt: new Date().toISOString(),
                },
                lastSyncError: null,
            },
        });

        try {
            const syncResult = await syncHubSpotWorkspace({
                workspaceId: user.workspaceId,
                accessToken: data?.access_token || "",
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
                        scope:
                            Array.isArray(data?.scopes)
                                ? data.scopes.join(" ")
                                : typeof data?.scope === "string"
                                    ? data.scope
                                    : "",
                        connectedAt: new Date().toISOString(),
                        lastSyncSummary: syncResult,
                    },
                },
            });
        } catch (syncError: any) {
            console.error("[HubSpot Callback] sync error:", syncError);

            await prisma.integration.update({
                where: {
                    workspaceId_provider: {
                        workspaceId: user.workspaceId,
                        provider: "hubspot",
                    },
                },
                data: {
                    lastSyncError: syncError?.message || "HubSpot sync failed",
                },
            });
        }

        const response = NextResponse.redirect(
            new URL("/dashboard/settings?hubspot=connected", appBaseUrl)
        );

        response.cookies.set("hubspot_uid", "", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: 0,
        });

        return response;
    } catch (error) {
        console.error("[HubSpot Callback] error:", error);

        return NextResponse.redirect(
            new URL("/dashboard/settings?error=server_error", appBaseUrl)
        );
    }
}