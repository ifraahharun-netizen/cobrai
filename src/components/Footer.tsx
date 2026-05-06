"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type ModalType = "about" | "privacy" | "terms" | "cookie" | null;

const TERM_IDS = {
    privacy: "a777b328-38d8-4bef-8046-88844055517f",
    terms: "232e972c-8924-4d89-9111-0aa5cc2ce0a5",
    cookie: "3e188e15-88f8-4ab9-aa2b-ef56422dd785",
};

export default function Footer() {
    const [modalType, setModalType] = useState<ModalType>(null);

    useEffect(() => {
        if (
            modalType !== "privacy" &&
            modalType !== "terms" &&
            modalType !== "cookie"
        ) {
            return;
        }

        const existingScript = document.getElementById("termly-jssdk");

        if (existingScript) {
            existingScript.remove();
        }

        const script = document.createElement("script");

        script.id = "termly-jssdk";
        script.type = "text/javascript";
        script.src = "https://app.termly.io/embed-policy.min.js";
        script.async = true;

        document.body.appendChild(script);
    }, [modalType]);

    return (
        <>
            <footer className="footer">
                <div className="footerCenter">
                    {/* ===== CTA ===== */}
                    <div className="footerCTA">
                        <h2 className="footerTitle">
                            Ready to protect your revenue?
                        </h2>

                        <p className="footerCopy">
                            See at-risk customers, understand why, and take action before it’s too late.
                        </p>

                        <div className="footerButtons">
                            <Link
                                href="/signup"
                                className="footerPrimaryBtn"
                            >
                                Start Free
                            </Link>

                            <Link
                                href="/demo"
                                className="footerSecondaryBtn"
                            >
                                View Demo
                            </Link>
                        </div>
                    </div>

                    {/* ===== GRID ===== */}
                    <div className="footerGrid">
                        {/* Brand */}
                        <div className="footerBrandCol">
                            <button
                                type="button"
                                className="footerBrand footerTextButton"
                                onClick={() => setModalType("about")}
                            >
                                Cobrai
                            </button>

                            <p className="footerCopy">
                                Retention intelligence for modern SaaS teams.
                            </p>
                        </div>

                        {/* About */}
                        <div>
                            <div className="footerHeading">
                                About
                            </div>

                            <button
                                type="button"
                                className="footerLinkButton"
                                onClick={() => setModalType("about")}
                            >
                                Cobrai
                            </button>

                            <Link href="/features">
                                Features
                            </Link>

                            <Link href="/pricing">
                                Pricing
                            </Link>
                        </div>

                        {/* Legal */}
                        <div>
                            <div className="footerHeading">
                                Legal
                            </div>

                            <button
                                type="button"
                                className="footerLinkButton"
                                onClick={() => setModalType("privacy")}
                            >
                                Privacy Policy
                            </button>

                            <button
                                type="button"
                                className="footerLinkButton"
                                onClick={() => setModalType("terms")}
                            >
                                Terms & Conditions
                            </button>

                            <button
                                type="button"
                                className="footerLinkButton"
                                onClick={() => setModalType("cookie")}
                            >
                                Cookie Policy
                            </button>
                        </div>

                        {/* Connect */}
                        <div>
                            <div className="footerHeading">
                                Connect
                            </div>

                            <a href="mailto:cobrai@cobrai.uk">
                                cobrai@cobrai.uk
                            </a>

                            <a
                                href="https://linkedin.com"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                LinkedIn
                            </a>

                            <a
                                href="https://twitter.com"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                X
                            </a>
                        </div>
                    </div>

                    {/* ===== BOTTOM ===== */}
                    <div className="footerBottom">
                        © {new Date().getFullYear()} Cobrai. All rights reserved.
                    </div>
                </div>
            </footer>

            {/* ===== MODAL ===== */}
            {modalType && (
                <div
                    className="footerModalOverlay"
                    onClick={() => setModalType(null)}
                >
                    <div
                        className="footerLegalModal"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            type="button"
                            className="footerModalClose"
                            onClick={() => setModalType(null)}
                        >
                            ×
                        </button>

                        {/* About Modal */}
                        {modalType === "about" && (
                            <>
                                <h2>About Cobrai</h2>

                                <p>
                                    Cobrai is an AI retention intelligence platform built for
                                    subscription and SaaS businesses. It helps teams identify
                                    at-risk customers, understand the reasons behind churn,
                                    and take action before revenue is lost.
                                </p>

                                <div className="footerModalGrid">
                                    <div>
                                        <h3>Mission</h3>

                                        <p>
                                            To help businesses retain more customers by
                                            making churn risk clear, early, and actionable.
                                        </p>
                                    </div>

                                    <div>
                                        <h3>Vision</h3>

                                        <p>
                                            To become the intelligence layer that helps
                                            subscription businesses grow through stronger
                                            customer retention.
                                        </p>
                                    </div>

                                    <div>
                                        <h3>Service</h3>

                                        <p>
                                            Cobrai connects customer, billing, and
                                            behavioural signals to show which accounts need
                                            attention and what action to take next.
                                        </p>
                                    </div>
                                </div>
                            </>
                        )}

                        {/* Termly Policies */}
                        {(modalType === "privacy" ||
                            modalType === "terms" ||
                            modalType === "cookie") && (
                                <>
                                    <h2>
                                        {modalType === "privacy"
                                            ? "Privacy Policy"
                                            : modalType === "terms"
                                                ? "Terms & Conditions"
                                                : "Cookie Policy"}
                                    </h2>

                                    <div className="footerLegalContent">
                                        <div
                                            {...{
                                                name: "termly-embed",
                                                "data-id": TERM_IDS[modalType],
                                            }}
                                        />
                                    </div>
                                </>
                            )}
                    </div>
                </div>
            )}
        </>
    );
}