"use client";

import {
    createElement,
    useEffect,
} from "react";

type TermlyPolicyProps = {
    policyId: string;
};

export default function TermlyPolicy({
    policyId,
}: TermlyPolicyProps) {
    useEffect(() => {
        const existingScript =
            document.querySelector<HTMLScriptElement>(
                'script[src="https://app.termly.io/embed-policy.min.js"]'
            );

        if (existingScript) {
            existingScript.remove();
        }

        const script =
            document.createElement("script");

        script.src =
            "https://app.termly.io/embed-policy.min.js";
        script.async = true;

        document.body.appendChild(script);

        return () => {
            script.remove();
        };
    }, [policyId]);

    return createElement("div", {
        name: "termly-embed",
        "data-id": policyId,
        "data-type": "iframe",
        className: "termlyPolicyContainer",
    });
}