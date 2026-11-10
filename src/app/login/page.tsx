"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { getFirebaseAuthSafe } from "@/lib/firebase.client";
import styles from "@/styles/auth.module.css";
import AuthShell from "@/components/auth/AuthShell";
import { AuthInput, AuthPasswordInput } from "@/components/auth/AuthInputs";

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
        <AuthShell
            mode="login"
            title="Welcome back"
            subtitle="Sign in to see which customers need you today."
        >
            <form onSubmit={onSubmit} className={styles.form} noValidate>
                <AuthInput
                    id="email"
                    type="email"
                    label="Email"
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
                    placeholder="••••••••"
                    autoComplete="current-password"
                    disabled={loading}
                />

                <div className={styles.row}>
                    <span>
                        Forgot{" "}
                        <Link href="/forgot-password" className={styles.link}>
                            password
                        </Link>{" "}
                        or{" "}
                        <Link href="/recover-email" className={styles.link}>
                            email
                        </Link>
                        ?
                    </span>
                </div>

                {error ? (
                    <div className={styles.error} role="alert">
                        {error}
                    </div>
                ) : null}

                <button type="submit" className={styles.button} disabled={loading}>
                    {loading ? "Logging in..." : "Log in"}
                </button>
            </form>

            <p className={styles.footer}>
                Don&apos;t have an account?{" "}
                <Link href="/signup" className={styles.link}>
                    Create account
                </Link>
            </p>
        </AuthShell>
    );
}
