import Link from "next/link";
import FeatureHeroVisual from "@/components/landing/FeatureHeroVisual";

export default function FeaturesPage() {
    return (
        <section className="landingSection">
            <div className="sectionShell featurePageShell">
                <div className="featureHero">
                    <p className="featureEyebrow">RETENTION INTELLIGENCE</p>

                    <h1 className="featureHeroTitle">
                        Everything you need
                        <br />
                        to reduce churn.
                    </h1>

                    <p className="featureHeroText">
                        Cobrai helps subscription teams spot churn risk early, understand why
                        customers may leave, and take the next best action to protect MRR.
                    </p>

                    <div className="featureHeroButtons">
                        <Link href="/signup" className="featurePrimaryBtn">
                            Get Started Free
                        </Link>
                    </div>

                </div>

                <FeatureHeroVisual />

                <div className="homeBenefits featureBenefitsBlock">
                    <h2 className="homeBenefitsTitle">
                        Built to protect recurring revenue.
                    </h2>

                    <div className="homeBenefitsGrid">
                        <div className="homeBenefitItem">
                            <div className="homeBenefitIcon">01</div>
                            <h3>Spot churn risk early</h3>
                            <p>
                                Detect at-risk accounts before they cancel using customer
                                behaviour, payment, and usage signals.
                            </p>
                        </div>

                        <div className="homeBenefitItem">
                            <div className="homeBenefitIcon">02</div>
                            <h3>Know why they might leave</h3>
                            <p>
                                Understand the root causes behind churn risk with clear
                                AI-powered explanations.
                            </p>
                        </div>

                        <div className="homeBenefitItem">
                            <div className="homeBenefitIcon">03</div>
                            <h3>Take action with confidence</h3>
                            <p>
                                Get prioritized recommendations your team can act on before
                                revenue is lost.
                            </p>
                        </div>

                        <div className="homeBenefitItem">
                            <div className="homeBenefitIcon">04</div>
                            <h3>Protect more revenue</h3>
                            <p>
                                Track recovery opportunities, retention progress, and potential
                                MRR improvement.
                            </p>
                        </div>
                    </div>
                </div>

                {/* PRICING */}

                <section className="marketingPricingSection">
                    <div className="marketingPricingHeader">
                        <p className="featureEyebrow">PRICING</p>

                        <h2 className="marketingPricingTitle">
                            Simple pricing for
                            <br />
                            subscription teams.
                        </h2>

                        <p className="marketingPricingText">
                            Start free and scale retention intelligence as your business grows.
                        </p>
                    </div>

                    <div className="marketingPricingGrid">
                        {/* STARTER */}
                        <div className="marketingPriceCard">
                            <div className="marketingPriceBadge">
                                Starter
                            </div>

                            <h3>Identify churn risk early.</h3>

                            <div className="marketingPriceValue">
                                £49
                                <span>/month</span>
                            </div>

                            <p className="marketingPriceDescription">
                                Monitor customer health, identify churn signals,
                                and take action before revenue is impacted.
                            </p>

                            <ul className="marketingPriceFeatures">
                                <li>Complete customer list</li>
                                <li>Customer health score</li>
                                <li>Limited AI insights</li>
                                <li>Dashboard overview</li>
                                <li>Manual account outreach</li>
                            </ul>

                            <Link href="/signup" className="secondaryBtn">
                                Start Free
                            </Link>
                        </div>

                        {/* PRO */}
                        <div className="marketingPriceCard featured">
                            <div className="marketingPriceBadge dark">
                                Pro
                            </div>

                            <h3>Advanced AI retention intelligence.</h3>

                            <div className="marketingPriceValue">
                                £99
                                <span>/month</span>
                            </div>

                            <p className="marketingPriceDescription">
                                Scale retention with deeper AI insights,
                                prioritisation, and automation.
                            </p>

                            <ul className="marketingPriceFeatures">
                                <li>Everything in Starter</li>
                                <li>Unlimited AI insights</li>
                                <li>Unlimited automation</li>
                                <li>Advanced AI forecasts</li>
                                <li>Retention progress tracking</li>
                            </ul>

                            <Link href="/signup" className="primaryBtn">
                                Start Free
                            </Link>
                        </div>
                    </div>
                </section>

        
            </div>
        </section>
    );
}