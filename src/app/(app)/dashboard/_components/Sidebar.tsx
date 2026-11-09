"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import styles from "./sidebar.module.css";

type NavItem = {
    label: string;
    href: string;
    icon: string;
};

const nav: NavItem[] = [
    { label: "Overview", href: "/dashboard", icon: "fi fi-rr-apps" },
    { label: "Accounts", href: "/dashboard/accounts-at-risk", icon: "fi fi-rr-users-alt" },
    { label: "Retention Impact", href: "/dashboard/progress", icon: "fi fi-rr-shield-check" },
    { label: "Inbox", href: "/dashboard/inbox", icon: "fi fi-rr-envelope" },
    { label: "Metrics", href: "/dashboard/analytics", icon: "fi fi-rr-chart-line-up" },
    { label: "Integrations", href: "/dashboard/integrations", icon: "fi fi-rr-apps-add" },
];

type SidebarProps = {
    collapsed?: boolean;
    onToggle?: () => void;
};

export default function Sidebar({ collapsed = false, onToggle }: SidebarProps) {
    const pathname = usePathname();
    const router = useRouter();

    const isActive = (href: string) =>
        pathname === href || (href !== "/dashboard" && pathname.startsWith(href));

    // In the folded rail, labels are hidden visually but stay readable to screen readers,
    // and a hover tooltip shows the name.
    const itemProps = (label: string) =>
        collapsed ? { "aria-label": label, "data-tooltip": label } : {};

    return (
        <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ""}`}>
            <div className={styles.header}>
                <Link href="/dashboard" aria-label="Cobrai home" className={styles.brandLink}>
                    {collapsed ? (
                        <Image
                            src="/branding/cobrai-mark.png"
                            alt=""
                            width={24}
                            height={24}
                            priority
                            unoptimized
                            className={styles.logoMark}
                        />
                    ) : (
                        <Image
                            src="/branding/cobrai-wordmark.png"
                            alt=""
                            width={96}
                            height={24}
                            priority
                            unoptimized
                            className={styles.logo}
                        />
                    )}
                </Link>
            </div>

            <nav className={styles.section} aria-label="Main">
                <div className={styles.sectionLabel}>Main</div>

                {nav.map((item) => {
                    const active = isActive(item.href);

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`${styles.item} ${active ? styles.itemActive : ""}`}
                            aria-current={active ? "page" : undefined}
                            {...itemProps(item.label)}
                        >
                            <i className={item.icon} aria-hidden="true" />
                            <span className={styles.label}>{item.label}</span>
                        </Link>
                    );
                })}
            </nav>

            <div className={styles.footer}>
                <div className={styles.sectionLabel}>Others</div>

                <Link
                    href="/dashboard/settings"
                    className={`${styles.item} ${isActive("/dashboard/settings") ? styles.itemActive : ""}`}
                    aria-current={isActive("/dashboard/settings") ? "page" : undefined}
                    {...itemProps("Settings")}
                >
                    <i className="fi fi-rr-settings" aria-hidden="true" />
                    <span className={styles.label}>Settings</span>
                </Link>

                <button
                    type="button"
                    className={styles.item}
                    onClick={() => router.replace("/")}
                    {...itemProps("Sign out")}
                >
                    <i className="fi fi-rr-sign-out-alt" aria-hidden="true" />
                    <span className={styles.label}>Sign out</span>
                </button>

                {onToggle ? (
                    <button
                        type="button"
                        className={`${styles.item} ${styles.collapseItem}`}
                        onClick={onToggle}
                        aria-expanded={!collapsed}
                        {...(collapsed
                            ? { "aria-label": "Expand sidebar", "data-tooltip": "Expand sidebar" }
                            : {})}
                    >
                        {collapsed ? (
                            <PanelLeftOpen size={16} strokeWidth={1.8} aria-hidden="true" />
                        ) : (
                            <PanelLeftClose size={16} strokeWidth={1.8} aria-hidden="true" />
                        )}
                        <span className={styles.label}>Collapse</span>
                    </button>
                ) : null}
            </div>
        </aside>
    );
}
