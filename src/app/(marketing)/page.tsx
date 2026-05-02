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
                            <p className="eyebrow">Retention Intelligence</p>

                            <h1 className="heroTitle">
                                Stop churn before it costs you revenue.
                            </h1>

                            <p className="heroText">
                                Cobrai shows you which customers are at risk, why they are
                                slipping, and what action to take next — so you can protect
                                MRR before customers leave.
                            </p>

                            <div className="heroActions">
                                <Link href="/signup" className="primaryBtn">
                                    Start Free — See At-Risk Revenue
                                </Link>

                                <button
                                    type="button"
                                    className="secondaryBtn"
                                    onClick={() => setShowDemo(true)}
                                >
                                    View Demo
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="heroRight">
                        <div className="loginWrap">
                            <div className="loginIntro">
                                <h3 className="loginHeading">Login</h3>
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
                            </form>
                        </div>
                    </div>
                </div>

                <div className="homeStory homeStoryWide">
                    <div className="storyCard storyCardMerged storyCardWide">
                        <h3 className="storyTitle">
                            Stop guessing why customers leave.
                        </h3>

                        <p className="storyText storyTextLead">
                            Most teams only notice churn after the revenue is already gone.
                            Cobrai gives you earlier visibility into risk, revenue exposure,
                            and the next best action for each account.
                        </p>

                        <div className="storyPoints">
                            <div className="storyPoint">
                                <span className="storyPointTitle">
                                    Find at-risk customers early
                                </span>
                                <p className="storyPointText">
                                    See which accounts need attention before they cancel or
                                    become harder to recover.
                                </p>
                            </div>

                            <div className="storyPoint">
                                <span className="storyPointTitle">
                                    Prioritise by revenue impact
                                </span>
                                <p className="storyPointText">
                                    Focus on the customers where action can protect the most
                                    MRR.
                                </p>
                            </div>

                            <div className="storyPoint">
                                <span className="storyPointTitle">
                                    Know what to do next
                                </span>
                                <p className="storyPointText">
                                    Turn churn signals into clear retention actions your team
                                    can act on quickly.
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

                            <h2>See how Cobrai protects revenue</h2>

                            <p className="demoIntro">
                                Cobrai connects your customer and billing signals, detects
                                churn risk early, and helps your team take action before MRR
                                is lost.
                            </p>

                            <div className="demoSteps">
                                <div className="demoStep">
                                    <span>01</span>
                                    <h3>Connect your tools</h3>
                                    <p>
                                        Bring together billing, customer, and activity data
                                        from the tools your team already uses.
                                    </p>
                                </div>

                                <div className="demoStep">
                                    <span>02</span>
                                    <h3>Spot revenue at risk</h3>
                                    <p>
                                        Cobrai highlights customers showing churn signals and
                                        ranks them by urgency and MRR impact.
                                    </p>
                                </div>

                                <div className="demoStep">
                                    <span>03</span>
                                    <h3>Take action earlier</h3>
                                    <p>
                                        Use clear recommendations and suggested outreach to
                                        recover customers before they leave.
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