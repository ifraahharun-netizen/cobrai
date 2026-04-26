"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { auth } from "@/lib/firebase.client";
import styles from "./dashboardshell.module.css";



export default function DashboardShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    return (
        <div className="min-h-screen bg-[#f6f7fb] text-[#0f1020]">
            <div className="mx-auto max-w-7xl px-4 py-6">
                <div className="grid grid-cols-[240px_1fr] gap-6">
                    {/* Sidebar */}
                    <aside className="rounded-2xl border border-black/5 bg-white shadow-sm">
                        <div className="px-5 py-4">
                            <div className="text-lg font-semibold tracking-tight">Cobrai</div>
                        </div>

                        <nav className="px-3 pb-4">
                            <NavItem href="/dashboard" label="Overview" active={pathname === "/dashboard"} />
                            <NavItem
                                href="/dashboard/integrations"
                                label="Integrations"
                                active={pathname?.startsWith("/dashboard/integrations") ?? false}
                            />
                            <NavItem
                                href="/dashboard/settings"
                                label="Settings"
                                active={pathname?.startsWith("/dashboard/settings") ?? false}
                            />
                        </nav>
                    </aside>

                    {/* Content */}
                    <section className="space-y-4">
                        {/* Top bar */}
                        <div className="flex items-center justify-between rounded-2xl border border-black/5 bg-white px-5 py-4 shadow-sm">
                            <div className="text-sm font-medium text-black/70">
                                <span className="mr-2">Connect</span>
                                <span className="inline-flex items-center gap-2">
                                    <Pill>Stripe</Pill>
                                    <Pill>HubSpot</Pill>
                                </span>
                            </div>

                            <div className="flex items-center gap-3">
                                <button className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-medium hover:bg-black/5">
                                    Search
                                </button>
                                <button className="rounded-full border border-black/10 bg-white px-3 py-2 text-sm font-semibold">
                                    IG
                                </button>
                            </div>
                        </div>

                        {/* Page content (your /dashboard/page.tsx renders here) */}
                        {children}
                    </section>
                </div>
            </div>
        </div>
    );
}

function NavItem({
    href,
    label,
    active,
}: {
    href: string;
    label: string;
    active: boolean;
}) {
    return (
        <Link
            href={href}
            className={[
                "mb-1 flex items-center rounded-xl px-3 py-2 text-sm font-medium",
                active ? "bg-black/5" : "hover:bg-black/5",
            ].join(" ")}
        >
            {label}
        </Link>
    );
}

function Pill({ children }: { children: React.ReactNode }) {
    return (
        <span className="rounded-full border border-black/10 bg-black/[0.03] px-3 py-1 text-xs font-semibold text-black/70">
            {children}
        </span>
    );
}


