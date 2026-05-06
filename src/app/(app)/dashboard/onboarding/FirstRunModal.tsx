"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { SiHubspot, SiStripe, SiResend } from "react-icons/si";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase.client";
import styles from "./onboarding.module.css";

const auth = getFirebaseAuth();
const db = getFirebaseDb();

type IntegrationState = {
    stripeConnected: boolean;
    hubspotConnected: boolean;
};

export default function FirstRunModal() {
    const router = useRouter();

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

                setIntegrations({
                    stripeConnected,
                    hubspotConnected,
                });
            } catch (error) {
                console.error("Failed to load onboarding integrations:", error);
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

    async function connectResend() {
        await markFirstRunCompleted({ selectedSetupStep: "resend" });
        setShowModal(false);

        router.push("/dashboard/settings?tab=Support%20%26%20Compliance&section=automated-emails");
    }

    async function skipForNow() {
        if (!user) {
            setShowModal(false);
            return;
        }

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

    if (loading || hasIntegration) return null;

    return (
        <>
            <button
                type="button"
                className={styles.floatingOnboardingCard}
                onClick={() => setShowModal(true)}
            >
                <span className={styles.inlineIconGroup}>
                    <span className={styles.inlineIcon}>
                        <SiStripe size={16} color="#635BFF" />
                    </span>

                    <span className={styles.inlineIcon}>
                        <SiHubspot size={15} color="#FF7A59" />
                    </span>

                    <span className={styles.inlineIcon}>
                        <SiResend size={15} color="#000000" />
                    </span>
                </span>

                <span>
                    <strong>Connect your tools</strong>
                    <small>Unlock live churn risk, revenue protection and email actions.</small>
                </span>

                <b>Set up</b>
            </button>

            {showModal ? (
                <div className={styles.modalOverlay}>
                    <div className={styles.modalCard}>
                        <button
                            type="button"
                            className={styles.closeButton}
                            onClick={() => setShowModal(false)}
                        >
                            ×
                        </button>

                        <div className={styles.modalBadge}>Quick setup</div>

                        <h2 className={styles.modalTitle}>
                            Connect your tools to start protecting revenue
                        </h2>

                        <p className={styles.modalText}>
                            Cobrai needs your payment, CRM and sending setup to detect churn
                            risk, recover failed payments and send retention emails from your
                            own domain.
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

                            <button
                                type="button"
                                className={styles.integrationOption}
                                onClick={connectResend}
                                disabled={saving}
                            >
                                <span className={styles.integrationIcon}>
                                    <SiResend size={24} color="#000000" />
                                </span>

                                <span className={styles.integrationCopy}>
                                    <strong>Resend domain</strong>
                                    <small>Verify your domain to send retention emails.</small>
                                </span>

                                <span className={styles.integrationCta}>Set up</span>
                            </button>
                        </div>

                        <p className={styles.urgentNote}>
                            Until your tools are connected, Cobrai can only show demo insights.
                            Connect now to unlock real customer risk and revenue protection.
                        </p>

                        <button
                            type="button"
                            className={styles.skipButton}
                            onClick={skipForNow}
                            disabled={saving}
                        >
                            Not now
                        </button>
                    </div>
                </div>
            ) : null}
        </>
    );
}