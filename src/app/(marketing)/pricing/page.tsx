import Link from "next/link";

export default function PricingPage() {
    return (
        <section className="landingSection">
            <div className="sectionShell">
                <h1 className="sectionTitle">Simple pricing for modern SaaS teams</h1>

                <p className="sectionText">
                    Start lean, grow into more advanced retention workflows, and scale as your
                    revenue operations mature.
                </p>

                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                        gap: "20px",
                        maxWidth: "860px",
                        margin: "32px auto 0",
                    }}
                >
                    <div
                        className="card"
                        style={{
                            padding: "28px 24px",
                            display: "flex",
                            flexDirection: "column",
                            minHeight: "460px",
                        }}
                    >
                        <div
                            style={{
                                display: "inline-flex",
                                alignSelf: "flex-start",
                                padding: "6px 12px",
                                borderRadius: "999px",
                                background: "rgba(15, 23, 42, 0.05)",
                                border: "1px solid rgba(15, 23, 42, 0.08)",
                                fontSize: "12px",
                                fontWeight: 700,
                                color: "#0f172a",
                                marginBottom: "16px",
                            }}
                        >
                            Starter
                        </div>

                        <h3
                            className="cardTitle"
                            style={{
                                fontSize: "1.5rem",
                                marginBottom: "10px",
                            }}
                        >
                            Built for early-stage teams
                        </h3>

                        <div
                            style={{
                                marginBottom: "6px",
                                fontSize: "0.95rem",
                                fontWeight: 600,
                                color: "#5f6b7a",
                            }}
                        >
                            Get started free for 2 weeks
                        </div>

                        <div
                            style={{
                                display: "flex",
                                alignItems: "baseline",
                                gap: "6px",
                                marginBottom: "14px",
                            }}
                        >
                            <span
                                style={{
                                    fontSize: "2.3rem",
                                    fontWeight: 700,
                                    lineHeight: 1,
                                    color: "#0f172a",
                                }}
                            >
                                £49
                            </span>
                            <span
                                style={{
                                    fontSize: "0.95rem",
                                    color: "#7b8794",
                                    fontWeight: 600,
                                }}
                            >
                                /month
                            </span>
                        </div>

                        <p className="cardText" style={{ marginBottom: "20px" }}>
                            For early-stage SaaS teams that want clearer visibility into churn
                            risk and account health.
                        </p>

                        <div
                            style={{
                                height: "1px",
                                background: "rgba(15, 23, 42, 0.08)",
                                marginBottom: "18px",
                            }}
                        />

                        <ul
                            style={{
                                listStyle: "none",
                                padding: 0,
                                margin: 0,
                                display: "grid",
                                gap: "12px",
                                color: "#5f6b7a",
                                fontSize: "0.95rem",
                                lineHeight: 1.6,
                            }}
                        >
                            <li>• Accounts at risk view</li>
                            <li>• Basic churn visibility</li>
                            <li>• Core account health signals</li>
                            <li>• Clean dashboard overview</li>
                        </ul>

                        <div style={{ marginTop: "auto", paddingTop: "24px" }}>
                            <Link
                                href="/signup"
                                className="secondaryBtn"
                                style={{
                                    width: "100%",
                                    minHeight: "52px",
                                    fontWeight: 600,
                                    fontSize: "0.95rem",
                                }}
                            >
                                Get Started
                            </Link>
                        </div>
                    </div>

                    <div
                        className="card"
                        style={{
                            padding: "28px 24px",
                            display: "flex",
                            flexDirection: "column",
                            minHeight: "460px",
                            border: "1px solid rgba(15, 23, 42, 0.14)",
                            background:
                                "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(248,250,252,0.96) 100%)",
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginBottom: "16px",
                                gap: "10px",
                                flexWrap: "wrap",
                            }}
                        >
                            <span
                                style={{
                                    display: "inline-flex",
                                    padding: "6px 12px",
                                    borderRadius: "999px",
                                    background: "#02040a",
                                    color: "#ffffff",
                                    fontSize: "12px",
                                    fontWeight: 700,
                                }}
                            >
                                Pro
                            </span>


                        </div>

                        <h3
                            className="cardTitle"
                            style={{
                                fontSize: "1.5rem",
                                marginBottom: "10px",
                            }}
                        >
                            Built for growing SaaS teams
                        </h3>

                        <div
                            style={{
                                marginBottom: "6px",
                                fontSize: "0.95rem",
                                fontWeight: 600,
                                color: "#5f6b7a",
                            }}
                        >
                            Get started free for 2 weeks then
                        </div>

                        <div
                            style={{
                                display: "flex",
                                alignItems: "baseline",
                                gap: "6px",
                                marginBottom: "14px",
                            }}
                        >
                            <span
                                style={{
                                    fontSize: "2.3rem",
                                    fontWeight: 700,
                                    lineHeight: 1,
                                    color: "#0f172a",
                                }}
                            >
                                £99
                            </span>
                            <span
                                style={{
                                    fontSize: "0.95rem",
                                    color: "#7b8794",
                                    fontWeight: 600,
                                }}
                            >
                                /month
                            </span>
                        </div>

                        <p className="cardText" style={{ marginBottom: "20px" }}>
                            For growing teams that need deeper MRR insights, stronger
                            prioritisation, and faster actioning.
                        </p>

                        <div
                            style={{
                                height: "1px",
                                background: "rgba(15, 23, 42, 0.08)",
                                marginBottom: "18px",
                            }}
                        />

                        <ul
                            style={{
                                listStyle: "none",
                                padding: 0,
                                margin: 0,
                                display: "grid",
                                gap: "12px",
                                color: "#5f6b7a",
                                fontSize: "0.95rem",
                                lineHeight: 1.6,
                            }}
                        >
                            <li>• Everything in Starter</li>
                            <li>• Deeper MRR insights</li>
                            <li>• Stronger customer prioritisation</li>
                            <li>• Faster retention workflows</li>
                            <li>• More advanced actioning</li>
                        </ul>

                        <div style={{ marginTop: "auto", paddingTop: "24px" }}>
                            <Link
                                href="/signup"
                                className="primaryBtn"
                                style={{
                                    width: "100%",
                                    minHeight: "52px",
                                    fontWeight: 600,
                                    fontSize: "0.95rem",
                                }}
                            >
                                Get Started
                            </Link>
                        </div>
                    </div>
                </div>

            </div>
        </section>
    );
}