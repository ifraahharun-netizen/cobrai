import type { ReactNode } from "react";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export default function MarketingLayout({
    children,
}: {
    children: ReactNode;
}) {
    return (
        <main
            className={`landing ${inter.variable}`}
            style={{ fontFamily: "var(--font-inter), Inter, system-ui, sans-serif" }}
        >
            <div className="container">
                <MarketingHeader />
                {children}
                <Footer />
            </div>
        </main>
    );
}