"use client";

import Link from "next/link";

type TrialBannerProps = {
    plan?: "free" | "starter" | "pro" | null;
    trialEndsAt?: string | null;
    className?: string;
};

function getTrialDaysLeft(value?: string | null) {
    if (!value) return 0;
    const end = new Date(value).getTime();
    if (Number.isNaN(end)) return 0;
    const diff = end - Date.now();
    if (diff <= 0) return 0;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export default function TrialBanner({
    plan,
    trialEndsAt,
    className,
}: TrialBannerProps) {
    if (plan !== "free") return null;

    const daysLeft = getTrialDaysLeft(trialEndsAt);
    const expired = daysLeft <= 0;

    const title = expired
        ? "Your free trial has ended"
        : `Your free trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`;

    const buttonText = expired ? "Upgrade to continue" : "Choose a plan";

    const description = expired
        ? "Choose Starter or Pro to continue using Cobrai."
        : "Choose Starter or Pro before your trial ends to keep using Cobrai without interruption.";

    return (
        <div
            className={className}
            style={{
                marginBottom: 16,
                padding: "14px 16px",
                border: "1px solid #e5e7eb",
                borderRadius: 14,
                background: "#fff8e7",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
            }}
        >
            <div>
                <div
                    style={{
                        fontWeight: 700,
                        fontSize: 15,
                        color: "#111827",
                        marginBottom: 4,
                    }}
                >
                    {title}
                </div>

                <div
                    style={{
                        color: "#4b5563",
                        fontSize: 14,
                    }}
                >
                    {description}
                </div>
            </div>

            <Link
                href="/dashboard/settings?tab=manage-plan"
                style={{
                    textDecoration: "none",
                    padding: "10px 14px",
                    borderRadius: 10,
                    background: "#111827",
                    color: "#ffffff",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                }}
            >
                {buttonText}
            </Link>
        </div>
    );
}