"use client";

import type { ReactNode } from "react";
import {
    type FeatureKey,
    type PlanTier,
    getUpgradeMessage,
    hasFeatureAccess,
} from "@/lib/permissions";

type FeatureGateProps = {
    plan: PlanTier | null | undefined;
    feature: FeatureKey;
    children: ReactNode;
    className?: string;
    blurAmount?: number;
    title?: string;
    description?: string;
    ctaLabel?: string;
    onUpgradeClick?: () => void;
};

export default function FeatureGate({
    plan,
    feature,
    children,
    className,
    blurAmount = 8,
    title,
    description,
    ctaLabel = "Upgrade to Pro",
    onUpgradeClick,
}: FeatureGateProps) {
    const allowed = hasFeatureAccess(plan, feature);

    if (allowed) {
        return <>{children}</>;
    }

    const upgrade = getUpgradeMessage(feature);

    const finalTitle = title ?? upgrade.title ?? "Unlock this feature";
    const finalDescription =
        description ??
        upgrade.description ??
        "Upgrade to Pro to unlock this feature.";

    return (
        <div
            className={className}
            style={{
                position: "relative",
                borderRadius: 24,
                overflow: "hidden",
            }}
        >
            <div
                aria-hidden="true"
                style={{
                    filter: `blur(${blurAmount}px)`,
                    opacity: 0.58,
                    pointerEvents: "none",
                    userSelect: "none",
                    transform: "scale(1.01)",
                }}
            >
                {children}
            </div>

            <div
                style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 24,
                    background:
                        "linear-gradient(180deg, rgba(255,255,255,0.58) 0%, rgba(255,255,255,0.78) 100%)",
                    backdropFilter: "blur(8px)",
                    WebkitBackdropFilter: "blur(8px)",
                }}
            >
                <div
                    style={{
                        width: "100%",
                        maxWidth: 380,
                        borderRadius: 22,
                        border: "1px solid rgba(15, 23, 42, 0.08)",
                        background: "rgba(255,255,255,0.96)",
                        boxShadow: "0 18px 50px rgba(15, 23, 42, 0.10)",
                        padding: 24,
                        textAlign: "center",
                    }}
                >
                    <div
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: "6px 12px",
                            borderRadius: 999,
                            background: "rgba(15, 23, 42, 0.06)",
                            color: "#0f172a",
                            fontSize: 12,
                            fontWeight: 700,
                            letterSpacing: "0.04em",
                            textTransform: "uppercase",
                            marginBottom: 14,
                        }}
                    >
                        Pro feature
                    </div>

                    <h3
                        style={{
                            margin: 0,
                            fontSize: 22,
                            lineHeight: 1.2,
                            fontWeight: 700,
                            color: "#0f172a",
                        }}
                    >
                        {finalTitle}
                    </h3>

                    <p
                        style={{
                            margin: "10px 0 0",
                            fontSize: 14,
                            lineHeight: 1.6,
                            color: "#5f6b7a",
                        }}
                    >
                        {finalDescription}
                    </p>

                    <button
                        type="button"
                        onClick={onUpgradeClick}
                        style={{
                            marginTop: 18,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            border: "none",
                            borderRadius: 999,
                            padding: "12px 18px",
                            background: "#0f172a",
                            color: "#ffffff",
                            fontSize: 14,
                            fontWeight: 600,
                            cursor: "pointer",
                        }}
                    >
                        {ctaLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}