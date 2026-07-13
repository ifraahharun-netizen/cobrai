import type { Metadata } from "next";
import Link from "next/link";
import TermlyPolicy from "@/components/TermlyPolicy";

export const metadata: Metadata = {
    title: "Privacy Policy | Cobrai",
    description:
        "Read Cobrai's privacy policy.",
};

export default function PrivacyPage() {
    return (
        <main className="legalPage">
            <div className="legalPageInner">
                <header className="legalPageHeader">
                    <Link
                        href="/"
                        className="legalBackLink"
                    >
                        ← Back to Cobrai
                    </Link>

                    <h1>Privacy Policy</h1>

                    <p>
                        Learn how Cobrai collects, uses and
                        protects your information.
                    </p>
                </header>

                <TermlyPolicy
                    policyId="a777b328-38d8-4bef-8046-88844055517f"
                />
            </div>
        </main>
    );
}