"use client";

import { useState } from "react";
import Link from "next/link";
import { sendPasswordResetEmail } from "firebase/auth";
import { getFirebaseAuthSafe } from "@/lib/firebase.client";

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    async function handleReset(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();

        try {
            setLoading(true);
            setMessage("");
            setError("");

            const res = getFirebaseAuthSafe();

            if (!res.ok) {
                throw new Error("Auth setup error. Try again.");
            }

            if (!email.trim()) {
                throw new Error("Enter your email address.");
            }

            await sendPasswordResetEmail(res.auth, email.trim().toLowerCase(), {
                url: "https://app.cobrai.uk/auth/action",
                handleCodeInApp: true,
            });

            setMessage("Reset link sent. Check your inbox and follow the secure link.");
            setEmail("");
        } catch (err: any) {
            setError(
                err?.code === "auth/user-not-found"
                    ? "No account found with this email."
                    : err?.message || "Failed to send reset email."
            );
        } finally {
            setLoading(false);
        }
    }

    return (
        <section
            style={{
                width: "100%",
                border: "1px solid #e5e7eb",
                borderRadius: 28,
                padding: 28,
                background: "#ffffff",
                boxShadow: "0 24px 70px rgba(15, 23, 42, 0.08)",
            }}
        >
            <p
                style={{
                    margin: "0 0 8px",
                    fontSize: 13,
                    color: "#64748b",
                    fontWeight: 700,
                }}
            >
                Password recovery
            </p>

            <h1
                style={{
                    margin: 0,
                    fontSize: 30,
                    lineHeight: 1.1,
                    fontWeight: 850,
                    letterSpacing: "-0.04em",
                    color: "#0b1220",
                }}
            >
                Forgot password?
            </h1>

            <p
                style={{
                    margin: "14px 0 20px",
                    color: "#64748b",
                    lineHeight: 1.6,
                    fontSize: 15,
                }}
            >
                Enter your email and we’ll send a secure link to reset your Cobrai
                password.
            </p>

            <form onSubmit={handleReset}>
                <label
                    htmlFor="email"
                    style={{
                        display: "block",
                        fontSize: 13,
                        fontWeight: 750,
                        marginBottom: 8,
                        color: "#0b1220",
                    }}
                >
                    Email address
                </label>

                <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => {
                        setEmail(e.target.value);
                        setMessage("");
                        setError("");
                    }}
                    placeholder="you@example.com"
                    required
                    disabled={loading}
                    style={{
                        width: "100%",
                        boxSizing: "border-box",
                        height: 52,
                        border: "1px solid #e5e7eb",
                        borderRadius: 16,
                        padding: "0 15px",
                        fontSize: 15,
                        marginBottom: 16,
                        outline: "none",
                        background: loading ? "#f8fafc" : "#ffffff",
                        color: "#0b1220",
                    }}
                />

                <button
                    type="submit"
                    disabled={loading}
                    style={{
                        width: "100%",
                        height: 54,
                        borderRadius: 17,
                        border: 0,
                        background: loading ? "#334155" : "#0b1220",
                        color: "#ffffff",
                        fontWeight: 850,
                        fontSize: 15,
                        cursor: loading ? "not-allowed" : "pointer",
                        boxShadow: "0 16px 36px rgba(15, 23, 42, 0.14)",
                    }}
                >
                    {loading ? "Sending reset link..." : "Send reset link"}
                </button>
            </form>

            {(message || error) && (
                <p
                    style={{
                        margin: "16px 0 0",
                        color: error ? "#b45309" : "#166534",
                        background: error ? "#fffbeb" : "#f0fdf4",
                        border: `1px solid ${error ? "#fde68a" : "#bbf7d0"}`,
                        borderRadius: 14,
                        padding: "11px 12px",
                        fontSize: 13,
                        lineHeight: 1.5,
                    }}
                >
                    {error || message}
                </p>
            )}

            <Link
                href="/"
                style={{
                    display: "block",
                    marginTop: 18,
                    color: "#64748b",
                    fontSize: 14,
                    textDecoration: "none",
                    textAlign: "center",
                }}
            >
                Remember your password? Back to login
            </Link>

            <Link
                href="/recover-email"
                style={{
                    display: "block",
                    marginTop: 10,
                    color: "#64748b",
                    fontSize: 13,
                    textDecoration: "none",
                    textAlign: "center",
                }}
            >
                Forgot which email you used?
            </Link>
        </section>
    );
}