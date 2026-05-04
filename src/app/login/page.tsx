"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getFirebaseAuth } from "@/lib/firebase.client";
import { onAuthStateChanged } from "firebase/auth";

export default function LoginPage() {
    const router = useRouter();

    useEffect(() => {
        const auth = getFirebaseAuth();

        const unsub = onAuthStateChanged(auth, (user) => {
            if (user) {
                router.replace("/dashboard");
            }
        });

        return () => unsub();
    }, [router]);

    return (
        <div style={{ padding: 40 }}>
            <h2>Login</h2>
            <p>Please sign in to continue.</p>
        </div>
    );
}