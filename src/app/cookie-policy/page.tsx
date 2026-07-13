import type { Metadata } from "next";
import Link from "next/link";
import TermlyPolicy from "@/components/TermlyPolicy";

export const metadata: Metadata = {
    title: "Cookie Policy | Cobrai",
    description:
        "Read Cobrai's cookie policy.",
};

export default function CookiePolicyPage() {
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

                    <h1>Cookie Policy</h1>

                    <p>
                        Learn how Cobrai uses cookies and
                        similar technologies.
                    </p>
                </header>

                <TermlyPolicy
                    policyId="3e188e15-88f8-4ab9-aa2b-ef56422dd785"
                />
            </div>
        </main>
    );
}