"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import styles from "./sidebar.module.css";

type NavItem = {
    label: string;
    href: string;
    icon: string;
};

const nav: NavItem[] = [
    { label: "Overview", href: "/dashboard", icon: "fi fi-rr-apps" },
    { label: "Customers", href: "/dashboard/accounts-at-risk", icon: "fi fi-rr-users-alt" },
    {
        label: "Retention Impact",
        href: "/dashboard/progress",
        icon: "fi fi-rr-shield-check",
    },
    { label: "Analytics", href: "/dashboard/analytics", icon: "fi fi-rr-chart-line-up" },
];

export default function Sidebar() {
    const pathname = usePathname();
    const router = useRouter();

    const isActive = (href: string) =>
        pathname === href || (href !== "/dashboard" && pathname.startsWith(href));

    return (
        <aside className={styles.sidebar}>
            <div className={styles.top}>
                <div className={styles.brandRow}>
                    <Link href="/dashboard" aria-label="Cobrai" className={styles.brandLink}>
                        <Image
                            src="/branding/cobrai.logo.png"
                            alt="Cobrai"
                            width={130}
                            height={34}
                            priority
                            className={styles.logo}
                        />
                    </Link>
                </div>

                <div className={styles.sectionLabel}>MAIN</div>

                <nav className={styles.nav}>
                    {nav.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`${styles.navLink} ${isActive(item.href) ? styles.NavActive : ""}`}
                        >
                            <i className={item.icon} aria-hidden="true" />
                            <span>{item.label}</span>
                        </Link>
                    ))}
                </nav>
            </div>

            <div className={styles.bottomWrap}>
                <div className={styles.sectionLabel}>OTHERS</div>

                <div className={styles.bottomSection}>
                    <Link
                        href="/dashboard/settings"
                        className={`${styles.bottomItem} ${isActive("/dashboard/settings") ? styles.NavActive : ""}`}
                    >
                        <i className="fi fi-rr-settings" aria-hidden="true" />
                        <span>Settings</span>
                    </Link>

                    <button
                        type="button"
                        className={styles.bottomItem}
                        onClick={() => router.replace("/")}
                    >
                        <i className="fi fi-rr-sign-out-alt" aria-hidden="true" />
                        <span>Sign Out</span>
                    </button>
                </div>
            </div>
        </aside>
    );
}