import Link from "next/link";
import {
    Activity,
    ArrowRight,
    BarChart3,
    Check,
    CircleDollarSign,
    MousePointerClick,
    Users,
    Zap,
} from "lucide-react";
import { Inter } from "next/font/google";

const inter = Inter({
    subsets: ["latin"],
    variable: "--font-inter",
});



const benefits = [
    {
        icon: BarChart3,
        title: "Spot churn before it happens",
        description:
            "AI monitors usage, billing and support signals to surface risk early — not after customers leave.",
    },
    {
        icon: Zap,
        title: "Automate actions that save accounts",
        description:
            "Trigger personalised emails, nudges and workflows at the exact moment they matter..",
    },
    {
        icon: Users,
        title: "Focus on what matters",
        description:
            " Prioritise customers by financial impact so your team works where retention matters most.",
    },
    {
        icon: CircleDollarSign,
        title: "Protect and grow recurring revenue",
        description:
            "Reduce churn, increase expansion and maximise lifetime value with intelligent retention automation.",
    },
];


type RiskCardProps = {
    status: "high" | "medium" | "low";
    label: string;
    title: string;
    description: string;
    amountLabel: string;
    amount: string;
    action: string;
};

function RiskCard({
    status,
    label,
    title,
    description,
    amountLabel,
    amount,
    action,
}: RiskCardProps) {
    return (
        <article className={`riskCard riskCard-${status}`}>
            <div className="riskCardTop">
                <span className={`riskStatus riskStatus-${status}`}>
                    <span className="riskStatusDot" />
                    {label}
                </span>

                <div className="riskValue">
                    <span>{amountLabel}</span>
                    <strong>{amount}</strong>
                </div>
            </div>

            <div className="riskCardContent">
                <h3>{title}</h3>
                <p>{description}</p>
            </div>

            <div className="riskCardBottom">
                <span className="actionSuggested">
                    <MousePointerClick size={13} />
                    Action suggested
                </span>

                <button type="button">{action}</button>
            </div>
        </article>
    );
}

function TestimonialCard({
    quote,
    name,
    role,
    initials,
}: {
    quote: string;
    name: string;
    role: string;
    initials: string;
}) {
    return (
        <article className="testimonialCard">
            <div className="testimonialStars" aria-label="Five-star rating">
                ★★★★★
            </div>

            <blockquote>“{quote}”</blockquote>

            <div className="testimonialAuthor">
                <span className="testimonialAvatar">{initials}</span>

                <div>
                    <strong>{name}</strong>
                    <small>{role}</small>
                </div>
            </div>
        </article>
    );
}

export default function HomePage() {
    return (
        <main className={`${inter.variable} landingPage`}>


            <section className="heroSection">
                <div className="heroDecoration heroDecorationRight" />
                <div className="heroDecoration heroDecorationBottom" />

                <div className="pageShell heroGrid">
                    <div className="heroCopy">

                        <h1>
                            <span className="headlineBlack">Make Churn</span>
                            <br />
                            <span className="headlineBlue">Predictable</span>
                            <br />
                            <span className="headlineBlack">and</span>
                            <br />
                            <span className="headlineBlue">Preventable</span>
                        </h1>




                        <p className="heroDescription">
                            Cobrai connects your product, billing and support data, predicts churn before it hits, and automates the exact actions that keep customers engaged and revenue stable.
                        </p>

                        <div className="heroActions">
                            <Link href="/signup" className="primaryButton">
                                Start free for 14 days
                            </Link>


                        </div>

                        <div className="heroReassurance">
                            <span>
                                <Check size={13} strokeWidth={2.7} />
                                No credit card required
                            </span>

                            <span>
                                <Check size={13} strokeWidth={2.7} />
                                14-day free trial
                            </span>

                            <span>
                                <Check size={13} strokeWidth={2.7} />
                                Cancel anytime
                            </span>
                        </div>
                    </div>

                    <div className="riskVisual">
                        <div className="riskLines" aria-hidden="true">
                            {Array.from({ length: 9 }).map((_, index) => (
                                <span
                                    key={index}
                                    style={{
                                        left: `${index * 12}px`,
                                        height: `${160 + index * 30}px`,
                                    }}
                                />
                            ))}
                        </div>

                        <div className="riskCardStack">
                            <RiskCard
                                status="high"
                                label="High risk"
                                title="Usage drop detected"
                                description="Acme AI's usage has dropped 42% in the last 7 days."
                                amountLabel="MRR at risk"
                                amount="£12,680"
                                action="Send retention email"
                            />

                            <RiskCard
                                status="medium"
                                label="At risk"
                                title="Feature not adopted"
                                description="CloudCore hasn't activated key product features yet."
                                amountLabel="MRR at risk"
                                amount="£6,840"
                                action="Nudge with guide"
                            />

                            <RiskCard
                                status="low"
                                label="Low risk"
                                title="Strong engagement"
                                description="FlowDesk is engaged and steadily increasing usage."
                                amountLabel="MRR"
                                amount="£4,210"
                                action="Send growth email"
                            />
                        </div>
                    </div>
                </div>
            </section>



            <section id="features" className="benefitsSection">
                <div className="pageShell">
                    <div className="sectionHeading">

                        <h2>
                            Everything you need to stop churn
                            <br />
                            and grow revenue.
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
                                        <Icon size={24} strokeWidth={2.1} />
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