"use client";

import { useId } from "react";
import { Info } from "lucide-react";
import styles from "./metrics.module.css";

/** Small "i" icon that explains what a card shows and why it matters (hover or focus). */
export default function InfoTip({ text, label }: { text: string; label?: string }) {
    const id = useId();
    return (
        <span className={styles.infoTip}>
            <button
                type="button"
                className={styles.infoTipButton}
                aria-label={label ? `About ${label}` : "More information"}
                aria-describedby={id}
                onClick={(event) => event.stopPropagation()}
            >
                <Info size={13} strokeWidth={1.8} aria-hidden="true" />
            </button>
            <span role="tooltip" id={id} className={styles.infoTipBubble}>
                {text}
            </span>
        </span>
    );
}
