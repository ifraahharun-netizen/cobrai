"use client";

import Link from "next/link";
import Image from "next/image";
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
                <Link href="/" aria-label="Cobrai home" className="logoWrap">
                    <Image
                        src="/branding/cobrai.logo.jpg.PNG"
                        alt="cobrai"
                        width={160}
                        height={54}
                        priority
                        unoptimized
                    />

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