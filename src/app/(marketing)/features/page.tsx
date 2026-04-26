import Link from "next/link";

export default function FeaturesPage() {
    return (
        <section className="landingSection">
            <div className="sectionShell">
               
                <h1 className="sectionTitle">
                    Built to protect revenue, not just display metrics
                </h1>
                <p className="sectionText">
                    Cobrai combines churn detection, account prioritisation, revenue
                    visibility, and retention workflows in one focused experience.
                </p>

                {/* TOP 3 CARDS */}
                <div className="grid3" style={{ marginTop: 24 }}>
                    <div className="card">
                     
                        <h3 className="cardTitle">Accounts at risk</h3>
                        <p className="cardText">
                            Prioritise customers by urgency, revenue exposure, and actionability
                            so teams know who to work on first.
                        </p>
                    </div>

                    <div className="card">
                       
                        <h3 className="cardTitle">MRR impact visibility</h3>
                        <p className="cardText">
                            See how much revenue is at risk, what is being protected, and where
                            the biggest retention opportunities sit.
                        </p>
                    </div>

                    <div className="card">
                     
                        <h3 className="cardTitle">Clear next actions</h3>
                        <p className="cardText">
                            Move faster with account-level context, suggested outreach, and
                            clearer paths to protect revenue before it slips.
                        </p>
                    </div>
                </div>

                {/* HOW IT WORKS */}
                <div className="featureStack">
                    <div className="featureBlock">

                        <h2 className="featureHeading">
                            Connect signals. Detect risk. Take action earlier.
                        </h2>
                        <p className="featureBody">
                            Cobrai is designed to make retention work more proactive. Instead of
                            waiting for churn to show up in hindsight, teams get earlier visibility
                            into risk and a clearer understanding of what to do next.
                        </p>
                    </div>

                    <div className="featureSteps">
                        <div className="featureStep">
                            <span className="featureNumber">1</span>
                            <div>
                                <h3>Connect your tools</h3>
                                <p>
                                    Bring together customer, billing, and behavioural signals from
                                    the systems your team already uses.
                                </p>
                            </div>
                        </div>

                        <div className="featureStep">
                            <span className="featureNumber">2</span>
                            <div>
                                <h3>Cobrai finds the cause</h3>
                                <p>
                                    Detect churn risk early and understand what is driving the
                                    pressure behind each account.
                                </p>
                            </div>
                        </div>

                        <div className="featureStep">
                            <span className="featureNumber">3</span>
                            <div>
                                <h3>Act before revenue is lost</h3>
                                <p>
                                    Prioritise the right accounts, trigger better outreach, and
                                    focus your team on the work that protects MRR.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}