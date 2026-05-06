"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./dashboardLayout.module.css";
import Sidebar from "./_components/Sidebar";
import FirstRunModal from "./onboarding/FirstRunModal";

import { Plus_Jakarta_Sans } from "next/font/google";
import { getFirebaseAuth } from "@/lib/firebase.client";
import { onAuthStateChanged, type User } from "firebase/auth";

const jakarta = Plus_Jakarta_Sans({
    subsets: ["latin"],
    weight: ["400", "500", "600", "700"],
    display: "swap",
});

export default function DashboardLayout({ children }: { children: ReactNode }) {
    const router = useRouter();
    const logoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [authChecked, setAuthChecked] = useState(false);
    const [user, setUser] = useState<User | null>(null);

    useEffect(() => {
        const auth = getFirebaseAuth();

        const unsub = onAuthStateChanged(auth, async (u) => {
            setAuthChecked(true);

            if (logoutTimer.current) {
                clearTimeout(logoutTimer.current);
                logoutTimer.current = null;
            }

            if (!u) {
                logoutTimer.current = setTimeout(() => {
                    if (!auth.currentUser) {
                        setUser(null);
                        router.replace("/login");
                    }
                }, 2000);

                return;
            }

            setUser(u);

            try {
                const token = await u.getIdToken();

                await fetch("/api/onboard", {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });
            } catch (e) {
                console.error("Onboarding failed:", e);
            }
        });

        return () => {
            if (logoutTimer.current) {
                clearTimeout(logoutTimer.current);
            }

            unsub();
        };
    }, [router]);

    if (!authChecked) {
        return (
            <div className={`${styles.loadingScreen} ${jakarta.className}`}>
                Loading Cobrai...
            </div>
        );
    }

    if (!user) {
        return (
            <div className={`${styles.loadingScreen} ${jakarta.className}`}>
                Restoring session...
            </div>
        );
    }

    return (
        <div className={`${styles.shell} ${jakarta.className}`}>
            <aside className={styles.sidebarWrap}>
                <Sidebar />
            </aside>

            <main className={styles.main}>{children}</main>

            <FirstRunModal />
        </div>
    );
}