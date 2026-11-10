"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, Check, Mail, MessageCircleQuestion, RotateCcw, Undo2, X } from "lucide-react";
import styles from "./metrics.module.css";

export type DrawerAccount = {
    name: string;
    email?: string | null;
    domain?: string;
    opportunity: string;
    tone: string;
    priority: string;
    value: string;
    confidence: number;
    whyNow: string;
    suggestedAction: string;
    lastEvent?: string | null;
    isPayment: boolean;
};

/** Side drawer with one account from the Revenue Impact Queue. */
export default function AccountDrawer({
    account,
    handled,
    onClose,
    onPrimary,
    onAsk,
    onToggleHandled,
    onOpenAccount,
}: {
    account: DrawerAccount | null;
    handled: boolean;
    onClose: () => void;
    /** Retry payment or send email, matching the table's action. */
    onPrimary: () => void;
    onAsk: () => void;
    onToggleHandled: () => void;
    onOpenAccount: () => void;
}) {
    useEffect(() => {
        if (!account) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [account, onClose]);

    if (!account || typeof document === "undefined") return null;

    return createPortal(
        <>
            <div className={styles.askBackdrop} onClick={onClose} aria-hidden="true" />
            <aside className={`${styles.askPanel} ${styles.drawer}`} role="dialog" aria-modal="true" aria-labelledby="account-drawer-title">
                <header className={styles.askHead}>
                    <span className={styles.drawerAvatar} aria-hidden="true">
                        {account.name.trim().charAt(0).toUpperCase() || "?"}
                    </span>
                    <div className={styles.drawerTitle}>
                        <h2 id="account-drawer-title">{account.name}</h2>
                        <span>{account.email || account.domain || "No email on file"}</span>
                    </div>
                    <button type="button" className={styles.askIconButton} onClick={onClose} aria-label="Close" title="Close">
                        <X size={16} strokeWidth={1.8} aria-hidden="true" />
                    </button>
                </header>

                <div className={styles.drawerBody}>
                    <div className={styles.drawerTags}>
                        <span className={`${styles.drawerPill} ${styles[`pill_${account.tone}`] ?? ""}`}>{account.opportunity}</span>
                        <span className={styles.drawerPill}>{account.priority} priority</span>
                        {handled ? (
                            <span className={`${styles.drawerPill} ${styles.pill_green}`}>
                                <Check size={11} strokeWidth={2} aria-hidden="true" /> Handled
                            </span>
                        ) : null}
                    </div>

                    <dl className={styles.drawerStats}>
                        <div>
                            <dt>Value at stake</dt>
                            <dd>{account.value}</dd>
                        </div>
                        <div>
                            <dt>Confidence</dt>
                            <dd>{Math.round(account.confidence)}%</dd>
                        </div>
                        <div>
                            <dt>Last activity</dt>
                            <dd>{account.lastEvent || "—"}</dd>
                        </div>
                    </dl>

                    <section className={styles.drawerSection}>
                        <h3>Why now</h3>
                        <p>{account.whyNow || "No reason recorded."}</p>
                    </section>

                    <section className={styles.drawerSection}>
                        <h3>Recommended next step</h3>
                        <p>{account.suggestedAction || "Review the account."}</p>
                    </section>
                </div>

                <footer className={styles.drawerFoot}>
                    <button type="button" className={styles.buttonPrimary} onClick={onPrimary}>
                        {account.isPayment ? <RotateCcw size={14} strokeWidth={1.8} aria-hidden="true" /> : <Mail size={14} strokeWidth={1.8} aria-hidden="true" />}
                        {account.isPayment ? "Retry payment" : "Send email"}
                    </button>
                    <button type="button" className={styles.button} onClick={onAsk}>
                        <MessageCircleQuestion size={14} strokeWidth={1.8} aria-hidden="true" />
                        Ask Claude
                    </button>
                    <button type="button" className={styles.button} onClick={onToggleHandled}>
                        {handled ? <Undo2 size={14} strokeWidth={1.8} aria-hidden="true" /> : <Check size={14} strokeWidth={1.8} aria-hidden="true" />}
                        {handled ? "Mark not handled" : "Mark handled"}
                    </button>
                    <button type="button" className={styles.drawerLink} onClick={onOpenAccount}>
                        Open account
                        <ArrowUpRight size={14} strokeWidth={1.8} aria-hidden="true" />
                    </button>
                </footer>
            </aside>
        </>,
        document.body
    );
}
