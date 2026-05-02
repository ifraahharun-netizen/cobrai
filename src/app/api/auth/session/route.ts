// src/app/api/auth/session/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAdminAuth } from "@/lib/firebaseAdmin";

export async function POST(req: Request) {
    try {
        const { idToken } = await req.json();

        if (!idToken || typeof idToken !== "string") {
            return NextResponse.json(
                { error: "Missing idToken" },
                { status: 400 }
            );
        }

        const auth = getAdminAuth();

        const decoded = await auth.verifyIdToken(idToken);

        const authTime = decoded.auth_time * 1000;
        const now = Date.now();

        if (now - authTime > 5 * 60 * 1000) {
            return NextResponse.json(
                { error: "Recent sign-in required" },
                { status: 401 }
            );
        }

        const expiresIn = 5 * 24 * 60 * 60 * 1000;

        const sessionCookie = await auth.createSessionCookie(idToken, {
            expiresIn,
        });

        (await cookies()).set("session", sessionCookie, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            path: "/",
            maxAge: expiresIn / 1000,
        });

        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error("SESSION ERROR:", err);

        return NextResponse.json(
            { error: "Failed to create session" },
            { status: 500 }
        );
    }
}