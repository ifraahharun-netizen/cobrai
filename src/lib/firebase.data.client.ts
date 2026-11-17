"use client";

import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import { getFirebaseApp } from "@/lib/firebase.client";

// Firestore and Storage, kept apart from sign-in so only the pages that read
// or write data download them.

let dbInstance: Firestore | null = null;
let storageInstance: FirebaseStorage | null = null;

export function getFirebaseDb(): Firestore {
    if (dbInstance) return dbInstance;
    dbInstance = getFirestore(getFirebaseApp());
    return dbInstance;
}

export function getFirebaseStorage(): FirebaseStorage {
    if (storageInstance) return storageInstance;
    storageInstance = getStorage(getFirebaseApp());
    return storageInstance;
}
