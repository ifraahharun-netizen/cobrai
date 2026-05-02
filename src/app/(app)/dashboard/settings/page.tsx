"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import styles from "./settings.module.css";
import { SiHubspot, SiStripe } from "react-icons/si";
import { onAuthStateChanged, updateProfile, User } from "firebase/auth";
import { auth, db } from "@/lib/firebase.client";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { termsContent, privacyContent } from "@/lib/legalContent";

const tabs = [
    "Profile",
    "Integration",
    "Manage Plan",
    "Support & Compliance",
];

const integrations = [
    {
        key: "hubspot",
        name: "HubSpot",
        description: "Sync customer data and manage CRM workflow.",
        icon: <SiHubspot color="#FF7A59" />,
    },
    {
        key: "stripe",
        name: "Stripe",
        description: "Sync subscriptions, invoices, payments, and MRR.",
        icon: <SiStripe color="#635BFF" />,
    },
];

type ProfileForm = {
    name: string;
    email: string;
    role: string;
    phone: string;
    location: string;
    photoURL: string;
};

type IntegrationKey = "hubspot" | "stripe";
type BillingPlan = "free" | "starter" | "pro";
type LegalModalType = "terms" | "privacy" | null;

type IntegrationState = {
    hubspot: {
        connected: boolean;
        accountName: string;
    };
    stripe: {
        connected: boolean;
        accountName: string;
    };
};

type BillingSummary = {
    workspaceId: string | null;
    plan: BillingPlan;
    billingStatus: string | null;
    renewalDate: string | null;
    trialEndsAt: string | null;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    hasBilling: boolean;
};

type EmailDomainRecord = {
    record?: string;
    name?: string;
    type?: string;
    ttl?: string | number;
    status?: string;
    value?: string;
    priority?: number | string;
};

type EmailSettingsResponse = {
    workspaceName: string;
    resendDomainId: string | null;
    sendingDomain: string | null;
    sendingDomainStatus: string | null;
    sendingDomainRecords: EmailDomainRecord[] | null;
    senderName: string | null;
    senderEmail: string | null;
    senderReplyTo: string | null;
    senderVerifiedAt: string | null;
    senderMatchesDomain: boolean;
    ready: boolean;
};

type EmailSettingsForm = {
    domain: string;
    senderName: string;
    senderEmail: string;
    senderReplyTo: string;
};

const emptyIntegrationState: IntegrationState = {
    hubspot: { connected: false, accountName: "" },
    stripe: { connected: false, accountName: "" },
};

const emptyBillingSummary: BillingSummary = {
    workspaceId: null,
    plan: "free",
    billingStatus: null,
    renewalDate: null,
    trialEndsAt: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    hasBilling: false,
};

const emptyEmailSettings: EmailSettingsResponse = {
    workspaceName: "",
    resendDomainId: null,
    sendingDomain: null,
    sendingDomainStatus: null,
    sendingDomainRecords: null,
    senderName: null,
    senderEmail: null,
    senderReplyTo: null,
    senderVerifiedAt: null,
    senderMatchesDomain: false,
    ready: false,
};

async function readFirestoreIntegrationState(uid: string): Promise<IntegrationState> {
    try {
        const integrationRef = doc(db, "users", uid, "integrations", "main");
        const integrationSnap = await getDoc(integrationRef);

        if (!integrationSnap.exists()) {
            return emptyIntegrationState;
        }

        const data = integrationSnap.data();

        return {
            hubspot: {
                connected: !!data?.hubspot?.connected,
                accountName: data?.hubspot?.accountName || "",
            },
            stripe: {
                connected: !!data?.stripe?.connected,
                accountName: data?.stripe?.accountName || "",
            },
        };
    } catch (error) {
        console.error("[Settings] readFirestoreIntegrationState failed:", error);
        return emptyIntegrationState;
    }
}

function formatPlanName(plan: BillingPlan | null | undefined) {
    if (!plan || plan === "free") return "Free Trial";
    if (plan === "pro") return "Pro";
    return "Starter";
}

function formatBillingStatus(status: string | null | undefined) {
    if (!status) return "Not available yet";

    switch (status) {
        case "active":
            return "Active";
        case "trialing":
            return "Trialing";
        case "past_due":
            return "Past due";
        case "canceled":
            return "Canceled";
        case "incomplete":
            return "Incomplete";
        case "incomplete_expired":
            return "Incomplete expired";
        case "unpaid":
            return "Unpaid";
        default:
            return status;
    }
}

function formatDate(value: string | null | undefined) {
    if (!value) return "Not available yet";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Not available yet";

    return new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
    }).format(date);
}

