"use client";

import Link from "next/link";
import {
    Activity,
    BarChart3,
    CalendarDays,
    Check,
    ChevronDown,
    CircleDollarSign,
    Download,
    Gauge,
    Mail,
    Settings,
    ShieldCheck,
    Sparkles,
    Users,
    Zap,
} from "lucide-react";
import { Instrument_Serif, Inter } from "next/font/google";

const inter = Inter({
    subsets: ["latin"],
    variable: "--font-inter",
});

const instrumentSerif = Instrument_Serif({
    subsets: ["latin"],
    weight: "400",
    style: ["normal", "italic"],
});

const accounts = [
    {
        name: "CedarWorks",
        risk: 91,
        reason: "Confirm billing contact and resolve payment today.",
        mrr: "£21,900",
        lastActive: "12 Apr 2026",
    },
    {
        name: "Kite Labs",
        risk: 87,
        reason: "Send a personal check-in and offer a quick walkthrough.",
        mrr: "£12,900",
        lastActive: "04 Apr 2026",
    },
    {
        name: "NovaPay",
        risk: 76,
        reason: "Send a value recap and suggest a success call.",
        mrr: "£8,400",
        lastActive: "18 Apr 2026",
    },
    {
        name: "BrightDesk",
        risk: 69,
        reason: "Highlight unused features and offer setup support.",
        mrr: "£7,200",
        lastActive: "20 Apr 2026",
    },
];

const activity = [
    {
        title: "Retention health recalculated",
        description:
            "Cobrai refreshed churn predictions using the latest billing and engagement activity.",
        time: "25 mins ago",
    },
    {
        title: "Customer opened outreach email",
        description:
            "The customer opened the re-engagement email after a period of declining activity.",
        time: "2 hours ago",
    },
    {
        title: "Re-engagement email sent",
        description:
            "An outreach email was triggered after Cobrai detected reduced engagement.",
        time: "4 hours ago",
    },
    {
        title: "Product engagement declined",
        description:
            "Cobrai detected a meaningful drop in product usage compared with normal activity.",
        time: "6 hours ago",
    },
];

const queue = [
    {
        account: "Acme Groups",
        opportunity: "Billing recovery email",
        impact: "High",
        action: "Retry the failed subscription payment",
    },
    {
        account: "Northstar AI",
        opportunity: "Re-engagement email",
        impact: "High",
        action: "Send a personalised check-in email",
    },
    {
        account: "Peak Ops",
        opportunity: "Retry payment",
        impact: "Medium",
        action: "Retry the failed card payment",
    },
    {
        account: "Clearpath Labs",
        opportunity: "Executive check-in",
        impact: "Medium",
        action: "Schedule executive check-in call",
    },
];

const benefits = [
    {
        icon: Gauge,
        title: "Predict churn before it happens",
        description:
            "AI-powered predictions based on real engagement, billing and usage signals.",
    },
    {
        icon: Zap,
        title: "Automate the right actions",
        description:
            "Send personalised emails, retry payments and run workflows that recover revenue.",
    },
    {
        icon: BarChart3,
        title: "Track retention impact",
        description:
            "See exactly how much revenue you are protecting and where to focus next.",
    },
    {
        icon: Users,
        title: "Built for SaaS founders",
        description:
            "Simple, powerful and built to help your team grow with confidence.",
    },
];

function RiskBadge({ value }: { value: number }) {
    const tone = value >= 85 ? "critical" : value >= 70 ? "high" : "medium";

    return <span className={`dashboardRisk dashboardRisk-${tone}`}>{value}</span>;
}

export default function HomePage() {
    return (
        <main className={`${inter.variable} landingPage`}>
            <section className="heroSection">
                <div className="heroGlow heroGlowLeft" />
                <div className="heroGlow heroGlowRight" />

                <div className="landingShell heroInner">
                    <span className="heroEyebrow">
                        <Sparkles size={13} />
                        AI retention intelligence
                    </span>

                    <h1 className={instrumentSerif.className}>
                        Stop churn. Protect revenue.
                        <span>Grow with confidence.</span>
                    </h1>

                    <p className="heroDescription">
                        Cobrai monitors your customers, predicts churn and
                        automates the right actions to keep recurring revenue
                        safe.
                    </p>

                    <div className="heroActions">
                        <button
                            type="button"
                            className="primaryButton"
                            onClick={() => {
                                window.dispatchEvent(
                                    new CustomEvent("cobrai:open-auth", {
                                        detail: { view: "signup" },
                                    })
                                );
                            }}
                        >
                            Get started free
                        </button>

                        <button
                            type="button"
                            className="secondaryButton"
                            onClick={() => {
                                window.dispatchEvent(
                                    new CustomEvent("cobrai:open-auth", {
                                        detail: { view: "login" },
                                    })
                                );
                            }}
                        >
                            Log back in
                        </button>
                    </div>

                    <div className="heroReassurance">
                        <span>
                            <Check size={14} />
                            14-day free trial
                        </span>
                        <span>
                            <Check size={14} />
                            No credit card required
                        </span>
                        <span>
                            <Check size={14} />
                            Cancel anytime
                        </span>
                    </div>

                    <div className="proofStrip">
                        <div>
                            <strong>Predictive</strong>
                            <span>Churn detection</span>
                        </div>
                        <div>
                            <strong>Proactive</strong>
                            <span>Revenue protection</span>
                        </div>
                        <div>
                            <strong>Automated</strong>
                            <span>Retention workflows</span>
                        </div>
                        <div>
                            <strong>Actionable</strong>
                            <span>Customer intelligence</span>
                        </div>
                    </div>
                </div>
            </section>

            <section id="features" className="benefitsSection">
                <div className="landingShell">
                    <div className="sectionHeading">
                        <h2 className={instrumentSerif.className}>
                            Everything you need to retain more.
                            <span>One intelligent platform.</span>
                        </h2>
                    </div>

                    <div className="benefitGrid">
                        {benefits.map((benefit) => {
                            const Icon = benefit.icon;

                            return (
                                <article
                                    className="benefitItem"
                                    key={benefit.title}
                                >
                                    <span className="benefitIcon">
                                        <Icon size={22} />
                                    </span>
                                    <h3>{benefit.title}</h3>
                                    <p>{benefit.description}</p>
                                </article>
                            );
                        })}
                    </div>
                </div>
            </section>
        </main>
    );
}
