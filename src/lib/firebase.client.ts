"use client";

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

type FirebaseInitResult =
    | { ok: true; auth: Auth; db: Firestore; storage: FirebaseStorage }
    | { ok: false; error: string };

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;
let storageInstance: FirebaseStorage | null = null;

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

function initApp(): FirebaseApp {
    if (app) return app;
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    return app;
}

export function getFirebaseAuth(): Auth {
    if (authInstance) return authInstance;
    authInstance = getAuth(initApp());
    return authInstance;
}

export function getFirebaseDb(): Firestore {
    if (dbInstance) return dbInstance;
    dbInstance = getFirestore(initApp());
    return dbInstance;
}

export function getFirebaseStorage(): FirebaseStorage {
    if (storageInstance) return storageInstance;
    storageInstance = getStorage(initApp());
    return storageInstance;
}

export function getFirebaseAuthSafe(): FirebaseInitResult {
    try {
        if (!firebaseConfig.apiKey) {
            return { ok: false, error: "missing-firebase-api-key" };
        }

        return {
            ok: true,
            auth: getFirebaseAuth(),
            db: getFirebaseDb(),
            storage: getFirebaseStorage(),
        };
    } catch (e: any) {
        return { ok: false, error: e?.code || e?.message || "firebase-init-failed" };
    }
}

export const auth = getFirebaseAuth();
export const db = getFirebaseDb();
export const storage = getFirebaseStorage();