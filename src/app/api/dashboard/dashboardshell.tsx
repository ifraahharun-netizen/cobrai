"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import styles from "./DashboardShell.module.css";

type NavItem = { label: string; href: string; icon: string };

export default function DashboardShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [collapsed, setCollapsed] = useState(false);

    const nav: NavItem[] = useMemo(
        () => [
            { label: "Dashboard", href: "/dashboard", icon: "▦" },
            { label: "Customers", href: "/dashboard/customers", icon: "👥" },
            { label: "Signals", href: "/dashboard/signals", icon: "📡" },
            { label: "Playbooks", href: "/dashboard/playbooks", icon: "🧩" },
            { label: "Integrations", href: "/dashboard/integrations", icon: "⛓️" },
            { label: "Settings", href: "/dashboard/settings", icon: "⚙️" },
        ],
        []
    );

    return (
        <div className={styles.shell}>
            <aside className={`${styles.sidebar} ${collapsed ? styles.sidebarCollapsed : ""}`}>
                <div className={styles.brandRow}>
                    <div className={styles.brand}>
                        <div className={styles.logoMark} />
                        {!collapsed && <span>Cobrai</span>}
                    </div>

                    <button
                        className={styles.iconBtn}
                        onClick={() => setCollapsed((v) => !v)}
                        aria-label="Toggle sidebar"
                        title="Toggle sidebar"
                    >
                        ☰
                    </button>
                </div>

                <nav className={styles.nav}>
                    {nav.map((item) => {
                        const active = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`${styles.navItem} ${active ? styles.navActive : ""}`}
                            >
                                <span className={styles.navIcon}>{item.icon}</span>
                                {!collapsed && <span className={styles.navLabel}>{item.label}</span>}
                            </Link>
                        );
                    })}
                </nav>

                <div className={styles.sidebarFooter}>
                    <div className={styles.pill}>
                        <span className={styles.pillDot} />
                        {!collapsed ? "Live signals connected" : "Live"}
                    </div>
                </div>
            </aside>

            <main className={styles.main}>
                <header className={styles.topbar}>
                    <div className={styles.topLeft}>
                        <div className={styles.pageTitle}>Retention Command Center</div>
                        <div className={styles.subtitle}>Churn risk, drivers, and next-best actions</div>
                    </div>

                    <div className={styles.topRight}>
                        <div className={styles.searchWrap}>
                            <input className={styles.search} placeholder="Search customers, segments, playbooks…" />
                        </div>

                        <button className={styles.ghostBtn}>Connect Stripe</button>
                        <button className={styles.ghostBtn}>Connect HubSpot</button>

                        <div className={styles.avatar} aria-label="Account">
                            IH
                        </div>
                    </div>
                </header>

                <section className={styles.content}>{children}</section>
            </main>
        </div>
    );
}
