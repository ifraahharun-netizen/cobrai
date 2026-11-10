"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { getFirebaseAuthSafe } from "@/lib/firebase.client";
import styles from "@/styles/auth.module.css";

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
        <div className={styles.page}>
            <div className={styles.backdrop} aria-hidden="true">
                <div className={styles.glow} />
                <div className={`${styles.ring} ${styles.ring1}`} />
                <div className={`${styles.ring} ${styles.ring2}`} />
                <div className={`${styles.ring} ${styles.ring3}`} />
                <div className={`${styles.ring} ${styles.ring4}`} />
            </div>

            <header className={styles.topBar}>
                <Link href="/" className={styles.brand}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/icon.svg" alt="" className={styles.brandMark} />
                    Cobrai
                </Link>
                <Link href="/signup" className={styles.topLink}>
                    Create account
                </Link>
            </header>

            <div className={`${styles.float} ${styles.floatLeft}`} aria-hidden="true">
                <span className={styles.floatIcon}>!</span>
                <span>
                    <span className={styles.floatTitle}>3 accounts at risk</span>
                    <span className={styles.floatMeta}>Usage down 40% this month</span>
                </span>
            </div>

            <div className={`${styles.float} ${styles.floatRight}`} aria-hidden="true">
                <span className={`${styles.floatIcon} ${styles.floatIconGreen}`}>&#10003;</span>
                <span>
                    <span className={styles.floatTitle}>Win-back email sent</span>
                    <span className={styles.floatMeta}>Acme Co &middot; 2 min ago</span>
                </span>
            </div>

            <main className={styles.main}>
                <div className={styles.column}>
                    <span className={styles.badge}>
                        <span className={styles.badgeDot} />
                        Retention intelligence
                    </span>

                    <h1 className={styles.title}>Welcome back</h1>

                    <p className={styles.subtitle}>
                        Stop churn before revenue drops. Identify risk, understand why, and take
                        action before customers leave.
                    </p>

                    <section className={styles.card}>
                        <form onSubmit={onSubmit} className={styles.form} noValidate>
                            <div className={styles.field}>
                                <label htmlFor="email">Email</label>
                                <input
                                    id="email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="you@company.com"
                                    autoComplete="email"
                                    disabled={loading}
                                />
                            </div>

                            <div className={styles.field}>
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

                            {error ? (
                                <div className={styles.error} role="alert">
                                    {error}
                                </div>
                            ) : null}

                            <button type="submit" className={styles.button} disabled={loading}>
                                {loading ? "Logging in..." : "Log in"}
                            </button>
                        </form>

                        <p className={styles.forgot}>
                            Forgot{" "}
                            <Link href="/forgot-password" className={styles.link}>
                                password
                            </Link>{" "}
                            or{" "}
                            <Link href="/recover-email" className={styles.link}>
                                email
                            </Link>
                            ?
                        </p>
                    </section>

                    <p className={styles.footer}>
                        Don&apos;t have an account?{" "}
                        <Link href="/signup" className={styles.link}>
                            Create account
                        </Link>
                    </p>
                </div>
            </main>
        </div>
    );
}
