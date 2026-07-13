import type { Metadata } from "next";
import Link from "next/link";
import TermlyPolicy from "@/components/TermlyPolicy";

export const metadata: Metadata = {
    title: "Terms & Conditions | Cobrai",
    description:
        "Read Cobrai's terms and conditions.",
};

export default function TermsPage() {
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

                    <h1>Terms &amp; Conditions</h1>

                    <p>
                        Read the terms governing your use of
                        Cobrai.
                    </p>
                </header>

                <TermlyPolicy
                    policyId="232e972c-8924-4d89-9111-0aa5cc2ce0a5"
                />
            </div>
        </main>
    );
}