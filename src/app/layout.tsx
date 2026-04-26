import "./globals.css";
import { DM_Sans, Tinos } from "next/font/google";
import Script from "next/script";

const headingFont = DM_Sans({
    subsets: ["latin"],
    weight: ["500", "600"],
    variable: "--font-heading",
});

const bodyFont = Tinos({
    subsets: ["latin"],
    weight: ["400"],
    variable: "--font-body",
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
    // Server-side env read
    const firebasePublicConfig = {
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    };

    return (
        <html lang="en" className={`${headingFont.variable} ${bodyFont.variable}`}>
            <head>
                {/* ✅ Icon styles */}
                <link
                    rel="stylesheet"
                    href="https://cdn-uicons.flaticon.com/uicons-regular-rounded/css/uicons-regular-rounded.css"
                />
                <link
                    rel="stylesheet"
                    href="https://cdn-uicons.flaticon.com/uicons-solid-rounded/css/uicons-solid-rounded.css"
                />
                <link
                    rel="stylesheet"
                    href="https://cdn-uicons.flaticon.com/uicons-thin-rounded/css/uicons-thin-rounded.css"
                />

                {/* ✅ Firebase config (unchanged) */}
                <Script
                    id="firebase-public-config"
                    strategy="beforeInteractive"
                    dangerouslySetInnerHTML={{
                        __html: `globalThis.__FIREBASE_CONFIG__=${JSON.stringify(firebasePublicConfig)};`,
                    }}
                />
            </head>

            <body>{children}</body>
        </html>
    );
}