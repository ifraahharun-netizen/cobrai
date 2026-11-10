"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    createUserWithEmailAndPassword,
    updateProfile,
} from "firebase/auth";
import { getFirebaseAuthSafe } from "@/lib/firebase.client";
import TermsModal from "@/components/TermsModal";
import { privacyContent, termsContent } from "@/lib/legalContent";
import styles from "@/styles/auth.module.css";
import AuthShell from "@/components/auth/AuthShell";
import { AuthInput, AuthPasswordInput } from "@/components/auth/AuthInputs";

type LegalView = "terms" | "privacy" | null;
 
export default function SignupPage() {
    const router = useRouter();

    const [fullName, setFullName] = useState("");
    const [companyName, setCompanyName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    const [agreed, setAgreed] = useState(false);
    const [legalView, setLegalView] = useState<LegalView>(null);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    function validateForm() {
        if (!fullName.trim()) return "Please enter your full name.";
        if (!companyName.trim()) return "Please enter your company name.";
        if (!email.trim()) return "Please enter your email.";
        if (!/\S+@\S+\.\S+/.test(email.trim())) return "Please enter a valid email.";
        if (!password) return "Please enter a password.";
        if (password.length < 8) return "Password must be at least 8 characters.";
        if (!agreed) return "Please agree to the Terms and Privacy Policy.";
        return "";
    }

    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError("");

        const validationError = validateForm();
        if (validationError) {
            setError(validationError);
            return;
        }

        setLoading(true);

        try {
            const firebase = getFirebaseAuthSafe();

            if (!firebase.ok) {
                setError(
                    firebase.error === "auth/invalid-api-key"
                        ? "Firebase config is blocked. Check your Firebase API key restrictions."
                        : `Auth setup error: ${firebase.error}`
                );
                return;
            }

            const cleanEmail = email.trim().toLowerCase();
            const auth = firebase.auth;

            const credential = await createUserWithEmailAndPassword(
                auth,
                cleanEmail,
                password
            );

            if (fullName.trim()) {
                await updateProfile(credential.user, {
                    displayName: fullName.trim(),
                });
            }

            const idToken = await credential.user.getIdToken();

            const registerRes = await fetch("/api/auth/register", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({
                    fullName: fullName.trim(),
                    companyName: companyName.trim(),
                }),
            });

            let data: any = null;
            try {
                data = await registerRes.json();
            } catch {
                data = null;
            }

            if (!registerRes.ok || !data?.ok) {
                throw new Error(data?.error || "Failed to finish account setup.");
            }

            router.push("/dashboard");
        } catch (err: any) {
            const code = err?.code || "";

            const message =
                code === "auth/email-already-in-use"
                    ? "That email is already in use."
                    : code === "auth/invalid-email"
                        ? "That email address is invalid."
                        : code === "auth/weak-password"
                            ? "Please choose a stronger password."
                            : err?.message || "Something went wrong creating your account.";

            setError(message);
        } finally {
            setLoading(false);
        }
    }

    const modalTitle =
        legalView === "terms"
            ? termsContent.title
            : legalView === "privacy"
                ? privacyContent.title
                : "";

    const modalSections =
        legalView === "terms"
            ? termsContent.sections
            : legalView === "privacy"
                ? privacyContent.sections
                : [];

    return (
        <>
            <AuthShell
                mode="signup"
                title="Create your workspace"
                subtitle="Find at-risk customers and act before they leave."
            >
                <form onSubmit={onSubmit} className={styles.form} noValidate>
                    <AuthInput
                        id="fullName"
                        type="text"
                        label="Full name"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Jane Smith"
                        autoComplete="name"
                        disabled={loading}
                    />

                    <AuthInput
                        id="companyName"
                        type="text"
                        label="Company name"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        placeholder="Acme Inc"
                        autoComplete="organization"
                        disabled={loading}
                    />

                    <AuthInput
                        id="email"
                        type="email"
                        label="Work email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@company.com"
                        autoComplete="email"
                        disabled={loading}
                    />

                    <AuthPasswordInput
                        id="password"
                        label="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="At least 8 characters"
                        autoComplete="new-password"
                        disabled={loading}
                    />

                    <label className={styles.checkRow}>
                        <input
                            type="checkbox"
                            checked={agreed}
                            onChange={(e) => setAgreed(e.target.checked)}
                            disabled={loading}
                        />
                        <span>
                            I agree to the{" "}
                            <button
                                type="button"
                                className={styles.legalLink}
                                onClick={() => setLegalView("terms")}
                            >
                                Terms
                            </button>{" "}
                            and{" "}
                            <button
                                type="button"
                                className={styles.legalLink}
                                onClick={() => setLegalView("privacy")}
                            >
                                Privacy Policy
                            </button>
                        </span>
                    </label>

                    {error ? (
                        <div className={styles.error} role="alert">
                            {error}
                        </div>
                    ) : null}

                    <button type="submit" className={styles.button} disabled={loading}>
                        {loading ? "Creating account..." : "Create account"}
                    </button>
                </form>

                <p className={styles.footer}>
                    Already have an account?{" "}
                    <Link href="/login" className={styles.link}>
                        Log in
                    </Link>
                </p>
            </AuthShell>

            <TermsModal
                open={legalView !== null}
                title={modalTitle}
                sections={modalSections}
                onClose={() => setLegalView(null)}
            />
        </>
    );
}