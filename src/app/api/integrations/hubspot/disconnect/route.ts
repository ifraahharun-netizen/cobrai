import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";

export async function POST(req: Request) {
    const { uid } = await req.json();

    if (!uid) {
        return NextResponse.json({ error: "Missing uid" }, { status: 400 });
    }

    const adminDb = getAdminDb();

    await adminDb.doc(`users/${uid}/integrations/main`).set(
        {
            hubspot: {
                connected: false,
                accountName: "",
                accessToken: "",
                connectedAt: null,
            },
            updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
    );

    return NextResponse.json({ ok: true });
}