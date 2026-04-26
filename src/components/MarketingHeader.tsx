"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function MarketingHeader() {
    const pathname = usePathname();

    const isActive = (href: string) => {
        if (href === "/") return pathname === "/";
        return pathname?.startsWith(href) ?? false;
    };

    return (
        <header className="siteHeader">
            <div className="siteHeaderInner">
                <Link href="/" aria-label="Cobrai home">
                 
                </Link>

                <nav className="topNav" aria-label="Main navigation">
                    <Link href="/" className={`navLink ${isActive("/") ? "active" : ""}`}>
                        Home
                    </Link>

                    <Link
                        href="/features"
                        className={`navLink ${isActive("/features") ? "active" : ""}`}
                    >
                        Features
                    </Link>

                    <Link
                        href="/pricing"
                        className={`navLink ${isActive("/pricing") ? "active" : ""}`}
                    >
                        Pricing
                    </Link>

                    <Link
                        href="/demo"
                        className={`navLink ${isActive("/demo") ? "active" : ""}`}
                    >
                       View Demo
                    </Link>
                </nav>

                <div className="headerActions">
                    <Link href="/signup" className="headerGhostBtn">
                        Get Started
                    </Link>

                    <Link href="/login" className="headerPrimaryBtn">
                        Login
                    </Link>
                </div>
            </div>
        </header>
    );
}