"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

const nav = [
    { href: "/app/dashboard", label: "Dashboard" },
    { href: "/app/customers", label: "Customers" },
    { href: "/app/insights", label: "Insights" },
    { href: "/app/charts", label: "Charts" },
    { href: "/app/integrations", label: "Integrations" },
    { href: "/app/settings", label: "Settings" },
];

export default function Sidebar() {
    const pathname = usePathname();

    return (
        <aside className="w-64 bg-neutral-900 text-white p-4 flex flex-col">
            <div className="mb-6">
                <div className="text-lg font-semibold">Cobrai</div>
                <div className="text-xs text-neutral-300">Decision Intelligence</div>
            </div>

            <nav className="space-y-1 flex-1">
                {nav.map((item) => {
                    const active = pathname.startsWith(item.href);
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`block rounded-xl px-3 py-2 ${active ? "bg-neutral-800" : "hover:bg-neutral-800/60"
                                }`}
                        >
                            {item.label}
                        </Link>
                    );
                })}
            </nav>

            <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="mt-4 rounded-xl bg-neutral-800 px-3 py-2 hover:bg-neutral-700"
            >
                Logout
            </button>
        </aside>
    );
}
