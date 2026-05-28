"use client";

import Link from "next/link";
import FeatureHeroVisual from "@/components/landing/FeatureHeroVisual";


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

export default function HomePage() {
    return (
        <section className="heroSection">
            <div className="heroShell">
                {/* HERO */}
                <div className="heroMinimal">
                    <p className="eyebrow">
                        Retention Intelligence
                    </p>

                    <h1 className="heroTitle">
                        Stop churn before
                        <br />
                        revenue drops.
                    </h1>

                    <p className="heroText">
                        Cobrai identifies at-risk customers,
                        explains the warning signals, and
                        shows the next best action to protect
                        MRR.
                    </p>


                    <p className="heroTrust">
                        Built for subscription businesses
                    </p>
                </div>

                {/* FEATURES */}
                <section
                    id="features"
                    className="featureSinglePage"
                >
                    <div className="featureSingleShell">
                        <section className="homeBenefits">
                            <p className="featureEyebrow">
                                RETENTION INTELLIGENCE
                            </p>

                            <h2 className="homeBenefitsTitle">
                                Built to protect recurring
                                revenue.
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

                                        <h3>
                                            {benefit.title}
                                        </h3>

                                        <p>
                                            {benefit.text}
                                        </p>
                                    </div>
                                ))}
                            </div>

                           

                        </section>

                        <FeatureHeroVisual />
                    </div>
                </section>

                {/* PRICING */}
                <section
                    id="pricing"
                    className="marketingPricingSection"
                >
                    <div className="marketingPricingHeader">
                        <p className="featureEyebrow">
                            PRICING
                        </p>

                        <h2 className="marketingPricingTitle">
                            Simple pricing for
                            <br />
                            subscription teams.
                        </h2>

                        <p className="marketingPricingText">
                            Start free and scale retention
                            intelligence as your business
                            grows.
                        </p>
                    </div>

                    <div className="marketingPricingGrid">
                        {/* STARTER */}
                        <div className="marketingPriceCard">
                            <div className="marketingPriceBadge">
                                Starter
                            </div>

                            <h3>
                                Identify churn risk early.
                            </h3>

                            <div className="marketingPriceTrial">
                                Try free for 14 days
                            </div>

                            <div className="marketingPriceValue">
                                £49
                                <span>
                                    /month after trial
                                </span>
                            </div>

                            <p className="marketingPriceDescription">
                                Monitor customer health,
                                identify churn signals, and
                                take action before revenue is
                                impacted.
                            </p>

                            <ul className="marketingPriceFeatures">
                                <li>
                                    Complete customer list
                                </li>

                                <li>
                                    Customer health score
                                </li>

                                <li>
                                    Limited MRR and churn
                                    drivers visibility
                                </li>

                                <li>
                                    Limited AI insights
                                </li>

                                <li>
                                    Dashboard overview
                                </li>

                                <li>
                                    Manual account outreach
                                </li>
                            </ul>

                            <Link
                                href="/signup"
                                className="secondaryBtn"
                            >
                                Start Free
                            </Link>
                        </div>

                        {/* PRO */}
                        <div className="marketingPriceCard featured">
                            <div className="marketingPriceBadge dark">
                                Pro
                            </div>

                            <h3>
                                Advanced AI retention
                                intelligence.
                            </h3>

                            <div className="marketingPriceTrial">
                                Try free for 14 days
                            </div>

                            <div className="marketingPriceValue">
                                £99
                                <span>
                                    /month after trial
                                </span>
                            </div>

                            <p className="marketingPriceDescription">
                                Scale retention with deeper
                                insights, prioritisation, and
                                automation.
                            </p>

                            <ul className="marketingPriceFeatures">
                                <li>
                                    Everything in Starter
                                </li>

                                <li>
                                    Unlimited automation
                                </li>

                                <li>
                                    Unlimited AI insights
                                </li>

                                <li>
                                    Retention progress
                                    tracking
                                </li>

                                <li>
                                    Advanced AI forecasts
                                </li>

                                <li>
                                    Critical accounts
                                    prioritisation
                                </li>

                                <li>
                                    AI-assisted account
                                    outreach
                                </li>
                            </ul>

                            <Link
                                href="/signup"
                                className="primaryBtn"
                            >
                                Start Free
                            </Link>
                        </div>
                    </div>
                </section>

            </div>
        </section>
    );
}