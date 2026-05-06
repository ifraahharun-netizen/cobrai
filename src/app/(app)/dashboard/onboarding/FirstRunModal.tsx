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

    const hasIntegration = useMemo(
        () => integrations.stripeConnected || integrations.hubspotConnected,
        [integrations]
    );

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (currentUser) => {
            setUser(currentUser);

            if (!currentUser) {
                setLoading(false);
                return;
            }

            try {
                const integrationSnap = await getDoc(
                    doc(db, "users", currentUser.uid, "integrations", "main")
                );

                const integrationData = integrationSnap.exists()
                    ? integrationSnap.data()
                    : {};

                const stripeConnected =
                    integrationData?.stripe?.connected === true ||
                    integrationData?.stripeConnected === true ||
                    Boolean(integrationData?.stripeAccountId);

                const hubspotConnected =
                    integrationData?.hubspot?.connected === true ||
                    integrationData?.hubspotConnected === true ||
                    Boolean(integrationData?.hubspotAccessToken);

                setIntegrations({ stripeConnected, hubspotConnected });
            } catch (error) {
                console.error("Failed to load onboarding state:", error);
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

        await markFirstRunCompleted({ selectedSetupStep: "stripe" });

        window.location.href = `/api/integrations/stripe/connect?uid=${encodeURIComponent(
            user.uid
        )}`;
    }

    async function connectHubSpot() {
        if (!user) return;

        await markFirstRunCompleted({ selectedSetupStep: "hubspot" });

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
        } finally {
            setSaving(false);
        }
    }

    async function skipForNow() {
        if (!user) return;

        setSaving(true);

        try {
            await markFirstRunCompleted({ selectedSetupStep: "skipped" });
            setShowModal(false);
        } finally {
            setSaving(false);
        }
    }

    if (loading || hasIntegration) return null;

    return (
        <>
            <button
                type="button"
                className={styles.inlineOnboardingCard}
                onClick={() => setShowModal(true)}
            >
                <span className={styles.inlineIconGroup}>
                    <span className={styles.inlineIcon}>
                        <SiStripe size={16} color="#635BFF" />
                    </span>
                    <span className={styles.inlineIcon}>
                        <SiHubspot size={15} color="#FF7A59" />
                    </span>
                </span>

                <span>
                    <strong>Connect your tools</strong>
                    <small>Start finding risky customers and protecting revenue.</small>
                </span>

                <b>Set up</b>
            </button>

            {showModal ? (
                <div className={styles.modalOverlay}>
                    <div className={styles.modalCard}>
                        <div className={styles.modalBadge}>First step</div>

                        <h2 className={styles.modalTitle}>
                            Connect your tools now to start protecting revenue
                        </h2>

                        <p className={styles.modalText}>
                            Cobrai needs your customer and payment data to identify churn
                            risk, failed payments, revenue leaks, and the accounts that need
                            action today.
                        </p>

                        <div className={styles.integrationGrid}>
                            <button
                                type="button"
                                className={styles.integrationOption}
                                onClick={connectStripe}
                                disabled={saving}
                            >
                                <span className={styles.integrationIcon}>
                                    <SiStripe size={25} color="#635BFF" />
                                </span>

                                <span className={styles.integrationCopy}>
                                    <strong>Stripe</strong>
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
                                    <SiHubspot size={24} color="#FF7A59" />
                                </span>

                                <span className={styles.integrationCopy}>
                                    <strong>HubSpot</strong>
                                    <small>Sync customer activity, CRM signals and lifecycle data.</small>
                                </span>

                                <span className={styles.integrationCta}>Connect</span>
                            </button>
                        </div>

                        <p className={styles.urgentNote}>
                            The sooner you connect your tools, the faster Cobrai can show
                            which customers are most likely to cancel.
                        </p>

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
            ) : null}
        </>
    );
}