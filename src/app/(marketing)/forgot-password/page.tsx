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
        setError("");
        setMessage("");
        setLoading(true);

        try {
            const res = getFirebaseAuthSafe();

            if (!res.ok) {
                setError("Auth setup error. Try again.");
                return;
            }

            await sendPasswordResetEmail(res.auth, email.trim().toLowerCase());

            setMessage("Password reset email sent. Check your inbox.");
        } catch (err: any) {
            const msg =
                err?.code === "auth/user-not-found"
                    ? "No account found with this email."
                    : err?.message || "Failed to send reset email.";

            setError(msg);
        } finally {
            setLoading(false);
        }
    }

    return (
        <section className="heroSection">
            <div className="heroShell">
                <div className="loginWrap" style={{ maxWidth: "520px", margin: "0 auto" }}>
                    <div className="loginIntro">
                        <h3 className="loginHeading">Reset your password</h3>
                        <p className="heroText" style={{ margin: "8px 0 0", fontSize: "15px" }}>
                            Enter your email and we’ll send you a reset link.
                        </p>
                    </div>

                    <form className="loginCard" onSubmit={handleReset}>
                        <label className="label" htmlFor="email">
                            Email
                        </label>

                        <input
                            id="email"
                            className="input"
                            type="email"
                            placeholder="Enter your email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            autoComplete="email"
                            required
                        />

                        {error ? <p className="error">{error}</p> : null}
                        {message ? <p className="success">{message}</p> : null}

                        <button className="loginBtn" type="submit" disabled={loading}>
                            {loading ? "Sending..." : "Send reset email"}
                        </button>

                        <Link href="/" className="forgot">
                            Back to login
                        </Link>
                    </form>
                </div>
            </div>
        </section>
    );
}