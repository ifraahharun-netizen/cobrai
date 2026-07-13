"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Footer() {
    const [aboutOpen, setAboutOpen] = useState(false);

    useEffect(() => {
        if (!aboutOpen) {
            document.body.style.overflow = "";
            return;
        }

        document.body.style.overflow = "hidden";

        return () => {
            document.body.style.overflow = "";
        };
    }, [aboutOpen]);

    useEffect(() => {
        function closeOnEscape(event: KeyboardEvent) {
            if (event.key === "Escape") {
                setAboutOpen(false);
            }
        }

        window.addEventListener("keydown", closeOnEscape);

        return () => {
            window.removeEventListener("keydown", closeOnEscape);
        };
    }, []);

    return (
        <>
            <footer className="footer">
                <div className="footerCenter">
                    <section className="featureFinalCta footerTopCta">
                        <div>
                            <h2>Ready to protect your revenue?</h2>

                            <p>
                                Join subscription businesses using Cobrai to
                                reduce churn and protect MRR.
                            </p>
                        </div>

                        <Link href="/signup" className="footerWhiteBtn">
                            Get Started Free
                        </Link>
                    </section>

                    <div className="footerGrid">
                        <div className="footerBrandCol">
                            <button
                                type="button"
                                className="footerBrand footerTextButton"
                                onClick={() => setAboutOpen(true)}
                            >
                                Cobrai
                            </button>

                            <p className="footerCopy">
                                Retention intelligence for modern SaaS teams.
                            </p>
                        </div>

                        <div>
                            <div className="footerHeading">About</div>

                            <button
                                type="button"
                                className="footerLinkButton"
                                onClick={() => setAboutOpen(true)}
                            >
                                Cobrai
                            </button>

                            <Link href="/features">Features</Link>

                            <Link href="/pricing">Pricing</Link>
                        </div>

                        <div>
                            <div className="footerHeading">Legal</div>

                            <Link href="/privacy">
                                Privacy Policy
                            </Link>

                            <Link href="/terms">
                                Terms &amp; Conditions
                            </Link>

                            <Link href="/cookies">
                                Cookie Policy
                            </Link>
                        </div>
                    </div>

                    <div className="footerBottom">
                        © {new Date().getFullYear()} Cobrai LTD. All rights
                        reserved.
                    </div>
                </div>
            </footer>

            {aboutOpen && (
                <div
                    className="footerModalOverlay"
                    role="presentation"
                    onClick={() => setAboutOpen(false)}
                >
                    <div
                        className="footerLegalModal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="footer-about-title"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <button
                            type="button"
                            className="footerModalClose"
                            aria-label="Close about Cobrai"
                            onClick={() => setAboutOpen(false)}
                        >
                            ×
                        </button>

                        <h2 id="footer-about-title">
                            About Cobrai
                        </h2>

                        <p>
                            Cobrai is an AI retention intelligence platform
                            built for subscription and SaaS businesses. It
                            helps teams identify at-risk customers, understand
                            the reasons behind churn, and take action before
                            revenue is lost.
                        </p>

                        <div className="footerModalGrid">
                            <div>
                                <h3>Mission</h3>

                                <p>
                                    To help businesses retain more customers by
                                    making churn risk clear, early and
                                    actionable.
                                </p>
                            </div>

                            <div>
                                <h3>Vision</h3>

                                <p>
                                    To become the intelligence layer that helps
                                    subscription businesses grow through
                                    stronger customer retention.
                                </p>
                            </div>

                            <div>
                                <h3>Service</h3>

                                <p>
                                    Cobrai connects customer, billing and
                                    behavioural signals to show which accounts
                                    need attention and what action to take next.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}