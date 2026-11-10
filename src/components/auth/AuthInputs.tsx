"use client";

import { useState } from "react";
import styles from "@/styles/auth.module.css";

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "className"> & {
    icon?: "mail" | "user" | "building";
};

export function AuthInput({ icon, ...props }: InputProps) {
    return (
        <div className={styles.inputWrap}>
            <input {...props} className={styles.input} />
            {icon ? <span className={styles.inputIcon}>{ICONS[icon]}</span> : null}
        </div>
    );
}

export function AuthPasswordInput(props: Omit<InputProps, "type" | "icon">) {
    const [visible, setVisible] = useState(false);

    return (
        <div className={styles.inputWrap}>
            <input {...props} type={visible ? "text" : "password"} className={styles.input} />
            <button
                type="button"
                className={styles.eyeButton}
                onClick={() => setVisible((v) => !v)}
                aria-label={visible ? "Hide password" : "Show password"}
                aria-pressed={visible}
            >
                {visible ? EYE_OFF : EYE}
            </button>
        </div>
    );
}

const svgProps = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
};

const ICONS = {
    mail: (
        <svg {...svgProps}>
            <rect x="3" y="5" width="18" height="14" rx="3" />
            <path d="m4 7 8 6 8-6" />
        </svg>
    ),
    user: (
        <svg {...svgProps}>
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
        </svg>
    ),
    building: (
        <svg {...svgProps}>
            <rect x="4" y="3" width="16" height="18" rx="2" />
            <path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1M10 21v-3h4v3" />
        </svg>
    ),
};

const EYE = (
    <svg {...svgProps}>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
    </svg>
);

const EYE_OFF = (
    <svg {...svgProps}>
        <path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-2.7 3.6M6.6 6.6C3.7 8.4 2 12 2 12s3.5 7 10 7c1.9 0 3.5-.6 4.9-1.4" />
        <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18" />
    </svg>
);
