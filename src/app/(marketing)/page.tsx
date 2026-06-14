"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import FeatureHeroVisual from "@/components/landing/FeatureHeroVisual";

const twitterBlue = "#1d9bf0";

const benefits = [
    {
        icon: "◎",
        title: "Detect churn risk early",
        text: "Identify at-risk accounts before they cancel.",
    },
    {
        icon: "▣",
        title: "AI-powered insights",
        text: "Understand the signals behind churn risk.",
    },
    {
        icon: "↯",
        title: "Take action with confidence",
        text: "Use data-driven AI insights to prioritize retention efforts.",
    },
    {
        icon: "↗",
        title: "The next best action",
        text: "Get AI recommendations to reduce preventable churn.",
    },
];

const starterFeatures = [
    "AI-powered churn insights",
    "Complete customer list ranked by risk score and MRR",
    "Customer health scoring",
    "Limited AI-generated retention emails",
    "MRR and churn trend charts",
    "Limited visibility into MRR drivers",
    "Limited visibility into churn drivers",
];

const proFeatures = [
    "Everything in Starter",
    "Unlimited AI insights",
    "Advanced MRR forecasting",
    "Churn prediction and retention signals",
    "Unlimited AI retention emails",
    "Automated failed payment recovery",
    "Retention execution monitoring",
    "Full visibility into MRR and churn drivers",
    "Critical account prioritisation",
    "Advanced retention automations",
];

