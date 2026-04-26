import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { env } from "@/lib/env";

let initialized = false;

function initAdmin() {
    if (initialized || getApps().length) {
        initialized = true;
        return;
    }

    const projectId = env.FIREBASE_PROJECT_ID;
    const clientEmail = env.FIREBASE_CLIENT_EMAIL;

    const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY_B64
        ? Buffer.from(process.env.FIREBASE_PRIVATE_KEY_B64, "base64").toString("utf8")
        : process.env.FIREBASE_PRIVATE_KEY;

    const privateKey = privateKeyRaw?.replace(/\\n/g, "\n");

    if (!privateKey) {
        throw new Error(
            "Missing Firebase Admin private key. Set FIREBASE_PRIVATE_KEY or FIREBASE_PRIVATE_KEY_B64."
        );
    }

    initializeApp({
        credential: cert({
            projectId,
            clientEmail,
            privateKey,
        }),
    });

    initialized = true;
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
    return getAuth().verifyIdToken(idToken);
}