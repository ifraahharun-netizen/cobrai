"use client";

// Last-resort error screen when the app itself crashes while rendering.
// Reports the crash to Sentry and offers a reload instead of a blank page.
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        Sentry.captureException(error);
    }, [error]);

    return (
        <html lang="en">
            <body
                style={{
                    margin: 0,
                    minHeight: "100vh",
                    display: "grid",
                    placeItems: "center",
                    background: "#ffffff",
                    color: "#18181b",
                    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                }}
            >
                <div style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
                    <h1 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Something went wrong</h1>
                    <p style={{ margin: "8px 0 20px", fontSize: 14, color: "#71717a" }}>
                        We&apos;ve been notified. Try again, and if it keeps happening, contact support.
                    </p>
                    <button
                        type="button"
                        onClick={() => reset()}
                        style={{
                            height: 36,
                            padding: "0 16px",
                            border: 0,
                            borderRadius: 8,
                            background: "#18181b",
                            color: "#ffffff",
                            fontSize: 13,
                            cursor: "pointer",
                        }}
                    >
                        Try again
                    </button>
                </div>
            </body>
        </html>
    );
}
