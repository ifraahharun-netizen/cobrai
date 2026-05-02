"use client";

import { useState } from "react";
import Link from "next/link";

export default function RecoverEmailPage() {
    const [name, setName] = useState("");
    const [contactEmail, setContactEmail] = useState("");
    const [details, setDetails] = useState("");
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();

        try {
            setLoading(true);
            setMessage("");
            setError("");

            const res = await fetch("/api/support/recover-email", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    name: name.trim(),
                    contactEmail: contactEmail.trim().toLowerCase(),
                    details: details.trim(),
                }),
            });

            const data = await res.json();

            if (!res.ok || !data.ok) {
                throw new Error(data.error || "Could not send recovery request.");
            }

            setMessage("Request sent. We’ll help verify your account and get back to you shortly.");
            setName("");
            setContactEmail("");
            setDetails("");
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Something went wrong. Please try again."
            );
        } finally {
            setLoading(false);
        }
    }

    return (
        <main
            style={{
                minHeight: "100vh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 24,
                background:
                    "radial-gradient(circle at top, #f8fafc 0%, #ffffff 46%, #ffffff 100%)",
                color: "#0b1220",
            }}
        >
            <section
                style={{
                    width: "100%",
                    maxWidth: 460,
                    border: "1px solid #e5e7eb",
                    borderRadius: 30,
                    padding: 30,
                    background: "rgba(255,255,255,0.92)",
                    boxShadow: "0 28px 90px rgba(15, 23, 42, 0.08)",
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
                    Account recovery
                </p>

                <h1 style={{ margin: 0, fontSize: 32, lineHeight: 1.1, fontWeight: 850 }}>
                    Forgot your email?
                </h1>

                <p
                    style={{
                        margin: "14px 0 18px",
                        color: "#64748b",
                        lineHeight: 1.65,
                        fontSize: 15,
                    }}
                >
                    Send us a few details and we’ll help locate your Cobrai account securely.
                    We’ll only use this information to verify your account.
                </p>

                <div
                    style={{
                        border: "1px solid #eef2f7",
                        borderRadius: 18,
                        padding: "12px 14px",
                        background: "#f8fafc",
                        color: "#475569",
                        fontSize: 13,
                        lineHeight: 1.5,
                        marginBottom: 20,
                    }}
                >
                    Helpful details: company name, possible account emails, billing name,
                    last invoice, or anything you remember.
                </div>

                <form onSubmit={handleSubmit}>
                    <label htmlFor="name" style={labelStyle}>
                        Your name
                    </label>

                    <input
                        id="name"
                        type="text"
                        value={name}
                        onChange={(e) => {
                            setName(e.target.value);
                            setError("");
                            setMessage("");
                        }}
                        placeholder="Name"
                        required
                        disabled={loading}
                        style={inputStyle(loading)}
                    />

                    <label htmlFor="contactEmail" style={labelStyle}>
                        Contact email
                    </label>

                    <input
                        id="contactEmail"
                        type="email"
                        value={contactEmail}
                        onChange={(e) => {
                            setContactEmail(e.target.value);
                            setError("");
                            setMessage("");
                        }}
                        placeholder="Where should we contact you?"
                        required
                        disabled={loading}
                        style={inputStyle(loading)}
                    />

                    <label htmlFor="details" style={labelStyle}>
                        Account details
                    </label>

                    <textarea
                        id="details"
                        value={details}
                        onChange={(e) => {
                            setDetails(e.target.value);
                            setError("");
                            setMessage("");
                        }}
                        placeholder="Any information would be helpful"
                        required
                        rows={5}
                        disabled={loading}
                        style={{
                            ...inputStyle(loading),
                            height: "auto",
                            padding: 15,
                            resize: "vertical",
                            fontFamily: "inherit",
                            lineHeight: 1.5,
                        }}
                    />

                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
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
                        {loading ? "Sending request..." : "Help me find my email"}
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

                <p
                    style={{
                        margin: "16px 0 0",
                        color: "#64748b",
                        fontSize: 13,
                        textAlign: "center",
                        lineHeight: 1.5,
                    }}
                >
                    Need urgent help?{" "}
                    <a
                        href="mailto:cobrai@cobrai.uk"
                        style={{
                            color: "#0b1220",
                            fontWeight: 750,
                            textDecoration: "none",
                        }}
                    >
                        cobrai@cobrai.uk
                    </a>
                </p>

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
                    Remember your email? Back to login
                </Link>
            </section>
        </main>
    );
}

const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 13,
    fontWeight: 750,
    marginBottom: 8,
};

function inputStyle(loading: boolean): React.CSSProperties {
    return {
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
    };
}