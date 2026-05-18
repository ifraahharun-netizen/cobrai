"use client";

import Link from "next/link";

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
        text: "Use data-driven AI insights to prioritize retention efforts. ",
    },
    {
        icon: "↗",
        title: "The next best action",
        text: "Get AI recommendations to reduce preventable churn.",
    },
];

export default function HomePage() {
    return (
        <>
            <section className="heroSection">
                <div className="heroShell">
                    <div className="heroMinimal">
                        <p className="eyebrow">Retention Intelligence</p>

                        <h1 className="heroTitle">
                            Stop churn before
                            <br />
                            revenue drops.
                        </h1>

                        <p className="heroText">
                            Cobrai identifies at-risk customers, explains why the warning signals,
                             and shows the next best action to protect MRR.
                        </p>

                        <div className="heroActions">
                            <Link href="/features" className="primaryBtn">
                                Cobrai in Action 
                            </Link>
                        </div>

                        <p className="heroTrust">
                            Built for subscription businesses
                        </p>
                    </div>

                    <div className="homeBenefits">
                        <h2 className="homeBenefitsTitle">
                            Everything you need to reduce churn.
                        </h2>

                        <div className="homeBenefitsGrid">
                            {benefits.map((benefit) => (
                                <div key={benefit.title} className="homeBenefitItem">
                                    <div className="homeBenefitIcon">
                                        {benefit.icon}
                                    </div>

                                    <h3>{benefit.title}</h3>

                                    <p>{benefit.text}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>
        </>
    );
}