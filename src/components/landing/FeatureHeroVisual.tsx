"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

const slides = [
    {
        label: "Dashboard",
        component: <DashboardSlide />,
    },
    {
        label: "Retention activity",
        component: <ActivitySlide />,
    },
    {
        label: "Overview",
        component: <OverviewSlide />,
    },
];

export default function FeatureHeroVisual() {
    const [activeSlide, setActiveSlide] = useState(0);

    const slideCount = slides.length;

    const slideWidth = useMemo(() => {
        return 100 / slideCount;
    }, [slideCount]);

    useEffect(() => {
        const timer = window.setInterval(() => {
            setActiveSlide((current) => {
                if (current >= slideCount - 1) {
                    return 0;
                }

                return current + 1;
            });
        }, 4500);

        return () => {
            window.clearInterval(timer);
        };
    }, [slideCount]);

    return (
        <div className="productPreviewShell">
            <div className="productPreviewTabs">
                {slides.map((slide, index) => (
                    <button
                        key={slide.label}
                        type="button"
                        onClick={() => setActiveSlide(index)}
                        className={activeSlide === index ? "active" : ""}
                    >
                        {slide.label}
                    </button>
                ))}
            </div>

            <div className="productPreviewFrame">
                <div
                    className="productPreviewTrack"
                    style={{
                        width: `${slideCount * 100}%`,
                        transform: `translate3d(-${activeSlide * slideWidth}%, 0, 0)`,
                    }}
                >
                    {slides.map((slide) => (
                        <div
                            key={slide.label}
                            className="productPreviewSlide"
                            style={{
                                width: `${slideWidth}%`,
                            }}
                        >
                            {slide.component}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function DashboardSlide() {
    const rows = [
        [
            "C",
            "CedarWorks",
            "91",
            "Payment risk + renewal intent detected.",
            "£21,900",
        ],
        [
            "KL",
            "Kite Labs",
            "87",
            "Usage dropped before renewal window.",
            "£12,900",
        ],
        [
            "N",
            "NovaPay",
            "76",
            "Expansion slowed after onboarding.",
            "£8,400",
        ],
        [
            "B",
            "BrightDesk",
            "69",
            "Low feature adoption this month.",
            "£7,200",
        ],
    ];

    return (
        <div className="productSlideMockup">
            <div className="mockupHeader">
                <h3>Dashboard</h3>

                <p>
                    Spot revenue at risk, prioritise the accounts that matter,
                    and prove how much MRR your team is protecting.
                </p>
            </div>

            <div className="mockKpiGrid">
                <Kpi
                    title="Total MRR"
                    value="£80,700"
                    meta="See every active account and understand where recurring revenue is concentrated."
                />

                <Kpi
                    title="MRR at risk"
                    value="£5,700"
                    meta="Turn hidden churn exposure into a clear list of customers to save."
                />

                <Kpi
                    title="Churn proxy"
                    value="2.6%"
                    meta="Catch churn pressure early before customers cancel, downgrade, or go quiet."
                />

                <Kpi
                    title="MRR protected"
                    value="£1,856"
                    meta="Show the revenue your retention work is actively helping protect."
                />
            </div>

            <div className="dashboardPreviewGrid">
                <ChartCard
                    title="Churn Trend"
                    subtitle="See whether churn risk is rising or improving, so your team knows when to step in."
                    type="red"
                />

                <ChartCard
                    title="MRR Trend"
                    subtitle="Track protected revenue over time and show the business impact of retention work."
                    type="blue"
                />

                <div className="mockTableCard dashboardTable">
                    <div className="mockTableTop">
                        <h4>Subscribers</h4>

                        <p>
                            Rank customers by churn risk and revenue impact, so
                            your team saves the accounts worth acting on first.
                        </p>
                    </div>

                    <div className="mockTableHead">
                        <span>Account</span>
                        <span>Risk</span>
                        <span>Why it matters</span>
                        <span>MRR</span>
                    </div>

                    {rows.map(
                        ([initial, account, risk, reason, mrr]) => (
                            <div
                                className="mockTableRow"
                                key={account}
                            >
                                <div className="mockAccount">
                                    <span>{initial}</span>

                                    <strong>{account}</strong>
                                </div>

                                <em>{risk}</em>

                                <p>{reason}</p>

                                <strong>{mrr}</strong>
                            </div>
                        )
                    )}
                </div>
            </div>
        </div>
    );
}

function ActivitySlide() {
    const rows = [
        [
            "A",
            "Acme Groups",
            "Billing recovery email",
            "Success",
            "£200",
            "65",
        ],
        [
            "N",
            "Northstar AI",
            "Re-engagement email",
            "Pending",
            "£120",
            "78",
        ],
        [
            "P",
            "Peak Ops",
            "Retry payment scheduled",
            "Pending",
            "£160",
            "84",
        ],
        [
            "C",
            "Clearpath Labs",
            "Executive check-in email",
            "Failed",
            "£180",
            "81",
        ],
    ];

    return (
        <div className="productSlideMockup">
            <div className="mockupHeader">
                <h3>Retention activity</h3>

                <p>
                    Track every save attempt, see what worked, and connect
                    retention actions directly to protected revenue.
                </p>
            </div>

            <div className="mockKpiGrid">
                <Kpi
                    title="MRR protected"
                    value="£1,250"
                    meta="Measure the revenue protected through emails, retries, and recovery workflows."
                />

                <Kpi
                    title="Accounts saved"
                    value="8"
                    meta="See how many at-risk customers were recovered before they churned."
                />

                <Kpi
                    title="Actions executed"
                    value="14"
                    meta="Keep every retention email, retry, and follow-up visible in one place."
                />

                <Kpi
                    title="Success rate"
                    value="57%"
                    meta="Learn which actions turn churn risk into recovered accounts."
                />
            </div>

            <div className="activityInsightsGrid">
                <div className="mockTableCard">
                    <div className="mockTableTop">
                        <h4>Action history</h4>

                        <p>
                            Give your team a clear record of every action,
                            outcome, and customer that still needs attention.
                        </p>
                    </div>

                    <div className="mockTableHead activity">
                        <span>Account</span>
                        <span>Action</span>
                        <span>Outcome</span>
                        <span>Saved</span>
                        <span>Risk</span>
                    </div>

                    {rows.map(
                        ([
                            initial,
                            account,
                            action,
                            outcome,
                            saved,
                            risk,
                        ]) => (
                            <div
                                className="mockTableRow activity"
                                key={`${account}-${action}`}
                            >
                                <div className="mockAccount">
                                    <span>{initial}</span>

                                    <strong>{account}</strong>
                                </div>

                                <p>{action}</p>

                                <b
                                    className={
                                        outcome === "Success"
                                            ? "statusSuccess"
                                            : outcome === "Pending"
                                                ? "statusPending"
                                                : "statusFailed"
                                    }
                                >
                                    {outcome}
                                </b>

                                <strong>{saved}</strong>

                                <em>{risk}</em>
                            </div>
                        )
                    )}
                </div>

                <div className="collageCard insightCard">
                    <h4>AI Insights</h4>

                    <p className="cardSubtext">
                        AI turns risk signals into clear priorities, next
                        actions, and revenue impact your team can trust.
                    </p>

                    <InsightItem
                        label="Revenue protected"
                        title="CedarWorks saved"
                        copy="At-risk revenue was protected after a recent retention action reduced churn exposure."
                        metric="Saved"
                        value="+£610"
                        badge="Impact recorded"
                    />

                    <InsightItem
                        label="Customers recovered"
                        title="Users retained"
                        copy="3 at-risk customers moved back into a safer position after targeted retention actions."
                        metric="Retained"
                        value="+3"
                        badge="Momentum gained"
                    />

                    <InsightItem
                        label="High priority"
                        title="Kite Labs needs action"
                        copy="Renewal is approaching while engagement signals are dropping, making follow-up urgent."
                        metric="At risk"
                        value="£1,850"
                        badge="Act now"
                        danger
                    />
                </div>
            </div>
        </div>
    );
}

function OverviewSlide() {
    return (
        <div className="productSlideMockup">
            <div className="mockupHeader">
                <h3>Overview</h3>

                <p>
                    Bring revenue, churn risk, AI outreach, and customer
                    context together so every save attempt is faster and easier
                    to act on.
                </p>
            </div>

            <div className="overviewGrid">
                <CollageCard
                    title="Recent Revenue"
                    subtitle="See which customers are growing, then protect the accounts most likely to renew, expand, or churn."
                >
                    <CollageTableHead
                        columns={[
                            "Account",
                            "Reason",
                            "Revenue",
                        ]}
                    />

                    <RevenueRow
                        initial="N"
                        account="Northstar Analytics"
                        reason="New Subscription Started"
                        revenue="+£31,250"
                        score="62"
                    />

                    <RevenueRow
                        initial="B"
                        account="BrightPath SaaS"
                        reason="Upgraded To Pro Plan"
                        revenue="+£21,000"
                        score="56"
                    />

                    <RevenueRow
                        initial="A"
                        account="Atlas Learning"
                        reason="Upgraded To Annual Plan"
                        revenue="+£14,750"
                        score="56"
                    />
                </CollageCard>

                <CollageCard
                    title="At-risk accounts"
                    subtitle="Identify churn risk early, understand the reason, and act before renewals turn into lost revenue."
                >
                    <div className="collageRiskHead">
                        <span>Account</span>
                        <span>Reason & action</span>
                        <span>Risk MRR</span>
                        <span>Score</span>
                    </div>

                    <RiskRow
                        initial="N"
                        account="Northstar AI"
                        reason="Failed payment + low engagement"
                        actions={[
                            "Retry payment",
                            "Recovery email",
                        ]}
                        revenue="£349"
                        score="61"
                    />

                    <RiskRow
                        initial="C"
                        account="CedarWorks"
                        reason="Usage dropped sharply in 14 days"
                        actions={[
                            "Usage recovery email",
                        ]}
                        revenue="£219"
                        score="88"
                    />

                    <RiskRow
                        initial="K"
                        account="Kite Labs"
                        reason="Renewal window approaching"
                        actions={[
                            "Renewal check-in",
                        ]}
                        revenue="£129"
                        score="82"
                    />
                </CollageCard>

                <CollageCard
                    title="Retention outreach"
                    subtitle="Turn AI recommendations into editable retention messages your team can send in seconds."
                >
                    <label>To</label>

                    <input
                        readOnly
                        value="support@cedarworks.io"
                    />

                    <label>Subject</label>

                    <input
                        readOnly
                        value="Quick renewal check-in — CedarWorks"
                    />

                    <label>Message</label>

                    <textarea
                        readOnly
                        value={`Hi CedarWorks team,

I wanted to check in ahead of your renewal.

We've seen a few signals that suggest your team may be reviewing the plan. Happy to align on what's working and what we can improve.`}
                    />

                    <div className="outreachButtons">
                        <button type="button">
                            Cancel
                        </button>

                        <button type="button">
                            Send email
                        </button>
                    </div>
                </CollageCard>

                <CollageCard
                    title="Account overview"
                    subtitle="Give your team the context they need before every renewal email, recovery call, or save attempt."
                >
                    <h3>CedarWorks</h3>

                    <p className="accountEmail">
                        support@cedarworks.io
                    </p>

                    <div className="accountMiniGrid">
                        <InfoBox
                            label="Plan"
                            value="Pro"
                        />

                        <InfoBox
                            label="MRR"
                            value="£21,900"
                        />

                        <InfoBox
                            label="Created"
                            value="08 Nov 2025"
                        />

                        <InfoBox
                            label="Next billing"
                            value="09 Jun 2026"
                        />

                        <InfoBox
                            label="Risk proxy"
                            value="91%"
                        />

                        <InfoBox
                            label="Status"
                            value="Healthy"
                        />
                    </div>
                </CollageCard>
            </div>
        </div>
    );
}

function Kpi({
    title,
    value,
    meta,
}: {
    title: string;
    value: string;
    meta: string;
}) {
    return (
        <div className="mockKpiCard">
            <span>{title}</span>

            <strong>{value}</strong>

            <p>{meta}</p>
        </div>
    );
}

function ChartCard({
    title,
    subtitle,
    type,
}: {
    title: string;
    subtitle: string;
    type: "blue" | "red";
}) {
    return (
        <div className="mockChartCard">
            <div className="mockCardTop">
                <div>
                    <h4>{title}</h4>

                    <p>{subtitle}</p>
                </div>

                <button type="button">
                    View full
                </button>
            </div>

            <div className="mockChart">
                <svg
                    viewBox="0 0 500 220"
                    preserveAspectRatio="none"
                >
                    <path
                        className={type}
                        d={
                            type === "blue"
                                ? "M0 180 L55 158 L110 165 L165 130 L220 112 L275 86 L330 96 L385 58 L500 28"
                                : "M0 55 L55 76 L110 68 L165 100 L220 112 L275 122 L330 146 L385 150 L500 178"
                        }
                    />
                </svg>
            </div>
        </div>
    );
}

function CollageCard({
    title,
    subtitle,
    children,
}: {
    title: string;
    subtitle: string;
    children: ReactNode;
}) {
    return (
        <section className="collageCard">
            <h4>{title}</h4>

            <p className="cardSubtext">
                {subtitle}
            </p>

            {children}
        </section>
    );
}

function CollageTableHead({
    columns,
}: {
    columns: string[];
}) {
    return (
        <div className="collageTableHead">
            {columns.map((column) => (
                <span key={column}>
                    {column}
                </span>
            ))}
        </div>
    );
}

function RevenueRow({
    initial,
    account,
    reason,
    revenue,
    score,
}: {
    initial: string;
    account: string;
    reason: string;
    revenue: string;
    score: string;
}) {
    return (
        <div className="collageRevenueRow">
            <div className="collageAccount">
                <span>{initial}</span>

                <div>
                    <strong>{account}</strong>

                    <small>23 May</small>
                </div>
            </div>

            <p>{reason}</p>

            <div className="collageMoney">
                <strong>{revenue}</strong>

                <em>{score}</em>
            </div>
        </div>
    );
}

function RiskRow({
    initial,
    account,
    reason,
    actions,
    revenue,
    score,
}: {
    initial: string;
    account: string;
    reason: string;
    actions: string[];
    revenue: string;
    score: string;
}) {
    return (
        <div className="collageRiskRow">
            <div className="collageAccount">
                <span>{initial}</span>

                <div>
                    <strong>{account}</strong>

                    <small>28 May</small>
                </div>
            </div>

            <div className="riskReason">
                <strong>{reason}</strong>

                <div>
                    {actions.map((action) => (
                        <button
                            key={action}
                            type="button"
                        >
                            {action}
                        </button>
                    ))}
                </div>
            </div>

            <b>{revenue}</b>

            <em>{score}</em>
        </div>
    );
}

function InfoBox({
    label,
    value,
}: {
    label: string;
    value: string;
}) {
    return (
        <div className="infoBox">
            <span>{label}</span>

            <strong>{value}</strong>
        </div>
    );
}

function InsightItem({
    label,
    title,
    copy,
    metric,
    value,
    badge,
    danger,
}: {
    label: string;
    title: string;
    copy: string;
    metric: string;
    value: string;
    badge: string;
    danger?: boolean;
}) {
    return (
        <div
            className={`insightItem ${danger ? "danger" : ""
                }`}
        >
            <div>
                <span>{label}</span>

                <strong>{title}</strong>

                <p>{copy}</p>

                <small>{badge}</small>
            </div>

            <div>
                <span>{metric}</span>

                <strong>{value}</strong>
            </div>
        </div>
    );
}