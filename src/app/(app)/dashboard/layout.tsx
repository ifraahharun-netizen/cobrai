"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import styles from "./dashboardLayout.module.css";
import Sidebar from "./_components/Sidebar";

import { Plus_Jakarta_Sans } from "next/font/google";

import { getFirebaseAuth } from "@/lib/firebase.client";
import { onAuthStateChanged } from "firebase/auth";

const jakarta = Plus_Jakarta_Sans({
    subsets: ["latin"],
    weight: ["400", "500", "600", "700"],
    display: "swap",
});

export default function DashboardLayout({ children }: { children: ReactNode }) {
    async function ensureWorkspace() {
        const auth = getFirebaseAuth();
        const user = auth.currentUser;
        if (!user) return;

        const token = await user.getIdToken(true);

        await fetch("/api/onboard", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });
    }

    useEffect(() => {
        const auth = getFirebaseAuth();

        const unsub = onAuthStateChanged(auth, async (u) => {
            if (!u) return;

            try {
                await ensureWorkspace();
            } catch (e) {
                console.error("Onboarding failed:", e);
            }
        });

        return () => unsub();
    }, []);

    return (
        <div className={`${styles.shell} ${jakarta.className}`}>
            <aside className={styles.sidebarWrap}>
                <Sidebar />
            </aside>

            <main className={styles.main}>{children}</main>
        </div>
    );
}