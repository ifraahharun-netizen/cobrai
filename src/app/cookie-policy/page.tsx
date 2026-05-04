"use client";

import { useEffect, useRef } from "react";

export default function CookiePolicyPage() {
    const termlyRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        // Set required attribute for Termly
        if (termlyRef.current) {
            termlyRef.current.setAttribute("name", "termly-embed");
        }

        // Load script once
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
        <main className="min-h-screen bg-white px-6 py-10 text-black">
            <div className="mx-auto max-w-4xl">
               

                <div
                    ref={termlyRef}
                    data-id="3e188e15-88f8-4ab9-aa2b-ef56422dd785"
                />
            </div>
        </main>
    );
}