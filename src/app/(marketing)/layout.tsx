import type { ReactNode } from "react";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";

export default function MarketingLayout({
    children,
}: {
    children: ReactNode;
}) {
    return (
        <main className="landing">
            <div className="container">
                <MarketingHeader />
                {children}
                <Footer />
            </div>
        </main>
    );
}