"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { getFirebaseAuthSafe } from "@/lib/firebase.client";

export default function LoginPage() {
    const router = useRouter();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError("");

        if (!email.trim()) return setError("Please enter your email.");
        if (!password) return setError("Please enter your password.");

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

            const credential = await signInWithEmailAndPassword(
                firebase.auth,
                email.trim().toLowerCase(),
                password
            );

            const idToken = await credential.user.getIdToken(true);

            const sessionRes = await fetch("/api/auth/session", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ idToken }),
            });

            if (!sessionRes.ok) {
                throw new Error("Login succeeded, but session could not be created.");
            }

            router.push("/dashboard");
            router.refresh();
        } catch (err: any) {
            const message =
                err?.code === "auth/invalid-credential"
                    ? "Incorrect email or password."
                    : err?.message || "Login failed. Try again.";

            setError(message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <main className="signupPage">
            <section className="signupReferenceWrap">
                <div className="signupReferenceCard">
                    <div className="signupReferenceLeft">
                        <div className="signupReferenceInner">
                            <h1 className="signupRefTitle">Login</h1>

                            <p className="signupRefSubtitle">
                                Welcome back
                            </p>

                            <form onSubmit={onSubmit} className="signupRefForm">
                                <div className="signupRefField">
                                    <label htmlFor="email">Email</label>
                                    <input
                                        id="email"
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="Enter your email"
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
                                        placeholder="Enter your password"
                                        autoComplete="current-password"
                                        disabled={loading}
                                    />
                                </div>

                                {error ? <div className="signupRefError">{error}</div> : null}

                                <button type="submit" className="signupRefButton" disabled={loading}>
                                    {loading ? "Logging in..." : "Login"}
                                </button>
                            </form>

                            <p className="forgotRow">
                                Forgot{" "}
                                <Link href="/forgot-password" className="forgotLink">
                                    password
                                </Link>{" "}
                                or{" "}
                                <Link href="/recover-email" className="forgotLink">
                                    email
                                </Link>
                                ?
                            </p>

                            <p className="signupRefLogin">
                                Don&apos;t have an account?{" "}
                                <Link href="/signup">Create account</Link>
                            </p>
                        </div>
                    </div>

                    <div className="signupReferenceRight">
                        <div className="signupRefVisual">
                            <div className="signupRefShape signupRefShapeTwo" />

                            <div className="signupRefVisualContent">
                                <h2 className="signupRefVisualTitle">
                                    Stop churn
                                    <br />
                                    before revenue drops.
                                </h2>

                                <p className="signupRefVisualText">
                                    Identify risk, understand why, and take action before customers leave.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </main>
    );
}