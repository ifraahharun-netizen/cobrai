import Link from "next/link";
import styles from "@/styles/auth.module.css";

type AuthShellProps = {
    mode: "login" | "signup";
    title: string;
    subtitle: string;
    children: React.ReactNode;
};

export default function AuthShell({ mode, title, subtitle, children }: AuthShellProps) {
    return (
        <div className={styles.page}>
            <div className={styles.shell}>
                <section className={styles.formPanel}>
                    <div className={styles.formInner}>
                        <Link href="/" className={styles.brand}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/icon.svg" alt="" className={styles.brandMark} />
                            Cobrai
                        </Link>

                        <h1 className={styles.title}>{title}</h1>
                        <p className={styles.subtitle}>{subtitle}</p>

                        <nav className={styles.toggle} aria-label="Sign in or sign up">
                            <Link
                                href="/login"
                                className={`${styles.toggleItem} ${mode === "login" ? styles.toggleActive : ""}`}
                                aria-current={mode === "login" ? "page" : undefined}
                            >
                                Sign in
                            </Link>
                            <Link
                                href="/signup"
                                className={`${styles.toggleItem} ${mode === "signup" ? styles.toggleActive : ""}`}
                                aria-current={mode === "signup" ? "page" : undefined}
                            >
                                Sign up
                            </Link>
                        </nav>

                        {children}
                    </div>
                </section>

                <aside className={styles.artPanel} aria-hidden="true">
                    <FlowArt />
                    <div className={styles.artCaption}>
                        <p className={styles.artTitle}>Stop churn before revenue drops.</p>
                        <p className={styles.artText}>
                            Identify risk, understand why, and take action before customers leave.
                        </p>
                    </div>
                </aside>
            </div>
        </div>
    );
}

/* Abstract flowing ribbons in Cobrai blues. */
function FlowArt() {
    return (
        <svg
            className={styles.art}
            viewBox="0 0 600 800"
            preserveAspectRatio="xMidYMid slice"
            xmlns="http://www.w3.org/2000/svg"
        >
            <defs>
                <linearGradient id="authRibbonA" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#9cc2ff" />
                    <stop offset="0.45" stopColor="#3b6cf6" />
                    <stop offset="1" stopColor="#0b1d7a" />
                </linearGradient>
                <linearGradient id="authRibbonB" x1="1" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#c9dcff" />
                    <stop offset="0.5" stopColor="#4f7dff" />
                    <stop offset="1" stopColor="#13238f" />
                </linearGradient>
                <radialGradient id="authGlow" cx="0.65" cy="0.35" r="0.6">
                    <stop offset="0" stopColor="#2f5ee6" stopOpacity="0.55" />
                    <stop offset="1" stopColor="#040a2a" stopOpacity="0" />
                </radialGradient>
                <filter id="authSoft" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="6" />
                </filter>
                <filter id="authBlur" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="22" />
                </filter>
            </defs>

            <rect width="600" height="800" fill="#040a2a" />
            <rect width="600" height="800" fill="url(#authGlow)" />

            {/* Deep background ribbons */}
            <path
                d="M-60 120 C 120 40, 220 260, 360 200 S 560 60, 680 160 L 680 300 C 560 220, 460 360, 330 360 S 80 220, -60 300 Z"
                fill="url(#authRibbonA)"
                opacity="0.35"
                filter="url(#authBlur)"
            />
            <path
                d="M-40 520 C 100 430, 260 640, 400 560 S 600 420, 680 500 L 680 640 C 560 560, 440 740, 300 700 S 60 600, -40 660 Z"
                fill="url(#authRibbonB)"
                opacity="0.3"
                filter="url(#authBlur)"
            />

            {/* Main flowing ribbons */}
            <path
                d="M120 -40 C 40 120, 260 200, 220 340 S 60 520, 180 640 S 420 760, 360 860 L 470 860 C 520 760, 300 660, 330 560 S 520 380, 420 250 S 230 60, 260 -40 Z"
                fill="url(#authRibbonA)"
                opacity="0.9"
                filter="url(#authSoft)"
            />
            <path
                d="M300 -40 C 260 100, 470 170, 450 300 S 280 470, 380 590 S 600 700, 560 860 L 640 860 C 660 720, 470 640, 470 560 S 640 380, 560 250 S 400 80, 420 -40 Z"
                fill="url(#authRibbonB)"
                opacity="0.8"
                filter="url(#authSoft)"
            />

            {/* Bright highlight strands */}
            <path
                d="M190 -40 C 120 120, 300 210, 270 340 S 120 520, 240 640 S 440 760, 410 860"
                fill="none"
                stroke="#e3edff"
                strokeWidth="3"
                strokeLinecap="round"
                opacity="0.7"
                filter="url(#authSoft)"
            />
            <path
                d="M360 -40 C 330 110, 500 180, 490 300 S 340 460, 430 580 S 610 700, 600 860"
                fill="none"
                stroke="#d4e3ff"
                strokeWidth="2"
                strokeLinecap="round"
                opacity="0.55"
            />
            <path
                d="M230 -40 C 170 120, 340 210, 310 340 S 170 520, 290 640"
                fill="none"
                stroke="#ffffff"
                strokeWidth="1.2"
                strokeLinecap="round"
                opacity="0.45"
            />
        </svg>
    );
}