function getTrialDaysLeft(value: string | null | undefined) {
    if (!value) return 0;
    const end = new Date(value).getTime();
    if (Number.isNaN(end)) return 0;
    const diff = end - Date.now();
    if (diff <= 0) return 0;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function isTrialActive(value: string | null | undefined) {
    return getTrialDaysLeft(value) > 0;
}

function normalizeDomainInput(value: string) {
    return value
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .replace(/\/.*$/, "")
        .replace(/\.$/, "");
}

function formatDomainStatus(status: string | null | undefined) {
    if (!status) return "Not connected";

    switch (status) {
        case "verified":
            return "Verified";
        case "not_started":
            return "Pending DNS setup";
        case "pending":
            return "Pending verification";
        case "temporary_failure":
            return "Temporary failure";
        case "failure":
            return "Verification failed";
        default:
            return status.replace(/_/g, " ");
    }
}

function isVerifiedStatus(status: string | null | undefined) {
    return typeof status === "string" && status.toLowerCase() === "verified";
}
function SettingsPageContent() {
    const searchParams = useSearchParams();

    const [activeTab, setActiveTab] = useState("Profile");
    const [legalModal, setLegalModal] = useState<LegalModalType>(null);
    const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
    const [supportEmail, setSupportEmail] = useState("");
    const [supportRequest, setSupportRequest] = useState("");
    const [sendingSupport, setSendingSupport] = useState(false);
    const [supportMessage, setSupportMessage] = useState<string | null>(null);
    const [form, setForm] = useState<ProfileForm>({
        name: "",
        email: "",
        role: "",
        phone: "",
        location: "",
        photoURL: "",
    });



    const [integrationState, setIntegrationState] =
        useState<IntegrationState>(emptyIntegrationState);

    const [billing, setBilling] = useState<BillingSummary>(emptyBillingSummary);

    const [emailSettings, setEmailSettings] =
        useState<EmailSettingsResponse>(emptyEmailSettings);

    const [emailForm, setEmailForm] = useState<EmailSettingsForm>({
        domain: "",
        senderName: "",
        senderEmail: "",
        senderReplyTo: "",
    });

    const [connectingKey, setConnectingKey] = useState<IntegrationKey | null>(null);
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [loadingUser, setLoadingUser] = useState(true);
    const [savingProfile, setSavingProfile] = useState(false);
    const [loadingIntegrations, setLoadingIntegrations] = useState(false);
    const [loadingBilling, setLoadingBilling] = useState(false);
    const [startingCheckout, setStartingCheckout] = useState(false);
    const [openingPortal, setOpeningPortal] = useState(false);

    const [loadingEmailSettings, setLoadingEmailSettings] = useState(false);
    const [creatingDomain, setCreatingDomain] = useState(false);
    const [verifyingDomain, setVerifyingDomain] = useState(false);
    const [savingSender, setSavingSender] = useState(false);

    const [profileMessage, setProfileMessage] = useState<string | null>(null);
    const [integrationMessage, setIntegrationMessage] = useState<string | null>(null);
    const [billingMessage, setBillingMessage] = useState<string | null>(null);
    const [emailMessage, setEmailMessage] = useState<string | null>(null);

    async function loadIntegrations(uid: string) {
        try {
            setLoadingIntegrations(true);

            const firestoreState = await readFirestoreIntegrationState(uid);

            let stripeState = firestoreState.stripe;

            try {
                const res = await fetch(`/api/integrations/stripe/status?uid=${encodeURIComponent(uid)}`, {
                    method: "GET",
                    cache: "no-store",
                });

                if (res.ok) {
                    const data = await res.json();

                    stripeState = {
                        connected: !!data.connected,
                        accountName:
                            data.accountName ||
                            data.accountEmail ||
                            "",
                    };
                }
            } catch (error) {
                console.error("[Settings] Stripe status fetch failed:", error);
            }

            setIntegrationState({
                hubspot: firestoreState.hubspot,
                stripe: stripeState,
            });
        } finally {
            setLoadingIntegrations(false);
        }
    }

    async function loadBilling() {
        try {
            if (!auth.currentUser) {
                setBilling(emptyBillingSummary);
                return;
            }

            setLoadingBilling(true);

            const token = await auth.currentUser.getIdToken();

            const res = await fetch("/api/stripe/billing-summary", {
                method: "GET",
                cache: "no-store",
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (!res.ok) {
                throw new Error("Failed to load billing summary");
            }

            const data = await res.json();

            setBilling({
                workspaceId: data.workspaceId ?? null,
                plan:
                    data.plan === "pro"
                        ? "pro"
                        : data.plan === "starter"
                            ? "starter"
                            : "free",
                billingStatus: data.billingStatus ?? null,
                renewalDate: data.renewalDate ?? null,
                trialEndsAt: data.trialEndsAt ?? null,
                stripeCustomerId: data.stripeCustomerId ?? null,
                stripeSubscriptionId: data.stripeSubscriptionId ?? null,
                hasBilling: !!data.hasBilling,
            });
        } catch (error) {
            console.error("[Settings] loadBilling failed:", error);
            setBilling(emptyBillingSummary);
        } finally {
            setLoadingBilling(false);
        }
    }

    async function loadEmailSettings(user?: User | null) {
        const currentUser = user || auth.currentUser;

        if (!currentUser) {
            setEmailSettings(emptyEmailSettings);
            setEmailForm({
                domain: "",
                senderName: "",
                senderEmail: "",
                senderReplyTo: "",
            });
            return;
        }

        try {
            setLoadingEmailSettings(true);

            const token = await currentUser.getIdToken();

            const res = await fetch("/api/email/domain/settings", {
                method: "GET",
                cache: "no-store",
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data?.error || "Failed to load email settings");
            }

            const settings = data?.settings || emptyEmailSettings;

            setEmailSettings(settings);
            setEmailForm({
                domain: settings.sendingDomain || "",
                senderName: settings.senderName || "",
                senderEmail: settings.senderEmail || "",
                senderReplyTo: settings.senderReplyTo || "",
            });
        } catch (error: any) {
            console.error("[Settings] loadEmailSettings failed:", error);
            setEmailMessage(error?.message || "Could not load email sending settings.");
            setEmailSettings(emptyEmailSettings);
        } finally {
            setLoadingEmailSettings(false);
        }
    }

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            setLoadingUser(true);
            setProfileMessage(null);
            setIntegrationMessage(null);
            setBillingMessage(null);
            setEmailMessage(null);

            if (!user) {
                setFirebaseUser(null);
                setForm({
                    name: "",
                    email: "",
                    role: "",
                    phone: "",
                    location: "",
                    photoURL: "",
                });
                setIntegrationState(emptyIntegrationState);
                setBilling(emptyBillingSummary);
                setEmailSettings(emptyEmailSettings);
                setEmailForm({
                    domain: "",
                    senderName: "",
                    senderEmail: "",
                    senderReplyTo: "",
                });
                setLoadingUser(false);
                return;
            }

            setFirebaseUser(user);

            try {
                const userRef = doc(db, "users", user.uid);
                const userSnap = await getDoc(userRef);
                const profile = userSnap.exists() ? userSnap.data() : null;

                const mergedName = profile?.name || user.displayName || "";
                const mergedEmail = user.email || "";
                const mergedRole = profile?.role || "";
                const mergedPhone = profile?.phone || "";
                const mergedLocation = profile?.location || "";
                const mergedPhotoURL = profile?.photoURL || user.photoURL || "";

                setSupportEmail(mergedEmail);

                setForm({
                    name: mergedName,
                    email: mergedEmail,
                    role: mergedRole,
                    phone: mergedPhone,
                    location: mergedLocation,
                    photoURL: mergedPhotoURL,
                });

                await Promise.all([
                    loadIntegrations(user.uid),
                    loadBilling(),
                    loadEmailSettings(user),
                ]);

                if (!userSnap.exists()) {
                    await setDoc(
                        userRef,
                        {
                            name: mergedName,
                            email: mergedEmail,
                            role: mergedRole,
                            phone: mergedPhone,
                            location: mergedLocation,
                            photoURL: mergedPhotoURL,
                            createdAt: serverTimestamp(),
                            updatedAt: serverTimestamp(),
                        },
                        { merge: true }
                    );
                }
            } catch (error: any) {
                console.error("Failed to load settings:", error);
                setProfileMessage(error?.message || "Could not load user information.");
            } finally {
                setLoadingUser(false);
            }
        });

        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const tab = searchParams.get("tab");
        const hubspot = searchParams.get("hubspot");
        const stripe = searchParams.get("stripe");
        const error = searchParams.get("error");
        const checkout = searchParams.get("checkout");
        const portal = searchParams.get("portal");

        if (tab === "manage-plan") {
            setActiveTab("Manage Plan");
        }

        if (hubspot === "connected") {
            setActiveTab("Integration");
            setIntegrationMessage("HubSpot connected successfully.");
        } else if (hubspot === "disconnected") {
            setActiveTab("Integration");
            setIntegrationMessage("HubSpot disconnected.");
        } else if (stripe === "connected") {
            setActiveTab("Integration");
            setIntegrationMessage("Stripe connected successfully.");
        } else if (stripe === "disconnected") {
            setActiveTab("Integration");
            setIntegrationMessage("Stripe disconnected.");
        } else if (stripe === "error" || error) {
            setActiveTab("Integration");
            setIntegrationMessage("Integration error. Please try again.");
        }

        if (checkout === "success") {
            setActiveTab("Manage Plan");
            setBillingMessage("Checkout completed successfully.");
        } else if (checkout === "cancelled") {
            setActiveTab("Manage Plan");
            setBillingMessage("Checkout was cancelled.");
        } else if (portal === "returned") {
            setActiveTab("Manage Plan");
            setBillingMessage("Returned from billing portal.");
        }
    }, [searchParams]);

    useEffect(() => {
        if (!firebaseUser) return;

        const hasIntegrationQuery =
            searchParams.get("hubspot") ||
            searchParams.get("stripe") ||
            searchParams.get("error");

        if (hasIntegrationQuery) {
            loadIntegrations(firebaseUser.uid);
        }

        const hasBillingQuery =
            searchParams.get("checkout") ||
            searchParams.get("portal") ||
            searchParams.get("tab") === "manage-plan";

        if (hasBillingQuery) {
            loadBilling();
        }
    }, [firebaseUser, searchParams]);

    function handleFieldChange(
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) {
        const { name, value } = e.target;
        setForm((prev) => ({
            ...prev,
            [name]: value,
        }));
    }

    function handleEmailFieldChange(
        e: React.ChangeEvent<HTMLInputElement>
    ) {
        const { name, value } = e.target;
        setEmailForm((prev) => ({
            ...prev,
            [name]: value,
        }));
    }

    function handleStartEdit() {
        setProfileMessage(null);
        setIsEditingProfile(true);
    }

    async function handleCancelEdit() {
        if (!firebaseUser) return;

        try {
            const userRef = doc(db, "users", firebaseUser.uid);
            const userSnap = await getDoc(userRef);
            const profile = userSnap.exists() ? userSnap.data() : null;

            setForm({
                name: profile?.name || firebaseUser.displayName || "",
                email: firebaseUser.email || "",
                role: profile?.role || "",
                phone: profile?.phone || "",
                location: profile?.location || "",
                photoURL: profile?.photoURL || firebaseUser.photoURL || "",
            });

            setIsEditingProfile(false);
            setProfileMessage(null);
        } catch (error) {
            console.error(error);
            setProfileMessage("Could not reset profile changes.");
        }
    }

    async function handleSaveProfile() {
        if (!firebaseUser) return;

        try {
            setSavingProfile(true);
            setProfileMessage(null);

            const userRef = doc(db, "users", firebaseUser.uid);

            await setDoc(
                userRef,
                {
                    name: form.name,
                    email: firebaseUser.email || form.email,
                    role: form.role,
                    phone: form.phone,
                    location: form.location,
                    photoURL: form.photoURL,
                    updatedAt: serverTimestamp(),
                },
                { merge: true }
            );

            if (form.name !== (firebaseUser.displayName || "")) {
                await updateProfile(firebaseUser, {
                    displayName: form.name,
                });
            }

            setIsEditingProfile(false);
            setProfileMessage("Profile updated successfully.");
        } catch (error) {
            console.error("Failed to save profile:", error);
            setProfileMessage("Failed to save profile changes.");
        } finally {
            setSavingProfile(false);
        }
    }

    async function handleConnectIntegration(key: IntegrationKey) {
        if (!firebaseUser) return;

        try {
            setConnectingKey(key);
            setIntegrationMessage(null);

            const url =
                key === "hubspot"
                    ? `/api/integrations/hubspot/connect?uid=${firebaseUser.uid}`
                    : `/api/integrations/stripe/connect?uid=${firebaseUser.uid}`;

            window.location.href = url;
        } catch (error) {
            console.error(`Failed to start ${key} connection:`, error);
            setConnectingKey(null);
            setIntegrationMessage(`Failed to start ${key} connection.`);
        }
    }

    async function handleDisconnectIntegration(key: IntegrationKey) {
        if (!firebaseUser) return;

        try {
            setConnectingKey(key);
            setIntegrationMessage(null);

            const response = await fetch(`/api/integrations/${key}/disconnect`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ uid: firebaseUser.uid }),
            });

            if (!response.ok) {
                throw new Error(`Failed to disconnect ${key}`);
            }

            await loadIntegrations(firebaseUser.uid);
            setIntegrationMessage(
                key === "hubspot" ? "HubSpot disconnected." : "Stripe disconnected."
            );
        } catch (error) {
            console.error(`Failed to disconnect ${key}:`, error);
            setIntegrationMessage(`Failed to disconnect ${key}.`);
        } finally {
            setConnectingKey(null);
        }
    }

    async function handleUpgrade(plan: "starter" | "pro") {
        if (!firebaseUser) return;
        if (!billing.workspaceId) {
            setBillingMessage("No workspace found for billing.");
            return;
        }

        try {
            setStartingCheckout(true);
            setBillingMessage(null);

            const token = await firebaseUser.getIdToken();

            const res = await fetch("/api/stripe/checkout", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    tier: plan,
                    workspaceId: billing.workspaceId,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data?.error || "Failed to start checkout");
            }

            if (!data?.url) {
                throw new Error("Missing checkout URL");
            }

            window.location.href = data.url;
        } catch (error: any) {
            console.error("Failed to start checkout:", error);
            setBillingMessage(error?.message || "Unable to start checkout.");
        } finally {
            setStartingCheckout(false);
        }
    }

    async function handleManageBilling() {
        if (!firebaseUser) return;
        if (!billing.workspaceId) {
            setBillingMessage("No workspace found for billing.");
            return;
        }

        try {
            setOpeningPortal(true);
            setBillingMessage(null);

            const token = await firebaseUser.getIdToken();

            const res = await fetch("/api/stripe/portal", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    workspaceId: billing.workspaceId,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data?.error || "Failed to open billing portal");
            }

            if (!data?.url) {
                throw new Error("Missing billing portal URL");
            }

            window.location.href = data.url;
        } catch (error: any) {
            console.error("Failed to open billing portal:", error);
            setBillingMessage(error?.message || "Unable to open billing portal.");
        } finally {
            setOpeningPortal(false);
        }
    }

    async function handleCreateSendingDomain() {
        if (!firebaseUser) return;

        try {
            setCreatingDomain(true);
            setEmailMessage(null);

            const domain = normalizeDomainInput(emailForm.domain);

            if (!domain) {
                throw new Error("Enter your company domain first.");
            }

            const token = await firebaseUser.getIdToken();

            const res = await fetch("/api/email/domain/create", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ domain }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data?.error || "Failed to connect sending domain");
            }

            setEmailMessage("Sending domain connected. Add the DNS records below, then click Verify.");
            await loadEmailSettings(firebaseUser);
        } catch (error: any) {
            console.error("Failed to create sending domain:", error);
            setEmailMessage(error?.message || "Failed to connect sending domain.");
        } finally {
            setCreatingDomain(false);
        }
    }

    async function handleVerifySendingDomain() {
        if (!firebaseUser) return;

        try {
            setVerifyingDomain(true);
            setEmailMessage(null);

            const token = await firebaseUser.getIdToken();

            const res = await fetch("/api/email/domain/verify", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data?.error || "Failed to verify sending domain");
            }

            await loadEmailSettings(firebaseUser);

            if (data?.verified) {
                setEmailMessage("Domain verified successfully. You can now save your sender details.");
            } else {
                setEmailMessage("Domain is not verified yet. Please finish the DNS setup and try again.");
            }
        } catch (error: any) {
            console.error("Failed to verify sending domain:", error);
            setEmailMessage(error?.message || "Failed to verify sending domain.");
        } finally {
            setVerifyingDomain(false);
        }
    }

    async function handleSaveSender() {
        if (!firebaseUser) return;

        try {
            setSavingSender(true);
            setEmailMessage(null);

            const token = await firebaseUser.getIdToken();

            const res = await fetch("/api/email/domain/save-sender", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    senderName: emailForm.senderName.trim(),
                    senderEmail: emailForm.senderEmail.trim().toLowerCase(),
                    senderReplyTo: emailForm.senderReplyTo.trim().toLowerCase(),
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data?.error || "Failed to save sender details");
            }

            setEmailMessage("Sender details saved successfully.");
            await loadEmailSettings(firebaseUser);
        } catch (error: any) {
            console.error("Failed to save sender details:", error);
            setEmailMessage(error?.message || "Failed to save sender details.");
        } finally {
            setSavingSender(false);
        }
    }

    const currentPlanName = formatPlanName(billing.plan);
    const isFree = billing.plan === "free";
    const isStarter = billing.plan === "starter";
    const isPro = billing.plan === "pro";
    const trialActive = isTrialActive(billing.trialEndsAt);
    const trialDaysLeft = getTrialDaysLeft(billing.trialEndsAt);

    const domainVerified = isVerifiedStatus(emailSettings.sendingDomainStatus);

    const modalContent = legalModal === "terms" ? termsContent : privacyContent;

    async function handleSendSupportRequest() {
        if (!firebaseUser) return;

        try {
            setSendingSupport(true);
            setSupportMessage(null);

            if (!supportEmail.trim()) {
                throw new Error("Please enter your email address.");
            }

            if (!supportRequest.trim()) {
                throw new Error("Please describe your request.");
            }

            if (supportRequest.trim().length < 10) {
                throw new Error("Please write a little more detail.");
            }

            const token = await firebaseUser.getIdToken(true);

            const res = await fetch("/api/support/request", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    email: supportEmail.trim().toLowerCase(),
                    request: supportRequest.trim(),
                    name: form.name || firebaseUser.displayName || "",
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data?.error || "Failed to send request.");
            }

            setSupportRequest("");
            setSupportMessage("Message sent. We’ll get back to you shortly.");
        } catch (error: any) {
            setSupportMessage(error?.message || "Could not send your request.");
        } finally {
            setSendingSupport(false);
        }
    }

    return (
        <>
            <main className={styles.page}>
                <div className={styles.shellNoSidebar}>
                    <section className={styles.main}>
                        <div className={styles.topBar}>
                            <div>
                                <h1 className={styles.title}>Settings</h1>
                            </div>
                        </div>

                        <div className={styles.inlineTabs}>
                            {tabs.map((tab) => (
                                <button
                                    key={tab}
                                    type="button"
                                    onClick={() => setActiveTab(tab)}
                                    className={`${styles.inlineTab} ${activeTab === tab ? styles.inlineTabActive : ""}`}
                                >
                                    {tab}
                                </button>
                            ))}
                        </div>

                        <div className={styles.contentGridFull}>
                            <div className={styles.column}>
                                {activeTab === "Profile" && (
                                    <section className={styles.card}>
                                        <div className={styles.cardHeader}>
                                            <div>
                                                <h3 className={styles.cardTitle}>Personal Information</h3>
                                            </div>

                                            {!isEditingProfile ? (
                                                <button
                                                    type="button"
                                                    className={styles.iconBtn}
                                                    onClick={handleStartEdit}
                                                    disabled={loadingUser || !firebaseUser}
                                                >
                                                    Edit
                                                </button>
                                            ) : (
                                                <div style={{ display: "flex", gap: 8 }}>
                                                    <button
                                                        type="button"
                                                        className={styles.iconBtn}
                                                        onClick={handleCancelEdit}
                                                        disabled={savingProfile}
                                                    >
                                                        Cancel
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={styles.iconBtn}
                                                        onClick={handleSaveProfile}
                                                        disabled={savingProfile}
                                                    >
                                                        {savingProfile ? "Saving..." : "Save"}
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {profileMessage && (
                                            <p style={{ marginBottom: 12 }}>{profileMessage}</p>
                                        )}

                                        <div className={styles.profileHeader}>
                                            <div className={styles.profileInfo}>
                                                <span className={styles.profileName}>
                                                    {loadingUser ? "Loading..." : form.name || "User"}
                                                </span>
                                                <span className={styles.profileSub}>
                                                    {loadingUser ? "" : form.role || "No role set"}
                                                </span>
                                                <span className={styles.profileSub}>
                                                    {loadingUser ? "" : form.location || "No location set"}
                                                </span>
                                            </div>
                                        </div>

                                        <div className={styles.infoGrid}>
                                            <div className={styles.field}>
                                                <span className={styles.label}>First and Last Name</span>
                                                {isEditingProfile ? (
                                                    <input
                                                        name="name"
                                                        value={form.name}
                                                        onChange={handleFieldChange}
                                                        className={styles.contactInput}
                                                    />
                                                ) : (
                                                    <span className={styles.value}>
                                                        {loadingUser ? "Loading..." : form.name || "—"}
                                                    </span>
                                                )}
                                            </div>

                                            <div className={styles.field}>
                                                <span className={styles.label}>Email</span>
                                                <span className={styles.value}>
                                                    {loadingUser ? "Loading..." : form.email || "—"}
                                                </span>
                                            </div>

                                            <div className={styles.field}>
                                                <span className={styles.label}>Role</span>
                                                {isEditingProfile ? (
                                                    <input
                                                        name="role"
                                                        value={form.role}
                                                        onChange={handleFieldChange}
                                                        className={styles.contactInput}
                                                    />
                                                ) : (
                                                    <span className={styles.value}>
                                                        {loadingUser ? "Loading..." : form.role || "—"}
                                                    </span>
                                                )}
                                            </div>

                                            <div className={styles.field}>
                                                <span className={styles.label}>Phone</span>
                                                {isEditingProfile ? (
                                                    <input
                                                        name="phone"
                                                        value={form.phone}
                                                        onChange={handleFieldChange}
                                                        className={styles.contactInput}
                                                    />
                                                ) : (
                                                    <span className={styles.value}>
                                                        {loadingUser ? "Loading..." : form.phone || "—"}
                                                    </span>
                                                )}
                                            </div>

                                            <div className={styles.field}>
                                                <span className={styles.label}>Location</span>
                                                {isEditingProfile ? (
                                                    <input
                                                        name="location"
                                                        value={form.location}
                                                        onChange={handleFieldChange}
                                                        className={styles.contactInput}
                                                    />
                                                ) : (
                                                    <span className={styles.value}>
                                                        {loadingUser ? "Loading..." : form.location || "—"}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </section>
                                )}

                                {activeTab === "Integration" && (
                                    <section className={styles.card}>
                                        <div className={styles.cardHeader}>
                                            <div>
                                                <h3 className={styles.cardTitle}>Integration</h3>
                                                <p className={styles.cardSubtext}>
                                                    Connect the tools Cobrai needs to read customer, billing, and CRM signals.
                                                </p>
                                            </div>
                                        </div>

                                        {integrationMessage && (
                                            <p style={{ marginBottom: 12 }}>{integrationMessage}</p>
                                        )}

                                        <div className={styles.integrationList}>
                                            {integrations.map((item) => {
                                                const key = item.key as IntegrationKey;
                                                const state = integrationState[key];
                                                const connected = state.connected;
                                                const busy = connectingKey === key;



                                                return (
                                                    <div key={item.key} className={styles.integrationRow}>
                                                        <div className={styles.integrationLeft}>
                                                            <div className={styles.integrationIcon}>
                                                                {item.icon}
                                                            </div>

                                                            <div className={styles.integrationMeta}>
                                                                <div className={styles.integrationTop}>
                                                                    <span className={styles.integrationName}>
                                                                        {item.name}
                                                                    </span>
                                                                    <span
                                                                        className={
                                                                            connected
                                                                                ? styles.statusConnected
                                                                                : styles.statusDisconnected
                                                                        }
                                                                    >
                                                                        {loadingIntegrations
                                                                            ? "Checking..."
                                                                            : connected
                                                                                ? "Connected"
                                                                                : "Not Connected"}
                                                                    </span>
                                                                </div>

                                                                <p className={styles.integrationDescription}>
                                                                    {item.description}
                                                                </p>

                                                                {connected && state.accountName && (
                                                                    <p
                                                                        className={styles.cardSubtext}
                                                                        style={{ marginTop: 8 }}
                                                                    >
                                                                        {state.accountName}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>

                                                        <button
                                                            type="button"
                                                            className={
                                                                connected
                                                                    ? styles.disconnectBtn
                                                                    : styles.connectBtn
                                                            }
                                                            onClick={() =>
                                                                connected
                                                                    ? handleDisconnectIntegration(key)
                                                                    : handleConnectIntegration(key)
                                                            }
                                                            disabled={
                                                                busy || !firebaseUser || loadingIntegrations
                                                            }
                                                        >
                                                            {busy
                                                                ? "Please wait..."
                                                                : connected
                                                                    ? "Disconnect"
                                                                    : "Connect"}
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        <div
                                            style={{
                                                marginTop: 24,
                                                paddingTop: 20,
                                                borderTop: "1px solid #e8eaee",
                                                display: "flex",
                                                flexDirection: "column",
                                                gap: 16,
                                            }}
                                        >
                                            <div>
                                                <h3 className={styles.cardTitle}>Automated Emails</h3>
                                                <p className={styles.cardSubtext}>
                                                    Connect your domain so Cobrai can send emails from your company email address to your clients.
                                                </p>
                                            </div>

                                            {emailMessage && (
                                                <p style={{ marginBottom: 4 }}>{emailMessage}</p>
                                            )}

                                            <div className={styles.infoGrid}>
                                                <div className={styles.field}>
                                                    <span className={styles.label}>Connected domain</span>
                                                    <span className={styles.value}>
                                                        {loadingEmailSettings
                                                            ? "Loading..."
                                                            : emailSettings.sendingDomain || "—"}
                                                    </span>
                                                </div>

                                                <div className={styles.field}>
                                                    <span className={styles.label}>Domain status</span>
                                                    <span
                                                        className={
                                                            domainVerified
                                                                ? styles.statusConnected
                                                                : styles.statusDisconnected
                                                        }
                                                    >
                                                        {loadingEmailSettings
                                                            ? "Checking..."
                                                            : formatDomainStatus(emailSettings.sendingDomainStatus)}
                                                    </span>
                                                </div>

                                                <div className={styles.field}>
                                                    <span className={styles.label}>Sender ready</span>
                                                    <span
                                                        className={
                                                            emailSettings.ready
                                                                ? styles.statusConnected
                                                                : styles.statusDisconnected
                                                        }
                                                    >
                                                        {loadingEmailSettings
                                                            ? "Checking..."
                                                            : emailSettings.ready
                                                                ? "Ready"
                                                                : "Not ready"}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className={styles.infoGrid}>
                                                <div className={styles.field}>
                                                    <span className={styles.label}>Company domain</span>
                                                    <input
                                                        name="domain"
                                                        value={emailForm.domain}
                                                        onChange={handleEmailFieldChange}
                                                        placeholder="yourcompany.com"
                                                        className={styles.contactInput}
                                                    />
                                                </div>

                                                <div className={styles.field}>
                                                    <span className={styles.label}>Sender name</span>
                                                    <input
                                                        name="senderName"
                                                        value={emailForm.senderName}
                                                        onChange={handleEmailFieldChange}
                                                        placeholder="company name"
                                                        className={styles.contactInput}
                                                    />
                                                </div>

                                                <div className={styles.field}>
                                                    <span className={styles.label}>Sender email</span>
                                                    <input
                                                        name="senderEmail"
                                                        value={emailForm.senderEmail}
                                                        onChange={handleEmailFieldChange}
                                                        placeholder="support@yourcompany.com"
                                                        className={styles.contactInput}
                                                    />
                                                </div>

                                                <div className={styles.field}>
                                                    <span className={styles.label}>Reply-to email</span>
                                                    <input
                                                        name="senderReplyTo"
                                                        value={emailForm.senderReplyTo}
                                                        onChange={handleEmailFieldChange}
                                                        placeholder="support@yourcompany.com"
                                                        className={styles.contactInput}
                                                    />
                                                </div>
                                            </div>

                                            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                                                <button
                                                    type="button"
                                                    className={styles.connectBtn}
                                                    onClick={handleCreateSendingDomain}
                                                    disabled={!firebaseUser || creatingDomain}
                                                >
                                                    {creatingDomain ? "Connecting..." : "Connect Domain"}
                                                </button>

                                                <button
                                                    type="button"
                                                    className={styles.iconBtn}
                                                    onClick={handleVerifySendingDomain}
                                                    disabled={!firebaseUser || verifyingDomain || !emailSettings.resendDomainId}
                                                >
                                                    {verifyingDomain ? "Verifying..." : "Verify Domain"}
                                                </button>

                                                <button
                                                    type="button"
                                                    className={styles.iconBtn}
                                                    onClick={handleSaveSender}
                                                    disabled={!firebaseUser || savingSender}
                                                >
                                                    {savingSender ? "Saving..." : "Save Sender"}
                                                </button>
                                            </div>

                                            {!!emailSettings.sendingDomainRecords?.length && (
                                                <div
                                                    style={{
                                                        border: "1px solid #e8eaee",
                                                        borderRadius: 14,
                                                        padding: 14,
                                                        background: "#fff",
                                                        overflowX: "auto",
                                                    }}
                                                >
                                                    <div style={{ marginBottom: 10 }}>
                                                        <strong>DNS records to add</strong>
                                                    </div>

                                                    <table
                                                        style={{
                                                            width: "100%",
                                                            borderCollapse: "collapse",
                                                            fontSize: 14,
                                                        }}
                                                    >
                                                        <thead>
                                                            <tr>
                                                                <th style={{ textAlign: "left", padding: "8px 6px" }}>Type</th>
                                                                <th style={{ textAlign: "left", padding: "8px 6px" }}>Name</th>
                                                                <th style={{ textAlign: "left", padding: "8px 6px" }}>Value</th>
                                                                <th style={{ textAlign: "left", padding: "8px 6px" }}>Status</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {emailSettings.sendingDomainRecords.map((record, index) => (
                                                                <tr key={`${record.name || record.record || "record"}-${index}`}>
                                                                    <td style={{ padding: "8px 6px", verticalAlign: "top" }}>
                                                                        {record.type || "—"}
                                                                    </td>
                                                                    <td style={{ padding: "8px 6px", verticalAlign: "top", wordBreak: "break-word" }}>
                                                                        {record.name || record.record || "—"}
                                                                    </td>
                                                                    <td style={{ padding: "8px 6px", verticalAlign: "top", wordBreak: "break-word" }}>
                                                                        {record.value || "—"}
                                                                    </td>
                                                                    <td style={{ padding: "8px 6px", verticalAlign: "top" }}>
                                                                        {record.status || "pending"}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}

                                            <p className={styles.cardSubtext}>
                                                Connect your domain, add the DNS records, verify ownership, then save a sender email that matches your domain.
                                            </p>
                                        </div>
                                    </section>
                                )}

                                {activeTab === "Manage Plan" && (
                                    <section className={styles.card}>
                                        <div className={styles.cardHeader}>
                                            <div>
                                                <h3 className={styles.cardTitle}>Manage Plan</h3>
                                                <p className={styles.cardSubtext}>
                                                    View your current plan and billing details.
                                                </p>
                                            </div>
                                        </div>

                                        {billingMessage && (
                                            <p style={{ marginBottom: 12 }}>{billingMessage}</p>
                                        )}

                                        <div className={styles.pricingSection}>
                                            <div
                                                className={styles.currentPlanCard}
                                                style={{
                                                    display: "flex",
                                                    flexDirection: "column",
                                                    gap: 20,
                                                    padding: 24,
                                                }}
                                            >
                                                <div
                                                    className={styles.currentPlanTop}
                                                    style={{
                                                        display: "flex",
                                                        alignItems: "flex-start",
                                                        justifyContent: "space-between",
                                                        gap: 16,
                                                        flexWrap: "wrap",
                                                    }}
                                                >
                                                    <div
                                                        className={styles.currentPlanInfo}
                                                        style={{
                                                            display: "flex",
                                                            flexDirection: "column",
                                                            gap: 8,
                                                            minWidth: 0,
                                                        }}
                                                    >
                                                        <span
                                                            className={styles.currentPlanLabel}
                                                            style={{
                                                                margin: 0,
                                                                lineHeight: 1.2,
                                                            }}
                                                        >
                                                            Current Plan
                                                        </span>

                                                        <h3
                                                            className={styles.currentPlanName}
                                                            style={{
                                                                margin: 0,
                                                                lineHeight: 1.1,
                                                            }}
                                                        >
                                                            {loadingBilling ? "Loading..." : currentPlanName}
                                                        </h3>
                                                    </div>

                                                    <span
                                                        className={
                                                            isFree && trialActive
                                                                ? styles.statusConnected
                                                                : billing.hasBilling
                                                                    ? styles.statusConnected
                                                                    : styles.statusDisconnected
                                                        }
                                                        style={{
                                                            alignSelf: "flex-start",
                                                            whiteSpace: "nowrap",
                                                        }}
                                                    >
                                                        {loadingBilling
                                                            ? "Checking..."
                                                            : isFree && trialActive
                                                                ? `Trial: ${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left`
                                                                : isFree
                                                                    ? "Trial expired"
                                                                    : billing.hasBilling && billing.billingStatus
                                                                        ? formatBillingStatus(billing.billingStatus)
                                                                        : "No active billing"}
                                                    </span>
                                                </div>

                                                <div
                                                    className={styles.currentPlanMetaGrid}
                                                    style={{
                                                        display: "grid",
                                                        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                                                        gap: 16,
                                                    }}
                                                >
                                                    <div
                                                        className={styles.currentPlanMetaItem}
                                                        style={{
                                                            display: "flex",
                                                            flexDirection: "column",
                                                            gap: 6,
                                                            padding: "14px 16px",
                                                            border: "1px solid #e8eaee",
                                                            borderRadius: 12,
                                                            background: "#ffffff",
                                                        }}
                                                    >
                                                        <span className={styles.currentPlanMetaLabel}>
                                                            Renewal date
                                                        </span>
                                                        <span className={styles.currentPlanMetaValue}>
                                                            {loadingBilling
                                                                ? "Loading..."
                                                                : isFree && billing.trialEndsAt
                                                                    ? formatDate(billing.trialEndsAt)
                                                                    : !isFree && billing.renewalDate
                                                                        ? formatDate(billing.renewalDate)
                                                                        : "—"}
                                                        </span>
                                                    </div>

                                                    <div
                                                        className={styles.currentPlanMetaItem}
                                                        style={{
                                                            display: "flex",
                                                            flexDirection: "column",
                                                            gap: 6,
                                                            padding: "14px 16px",
                                                            border: "1px solid #e8eaee",
                                                            borderRadius: 12,
                                                            background: "#ffffff",
                                                        }}
                                                    >
                                                        <span className={styles.currentPlanMetaLabel}>
                                                            Billing status
                                                        </span>
                                                        <span className={styles.currentPlanMetaValue}>
                                                            {loadingBilling
                                                                ? "Loading..."
                                                                : isFree && trialActive
                                                                    ? "Free trial active"
                                                                    : isFree
                                                                        ? "Trial expired"
                                                                        : billing.hasBilling && billing.billingStatus
                                                                            ? formatBillingStatus(billing.billingStatus)
                                                                            : "—"}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div
                                                    className={styles.currentPlanActions}
                                                    style={{
                                                        display: "flex",
                                                        justifyContent: "flex-start",
                                                        marginTop: 4,
                                                    }}
                                                >
                                                    <button
                                                        type="button"
                                                        className={styles.pricingPrimaryBtn}
                                                        onClick={handleManageBilling}
                                                        disabled={
                                                            openingPortal ||
                                                            loadingBilling ||
                                                            !billing.workspaceId ||
                                                            !billing.stripeCustomerId
                                                        }
                                                    >
                                                        {openingPortal ? "Opening..." : "Manage Billing"}
                                                    </button>
                                                </div>
                                            </div>

                                            <div className={styles.pricingGrid}>
                                                <div className={styles.pricingCard}>
                                                    <div className={styles.planBadge}>Starter</div>

                                                    <div className={styles.pricingCardTitle}>
                                                        Built for early-stage teams
                                                    </div>

                                                    <div className={styles.pricingSmallText}>
                                                        Get started free for 2 weeks
                                                    </div>

                                                    <div className={styles.pricingRow}>
                                                        <div className={styles.pricingAmount}>£49</div>
                                                        <div className={styles.pricingInterval}>/month</div>
                                                    </div>

                                                    <div className={styles.pricingDescription}>
                                                        For early-stage SaaS teams that want clearer
                                                        visibility into churn risk and account health.
                                                    </div>

                                                    <div className={styles.pricingDivider} />

                                                    <ul className={styles.pricingFeatures}>
                                                        <li>Accounts at risk view</li>
                                                        <li>Basic churn visibility</li>
                                                        <li>Core account health signals</li>
                                                        <li>Clean dashboard overview</li>
                                                    </ul>

                                                    <button
                                                        type="button"
                                                        className={styles.pricingSecondaryBtn}
                                                        onClick={() => handleUpgrade("starter")}
                                                        disabled={
                                                            startingCheckout ||
                                                            loadingBilling ||
                                                            !firebaseUser ||
                                                            !billing.workspaceId ||
                                                            isStarter
                                                        }
                                                    >
                                                        {isStarter
                                                            ? "Current Plan"
                                                            : startingCheckout
                                                                ? "Redirecting..."
                                                                : "Choose Starter"}
                                                    </button>
                                                </div>

                                                <div
                                                    className={`${styles.pricingCard} ${styles.pricingCardFeatured}`}
                                                >
                                                    <div className={styles.planBadgeDark}>Pro</div>

                                                    <div className={styles.pricingCardTitle}>
                                                        Built for growing SaaS teams
                                                    </div>

                                                    <div className={styles.pricingSmallText}>
                                                        Get started free for 2 weeks then
                                                    </div>

                                                    <div className={styles.pricingRow}>
                                                        <div className={styles.pricingAmount}>£99</div>
                                                        <div className={styles.pricingInterval}>/month</div>
                                                    </div>

                                                    <div className={styles.pricingDescription}>
                                                        For growing teams that need deeper MRR insights,
                                                        stronger prioritisation, and faster actioning.
                                                    </div>

                                                    <div className={styles.pricingDivider} />

                                                    <ul className={styles.pricingFeatures}>
                                                        <li>Everything in Starter</li>
                                                        <li>Deeper MRR insights</li>
                                                        <li>Stronger customer prioritisation</li>
                                                        <li>Faster retention workflows</li>
                                                        <li>More advanced actioning</li>
                                                    </ul>

                                                    <button
                                                        type="button"
                                                        className={styles.pricingPrimaryBtn}
                                                        onClick={() => handleUpgrade("pro")}
                                                        disabled={
                                                            startingCheckout ||
                                                            loadingBilling ||
                                                            !firebaseUser ||
                                                            !billing.workspaceId ||
                                                            isPro
                                                        }
                                                    >
                                                        {isPro
                                                            ? "Current Plan"
                                                            : startingCheckout
                                                                ? "Redirecting..."
                                                                : "Upgrade to Pro"}
                                                    </button>
                                                </div>
                                            </div>

                                            {isFree && (
                                                <p className={styles.cardSubtext} style={{ marginTop: 12 }}>
                                                    {trialActive
                                                        ? `Your free trial ends on ${formatDate(
                                                            billing.trialEndsAt
                                                        )}. Choose Starter or Pro to keep using Cobrai without interruption.`
                                                        : "Your free trial has ended. Choose Starter or Pro to continue using Cobrai with your live workspace and billing data."}
                                                </p>
                                            )}
                                        </div>
                                    </section>
                                )}

                                {activeTab === "Support & Compliance" && (
                                    <section className={styles.card}>
                                        <div className={styles.contactSection}>
                                            <div className={styles.contactIntro}>
                                                <h2 className={styles.contactTitle}>
                                                    Contact support
                                                </h2>
                                                <p className={styles.contactText}>
                                                    We’ll get back to you within 24 hours.                                                </p>
                                            </div>

                                            <div className={styles.contactCard}>
                                                {supportMessage && (
                                                    <p style={{ marginBottom: 12 }}>{supportMessage}</p>
                                                )}

                                                <div className={styles.contactField}>
                                                    <label className={styles.contactLabel}>
                                                        Email
                                                    </label>
                                                    <input
                                                        type="email"
                                                        placeholder="your@email.com" className={styles.contactInput}
                                                        value={supportEmail}
                                                        onChange={(e) => setSupportEmail(e.target.value)}
                                                    />
                                                </div>

                                                <div className={styles.contactField}>
                                                    <label className={styles.contactLabel}>
                                                        Message
                                                    </label>
                                                    <textarea
                                                        placeholder="Describe your issue..."
                                                        className={styles.contactTextarea}
                                                        rows={5}
                                                        value={supportRequest}
                                                        onChange={(e) => setSupportRequest(e.target.value)}
                                                    />
                                                </div>

                                                <button
                                                    type="button"
                                                    className={styles.contactSubmit}
                                                    onClick={handleSendSupportRequest}
                                                    disabled={sendingSupport || !firebaseUser}
                                                >
                                                    {sendingSupport ? "Sending..." : "Send message"}
                                                </button>
                                            </div>
                                        </div>

                                        <div
                                            style={{
                                                marginTop: 24,
                                                paddingTop: 18,
                                                borderTop: "1px solid #e8eaee",
                                                display: "flex",
                                                gap: 10,
                                                flexWrap: "wrap",
                                            }}
                                        >
                                            <button
                                                type="button"
                                                className={styles.iconBtn}
                                                onClick={() => setLegalModal("terms")}
                                            >
                                                Terms of Service
                                            </button>

                                            <button
                                                type="button"
                                                className={styles.iconBtn}
                                                onClick={() => setLegalModal("privacy")}
                                            >
                                                Privacy Policy
                                            </button>
                                        </div>
                                    </section>
                                )}

                            </div>
                        </div>
                    </section>
                </div>
            </main>

            {legalModal && (
                <div
                    style={{
                        position: "fixed",
                        inset: 0,
                        background: "rgba(15, 23, 42, 0.45)",
                        backdropFilter: "blur(3px)",
                        zIndex: 1000,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 20,
                    }}
                    onClick={() => setLegalModal(null)}
                >
                    <div
                        style={{
                            width: "100%",
                            maxWidth: 820,
                            maxHeight: "85vh",
                            overflowY: "auto",
                            background: "#ffffff",
                            borderRadius: 24,
                            boxShadow: "0 24px 80px rgba(15, 23, 42, 0.18)",
                            border: "1px solid rgba(15, 23, 42, 0.08)",
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 16,
                                padding: "22px 24px",
                                borderBottom: "1px solid #e8eaee",
                                position: "sticky",
                                top: 0,
                                background: "#ffffff",
                                borderTopLeftRadius: 24,
                                borderTopRightRadius: 24,
                            }}
                        >
                            <h2
                                style={{
                                    margin: 0,
                                    fontSize: 18,
                                    fontWeight: 700,
                                    color: "#111827",
                                }}
                            >
                                {modalContent.title}
                            </h2>

                            <button
                                type="button"
                                onClick={() => setLegalModal(null)}
                                style={{
                                    width: 40,
                                    height: 40,
                                    borderRadius: 999,
                                    border: "0",
                                    background: "#f3f4f6",
                                    color: "#111827",
                                    fontSize: 26,
                                    lineHeight: 1,
                                    cursor: "pointer",
                                }}
                                aria-label="Close"
                            >
                                ×
                            </button>
                        </div>

                        <div
                            style={{
                                padding: "22px 24px 28px",
                                display: "flex",
                                flexDirection: "column",
                                gap: 24,
                            }}
                        >
                            {modalContent.sections.map((section) => (
                                <div key={section.heading}>
                                    <h3
                                        style={{
                                            margin: "0 0 10px",
                                            fontSize: 16,
                                            fontWeight: 700,
                                            color: "#111827",
                                        }}
                                    >
                                        {section.heading}
                                    </h3>

                                    <div
                                        style={{
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: 12,
                                        }}
                                    >
                                        {section.body.map((paragraph, index) => (
                                            <p
                                                key={`${section.heading}-${index}`}
                                                style={{
                                                    margin: 0,
                                                    fontSize: 15,
                                                    lineHeight: 1.7,
                                                    color: "#4b5563",
                                                }}
                                            >
                                                {paragraph}
                                            </p>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </>


    );
}

export default function SettingsPage() {
    return (
        <Suspense fallback={null}>
            <SettingsPageContent />
        </Suspense>
    );
}