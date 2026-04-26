"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signInWithEmailAndPassword } from "firebase/auth";
import { getFirebaseAuthSafe } from "@/lib/firebase.client";

export default function HomePage() {
    const router = useRouter();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [showDemo, setShowDemo] = useState(false);

    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            const res = getFirebaseAuthSafe();

            if (!res.ok) {
                setError(
                    res.error === "auth/invalid-api-key"
                        ? "Firebase config is blocked (invalid API key). Check API key restrictions in Google Cloud."
                        : `Auth setup error: ${res.error}`
                );
                return;
            }

            await signInWithEmailAndPassword(
                res.auth,
                email.trim().toLowerCase(),
                password
            );

            router.push("/dashboard");
        } catch (err: any) {
            const msg =
                err?.code === "auth/invalid-credential"
                    ? "Incorrect email or password."
                    : err?.code === "auth/invalid-api-key"
                        ? "Firebase API key is invalid or restricted."
                        : err?.message || "Login failed. Try again.";

            setError(msg);
        } finally {
            setLoading(false);
        }
    }

    return (
        <section className="heroSection">
            <div className="heroShell">
                <div className="heroTopRow">
                    <div className="heroLeft">
                        <div className="heroContent">
                            <p className="eyebrow">Retention intelligence</p>

                            <h1 className="heroTitle">
                                Know who will churn — before it hits your revenue.
                            </h1>

                            <p className="heroText">
                                Cobrai shows which customers are at risk, why it&apos;s
                                happening, and what actions will protect your revenue —
                                before it&apos;s too late.
                            </p>

                            <div className="heroActions">
                                <Link href="/signup" className="primaryBtn">
                                    Start Free — See At-Risk Revenue in Minutes
                                </Link>

                                <button
                                    type="button"
                                    className="secondaryBtn"
                                    onClick={() => setShowDemo(true)}
                                >
                                    See Cobrai in Action
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="heroRight">
                        <div className="loginWrap">
                            <div className="loginIntro">
                                <h3 className="loginHeading">
                                    Login
                                </h3>
                            </div>

                            <form className="loginCard" onSubmit={onSubmit}>
                                <label className="label" htmlFor="email">
                                    Email
                                </label>
                                <input
                                    id="email"
                                    className="input"
                                    type="email"
                                    placeholder="Email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    autoComplete="email"
                                    required
                                />

                                <label className="label" htmlFor="password">
                                    Password
                                </label>
                                <input
                                    id="password"
                                    className="input"
                                    type="password"
                                    placeholder="Password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    autoComplete="current-password"
                                    required
                                />

                                {error ? <p className="error">{error}</p> : null}

                                <button className="loginBtn" type="submit" disabled={loading}>
                                    {loading ? "Logging in..." : "Login"}
                                </button>

                                <Link className="forgot" href="/forgot-password">
                                    Forgot password?
                                </Link>
                            </form>
                        </div>
                    </div>
                </div>

                <div className="homeStory homeStoryWide">
                    <div className="storyCard storyCardMerged storyCardWide">
                        <h3 className="storyTitle">
                            Retention teams need clarity, not more scattered data.
                        </h3>

                        <p className="storyText storyTextLead">
                            Cobrai helps modern SaaS teams spot churn risk earlier,
                            understand what is driving it, and focus on the actions most
                            likely to protect revenue.
                        </p>

                        <div className="storyPoints">
                            <div className="storyPoint">
                                <span className="storyPointTitle">
                                    Early warning on churn risk
                                </span>
                                <p className="storyPointText">
                                    See which customers need attention before revenue is
                                    lost.
                                </p>
                            </div>

                            <div className="storyPoint">
                                <span className="storyPointTitle">
                                    Revenue-based prioritisation
                                </span>
                                <p className="storyPointText">
                                    Focus on the accounts and risks that matter most to MRR.
                                </p>
                            </div>

                            <div className="storyPoint">
                                <span className="storyPointTitle">
                                    Clear next actions
                                </span>
                                <p className="storyPointText">
                                    Move from signals to action with better retention
                                    decisions.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {showDemo && (
                    <div className="demoOverlay" onClick={() => setShowDemo(false)}>
                        <div className="demoModal" onClick={(e) => e.stopPropagation()}>
                            <button
                                type="button"
                                className="demoClose"
                                onClick={() => setShowDemo(false)}
                            >
                                ×
                            </button>

                            <p className="demoEyebrow">PRODUCT WALKTHROUGH</p>

                            <h2>See how Cobrai works</h2>

                            <p className="demoIntro">
                                Cobrai helps subscription businesses spot churn risk early,
                                understand why customers may leave, and take action before
                                revenue is lost.
                            </p>

                            <div className="demoSteps">
                                <div className="demoStep">
                                    <span>01</span>
                                    <h3>Connect your data</h3>
                                    <p>
                                        Sync billing and customer activity from tools like
                                        Stripe and HubSpot.
                                    </p>
                                </div>

                                <div className="demoStep">
                                    <span>02</span>
                                    <h3>Find at-risk customers</h3>
                                    <p>
                                        Cobrai highlights customers showing churn signals and
                                        revenue risk.
                                    </p>
                                </div>

                                <div className="demoStep">
                                    <span>03</span>
                                    <h3>Take retention action</h3>
                                    <p>
                                        Use recommended actions to recover customers before
                                        they cancel.
                                    </p>
                                </div>
                            </div>

                            <div className="demoActions">
                                <Link href="/signup" className="demoPrimary">
                                    Start Free
                                </Link>

                                <button
                                    type="button"
                                    className="demoSecondary"
                                    onClick={() => setShowDemo(false)}
                                >
                                    Maybe later
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
}