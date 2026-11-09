"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus_Jakarta_Sans } from "next/font/google";
import { onAuthStateChanged, type User } from "firebase/auth";

import { getFirebaseAuth } from "@/lib/firebase.client";
import Sidebar from "./_components/Sidebar";
import TrialUpgradeGate, {
    type TrialStatus,
} from "./_components/TrialUpgradeGate";
import FirstRunModal from "./onboarding/FirstRunModal";
import styles from "./dashboardLayout.module.css";

const jakarta = Plus_Jakarta_Sans({
    subsets: ["latin"],
    weight: ["400", "500", "600", "700"],
    display: "swap",
});

// The expired-trial "AI Retention Report" paywall is switched off for now.
// Set this back to true to lock the dashboard again when a trial ends.
const TRIAL_GATE_ENABLED = false;

type TrialStatusSuccessResponse =TrialStatus & {
    ok: true;
};

type TrialStatusErrorResponse = {
    ok: false;
    error?: string;
};

type TrialStatusResponse =
    | TrialStatusSuccessResponse
    | TrialStatusErrorResponse;

const SIDEBAR_COLLAPSED_KEY = "cobrai:sidebar-collapsed";

export default function DashboardLayout({
    children,
}: {
    children: ReactNode;
}) {
    const router = useRouter();
    const logoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [authChecked, setAuthChecked] = useState(false);
    const [user, setUser] = useState<User | null>(null);
    const [trialStatus, setTrialStatus] = useState<TrialStatus | null>(null);
    const [trialChecked, setTrialChecked] = useState(false);
    const [trialError, setTrialError] = useState("");
    // Folded sidebar is remembered in this browser.
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
        if (typeof window === "undefined") return false;
        try {
            return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
        } catch {
            return false;
        }
    });

    const toggleSidebar = () => {
        setSidebarCollapsed((collapsed) => {
            const next = !collapsed;
            try {
                window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
            } catch {
                // Not critical.
            }
            return next;
        });
    };

    useEffect(() => {
        const auth = getFirebaseAuth();

        const unsub = onAuthStateChanged(auth, (currentUser) => {
            setAuthChecked(true);

            if (logoutTimer.current) {
                clearTimeout(logoutTimer.current);
                logoutTimer.current = null;
            }

            if (!currentUser) {
                setTrialStatus(null);
                setTrialChecked(false);

                logoutTimer.current = setTimeout(() => {
                    if (!auth.currentUser) {
                        setUser(null);
                        router.replace("/login");
                    }
                }, 1200);

                return;
            }

            setUser(currentUser);
        });

        return () => {
            if (logoutTimer.current) {
                clearTimeout(logoutTimer.current);
                logoutTimer.current = null;
            }

            unsub();
        };
    }, [router]);

    useEffect(() => {
        if (!user) return;

        const authenticatedUser = user;
        let cancelled = false;

        async function initialiseWorkspaceAndTrial() {
            setTrialChecked(false);
            setTrialError("");

            try {
                const token = await authenticatedUser.getIdToken();

                const onboardResponse = await fetch("/api/onboard", {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                    cache: "no-store",
                });

                if (!onboardResponse.ok) {
                    const onboardData = (await onboardResponse
                        .json()
                        .catch(() => null)) as
                        | {
                            error?: string;
                        }
                        | null;

                    throw new Error(
                        onboardData?.error ||
                        "Unable to initialise your workspace."
                    );
                }

                const trialResponse = await fetch(
                    "/api/billing/trial-status",
                    {
                        method: "GET",
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                        cache: "no-store",
                    }
                );

                const trialData = (await trialResponse
                    .json()
                    .catch(() => null)) as TrialStatusResponse | null;

                if (!trialResponse.ok || !trialData) {
                    throw new Error(
                        "Unable to verify your trial status."
                    );
                }

                if (!trialData.ok) {
                    throw new Error(
                        trialData.error ||
                        "Unable to verify your trial status."
                    );
                }

                if (!cancelled) {
                    const { ok: _ok, ...status } = trialData;
                    setTrialStatus(status);
                }
            } catch (error) {
                console.error(
                    "Dashboard initialisation failed:",
                    error
                );

                if (!cancelled) {
                    setTrialError(
                        error instanceof Error
                            ? error.message
                            : "Unable to load your workspace."
                    );
                }
            } finally {
                if (!cancelled) {
                    setTrialChecked(true);
                }
            }
        }

        void initialiseWorkspaceAndTrial();

        return () => {
            cancelled = true;
        };
    }, [user]);

    if (!authChecked) {
        return (
            <div
                className={`${styles.loadingScreen} ${jakarta.className}`}
            >
                Loading Cobrai...
            </div>
        );
    }

    if (!user) {
        return (
            <div
                className={`${styles.loadingScreen} ${jakarta.className}`}
            >
                Restoring session...
            </div>
        );
    }

    if (!trialChecked) {
        return (
            <div
                className={`${styles.loadingScreen} ${jakarta.className}`}
            >
                Preparing your workspace...
            </div>
        );
    }

    if (trialError || !trialStatus) {
        return (
            <div
                className={`${styles.loadingScreen} ${jakarta.className}`}
            >
                <div>
                    <p>
                        {trialError ||
                            "Unable to load your workspace."}
                    </p>

                    <button
                        type="button"
                        onClick={() => window.location.reload()}
                    >
                        Try again
                    </button>
                </div>
            </div>
        );
    }

    const dashboardLocked =
        TRIAL_GATE_ENABLED &&
        trialStatus.trialExpired &&
        !trialStatus.hasActiveSubscription;

    return (
        <div className={`${styles.shell} ${jakarta.className}`}>
            <div
                aria-hidden={dashboardLocked}
                inert={dashboardLocked ? true : undefined}
                style={{
                    display: "contents",
                    pointerEvents: dashboardLocked
                        ? "none"
                        : undefined,
                    userSelect: dashboardLocked
                        ? "none"
                        : undefined,
                }}
            >
                <aside
                    className={`${styles.sidebarWrap} ${sidebarCollapsed ? styles.sidebarWrapCollapsed : ""}`}
                >
                    <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
                </aside>

                <main className={styles.main}>{children}</main>

                {!dashboardLocked ? <FirstRunModal /> : null}
            </div>

            {TRIAL_GATE_ENABLED ? (
                <TrialUpgradeGate
                    user={user}
                    status={trialStatus}
                />
            ) : null}
        </div>
    );
}