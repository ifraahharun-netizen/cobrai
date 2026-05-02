import Link from "next/link";

export default function FeaturesPage() {
    return (
        <section className="landingSection">
            <div className="sectionShell">

                <h1 className="sectionTitle">
                    Turn churn signals into revenue-saving actions
                </h1>
                <p className="sectionText">
                    Cobrai brings your customer data into one place, identifies real churn
                    risk, and helps your team take action where it matters most — before
                    revenue is lost.
                </p>

                {/* TOP 3 CARDS */}
                <div className="grid3" style={{ marginTop: 24 }}>
                    <div className="card">
                        <h3 className="cardTitle">Accounts at risk</h3>
                        <p className="cardText">
                            Instantly identify high-risk customers, prioritised by urgency and
                            revenue impact so your team knows exactly where to focus.
                        </p>
                    </div>

                    <div className="card">
                        <h3 className="cardTitle">MRR impact visibility</h3>
                        <p className="cardText">
                            See exactly how much revenue is at risk and where the biggest
                            opportunities to protect it are.
                        </p>
                    </div>

                    <div className="card">
                        <h3 className="cardTitle">Clear next actions</h3>
                        <p className="cardText">
                            Move from insight to action with clear recommendations and
                            suggested outreach for every at-risk account.
                        </p>
                    </div>
                </div>

                {/* HOW IT WORKS */}
                <div className="featureStack">
                    <div className="featureBlock">
                        <h2 className="featureHeading">
                            See risk earlier. Act faster. Protect revenue.
                        </h2>
                        <p className="featureBody">
                            Most teams only react to churn after it happens. Cobrai gives you
                            early visibility into risk, explains what’s driving it, and helps
                            your team take the right action before customers leave.
                        </p>
                    </div>

                    <div className="featureSteps">
                        <div className="featureStep">
                            <span className="featureNumber">1</span>
                            <div>
                                <h3>Connect your tools</h3>
                                <p>
                                    Sync billing, customer, and product signals from the tools
                                    your team already uses — no complex setup required.
                                </p>
                            </div>
                        </div>

                        <div className="featureStep">
                            <span className="featureNumber">2</span>
                            <div>
                                <h3>Identify churn risk</h3>
                                <p>
                                    Cobrai detects early warning signs and shows which accounts
                                    are at risk, why it’s happening, and how it impacts revenue.
                                </p>
                            </div>
                        </div>

                        <div className="featureStep">
                            <span className="featureNumber">3</span>
                            <div>
                                <h3>Take action before it’s too late</h3>
                                <p>
                                    Prioritise the right customers, take targeted action, and
                                    focus your team on protecting MRR where it matters most.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}