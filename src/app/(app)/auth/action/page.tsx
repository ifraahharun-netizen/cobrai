"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
    applyActionCode,
    confirmPasswordReset,
    signInWithEmailAndPassword,
    verifyPasswordResetCode,
} from "firebase/auth";
import { getFirebaseAuthSafe } from "@/lib/firebase.client";

function AuthActionContent() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const mode = searchParams.get("mode");
    const oobCode = searchParams.get("oobCode");

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    const passwordChecks = useMemo(() => {
        return {
            length: password.length >= 8,
            uppercase: /[A-Z]/.test(password),
            lowercase: /[a-z]/.test(password),
            number: /\d/.test(password),
        };
    }, [password]);

    const passwordStrong =
        passwordChecks.length &&
        passwordChecks.uppercase &&
        passwordChecks.lowercase &&
        passwordChecks.number;

    const passwordsMatch =
        password.length > 0 &&
        confirmPassword.length > 0 &&
        password === confirmPassword;

    useEffect(() => {
        async function validateLink() {
            try {
                setLoading(true);
                setError("");

                const res = getFirebaseAuthSafe();

                if (!res.ok) {
                    throw new Error("Auth setup error. Please try again.");
                }

                if (!mode || !oobCode) {
                    throw new Error("This account link is invalid.");
                }

                if (mode === "resetPassword") {
                    const accountEmail = await verifyPasswordResetCode(
                        res.auth,
                        oobCode
                    );

                    setEmail(accountEmail);
                    return;
                }

                if (mode === "verifyEmail") {
                    await applyActionCode(res.auth, oobCode);
                    setMessage("Email verified successfully. Redirecting to login...");

                    setTimeout(() => {
                        router.push("/login");
                    }, 1800);

                    return;
                }

                throw new Error("This account action is not supported.");
            } catch (err: any) {
                setError(
                    err?.message ||
                    "This link is invalid, expired, or has already been used."
                );
            } finally {
                setLoading(false);
            }
        }

        validateLink();
    }, [mode, oobCode, router]);

    async function handleResetPassword() {
        try {
            setSubmitting(true);
            setError("");
            setMessage("");

            const res = getFirebaseAuthSafe();

            if (!res.ok) {
                throw new Error("Auth setup error. Please try again.");
            }

            if (!oobCode) {
                throw new Error("Missing reset code.");
            }

            if (!passwordStrong) {
                throw new Error(
                    "Please use at least 8 characters, including uppercase, lowercase, and a number."
                );
            }

            if (!passwordsMatch) {
                throw new Error("Passwords do not match.");
            }

            await confirmPasswordReset(res.auth, oobCode, password);

            try {
                if (email) {
                    await signInWithEmailAndPassword(res.auth, email, password);
                    setMessage("Password updated successfully. Redirecting to your dashboard...");

                    setTimeout(() => {
                        router.push("/dashboard");
                    }, 1600);

                    return;
                }
            } catch {
                setMessage("Password updated successfully. Redirecting to login...");

                setTimeout(() => {
                    router.push("/login");
                }, 1600);

                return;
            }

            setMessage("Password updated successfully. Redirecting to login...");

            setTimeout(() => {
                router.push("/login");
            }, 1600);
        } catch (err: any) {
            setError(err?.message || "Failed to reset password.");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <main
            style={{
                minHeight: "100vh",
                background:
                    "radial-gradient(circle at top, #f8fafc 0%, #ffffff 42%, #f4f4f5 100%)",
                color: "#0b1220",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 24,
                fontFamily: "inherit",
            }}
        >
            <section
                style={{
                    width: "100%",
                    maxWidth: 460,
                    background: "#ffffff",
                    border: "1px solid #e5e7eb",
                    borderRadius: 28,
                    padding: 28,
                    boxShadow: "0 28px 90px rgba(15, 23, 42, 0.10)",
                }}
            >
                <div style={{ marginBottom: 26 }}>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            marginBottom: 18,
                        }}
                    >
                        <span
                            style={{
                                fontSize: 24,
                                fontWeight: 650,
                                letterSpacing: "-0.05em",
                            }}
                        >
                            Cobrai
                        </span>
                    </div>

                    <h1
                        style={{
                            margin: 0,
                            fontSize: 30,
                            lineHeight: 1.05,
                            fontWeight: 650,
                            letterSpacing: "-0.06em",
                        }}
                    >
                        {mode === "verifyEmail"
                            ? "Verifying your email"
                            : "Reset your password"}
                    </h1>

                    <p
                        style={{
                            margin: "12px 0 0",
                            color: "#64748b",
                            fontSize: 15,
                            lineHeight: 1.6,
                        }}
                    >
                        {mode === "verifyEmail"
                            ? "We’re confirming your Cobrai account email."
                            : "Choose a secure new password for your Cobrai account."}
                    </p>
                </div>

                {loading && (
                    <p style={{ margin: 0, color: "#64748b" }}>Checking your link...</p>
                )}

                {!loading && error && (
                    <div
                        style={{
                            border: "1px solid #fecaca",
                            background: "#fef2f2",
                            color: "#991b1b",
                            borderRadius: 16,
                            padding: 14,
                            fontSize: 14,
                            lineHeight: 1.5,
                        }}
                    >
                        {error}
                    </div>
                )}

                {!loading && message && (
                    <div
                        style={{
                            border: "1px solid #bbf7d0",
                            background: "#f0fdf4",
                            color: "#166534",
                            borderRadius: 16,
                            padding: 14,
                            fontSize: 14,
                            lineHeight: 1.5,
                        }}
                    >
                        {message}
                    </div>
                )}

                {!loading && !error && !message && mode === "resetPassword" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                        {email && (
                            <div
                                style={{
                                    border: "1px solid #e5e7eb",
                                    background: "#f8fafc",
                                    borderRadius: 16,
                                    padding: 14,
                                }}
                            >
                                <div
                                    style={{
                                        fontSize: 12,
                                        color: "#64748b",
                                        fontWeight: 700,
                                        marginBottom: 4,
                                    }}
                                >
                                    Account
                                </div>
                                <div
                                    style={{
                                        fontSize: 14,
                                        color: "#0b1220",
                                        wordBreak: "break-word",
                                    }}
                                >
                                    {email}
                                </div>
                            </div>
                        )}

                        <div>
                            <label
                                style={{
                                    display: "block",
                                    fontSize: 13,
                                    fontWeight: 700,
                                    marginBottom: 8,
                                }}
                            >
                                New password
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Enter new password"
                                style={{
                                    width: "100%",
                                    height: 50,
                                    border: "1px solid #e5e7eb",
                                    borderRadius: 14,
                                    padding: "0 14px",
                                    fontSize: 15,
                                    outline: "none",
                                }}
                            />
                        </div>

                        <div>
                            <label
                                style={{
                                    display: "block",
                                    fontSize: 13,
                                    fontWeight: 700,
                                    marginBottom: 8,
                                }}
                            >
                                Confirm password
                            </label>
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="Confirm new password"
                                style={{
                                    width: "100%",
                                    height: 50,
                                    border: "1px solid #e5e7eb",
                                    borderRadius: 14,
                                    padding: "0 14px",
                                    fontSize: 15,
                                    outline: "none",
                                }}
                            />
                        </div>

                        <div
                            style={{
                                border: "1px solid #e5e7eb",
                                borderRadius: 16,
                                padding: 14,
                                display: "flex",
                                flexDirection: "column",
                                gap: 8,
                            }}
                        >
                            <PasswordCheck valid={passwordChecks.length} text="At least 8 characters" />
                            <PasswordCheck valid={passwordChecks.uppercase} text="One uppercase letter" />
                            <PasswordCheck valid={passwordChecks.lowercase} text="One lowercase letter" />
                            <PasswordCheck valid={passwordChecks.number} text="One number" />
                            <PasswordCheck valid={passwordsMatch} text="Passwords match" />
                        </div>

                        <button
                            type="button"
                            onClick={handleResetPassword}
                            disabled={submitting || !passwordStrong || !passwordsMatch}
                            style={{
                                height: 52,
                                borderRadius: 16,
                                border: 0,
                                background:
                                    submitting || !passwordStrong || !passwordsMatch
                                        ? "#9ca3af"
                                        : "#0b1220",
                                color: "#ffffff",
                                fontWeight: 800,
                                cursor:
                                    submitting || !passwordStrong || !passwordsMatch
                                        ? "not-allowed"
                                        : "pointer",
                                fontSize: 15,
                            }}
                        >
                            {submitting ? "Updating password..." : "Reset password"}
                        </button>

                        <button
                            type="button"
                            onClick={() => router.push("/login")}
                            style={{
                                border: 0,
                                background: "transparent",
                                color: "#64748b",
                                fontWeight: 700,
                                cursor: "pointer",
                                padding: 8,
                            }}
                        >
                            Back to login
                        </button>
                    </div>
                )}
            </section>
        </main>
    );
}

function PasswordCheck({ valid, text }: { valid: boolean; text: string }) {
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                color: valid ? "#166534" : "#64748b",
            }}
        >
            <span
                style={{
                    width: 18,
                    height: 18,
                    borderRadius: 999,
                    background: valid ? "#dcfce7" : "#f1f5f9",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 900,
                }}
            >
                {valid ? "✓" : "•"}
            </span>
            {text}
        </div>
    );
}

export default function AuthActionPage() {
    return (
        <Suspense fallback={null}>
            <AuthActionContent />
        </Suspense>
    );
}