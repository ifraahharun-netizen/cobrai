"use client";

import { useEffect } from "react";

export default function TermsPage() {
    useEffect(() => {
        const scriptId = "termly-jssdk";

        if (!document.getElementById(scriptId)) {
            const script = document.createElement("script");
            script.id = scriptId;
            script.src = "https://app.termly.io/embed-policy.min.js";
            script.async = true;
            document.body.appendChild(script);
        }
    }, []);

    return (
        <main className="min-h-screen bg-white text-black px-6 py-10">
            <div className="mx-auto max-w-3xl">
               

                <div
                    data-name="termly-embed"
                    data-id="232e972c-8924-4d89-9111-0aa5cc2ce0a5"
                />
            </div>
        </main>
    );
}