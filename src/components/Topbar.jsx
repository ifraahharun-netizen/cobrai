"use client";

import { usePathname } from "next/navigation";

export default function Topbar() {
    const pathname = usePathname();
    const title = pathname.split("/").pop()?.replace("-", " ") ?? "";

    return (
        <div className="sticky top-0 z-10 border-b bg-white/80 backdrop-blur">
            <div className="px-6 py-3 flex items-center gap-4">
                <div className="text-sm text-neutral-500 capitalize">{title}</div>

                <div className="flex-1">
                    <input
                        className="w-full max-w-xl rounded-xl border px-3 py-2 text-sm"
                        placeholder="Search customers, insights, risks… (MVP)"
                    />
                </div>
            </div>
        </div>
    );
}