export default function HomePage() {
    return (
        <section className="heroSection">
            <div className="heroShell">
                {/* HERO */}
                <div className="heroMinimal">
                    <p className="eyebrow">Retention Intelligence</p>

                    <h1 className="heroTitle">
                        Stop churn before
                        <br />
                        revenue drops.
                    </h1>

                    <p className="heroText">
                        Cobrai identifies at-risk customers, explains the warning
                        signals, and shows the next best action to protect MRR.
                    </p>

                    <p className="heroTrust">
                        Built for subscription businesses
                    </p>
                </div>

                {/* FEATURES */}
                <section id="features" className="featureSinglePage">
                    <div className="featureSingleShell">
                        <section className="homeBenefits">
                            <p className="featureEyebrow">
                                RETENTION INTELLIGENCE
                            </p>

                            <h2 className="homeBenefitsTitle">
                                Built to protect recurring revenue.
                            </h2>

                            <div className="homeBenefitsGrid">
                                {benefits.map((benefit) => (
                                    <div
                                        key={benefit.title}
                                        className="homeBenefitItem"
                                    >
                                        <div className="homeBenefitIcon">
                                            {benefit.icon}
                                        </div>

                                        <h3>{benefit.title}</h3>
                                        <p>{benefit.text}</p>
                                    </div>
                                ))}
                            </div>
                        </section>

                        <FeatureHeroVisual />
                    </div>
                </section>

                {/* PRICING */}
                <section id="pricing" className="landingSection">
                    <div className="sectionShell">
                        <div
                            style={{
                                maxWidth: "1080px",
                                margin: "0 auto",
                                border: "1px solid rgba(15, 23, 42, 0.06)",
                                borderRadius: "34px",
                                padding: "50px 34px 34px",
                                background: "#ffffff",
                            }}
                        >
                            <h2
                                className="sectionTitle"
                                style={{
                                    marginBottom: "14px",
                                    letterSpacing: "-0.08em",
                                    lineHeight: 0.95,
                                }}
                            >
                                Start free
                                <br />
                                Scale retention as you grow
                            </h2>

                            <p
                                className="sectionText"
                                style={{
                                    maxWidth: "720px",
                                    margin: "0 auto",
                                    fontSize: "0.95rem",
                                    lineHeight: 1.6,
                                    color: "#64748b",
                                }}
                            >
                                Built for subscription businesses that want clearer
                                customer visibility, stronger retention decisions,
                                and AI-powered revenue protection.
                            </p>

                            <div
                                style={{
                                    display: "grid",
                                    gridTemplateColumns:
                                        "repeat(2, minmax(0, 1fr))",
                                    gap: "20px",
                                    maxWidth: "820px",
                                    margin: "30px auto 0",
                                }}
                            >
                                {/* STARTER */}
                                <div
                                    style={{
                                        position: "relative",
                                        borderRadius: "26px",
                                        padding: "22px",
                                        background: "#ffffff",
                                        border:
                                            "1px solid rgba(15, 23, 42, 0.08)",
                                        display: "flex",
                                        flexDirection: "column",
                                    }}
                                >
                                    <div
                                        style={{
                                            display: "inline-flex",
                                            alignSelf: "flex-start",
                                            padding: "6px 12px",
                                            borderRadius: "999px",
                                            background:
                                                "rgba(29, 155, 240, 0.10)",
                                            color: twitterBlue,
                                            fontSize: "11px",
                                            fontWeight: 700,
                                            marginBottom: "10px",
                                        }}
                                    >
                                        Starter
                                    </div>

                                    <div
                                        style={{
                                            display: "inline-flex",
                                            alignSelf: "flex-start",
                                            marginBottom: "16px",
                                            fontSize: "0.82rem",
                                            fontWeight: 650,
                                            color: "#0f172a",
                                        }}
                                    >
                                        Try free for 14 days
                                    </div>

                                    <h3
                                        style={{
                                            fontSize: "1.5rem",
                                            lineHeight: 1.05,
                                            letterSpacing: "-0.06em",
                                            fontWeight: 560,
                                            color: "#0f172a",
                                            marginBottom: "14px",
                                        }}
                                    >
                                        Spot churn risk early and prioritise the
                                        customers that matter most.
                                    </h3>

                                    <p
                                        style={{
                                            fontSize: "0.88rem",
                                            lineHeight: 1.5,
                                            color: "#64748b",
                                            marginBottom: "18px",
                                        }}
                                    >
                                        For SaaS teams that need clear customer
                                        visibility, churn detection, and guided
                                        retention action.
                                    </p>

                                    <div
                                        style={{
                                            display: "flex",
                                            alignItems: "flex-end",
                                            gap: "7px",
                                            marginBottom: "18px",
                                        }}
                                    >
                                        <span
                                            style={{
                                                fontSize: "3rem",
                                                lineHeight: 0.9,
                                                letterSpacing: "-0.09em",
                                                fontWeight: 630,
                                                color: "#020617",
                                            }}
                                        >
                                            £99
                                        </span>

                                        <span
                                            style={{
                                                fontSize: "0.88rem",
                                                color: "#64748b",
                                                paddingBottom: "6px",
                                            }}
                                        >
                                            /month
                                        </span>
                                    </div>

                                    <div
                                        style={{
                                            height: "1px",
                                            background: "rgba(15,23,42,0.08)",
                                            marginBottom: "18px",
                                        }}
                                    />

                                    <ul
                                        style={{
                                            listStyle: "none",
                                            padding: 0,
                                            margin: 0,
                                            display: "grid",
                                            gap: "10px",
                                        }}
                                    >
                                        {starterFeatures.map((feature) => (
                                            <li
                                                key={feature}
                                                style={{
                                                    display: "flex",
                                                    alignItems: "flex-start",
                                                    gap: "10px",
                                                    color: "#475569",
                                                    fontSize: "0.86rem",
                                                    lineHeight: 1.42,
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        width: "18px",
                                                        height: "18px",
                                                        minWidth: "18px",
                                                        borderRadius: "999px",
                                                        background:
                                                            "rgba(29, 155, 240, 0.10)",
                                                        display: "flex",
                                                        alignItems: "center",
                                                        justifyContent: "center",
                                                        marginTop: "1px",
                                                    }}
                                                >
                                                    <Check
                                                        size={11}
                                                        strokeWidth={3}
                                                        color={twitterBlue}
                                                    />
                                                </div>

                                                <span>{feature}</span>
                                            </li>
                                        ))}
                                    </ul>

                                    <div
                                        style={{
                                            marginTop: "auto",
                                            paddingTop: "20px",
                                        }}
                                    >
                                        <Link
                                            href="/signup"
                                            style={{
                                                width: "100%",
                                                height: "48px",
                                                borderRadius: "16px",
                                                border:
                                                    "1px solid rgba(29, 155, 240, 0.18)",
                                                background: "#ffffff",
                                                color: twitterBlue,
                                                fontSize: "0.92rem",
                                                fontWeight: 600,
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                textDecoration: "none",
                                            }}
                                        >
                                            Start Free Trial
                                        </Link>
                                    </div>
                                </div>

                                {/* PRO */}
                                <div
                                    style={{
                                        position: "relative",
                                        borderRadius: "26px",
                                        padding: "22px",
                                        background:
                                            "linear-gradient(to bottom, rgba(29,155,240,0.03), #ffffff)",
                                        border:
                                            "1px solid rgba(29, 155, 240, 0.16)",
                                        display: "flex",
                                        flexDirection: "column",
                                        boxShadow:
                                            "0 10px 30px rgba(29,155,240,0.06)",
                                    }}
                                >
                                    <div
                                        style={{
                                            position: "absolute",
                                            top: "18px",
                                            right: "18px",
                                            padding: "6px 10px",
                                            borderRadius: "999px",
                                            background: twitterBlue,
                                            color: "#ffffff",
                                            fontSize: "10px",
                                            fontWeight: 700,
                                            letterSpacing: "0.03em",
                                        }}
                                    >
                                        MOST POPULAR
                                    </div>

                                    <div
                                        style={{
                                            display: "inline-flex",
                                            alignSelf: "flex-start",
                                            padding: "6px 12px",
                                            borderRadius: "999px",
                                            background: twitterBlue,
                                            color: "#ffffff",
                                            fontSize: "11px",
                                            fontWeight: 700,
                                            marginBottom: "10px",
                                        }}
                                    >
                                        Pro
                                    </div>

                                    <div
                                        style={{
                                            display: "inline-flex",
                                            alignSelf: "flex-start",
                                            marginBottom: "16px",
                                            fontSize: "0.82rem",
                                            fontWeight: 650,
                                            color: "#0f172a",
                                        }}
                                    >
                                        Try free for 14 days
                                    </div>

                                    <h3
                                        style={{
                                            fontSize: "1.5rem",
                                            lineHeight: 1.05,
                                            letterSpacing: "-0.06em",
                                            fontWeight: 560,
                                            color: "#0f172a",
                                            marginBottom: "14px",
                                        }}
                                    >
                                        Forecast revenue risk, automate recovery,
                                        and scale retention.
                                    </h3>

                                    <p
                                        style={{
                                            fontSize: "0.88rem",
                                            lineHeight: 1.5,
                                            color: "#64748b",
                                            marginBottom: "18px",
                                        }}
                                    >
                                        For growing SaaS teams that want deeper AI
                                        intelligence, automated recovery, and
                                        advanced retention workflows.
                                    </p>

                                    <div
                                        style={{
                                            display: "flex",
                                            alignItems: "flex-end",
                                            gap: "7px",
                                            marginBottom: "18px",
                                        }}
                                    >
                                        <span
                                            style={{
                                                fontSize: "3rem",
                                                lineHeight: 0.9,
                                                letterSpacing: "-0.09em",
                                                fontWeight: 630,
                                                color: "#020617",
                                            }}
                                        >
                                            £299
                                        </span>

                                        <span
                                            style={{
                                                fontSize: "0.88rem",
                                                color: "#64748b",
                                                paddingBottom: "6px",
                                            }}
                                        >
                                            /month
                                        </span>
                                    </div>

                                    <div
                                        style={{
                                            height: "1px",
                                            background: "rgba(15,23,42,0.08)",
                                            marginBottom: "18px",
                                        }}
                                    />

                                    <ul
                                        style={{
                                            listStyle: "none",
                                            padding: 0,
                                            margin: 0,
                                            display: "grid",
                                            gap: "10px",
                                        }}
                                    >
                                        {proFeatures.map((feature) => (
                                            <li
                                                key={feature}
                                                style={{
                                                    display: "flex",
                                                    alignItems: "flex-start",
                                                    gap: "10px",
                                                    color: "#475569",
                                                    fontSize: "0.86rem",
                                                    lineHeight: 1.42,
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        width: "18px",
                                                        height: "18px",
                                                        minWidth: "18px",
                                                        borderRadius: "999px",
                                                        background:
                                                            "rgba(29, 155, 240, 0.10)",
                                                        display: "flex",
                                                        alignItems: "center",
                                                        justifyContent: "center",
                                                        marginTop: "1px",
                                                    }}
                                                >
                                                    <Check
                                                        size={11}
                                                        strokeWidth={3}
                                                        color={twitterBlue}
                                                    />
                                                </div>

                                                <span>{feature}</span>
                                            </li>
                                        ))}
                                    </ul>

                                    <div
                                        style={{
                                            marginTop: "auto",
                                            paddingTop: "20px",
                                        }}
                                    >
                                        <Link
                                            href="/signup"
                                            style={{
                                                width: "100%",
                                                height: "48px",
                                                borderRadius: "16px",
                                                background: twitterBlue,
                                                color: "#ffffff",
                                                fontSize: "0.92rem",
                                                fontWeight: 600,
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                textDecoration: "none",
                                                boxShadow:
                                                    "0 10px 24px rgba(29,155,240,0.18)",
                                            }}
                                        >
                                            Start Free Trial
                                        </Link>
                                    </div>
                                </div>
                            </div>

                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "center",
                                    gap: "10px",
                                    flexWrap: "wrap",
                                    marginTop: "18px",
                                    color: "#64748b",
                                    fontSize: "0.88rem",
                                }}
                            >
                                <span>14-day free trial</span>
                                <span>•</span>
                                <span>Cancel anytime</span>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </section>
    );
}