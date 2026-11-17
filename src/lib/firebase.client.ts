"use client";

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
    getAuth,
    setPersistence,
    browserLocalPersistence,
    type Auth,
} from "firebase/auth";

// Sign-in only. Firestore and Storage live in firebase.data.client.ts so pages
// that just need the signed-in user (login, signup, most of the dashboard)
// don't download them.

type FirebaseInitResult =
    | { ok: true; auth: Auth }
    | { ok: false; error: string };

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let persistencePromise: Promise<void> | null = null;

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export function getFirebaseApp(): FirebaseApp {
    if (app) return app;

    if (!firebaseConfig.apiKey) {
        throw new Error("Missing Firebase API key");
    }

    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    return app;
}

export function getFirebaseAuth(): Auth {
    if (authInstance) return authInstance;

    authInstance = getAuth(getFirebaseApp());

    persistencePromise = setPersistence(
        authInstance,
        browserLocalPersistence
    ).catch((error) => {
        console.error("Firebase persistence failed:", error);
    });

    return authInstance;
}

export async function waitForFirebasePersistence() {
    getFirebaseAuth();

    if (persistencePromise) {
        await persistencePromise;
    }
}

export function getFirebaseAuthSafe(): FirebaseInitResult {
    try {
        return {
            ok: true,
            auth: getFirebaseAuth(),
        };
    } catch (e: any) {
        return {
            ok: false,
            error: e?.code || e?.message || "firebase-init-failed",
        };
    }
}