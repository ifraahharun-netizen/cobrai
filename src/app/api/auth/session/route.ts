// src/app/api/auth/session/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebaseAdmin";

export async function POST(req: Request) {
    try {
        const { idToken } = await req.json();

        if (!idToken) {
            return NextResponse.json({ error: "Missing idToken" }, { status: 400 });
        }

        const expiresIn = 5 * 24 * 60 * 60 * 1000; // 5 days (ms)
        const sessionCookie = await adminAuth().createSessionCookie(idToken, { expiresIn });

        (await cookies()).set("session", sessionCookie, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: expiresIn / 1000,
        });

        return NextResponse.json({ ok: true });
    } catch (err: any) {
        console.error("SESSION ERROR:", err);
        return NextResponse.json({ error: err?.message ?? "Session route crashed" }, { status: 500 });
    }
}



