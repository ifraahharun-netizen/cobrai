"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus_Jakarta_Sans } from "next/font/google";
import { onAuthStateChanged, type User } from "firebase/auth";

import { getFirebaseAuth } from "@/lib/firebase.client";
import Sidebar from "./_components/Sidebar";
import FirstRunModal from "./onboarding/FirstRunModal";
import styles from "./dashboardLayout.module.css";

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

        const unsub = onAuthStateChanged(auth, (u) => {
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
                }, 1200);

                return;
            }

            setUser(u);

            void u
                .getIdToken()
                .then((token) =>
                    fetch("/api/onboard", {
                        method: "POST",
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                    })
                )
                .catch((e) => {
                    console.error("Onboarding failed:", e);
                });
        });

        return () => {
            if (logoutTimer.current) {
                clearTimeout(logoutTimer.current);
                logoutTimer.current = null;
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