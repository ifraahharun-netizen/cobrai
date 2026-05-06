"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { SiHubspot, SiStripe } from "react-icons/si";
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
                const userSnap = await getDoc(userRef);

                const integrationRef = doc(
                    db,
                    "users",
                    currentUser.uid,
                    "integrations",
                    "main"
                );
                const integrationSnap = await getDoc(integrationRef);

                const userData = userSnap.exists() ? userSnap.data() : {};
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
                <div className={styles.modalBadge}>Start here</div>

                <h2 className={styles.modalTitle}>
                    Find your highest-risk customers before they churn
                </h2>

                <p className={styles.modalText}>
                    Connect your customer data now so Cobrai can instantly detect churn
                    risk, failed payments, revenue leaks, and accounts that need action
                    today.
                </p>

                <div className={styles.integrationGrid}>
                    <button
                        type="button"
                        className={styles.integrationOption}
                        onClick={connectStripe}
                        disabled={saving}
                    >
                        <span className={styles.integrationIcon}>
                            <SiStripe size={24} />
                        </span>

                        <span className={styles.integrationCopy}>
                            <strong>Connect Stripe</strong>
                            <small>Sync subscriptions, invoices, payments and MRR.</small>
                        </span>

                        <span className={styles.integrationCta}>Connect</span>
                    </button>

                    <button
                        type="button"
                        className={styles.integrationOption}
                        onClick={connectHubSpot}
                        disabled={saving}
                    >
                        <span className={styles.integrationIcon}>
                            <SiHubspot size={23} />
                        </span>

                        <span className={styles.integrationCopy}>
                            <strong>Connect HubSpot</strong>
                            <small>Sync customer activity, lifecycle data and CRM signals.</small>
                        </span>

                        <span className={styles.integrationCta}>Connect</span>
                    </button>
                </div>

                <div className={styles.urgentNote}>
                    The sooner you connect data, the faster Cobrai can surface accounts
                    at risk of cancelling.
                </div>

                <button
                    type="button"
                    className={styles.demoButton}
                    onClick={useDemoData}
                    disabled={saving}
                >
                    Preview with demo data first
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