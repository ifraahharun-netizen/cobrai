"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase.client";
import styles from "./onboarding.module.css";

const auth = getFirebaseAuth();
const db = getFirebaseDb();

export default function DomainSetupCard() {
    const router = useRouter();

    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [shouldShow, setShouldShow] = useState(false);
    const [domainStatus, setDomainStatus] = useState<string | null>(null);

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (currentUser) => {
            setUser(currentUser);

            if (!currentUser) {
                setLoading(false);
                return;
            }

            try {
                const userSnap = await getDoc(doc(db, "users", currentUser.uid));
                const userData = userSnap.exists() ? userSnap.data() : {};

                const firstRunCompleted =
                    userData?.onboarding?.firstRunCompleted === true;

                const integrationSnap = await getDoc(
                    doc(db, "users", currentUser.uid, "integrations", "main")
                );

                const integrationData = integrationSnap.exists()
                    ? integrationSnap.data()
                    : {};

                const hasStripe =
                    integrationData?.stripe?.connected === true ||
                    integrationData?.stripeConnected === true ||
                    Boolean(integrationData?.stripeAccountId);

                const hasHubSpot =
                    integrationData?.hubspot?.connected === true ||
                    integrationData?.hubspotConnected === true ||
                    Boolean(integrationData?.hubspotAccessToken);

                const hasIntegration = hasStripe || hasHubSpot;

                if (!firstRunCompleted || !hasIntegration) {
                    setShouldShow(false);
                    setLoading(false);
                    return;
                }

                const token = await currentUser.getIdToken();

                const res = await fetch("/api/email/domain/settings", {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                    cache: "no-store",
                });

                if (!res.ok) {
                    setShouldShow(true);
                    setLoading(false);
                    return;
                }

                const data = await res.json();

                const status =
                    data?.sendingDomainStatus ||
                    data?.domainStatus ||
                    data?.status ||
                    null;

                setDomainStatus(status);

                setShouldShow(status !== "verified");
            } catch (error) {
                console.error("Failed to load domain setup state:", error);
                setShouldShow(false);
            } finally {
                setLoading(false);
            }
        });

        return () => unsub();
    }, []);

    if (loading || !user || !shouldShow) return null;

    return (
        <div className={styles.domainCard}>
            <div>
                <p className={styles.domainEyebrow}>Next setup step</p>

                <h3 className={styles.domainTitle}>Set up your sending domain</h3>

                <p className={styles.domainText}>
                    Verify your domain with Resend so Cobrai can send retention emails
                    from your own business address.
                </p>

                {domainStatus && domainStatus !== "verified" ? (
                    <p className={styles.domainStatus}>
                        Current status: <span>{domainStatus}</span>
                    </p>
                ) : null}
            </div>

            <div className={styles.domainActions}>
                <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={() =>
                        router.push(
                            "/dashboard/settings?tab=Support%20%26%20Compliance"
                        )
                    }
                >
                    Set up domain
                </button>

                <button
                    type="button"
                    className={styles.lightButton}
                    onClick={() => setShouldShow(false)}
                >
                    Do later
                </button>
            </div>
        </div>
    );
}