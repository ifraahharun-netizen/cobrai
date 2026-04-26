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

type LegalView = "terms" | "privacy" | null;

export default function SignupPage() {
    const router = useRouter();

    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    const [agreed, setAgreed] = useState(false);
    const [legalView, setLegalView] = useState<LegalView>(null);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    function validateForm() {
        if (!fullName.trim()) return "Please enter your full name.";
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
            <main className="signupPage">
                <section className="signupReferenceWrap">
                    <div className="signupReferenceCard">
                        <div className="signupReferenceLeft">
                            <div className="signupReferenceInner">
                                <h1 className="signupRefTitle">Sign up</h1>
                                <p className="signupRefSubtitle">
                                    Let&apos;s get you all set up so you can access your Cobrai
                                    account.
                                </p>

                                <form onSubmit={onSubmit} className="signupRefForm">
                                    <div className="signupRefField">
                                        <label htmlFor="fullName">Full Name</label>
                                        <input
                                            id="fullName"
                                            type="text"
                                            value={fullName}
                                            onChange={(e) => setFullName(e.target.value)}
                                            autoComplete="name"
                                            disabled={loading}
                                        />
                                    </div>

                                    <div className="signupRefField">
                                        <label htmlFor="email">Email</label>
                                        <input
                                            id="email"
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            autoComplete="email"
                                            disabled={loading}
                                        />
                                    </div>

                                    <div className="signupRefField">
                                        <label htmlFor="password">Password</label>
                                        <input
                                            id="password"
                                            type="password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            autoComplete="new-password"
                                            disabled={loading}
                                        />
                                    </div>

                                    <label className="signupLegalRow">
                                        <input
                                            type="checkbox"
                                            checked={agreed}
                                            onChange={(e) => setAgreed(e.target.checked)}
                                            disabled={loading}
                                            className="signupLegalCheckbox"
                                        />
                                        <span className="signupLegalText">
                                            I agree to the{" "}
                                            <button
                                                type="button"
                                                className="signupLegalLink"
                                                onClick={() => setLegalView("terms")}
                                            >
                                                Terms
                                            </button>{" "}
                                            and{" "}
                                            <button
                                                type="button"
                                                className="signupLegalLink"
                                                onClick={() => setLegalView("privacy")}
                                            >
                                                Privacy Policy
                                            </button>
                                        </span>
                                    </label>

                                    {error ? <div className="signupRefError">{error}</div> : null}

                                    <button
                                        type="submit"
                                        className="signupRefButton"
                                        disabled={loading}
                                    >
                                        {loading ? "Creating account..." : "Create account"}
                                    </button>
                                </form>

                                <p className="signupRefLogin">
                                    Already have an account? <Link href="/login">Login</Link>
                                </p>
                            </div>
                        </div>

                        <div className="signupReferenceRight">
                            <div className="signupRefVisual">
                                <div className="signupRefShape signupRefShapeOne" />
                                <div className="signupRefShape signupRefShapeTwo" />
                                <div className="signupRefShape signupRefShapeThree" />

                                <div className="signupRefVisualContent">
                                    <h2 className="signupRefVisualTitle">
                                        Protect revenue
                                        <br />
                                        with Cobrai
                                    </h2>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </main>

            <TermsModal
                open={legalView !== null}
                title={modalTitle}
                sections={modalSections}
                onClose={() => setLegalView(null)}
            />
        </>
    );
}