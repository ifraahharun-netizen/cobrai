"use client";

import { useState } from "react";
import Link from "next/link";
import { termsContent, privacyContent } from "@/lib/legalContent";

type ModalType = "about" | "privacy" | "terms" | null;

export default function Footer() {
    const [modalType, setModalType] = useState<ModalType>(null);

    const legalContent =
        modalType === "privacy"
            ? privacyContent
            : modalType === "terms"
                ? termsContent
                : null;

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
                            <Link href="/signup" className="footerPrimaryBtn">
                                Start Free
                            </Link>

                            <Link href="/demo" className="footerSecondaryBtn">
                                View Demo
                            </Link>
                        </div>
                    </div>

                    {/* ===== MAIN GRID ===== */}
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
                            <div className="footerHeading">About</div>

                            <button
                                type="button"
                                className="footerLinkButton"
                                onClick={() => setModalType("about")}
                            >
                                Cobrai
                            </button>

                            <Link href="/features">Features</Link>
                            <Link href="/pricing">Pricing</Link>
                        </div>

                        {/* Legal */}
                        <div>
                            <div className="footerHeading">Legal</div>

                            <button
                                type="button"
                                className="footerLinkButton"
                                onClick={() => setModalType("privacy")}
                            >
                                Privacy
                            </button>

                            <button
                                type="button"
                                className="footerLinkButton"
                                onClick={() => setModalType("terms")}
                            >
                                Terms
                            </button>
                        </div>

                        {/* Connect */}
                        <div>
                            <div className="footerHeading">Connect</div>

                            <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer">
                                LinkedIn
                            </a>

                            <a href="https://twitter.com" target="_blank" rel="noopener noreferrer">
                                Twitter
                            </a>

                            <Link href="/contact">Gmail</Link>
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
                <div className="footerModalOverlay" onClick={() => setModalType(null)}>
                    <div className="footerLegalModal" onClick={(e) => e.stopPropagation()}>
                        <button
                            type="button"
                            className="footerModalClose"
                            onClick={() => setModalType(null)}
                        >
                            ×
                        </button>

                        {modalType === "about" && (
                            <>
                                <h2>About Cobrai</h2>

                                <p>
                                    Cobrai is an AI retention intelligence platform built for
                                    subscription and SaaS businesses. It helps teams identify
                                    at-risk customers, understand the reasons behind churn, and take
                                    action before revenue is lost.
                                </p>

                                <div className="footerModalGrid">
                                    <div>
                                        <h3>Mission</h3>
                                        <p>
                                            To help businesses retain more customers by making churn
                                            risk clear, early, and actionable.
                                        </p>
                                    </div>

                                    <div>
                                        <h3>Vision</h3>
                                        <p>
                                            To become the intelligence layer that helps subscription
                                            businesses grow through stronger customer retention.
                                        </p>
                                    </div>

                                    <div>
                                        <h3>Service</h3>
                                        <p>
                                            Cobrai connects customer, billing, and behavioural signals
                                            to show which accounts need attention and what action to
                                            take next.
                                        </p>
                                    </div>
                                </div>
                            </>
                        )}

                        {legalContent && (
                            <>
                                <h2>{legalContent.title}</h2>

                                <div className="footerLegalContent">
                                    {legalContent.sections.map((section) => (
                                        <div key={section.heading} className="footerLegalSection">
                                            <h3>{section.heading}</h3>

                                            {section.body.map((text, index) => (
                                                <p key={index}>{text}</p>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}