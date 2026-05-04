"use client";

import { useEffect, useRef } from "react";

export default function PrivacyPage() {
    const termlyRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (termlyRef.current) {
            termlyRef.current.setAttribute("name", "termly-embed");
        }

        const existingScript = document.getElementById("termly-jssdk");

        if (!existingScript) {
            const script = document.createElement("script");
            script.id = "termly-jssdk";
            script.src = "https://app.termly.io/embed-policy.min.js";
            script.async = true;
            document.body.appendChild(script);
        }
    }, []);

    return (
        <main className="min-h-screen bg-white px-6 py-10">
            <div className="mx-auto max-w-4xl">
                <h1 className="mb-8 text-2xl font-semibold text-black">
                   
                </h1>

                <div
                    ref={termlyRef}
                    data-id="a777b328-38d8-4bef-8046-88844055517f"
                />
            </div>
        </main>
    );
}