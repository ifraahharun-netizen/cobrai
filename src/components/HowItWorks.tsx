"use client";

export default function HowItWorks() {
    const steps = [
        {
            step: "1",
            title: "Connect your revenue data",
            text:
                "Sync Stripe, HubSpot, and product data in minutes to bring all your customer signals into one place.",
        },
        {
            step: "2",
            title: "See churn risk in £, not guesswork",
            text:
                "Instantly identify which accounts are at risk, why they’re slipping, and how much MRR is exposed.",
        },
        {
            step: "3",
            title: "Take action and protect revenue",
            text:
                "Trigger outreach, recover payments, and act on the right accounts before churn impacts your revenue.",
        },
    ];

    return (
        <section className="section">
            <div className="panel">
                <h2 className="sectionTitle">How Cobrai Works</h2>
                <p className="sectionSub">
                    Turn customer signals into clear actions that protect revenue — fast, simple, and built for busy teams.
                </p>

                <div className="grid3">
                    {steps.map((item) => (
                        <div className="card" key={item.step}>
                            <div className="stepBadge">{item.step}</div>

                            <h3 className="cardTitle">{item.title}</h3>
                            <p className="cardText">{item.text}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}