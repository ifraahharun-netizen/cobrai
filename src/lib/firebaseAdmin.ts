import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { env } from "@/lib/env";

function initAdmin() {
    if (getApps().length) {
        return;
    }

    const projectId = env.FIREBASE_PROJECT_ID;
    const clientEmail = env.FIREBASE_CLIENT_EMAIL;

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

export function getAdminAuth() {
    initAdmin();
    return getAuth();
}

export function getAdminDb() {
    initAdmin();
    return getFirestore();
}

export async function verifyFirebaseIdToken(idToken: string) {
    initAdmin();
    return getAuth().verifyIdToken(idToken, true);
}