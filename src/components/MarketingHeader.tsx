"use client";

import Image from "next/image";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const navigation = [
    {
        label: "Home",
        href: "/",
    },
    {
        label: "Features",
        href: "/#features",
    },
    {
        label: "Pricing",
        href: "/#pricing",
    },
    {
        label: "Resources",
        href: "/#resources",
    },
];

export default function MarketingHeader() {
    const pathname = usePathname();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const isActive = (href: string) => {
        if (href === "/") {
            return pathname === "/";
        }

        if (href.startsWith("/#")) {
            return false;
        }

        return pathname?.startsWith(href) ?? false;
    };

    useEffect(() => {
        setMobileMenuOpen(false);
    }, [pathname]);

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

    return (
        <header className="siteHeader">
            <div className="siteHeaderInner">
                <Link
                    href="/"
                    aria-label="Go to Cobrai homepage"
                    className="logoWrap"
                    onClick={() => setMobileMenuOpen(false)}
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
                    {navigation.map((item) => (
                        <Link
                            key={item.label}
                            href={item.href}
                            className={`navLink ${isActive(item.href) ? "active" : ""
                                }`}
                        >
                            {item.label}
                        </Link>
                    ))}
                </nav>

                <div className="headerActions">
                    <Link href="/login" className="headerGhostBtn">
                        Log in
                    </Link>

                    <Link href="/signup" className="headerPrimaryBtn">
                        Start free trial
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
                    onClick={() => {
                        setMobileMenuOpen((current) => !current);
                    }}
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
                    {navigation.map((item) => (
                        <Link
                            key={item.label}
                            href={item.href}
                            className={
                                isActive(item.href) ? "mobileNavActive" : ""
                            }
                            onClick={() => setMobileMenuOpen(false)}
                        >
                            {item.label}
                        </Link>
                    ))}

                    <div className="mobileMenuDivider" />

                    <Link
                        href="/login"
                        onClick={() => setMobileMenuOpen(false)}
                    >
                        Log in
                    </Link>

                    <Link
                        href="/signup"
                        className="headerMobilePrimary"
                        onClick={() => setMobileMenuOpen(false)}
                    >
                        Start free trial
                    </Link>
                </nav>
            )}
        </header>
    );
}