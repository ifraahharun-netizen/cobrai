import Link from "next/link";

export default function PricingPage() {
    return (
        <section className="landingSection">
            <div className="sectionShell">
                <h1 className="sectionTitle">Start free
                    <br />
                    Scale retention as you grow</h1>

                <p className="sectionText">
                    Built for subscription businesses that want clearler customer visibility and smarter retention decisions.
                </p>

                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                        gap: "18px",
                        maxWidth: "780px",
                        margin: "28px auto 0",
                    }}
                >
                    {/* STARTER */}
                    <div
                        className="card"
                        style={{
                            padding: "24px 22px",
                            display: "flex",
                            flexDirection: "column",
                            minHeight: "430px",
                        }}
                    >
                        <div
                            style={{
                                display: "inline-flex",
                                alignSelf: "flex-start",
                                padding: "6px 11px",
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
                                fontSize: "1.25rem",
                                fontWeight: 500,
                                marginBottom: "12px",
                            }}
                        >
                            Identify churn risk early.
                        </h3>

                        <div
                            style={{
                                marginBottom: "6px",
                                fontSize: "1rem",
                                fontWeight: 700,
                                color: "#0f172a",
                            }}
                        >
                            Try free for 14 days
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
                                    fontSize: "1.55rem",
                                    fontWeight: 500,
                                    lineHeight: 1,
                                    color: "#0f172a",
                                }}
                            >
                                £49
                            </span>

                            <span
                                style={{
                                    fontSize: "0.86rem",
                                    color: "#7b8794",
                                    fontWeight: 500,
                                }}
                            >
                                /month after trial
                            </span>
                        </div>

                        <p className="cardText" style={{ marginBottom: "18px" }}>
                            Monitor customer health, identify churn signals, and take action before revenue is impacted.
                        </p>

                        <div
                            style={{
                                height: "1px",
                                background: "rgba(15, 23, 42, 0.08)",
                                marginBottom: "16px",
                            }}
                        />

                        <ul
                            style={{
                                listStyle: "none",
                                padding: 0,
                                margin: 0,
                                display: "grid",
                                gap: "10px",
                                color: "#5f6b7a",
                                fontSize: "0.9rem",
                                lineHeight: 1.5,
                            }}
                        >
                            <li>• Complete customer list</li>
                            <li>• Customer health score</li>
                            <li>• Limited MRR and churn drivers visibility</li>
                            <li>• Limited AI insights</li>
                            <li>• Dashboard overview</li>
                            <li>• Manual account outreach</li>
                        </ul>

                        <div style={{ marginTop: "auto", paddingTop: "22px" }}>
                            <Link
                                href="/signup"
                                className="secondaryBtn"
                                style={{
                                    width: "100%",
                                    minHeight: "48px",
                                    fontWeight: 600,
                                    fontSize: "0.92rem",
                                }}
                            >
                                Start Free
                            </Link>
                        </div>
                    </div>

                    {/* PRO */}
                    <div
                        className="card"
                        style={{
                            padding: "24px 22px",
                            display: "flex",
                            flexDirection: "column",
                            minHeight: "430px",
                            border: "1px solid rgba(15, 23, 42, 0.12)",
                            background: "rgba(255,255,255,0.96)",
                        }}
                    >
                        <div
                            style={{
                                display: "inline-flex",
                                alignSelf: "flex-start",
                                padding: "6px 11px",
                                borderRadius: "999px",
                                background: "#02040a",
                                color: "#ffffff",
                                fontSize: "12px",
                                fontWeight: 700,
                                marginBottom: "16px",
                            }}
                        >
                            Pro
                        </div>

                        <h3
                            className="cardTitle"
                            style={{
                                fontSize: "1.25rem",
                                fontWeight: 500,
                                marginBottom: "12px",
                            }}
                        >
                            Advanced AI retention intelligence
                        </h3>

                        <div
                            style={{
                                marginBottom: "6px",
                                fontSize: "1rem",
                                fontWeight: 700,
                                color: "#0f172a",
                            }}
                        >
                            Try free for 14 days
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
                                    fontSize: "1.55rem",
                                    fontWeight: 500,
                                    lineHeight: 1,
                                    color: "#0f172a",
                                }}
                            >
                                £99
                            </span>

                            <span
                                style={{
                                    fontSize: "0.86rem",
                                    color: "#7b8794",
                                    fontWeight: 500,
                                }}
                            >
                                /month after trial
                            </span>
                        </div>

                        <p className="cardText" style={{ marginBottom: "18px" }}>
                            Scale retention with deeper insights and prioritisation.
                        </p>

                        <div
                            style={{
                                height: "1px",
                                background: "rgba(15, 23, 42, 0.08)",
                                marginBottom: "16px",
                            }}
                        />

                        <ul
                            style={{
                                listStyle: "none",
                                padding: 0,
                                margin: 0,
                                display: "grid",
                                gap: "10px",
                                color: "#5f6b7a",
                                fontSize: "0.9rem",
                                lineHeight: 1.5,
                            }}
                        >
                            <li>• Everything in Starter</li>
                            <li>• Unlimited automation </li>
                            <li>• Unlimited AI insights</li>
                            <li>• Retention progress tracking</li>
                            <li>• Advanced AI forecasts</li>
                            <li>• Critical accounts prioritisation</li>
                            <li>• AI-assisted account outreach</li>
                        </ul>

                        <div style={{ marginTop: "auto", paddingTop: "22px" }}>
                            <Link
                                href="/signup"
                                className="primaryBtn"
                                style={{
                                    width: "100%",
                                    minHeight: "48px",
                                    fontWeight: 600,
                                    fontSize: "0.92rem",
                                }}
                            >
                                Start Free
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}