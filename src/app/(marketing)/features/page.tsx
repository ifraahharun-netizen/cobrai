import Link from "next/link";

const riskAccounts = [
    {
        score: 91,
        company: "CedarWorks",
        reason: "Billing issue + reduced activity",
        mrr: "£21.9K",
        level: "High",
    },
    {
        score: 87,
        company: "Kite Labs",
        reason: "No activity in 25 days",
        mrr: "£12.9K",
        level: "High",
    },
    {
        score: 76,
        company: "NovaPay",
        reason: "Usage dropped",
        mrr: "£8.4K",
        level: "Medium",
    },
];

export default function FeaturesPage() {
    return (
        <section className="landingSection">
            <div className="sectionShell">

                {/* HERO */}
                <div className="featureHero">

                    <p className="featureEyebrow">
                        RETENTION INTELLIGENCE
                    </p>

                    <h1 className="featureHeroTitle">
                        Protect MRR with
                        <br />
                        AI retention intelligence
                    </h1>

                    <p className="featureHeroText">
                        Track churn risk, uncover warning signals, and prioritize the accounts that need attention immediately.
                    </p>

                    <div className="featureHeroButtons">
                        <Link
                            href="/signup"
                            className="featurePrimaryBtn"
                        >
                            Start Free
                        </Link>

                
                    </div>

                </div>

                {/* KPI GRID */}
                <div className="featureKpiGrid">

                    <div className="featureKpiCard">

                        <div className="featureKpiIcon">
                            £
                        </div>

                        <span className="featureKpiLabel">
                            MRR at risk
                        </span>

                        <strong className="featureKpiValue">
                            £34.8K
                        </strong>

                        <p className="featureKpiDescription">
                            Across high-risk customers
                        </p>

                        <div className="featureKpiTrend positive">
                            ▲ 12% vs last 30 days
                        </div>

                    </div>

                    <div className="featureKpiCard">

                        <div className="featureKpiIcon">
                            ⌁
                        </div>

                        <span className="featureKpiLabel">
                            Critical accounts
                        </span>

                        <strong className="featureKpiValue">
                            2
                        </strong>

                        <p className="featureKpiDescription">
                            Need action this week
                        </p>

                        <div className="featureKpiTrend negative">
                            ▲ 1 vs last 7 days
                        </div>

                    </div>

                    <div className="featureKpiCard">

                        <div className="featureKpiIcon">
                            ↗
                        </div>

                        <span className="featureKpiLabel">
                            AI forecast
                        </span>

                        <strong className="featureKpiValue">
                            £6.9K
                        </strong>

                        <p className="featureKpiDescription">
                            Potential MRR improvement
                        </p>

                        <div className="featureKpiTrend positive">
                            ▲ 18% vs last 30 days
                        </div>

                    </div>

                </div>

                {/* MAIN GRID */}
                <div className="featurePreviewGrid">

                    {/* LEFT */}
                    <div className="featurePreviewCard large">

                        <div className="featurePanelHeader">

                            <div>
                                <h3>
                                    Accounts ranked by risk
                                </h3>

                                <p className="featurePanelSubtext">
                                    Cobrai shows which customers need attention first.
                                </p>
                            </div>

                            <Link
                                href="/demo"
                                className="featureMiniBtn"
                            >
                                Open demo
                            </Link>

                        </div>

                        <div className="featureTableHeader">
                            <span>Risk score</span>
                            <span>Account</span>
                            <span>Reason</span>
                            <span>MRR at risk</span>
                        </div>

                        <div className="featureCustomerList">

                            {riskAccounts.map((account) => (
                                <div
                                    key={account.company}
                                    className="featureCustomerRow"
                                >

                                    <div className="featureRiskCircle">
                                        {account.score}
                                    </div>

                                    <div className="featureCustomerName">
                                        <strong>{account.company}</strong>
                                    </div>

                                    <div className="featureCustomerReason">
                                        {account.reason}
                                    </div>

                                    <div className="featureCustomerRight">

                                        <strong>
                                            {account.mrr}
                                        </strong>

                                        <span
                                            className={`riskBadge ${account.level.toLowerCase()}`}
                                        >
                                            {account.level}
                                        </span>

                                    </div>

                                </div>
                            ))}

                        </div>

                        <Link
                            href="/dashboard/accounts-at-risk"
                            className="featureBottomLink"
                        >
                            View all at-risk accounts →
                        </Link>

                    </div>

                    {/* RIGHT */}
                    <div className="featureInsightsColumn">

                        {/* AI INSIGHT */}
                        <div className="featurePreviewCard">

                            <p className="featureCardLabel">
                                AI INSIGHT
                            </p>

                            <h3 className="featureCardTitle">
                                Recover failed payments first
                            </h3>

                            <p className="featureCardText">
                                Cobrai highlights the customers most likely to churn
                                and recommends where your team should act first.
                            </p>

                            <div className="featureRecommendationBox">
                                ✦ Recommended action:
                                contact CedarWorks and Kite Labs today.
                            </div>

                        </div>

                        {/* AI FORECAST */}
                        <div className="featurePreviewCard">

                            <div className="featureForecastTop">

                                <div>
                                    <p className="featureCardLabel">
                                        AI FORECAST
                                    </p>

                                    <h3 className="featureCardTitle">
                                        MRR could improve by £6.9K
                                    </h3>
                                </div>

                                <div className="forecastGrowth">
                                    ▲ 18% vs last 30 days
                                </div>

                            </div>

                            <p className="featureCardText">
                                Cobrai forecasts how revenue exposure could improve
                                if high-risk accounts are recovered early.
                            </p>

                            <div className="featureLineChart">

                                <div className="chartGrid" />

                                <svg
                                    viewBox="0 0 400 120"
                                    className="chartSvg"
                                    preserveAspectRatio="none"
                                >
                                    <path
                                        d="M0 92 C40 100, 70 70, 110 78 C150 86, 180 48, 220 58 C260 68, 290 32, 330 40 C360 44, 385 18, 400 22"
                                        className="chartPath"
                                    />

                                    <path
                                        d="M0 120 L0 92 C40 100, 70 70, 110 78 C150 86, 180 48, 220 58 C260 68, 290 32, 330 40 C360 44, 385 18, 400 22 L400 120 Z"
                                        className="chartArea"
                                    />
                                </svg>

                            </div>

                        </div>

                    </div>

                </div>

            </div>
        </section>
    );
}