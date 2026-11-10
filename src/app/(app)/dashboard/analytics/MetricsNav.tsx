"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import styles from "./metrics.module.css";

export type NavItem = {
    id: string;
    label: string;
    icon?: ReactNode;
    /** Small count on the right, e.g. accounts still to act on. */
    badge?: number | string | null;
};

const FOLD_KEY = "cobrai.metrics.navFolded";

/** Gap kept between the sidebar and the top of the window while scrolling. */
const STICK_TOP = 24;

/**
 * Console-style sidebar for the Metrics page: each item opens its own view.
 * Folds to icons; the choice is remembered in this browser.
 */
export default function MetricsNav({
    title,
    items,
    active,
    onSelect,
    footer,
}: {
    title: string;
    items: NavItem[];
    active: string;
    onSelect: (id: string) => void;
    /** Extra actions under the list (e.g. Ask Claude). Hidden when folded. */
    footer?: ReactNode;
}) {
    const navRef = useRef<HTMLElement>(null);
    const [folded, setFolded] = useState(() => {
        if (typeof window === "undefined") return false;
        try {
            return window.localStorage.getItem(FOLD_KEY) === "1";
        } catch {
            return false;
        }
    });

    // Keep the sidebar in view while the page scrolls. The app layout's scroll
    // container stops CSS position: sticky from working, so offset it by hand.
    useEffect(() => {
        let frame = 0;
        const place = () => {
            frame = 0;
            const nav = navRef.current;
            const column = nav?.parentElement;
            if (!nav || !column) return;
            const columnTop = column.getBoundingClientRect().top;
            const room = column.offsetHeight - nav.offsetHeight;
            const offset = Math.max(0, Math.min(STICK_TOP - columnTop, room));
            nav.style.transform = offset ? `translateY(${offset}px)` : "";
        };
        const schedule = () => {
            if (!frame) frame = window.requestAnimationFrame(place);
        };
        place();
        document.addEventListener("scroll", schedule, true);
        window.addEventListener("resize", schedule);
        return () => {
            if (frame) window.cancelAnimationFrame(frame);
            document.removeEventListener("scroll", schedule, true);
            window.removeEventListener("resize", schedule);
        };
    }, [active]);

    function toggleFold() {
        setFolded((was) => {
            const next = !was;
            try {
                window.localStorage.setItem(FOLD_KEY, next ? "1" : "0");
            } catch {
                // Not critical.
            }
            return next;
        });
    }

    return (
        <nav ref={navRef} className={`${styles.pageNav} ${folded ? styles.pageNavFolded : ""}`} aria-label={`${title} sections`}>
            <div className={styles.pageNavHead}>
                {!folded ? <span>{title}</span> : null}
                <button
                    type="button"
                    className={styles.pageNavFold}
                    onClick={toggleFold}
                    aria-expanded={!folded}
                    aria-label={folded ? "Show sidebar" : "Hide sidebar"}
                    title={folded ? "Show sidebar" : "Hide sidebar"}
                >
                    {folded ? (
                        <PanelLeftOpen size={15} strokeWidth={1.8} aria-hidden="true" />
                    ) : (
                        <PanelLeftClose size={15} strokeWidth={1.8} aria-hidden="true" />
                    )}
                </button>
            </div>

            <ul className={styles.pageNavList}>
                {items.map((item) => {
                    const isActive = active === item.id;
                    return (
                        <li key={item.id}>
                            <button
                                type="button"
                                className={`${styles.pageNavItem} ${isActive ? styles.pageNavItemActive : ""}`}
                                onClick={() => onSelect(item.id)}
                                aria-current={isActive ? "page" : undefined}
                                title={folded ? item.label : undefined}
                            >
                                {item.icon ? <span className={styles.pageNavIcon}>{item.icon}</span> : null}
                                {!folded ? <span className={styles.pageNavLabel}>{item.label}</span> : null}
                                {!folded && item.badge !== null && item.badge !== undefined && item.badge !== "" ? (
                                    <span className={typeof item.badge === "number" ? styles.pageNavBadge : styles.pageNavKbd}>
                                        {item.badge}
                                    </span>
                                ) : null}
                            </button>
                        </li>
                    );
                })}
            </ul>

            {!folded && footer ? <div className={styles.pageNavFoot}>{footer}</div> : null}
        </nav>
    );
}
