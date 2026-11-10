"use client";

import Image from "next/image";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export default function MarketingHeader() {
    const pathname = usePathname();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const isHomeActive = pathname === "/";
    const isRetentionAuditActive = pathname === "/retention-audit";

    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth > 900) {
                setMobileMenuOpen(false);
            }
        };

        window.addEventListener("resize", handleResize);

        return () => {
            window.removeEventListener("resize", handleResize);
        };
    }, []);

    const closeMenu = () => setMobileMenuOpen(false);

    return (
        <header className="siteHeader">
            <div className="siteHeaderInner">
                <Link
                    href="/"
                    aria-label="Go to Cobrai homepage"
                    className="logoWrap"
                    onClick={closeMenu}
                >
                    <Image
                        src="/branding/cobrai.logo.jpg.PNG"
                        alt="Cobrai"
                        width={126}
                        height={42}
                        priority
                        unoptimized
                    />
                </Link>

                <nav className="topNav" aria-label="Main navigation">
                    <Link
                        href="/"
                        className={`navLink ${isHomeActive ? "active" : ""}`}
                    >
                        Home
                    </Link>
                </nav>

                <div className="headerActions">
                    <Link
                        href="/retention-audit"
                        className={`headerGhostBtn ${isRetentionAuditActive ? "active" : ""}`}
                    >
                        Request retention audit
                    </Link>

                    <Link href="/login" className="headerGhostBtn">
                        Log in
                    </Link>

                    <Link href="/signup" className="headerPrimaryBtn">
                        Sign up
                    </Link>
                </div>

                <button
                    type="button"
                    className="headerMenuButton"
                    aria-label={
                        mobileMenuOpen
                            ? "Close navigation menu"
                            : "Open navigation menu"
                    }
                    aria-expanded={mobileMenuOpen}
                    aria-controls="marketing-mobile-menu"
                    onClick={() => setMobileMenuOpen((current) => !current)}
                >
                    {mobileMenuOpen ? <X size={19} /> : <Menu size={19} />}
                </button>
            </div>

            {mobileMenuOpen && (
                <nav
                    id="marketing-mobile-menu"
                    className="headerMobileMenu"
                    aria-label="Mobile navigation"
                >
                    <Link
                        href="/"
                        className={isHomeActive ? "mobileNavActive" : ""}
                        onClick={closeMenu}
                    >
                        Home
                    </Link>

                    <Link
                        href="/retention-audit"
                        className={isRetentionAuditActive ? "mobileNavActive" : ""}
                        onClick={closeMenu}
                    >
                        Request retention audit
                    </Link>

                    <div className="mobileMenuDivider" />

                    <Link href="/login" onClick={closeMenu}>
                        Log in
                    </Link>

                    <Link
                        href="/signup"
                        className="headerMobilePrimary"
                        onClick={closeMenu}
                    >
                        Sign up
                    </Link>
                </nav>
            )}
        </header>
    );
}
