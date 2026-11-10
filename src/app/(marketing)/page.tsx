import Link from "next/link";

import AuthButton from "@/components/landing/AuthButton";
import { BehaviourVisual, ForecastVisual } from "@/components/landing/ClaudeSections";
import OverviewPreview from "@/components/landing/OverviewPreview";
import styles from "./landing.module.css";

const steps = [
    {
        title: "Connect",
        body: "Link Stripe and HubSpot in a few minutes. Read-only, no engineering work.",
    },
    {
        title: "Understand",
        body: "Claude reads each account's behaviour, explains what changed and predicts who will churn.",
    },
    {
        title: "Act",
        body: "Send the retention email Claude drafts, from your own domain, and track the reply.",
    },
];

const features = [
    {
        title: "Metrics",
        body: "Overview, retention and accounts, built from your billing and CRM data.",
    },
    {
        title: "Ask Claude",
        body: "Ask why churn moved or who is at risk, in plain English.",
    },
    {
        title: "Inbox",
        body: "Two-way retention email from your own domain, next to each account.",
    },
];

export default function HomePage() {
    return (
        <div className={styles.page}>
            <section className={styles.hero}>
                <div className={styles.shell}>
                    <div className={styles.heroCopy}>
                        <span className={styles.eyebrow}>Retention intelligence, powered by Claude</span>
                        <h1 className={styles.heroTitle}>Stop churn before revenue drops.</h1>
                        <p className={styles.heroLead}>
                            Identify risk, understand why, and take action before
                            customers leave. Claude reads your Stripe and HubSpot
                            data and forecasts your MRR.
                        </p>
                        <div className={styles.heroActions}>
                            <AuthButton view="signup" className={styles.btnPrimary}>
                                Start free trial
                            </AuthButton>
                            <Link href="/retention-audit" className={styles.btnSecondary}>
                                Request a retention audit
                            </Link>
                        </div>
                        <p className={styles.heroNote}>14-day free trial · No credit card required</p>
                    </div>

                    <OverviewPreview />
                </div>
            </section>

            <section className={styles.section} id="claude">
                <div className={styles.shell}>
                    <div className={styles.sectionHead}>
                        <span className={styles.eyebrow}>Interpretation</span>
                        <h2>Claude explains what your customers are doing</h2>
                        <p className={styles.sectionLead}>
                            Not just that usage dropped, but why, and what it
                            means for revenue.
                        </p>
                    </div>
                    <BehaviourVisual />
                </div>
            </section>

            <section className={styles.section} id="forecast">
                <div className={styles.shell}>
                    <div className={styles.sectionHead}>
                        <span className={styles.eyebrow}>Forecasting</span>
                        <h2>See where MRR is heading</h2>
                        <p className={styles.sectionLead}>
                            A forecast built from each account&rsquo;s risk, with
                            Claude naming the customers that move it.
                        </p>
                    </div>
                    <ForecastVisual />
                </div>
            </section>

            <section className={styles.section} id="how-it-works">
                <div className={styles.shell}>
                    <div className={styles.sectionHead}>
                        <span className={styles.eyebrow}>How it works</span>
                        <h2>Connect, understand, act</h2>
                    </div>
                    <ol className={styles.steps}>
                        {steps.map((step, index) => (
                            <li className={styles.step} key={step.title}>
                                <span className={styles.stepNum}>0{index + 1}</span>
                                <h3>{step.title}</h3>
                                <p>{step.body}</p>
                            </li>
                        ))}
                    </ol>
                </div>
            </section>

            <section className={styles.section} id="features">
                <div className={styles.shell}>
                    <div className={styles.sectionHead}>
                        <span className={styles.eyebrow}>In the product</span>
                        <h2>Everything in one place</h2>
                    </div>
                    <div className={styles.featureGrid}>
                        {features.map((feature) => (
                            <div className={styles.featureItem} key={feature.title}>
                                <h3>{feature.title}</h3>
                                <p>{feature.body}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section className={styles.section}>
                <div className={styles.shell}>
                    <div className={styles.cta}>
                        <h2>Start with your own data</h2>
                        <p>Your first risk list and MRR forecast in minutes.</p>
                        <div className={styles.ctaActions}>
                            <AuthButton view="signup" className={styles.btnPrimary}>
                                Start free trial
                            </AuthButton>
                            <Link href="/pricing" className={styles.btnSecondary}>
                                View pricing
                            </Link>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
