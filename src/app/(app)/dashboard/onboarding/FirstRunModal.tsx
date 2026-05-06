"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase.client";
import styles from "./onboarding.module.css";

const auth = getFirebaseAuth();
const db = getFirebaseDb();

type IntegrationState = {
    stripeConnected: boolean;
    hubspotConnected: boolean;
};

export default function FirstRunModal() {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [saving, setSaving] = useState(false);
    const [integrations, setIntegrations] = useState<IntegrationState>({
        stripeConnected: false,
        hubspotConnected: false,
    });

    const hasIntegration = useMemo(() => {
        return integrations.stripeConnected || integrations.hubspotConnected;
    }, [integrations]);

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (currentUser) => {
            setUser(currentUser);

            if (!currentUser) {
                setLoading(false);
                return;
            }

            try {
                const userRef = doc(db, "users", currentUser.uid);
                const onboardingSnap = await getDoc(userRef);

                const integrationRef = doc(
                    db,
                    "users",
                    currentUser.uid,
                    "integrations",
                    "main"
                );
                const integrationSnap = await getDoc(integrationRef);

                const userData = onboardingSnap.exists()
                    ? onboardingSnap.data()
                    : {};

                const integrationData = integrationSnap.exists()
                    ? integrationSnap.data()
                    : {};

                const firstRunCompleted =
                    userData?.onboarding?.firstRunCompleted === true;

                const stripeConnected =
                    integrationData?.stripe?.connected === true ||
                    integrationData?.stripeConnected === true ||
                    Boolean(integrationData?.stripeAccountId);

                const hubspotConnected =
                    integrationData?.hubspot?.connected === true ||
                    integrationData?.hubspotConnected === true ||
                    Boolean(integrationData?.hubspotAccessToken);

                setIntegrations({
                    stripeConnected,
                    hubspotConnected,
                });

                setShowModal(!firstRunCompleted && !stripeConnected && !hubspotConnected);
            } catch (error) {
                console.error("Failed to load onboarding state:", error);
                setShowModal(false);
            } finally {
                setLoading(false);
            }
        });

        return () => unsub();
    }, []);

    async function markFirstRunCompleted(extra?: Record<string, unknown>) {
        if (!user) return;

        await setDoc(
            doc(db, "users", user.uid),
            {
                onboarding: {
                    firstRunCompleted: true,
                    firstRunCompletedAt: serverTimestamp(),
                    ...extra,
                },
            },
            { merge: true }
        );
    }

    async function connectStripe() {
        if (!user) return;

        await markFirstRunCompleted({
            selectedSetupStep: "stripe",
        });

        window.location.href = `/api/integrations/stripe/connect?uid=${encodeURIComponent(
            user.uid
        )}`;
    }

    async function connectHubSpot() {
        if (!user) return;

        await markFirstRunCompleted({
            selectedSetupStep: "hubspot",
        });

        window.location.href = `/api/integrations/hubspot/connect?uid=${encodeURIComponent(
            user.uid
        )}`;
    }

    async function useDemoData() {
        if (!user) return;

        setSaving(true);

        try {
            await setDoc(
                doc(db, "users", user.uid),
                {
                    demoMode: true,
                    mode: "demo",
                    onboarding: {
                        firstRunCompleted: true,
                        firstRunCompletedAt: serverTimestamp(),
                        selectedSetupStep: "demo",
                    },
                },
                { merge: true }
            );

            setShowModal(false);
            window.location.reload();
        } catch (error) {
            console.error("Failed to enable demo mode:", error);
        } finally {
            setSaving(false);
        }
    }

    async function skipForNow() {
        if (!user) return;

        setSaving(true);

        try {
            await markFirstRunCompleted({
                selectedSetupStep: "skipped",
            });

            setShowModal(false);
        } catch (error) {
            console.error("Failed to skip onboarding:", error);
        } finally {
            setSaving(false);
        }
    }

    if (loading || !showModal || hasIntegration) return null;

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modalCard}>
                <div className={styles.modalBadge}>First step</div>

                <h2 className={styles.modalTitle}>
                    Let’s identify customers most likely to churn now
                </h2>

                <p className={styles.modalText}>
                    Connect your customer or payment data so Cobrai can detect risky
                    accounts, failed payments, and revenue leakage before customers leave.
                </p>

                <div className={styles.modalActions}>
                    <button
                        type="button"
                        className={styles.primaryButton}
                        onClick={connectStripe}
                        disabled={saving}
                    >
                        Connect Stripe
                    </button>

                    <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={connectHubSpot}
                        disabled={saving}
                    >
                        Connect HubSpot
                    </button>
                </div>

                <button
                    type="button"
                    className={styles.demoButton}
                    onClick={useDemoData}
                    disabled={saving}
                >
                    Use demo data for now
                </button>

                <button
                    type="button"
                    className={styles.skipButton}
                    onClick={skipForNow}
                    disabled={saving}
                >
                    Skip for now
                </button>
            </div>
        </div>
    );
}