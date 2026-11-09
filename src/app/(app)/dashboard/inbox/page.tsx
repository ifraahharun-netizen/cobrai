"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
    AlertTriangle,
    Archive,
    CornerUpLeft,
    PanelLeftClose,
    PanelLeftOpen,
    PanelRightClose,
    PanelRightOpen,
    ArchiveRestore,
    Eye,
    Inbox as InboxIcon,
    MailOpen,
    MessageSquareReply,
    MousePointerClick,
    Search,
    Send,
    Sparkles,
    Star,
} from "lucide-react";
import type { IconType } from "react-icons";
import { PiMicrosoftOutlookLogoFill } from "react-icons/pi";
import { SiGmail, SiHubspot, SiIntercom, SiZendesk } from "react-icons/si";
import { getFirebaseAuth } from "@/lib/firebase.client";
import {
    INBOX_CHANNELS,
    threadInFolder,
    type InboxAccount,
    type InboxChannel,
    type InboxFolder, type InboxMessageView, type InboxThread } from "@/lib/inbox";
import ReplyEditor, { type ReplyEditorHandle } from "./ReplyEditor";
import styles from "./inbox.module.css";

type InboxResponse = {
    source: "live" | "demo";
    threads: InboxThread[];
    setupRequired: boolean;
};

const FOLDERS: Array<{ key: InboxFolder; label: string; Icon: typeof InboxIcon }> = [
    { key: "all", label: "All", Icon: InboxIcon },
    { key: "starred", label: "Starred", Icon: Star },
    { key: "needsReply", label: "Needs reply", Icon: MessageSquareReply },
    { key: "replied", label: "Replied", Icon: MailOpen },
    { key: "opened", label: "Opened", Icon: Eye },
    { key: "sent", label: "Sent, no reply", Icon: Send },
    { key: "failed", label: "Failed", Icon: AlertTriangle },
    { key: "archived", label: "Archived", Icon: Archive },
];

const CHANNEL_LOGOS: Record<Exclude<InboxChannel, "cobrai">, { Icon: IconType; colour: string }> = {
    gmail: { Icon: SiGmail, colour: "#ea4335" },
    outlook: { Icon: PiMicrosoftOutlookLogoFill, colour: "#0a64c8" },
    intercom: { Icon: SiIntercom, colour: "#286efa" },
    zendesk: { Icon: SiZendesk, colour: "#03363d" },
    hubspot: { Icon: SiHubspot, colour: "#ff7a59" },
};

const CHANNEL_LABEL = Object.fromEntries(INBOX_CHANNELS.map((c) => [c.key, c.label])) as Record<InboxChannel, string>;

/** The logo of the tool a message came through. */
function ChannelLogo({ channel, size = 13 }: { channel: InboxChannel; size?: number }) {
    if (channel === "cobrai") {
        // eslint-disable-next-line @next/next/no-img-element
        return <img src="/branding/cobrai-mark.png" alt="" width={size} height={size} style={{ objectFit: "contain" }} />;
    }
    const { Icon, colour } = CHANNEL_LOGOS[channel];
    return <Icon size={size} color={colour} aria-hidden="true" />;
}

function initials(name: string) {
    return name
        .split(/[\s@.]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("");
}

function shortTime(iso: string) {
    const date = new Date(iso);
    const diffHours = (Date.now() - date.getTime()) / 3_600_000;
    if (diffHours < 24) return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    if (diffHours < 24 * 6) return date.toLocaleDateString("en-GB", { weekday: "short" });
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function longTime(iso: string) {
    return new Date(iso).toLocaleString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function relative(iso: string | null | undefined) {
    if (!iso) return "Never";
    const hours = (Date.now() - new Date(iso).getTime()) / 3_600_000;
    if (hours < 1) return "Just now";
    if (hours < 24) return `${Math.round(hours)}h ago`;
    const days = Math.round(hours / 24);
    return days === 1 ? "Yesterday" : `${days} days ago`;
}

function riskTone(account: InboxAccount) {
    if (account.riskScore >= 70) return "bad";
    if (account.riskScore >= 40) return "warn";
    return "good";
}


export default function InboxPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [data, setData] = useState<InboxResponse | null>(null);
    const [loadError, setLoadError] = useState("");
    const [folder, setFolder] = useState<InboxFolder>("all");
    const [query, setQuery] = useState("");
    const [channel, setChannel] = useState<InboxChannel | null>(null);
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    // The draft belongs to one conversation, so switching threads starts fresh.
    const [draftState, setDraftState] = useState({ key: "", text: "", html: "" });
    const [sending, setSending] = useState(false);
    const [notice, setNotice] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);
    const [showAccount, setShowAccount] = useState(true);
    // Remember whether the folders column was folded (same approach as the main sidebar).
    const [foldersFolded, setFoldersFolded] = useState(() => {
        if (typeof window === "undefined") return false;
        try {
            return window.localStorage.getItem("cobrai.inbox.foldersFolded") === "1";
        } catch {
            return false;
        }
    });

    function toggleFolders() {
        setFoldersFolded((current) => {
            const next = !current;
            try {
                localStorage.setItem("cobrai.inbox.foldersFolded", next ? "1" : "0");
            } catch {
                // Ignore storage errors.
            }
            return next;
        });
    }
    const replyRef = useRef<ReplyEditorHandle>(null);

    useEffect(() => onAuthStateChanged(getFirebaseAuth(), setUser), []);

    useEffect(() => {
        if (!user) return;
        let cancelled = false;

        (async () => {
            try {
                const token = await user.getIdToken();
                const res = await fetch("/api/inbox", {
                    cache: "no-store",
                    headers: { Authorization: `Bearer ${token}` },
                });
                const json = (await res.json().catch(() => null)) as (InboxResponse & { error?: string }) | null;
                if (cancelled) return;
                if (!res.ok || !json?.threads) throw new Error(json?.error || "Could not load the inbox.");
                setData(json);
                setLoadError("");
            } catch (error) {
                if (!cancelled) setLoadError(error instanceof Error ? error.message : "Could not load the inbox.");
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [user]);

    const threads = useMemo(() => data?.threads ?? [], [data]);

    const counts = useMemo(() => {
        const result = {} as Record<InboxFolder, number>;
        for (const item of FOLDERS) result[item.key] = threads.filter((t) => threadInFolder(t, item.key)).length;
        return result;
    }, [threads]);

    const channelCounts = useMemo(() => {
        const result = Object.fromEntries(INBOX_CHANNELS.map((c) => [c.key, 0])) as Record<InboxChannel, number>;
        for (const thread of threads) if (!thread.archived) result[thread.channel] += 1;
        return result;
    }, [threads]);

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        return threads
            .filter((thread) => threadInFolder(thread, folder))
            .filter((thread) => !channel || thread.channel === channel)
            .filter((thread) =>
                !q
                    ? true
                    : [thread.customerName, thread.counterpartEmail, thread.subject, thread.preview]
                        .join(" ")
                        .toLowerCase()
                        .includes(q)
            );
    }, [threads, folder, channel, query]);

    const selected = threads.find((thread) => thread.key === selectedKey) ?? visible[0] ?? null;
    const draft = draftState.key === selected?.key ? draftState : { key: "", text: "", html: "" };
    const messagesRef = useRef<HTMLDivElement>(null);
    const selectedKeyNow = selected?.key;
    const messageCount = selected?.messages.length ?? 0;

    // Open each conversation at its newest message.
    useEffect(() => {
        const el = messagesRef.current;
        const emails = el?.querySelectorAll("article");
        const last = emails?.[emails.length - 1] as HTMLElement | undefined;
        if (el && last) el.scrollTop = Math.max(0, last.offsetTop - 16);
    }, [selectedKeyNow, messageCount]);

    function updateThread(key: string, change: (thread: InboxThread) => InboxThread) {
        setData((current) =>
            current ? { ...current, threads: current.threads.map((t) => (t.key === key ? change(t) : t)) } : current
        );
    }

    /** Returns an error message if the change couldn't be saved. */
    async function threadAction(
        thread: InboxThread,
        action: "read" | "archive" | "unarchive" | "star" | "unstar"
    ): Promise<string | null> {
        if (data?.source !== "live" || !user) return null;
        try {
            const token = await user.getIdToken();
            const res = await fetch("/api/inbox/thread", {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ threadKey: thread.key, action }),
            });
            if (res.ok) return null;
            const json = (await res.json().catch(() => null)) as { error?: string } | null;
            return json?.error || "Could not save that change.";
        } catch {
            return "Could not save that change.";
        }
    }

    async function toggleStar(thread: InboxThread) {
        const starred = !thread.starred;
        updateThread(thread.key, (t) => ({ ...t, starred }));
        const error = await threadAction(thread, starred ? "star" : "unstar");
        if (error) {
            updateThread(thread.key, (t) => ({ ...t, starred: !starred }));
            setNotice({ tone: "error", text: error });
        }
    }

    function openThread(thread: InboxThread) {
        setSelectedKey(thread.key);
        setNotice(null);
        if (thread.unread > 0) {
            updateThread(thread.key, (t) => ({
                ...t,
                unread: 0,
                messages: t.messages.map((m) => ({ ...m, read: true })),
            }));
            void threadAction(thread, "read");
        }
    }

    function toggleArchive(thread: InboxThread) {
        const archive = !thread.archived;
        updateThread(thread.key, (t) => ({ ...t, archived: archive }));
        void threadAction(thread, archive ? "archive" : "unarchive");
        setNotice({ tone: "ok", text: archive ? "Conversation archived." : "Moved back to the inbox." });
    }

    async function sendReply() {
        if (!selected || !draft.text || sending) return;

        if (data?.source === "demo") {
            const message: InboxMessageView = {
                id: `local-${Date.now()}`,
                direction: "outbound",
                source: "inbox",
                fromEmail: "you",
                fromName: "You",
                toEmail: selected.counterpartEmail,
                subject: `Re: ${selected.subject}`,
                bodyText: draft.text,
                bodyHtml: draft.html || null,
                createdAt: new Date().toISOString(),
                status: "not_sent",
                read: true,
            };
            updateThread(selected.key, (t) => ({
                ...t,
                messages: [...t.messages, message],
                needsReply: false,
                lastAt: message.createdAt,
                preview: message.bodyText.slice(0, 140),
            }));
            replyRef.current?.clear();
            setNotice({ tone: "warn", text: "Demo data: the reply was added here but not sent." });
            return;
        }

        if (!user) return;
        setSending(true);
        setNotice(null);

        try {
            const token = await user.getIdToken();
            const lastInbound = [...selected.messages].reverse().find((m) => m.direction === "inbound");
            const res = await fetch("/api/inbox/reply", {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    to: selected.counterpartEmail,
                    subject: selected.subject,
                    body: draft.text,
                    html: draft.html || null,
                    inReplyTo: lastInbound?.id ?? null,
                }),
            });
            const json = (await res.json().catch(() => null)) as {
                ok?: boolean;
                status?: string;
                notice?: string | null;
                error?: string;
                message?: InboxMessageView;
            } | null;

            if (!res.ok && !json?.message) throw new Error(json?.error || "Could not send the reply.");

            if (json?.message) {
                const message = json.message;
                updateThread(selected.key, (t) => ({
                    ...t,
                    messages: [...t.messages, message],
                    needsReply: false,
                    lastAt: message.createdAt,
                    preview: message.bodyText.slice(0, 140),
                }));
            }

            replyRef.current?.clear();
            setNotice(
                json?.status === "sent"
                    ? { tone: "ok", text: "Reply sent." }
                    : { tone: json?.status === "failed" ? "error" : "warn", text: json?.notice || "Reply saved but not sent." }
            );
        } catch (error) {
            setNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not send the reply." });
        } finally {
            setSending(false);
        }
    }

    return (
        <main className={styles.page}>
            <header className={styles.header}>
                <div>
                    <h1 className={styles.title}>Inbox</h1>
                    <p className={styles.subtitle}>Retention emails you&apos;ve sent and the replies customers send back.</p>
                </div>
                {data?.source === "demo" ? <span className={styles.demoBadge}>Demo data</span> : null}
            </header>

            {data?.setupRequired ? (
                <div className={styles.banner} role="status">
                    <Sparkles size={14} aria-hidden="true" />
                    Showing sent emails only. To receive replies, apply the inbox database migration
                    (<code>npx prisma migrate deploy</code>) and connect inbound email.
                </div>
            ) : null}

            {loadError ? <div className={styles.error} role="alert">{loadError}</div> : null}

            <div
                className={`${styles.shell} ${selected && showAccount ? styles.shellWithPanel : ""} ${foldersFolded ? styles.shellFolded : ""}`}
            >
                {/* Folders */}
                <nav className={styles.folders} aria-label="Inbox folders">
                    <div className={styles.foldersTop}>
                        <span>Mailboxes</span>
                        <button
                            type="button"
                            className={styles.foldToggle}
                            onClick={toggleFolders}
                            aria-expanded={!foldersFolded}
                            aria-label={foldersFolded ? "Expand folders" : "Collapse folders"}
                            title={foldersFolded ? "Expand folders" : "Collapse folders"}
                        >
                            {foldersFolded ? (
                                <PanelLeftOpen size={15} strokeWidth={1.8} aria-hidden="true" />
                            ) : (
                                <PanelLeftClose size={15} strokeWidth={1.8} aria-hidden="true" />
                            )}
                        </button>
                    </div>
                    {FOLDERS.map(({ key, label, Icon }) => (
                        <button
                            key={key}
                            type="button"
                            title={foldersFolded ? `${label}${counts[key] ? ` (${counts[key]})` : ""}` : undefined}
                            className={`${styles.folder} ${folder === key ? styles.folderActive : ""}`}
                            aria-current={folder === key ? "true" : undefined}
                            onClick={() => {
                                setFolder(key);
                                setSelectedKey(null);
                            }}
                        >
                            <Icon size={15} strokeWidth={1.8} aria-hidden="true" />
                            <span>{label}</span>
                            {counts[key] ? <em>{counts[key]}</em> : null}
                        </button>
                    ))}

                    <p className={styles.navLabel}>Channels</p>
                    {INBOX_CHANNELS.map(({ key, label, hint }) => {
                        const active = channel === key;
                        return (
                            <button
                                key={key}
                                type="button"
                                title={foldersFolded ? `${label}${channelCounts[key] ? ` (${channelCounts[key]})` : ""}` : hint}
                                className={`${styles.folder} ${active ? styles.folderActive : ""}`}
                                aria-pressed={active}
                                onClick={() => {
                                    setChannel(active ? null : key);
                                    setSelectedKey(null);
                                }}
                            >
                                <span className={styles.channelIcon} aria-hidden="true">
                                    <ChannelLogo channel={key} size={12} />
                                </span>
                                <span>{label}</span>
                                {channelCounts[key] ? <em>{channelCounts[key]}</em> : null}
                            </button>
                        );
                    })}
                </nav>

                {/* List */}
                <section className={styles.list} aria-label="Conversations">
                    <label className={styles.search}>
                        <Search size={14} strokeWidth={1.8} aria-hidden="true" />
                        <input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search conversations"
                            aria-label="Search conversations"
                        />
                    </label>

                    <div className={styles.listScroll}>
                        {!data && !loadError ? <p className={styles.empty}>Loading…</p> : null}
                        {data && visible.length === 0 ? <p className={styles.empty}>Nothing here.</p> : null}

                        {visible.map((thread) => (
                            <div key={thread.key} className={styles.rowWrap}>
                            <button
                                type="button"
                                className={`${styles.row} ${selected?.key === thread.key ? styles.rowActive : ""} ${thread.unread ? styles.rowUnread : ""}`}
                                onClick={() => openThread(thread)}
                            >
                                <span className={styles.avatarWrap}>
                                    <span className={styles.avatar} aria-hidden="true">{initials(thread.customerName)}</span>
                                    <span className={styles.avatarBadge} title={`Via ${CHANNEL_LABEL[thread.channel]}`}>
                                        <ChannelLogo channel={thread.channel} size={10} />
                                    </span>
                                </span>
                                <span className={styles.rowMain}>
                                    <span className={styles.rowTop}>
                                        <strong>{thread.customerName}</strong>
                                        <time>{shortTime(thread.lastAt)}</time>
                                    </span>
                                    <span className={styles.rowSubject}>{thread.subject}</span>
                                    <span className={styles.rowPreview}>{thread.preview}</span>
                                    <span className={styles.rowTags}>
                                        {thread.needsReply ? <i className={styles.tagReply}>Needs reply</i> : null}
                                        {thread.failed ? <i className={styles.tagFailed}>Failed</i> : null}
                                        {!thread.hasReply && thread.opened ? <i>Opened</i> : null}
                                    </span>
                                </span>
                                {thread.unread ? <span className={styles.unreadDot} aria-label="Unread" /> : null}
                            </button>
                            <button
                                type="button"
                                className={`${styles.rowStar} ${thread.starred ? styles.rowStarOn : ""}`}
                                onClick={() => void toggleStar(thread)}
                                aria-pressed={thread.starred}
                                aria-label={thread.starred ? `Unstar ${thread.customerName}` : `Star ${thread.customerName}`}
                                title={thread.starred ? "Unstar" : "Star"}
                            >
                                <Star size={14} strokeWidth={1.8} fill={thread.starred ? "currentColor" : "none"} aria-hidden="true" />
                            </button>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Reader */}
                <section className={styles.reader} aria-label="Conversation">
                    {selected ? (
                        <>
                            <div className={styles.readerHead}>
                                <div className={styles.readerTitle}>
                                    <h2>{selected.subject}</h2>
                                    <div className={styles.readerMetaLine}>
                                        <span className={styles.channelChip}>
                                            <ChannelLogo channel={selected.channel} size={12} />
                                            via {CHANNEL_LABEL[selected.channel]}
                                        </span>
                                        <span>
                                            {selected.messages.length} {selected.messages.length === 1 ? "email" : "emails"}
                                        </span>
                                    </div>
                                </div>
                                <div className={styles.readerActions}>
                                    <button
                                        type="button"
                                        className={`${styles.iconButton} ${selected.starred ? styles.iconButtonStarred : ""}`}
                                        onClick={() => void toggleStar(selected)}
                                        aria-pressed={selected.starred}
                                        aria-label={selected.starred ? "Unstar" : "Star"}
                                        title={selected.starred ? "Unstar" : "Star"}
                                    >
                                        <Star
                                            size={15}
                                            strokeWidth={1.8}
                                            fill={selected.starred ? "currentColor" : "none"}
                                            aria-hidden="true"
                                        />
                                    </button>
                                    <button
                                        type="button"
                                        className={styles.iconButton}
                                        onClick={() => replyRef.current?.focus()}
                                        aria-label="Reply"
                                        title="Reply"
                                    >
                                        <CornerUpLeft size={15} strokeWidth={1.8} aria-hidden="true" />
                                    </button>
                                    {selected.hasReply ? (
                                        <button
                                            type="button"
                                            className={styles.iconButton}
                                            onClick={() => toggleArchive(selected)}
                                            aria-label={selected.archived ? "Unarchive" : "Archive"}
                                            title={selected.archived ? "Unarchive" : "Archive"}
                                        >
                                            {selected.archived ? (
                                                <ArchiveRestore size={15} strokeWidth={1.8} aria-hidden="true" />
                                            ) : (
                                                <Archive size={15} strokeWidth={1.8} aria-hidden="true" />
                                            )}
                                        </button>
                                    ) : null}
                                    <button
                                        type="button"
                                        className={styles.iconButton}
                                        onClick={() => setShowAccount((v) => !v)}
                                        aria-pressed={showAccount}
                                        aria-label={showAccount ? "Hide account info" : "Show account info"}
                                        title={showAccount ? "Hide account info" : "Show account info"}
                                    >
                                        {showAccount ? (
                                            <PanelRightClose size={15} strokeWidth={1.8} aria-hidden="true" />
                                        ) : (
                                            <PanelRightOpen size={15} strokeWidth={1.8} aria-hidden="true" />
                                        )}
                                    </button>
                                </div>
                            </div>

                            <div className={styles.emails} ref={messagesRef}>
                                {selected.messages.map((message, index) => {
                                    const mine = message.direction === "outbound";
                                    const isLast = index === selected.messages.length - 1;
                                    const open = isLast || expanded.has(message.id);
                                    const name = message.fromName || message.fromEmail;

                                    return (
                                        <article key={message.id} className={`${styles.email} ${open ? "" : styles.emailCollapsed}`}>
                                            <header
                                                className={styles.emailHead}
                                                onClick={() => {
                                                    if (isLast) return;
                                                    setExpanded((current) => {
                                                        const next = new Set(current);
                                                        if (next.has(message.id)) next.delete(message.id);
                                                        else next.add(message.id);
                                                        return next;
                                                    });
                                                }}
                                                role={isLast ? undefined : "button"}
                                                tabIndex={isLast ? undefined : 0}
                                                aria-expanded={isLast ? undefined : open}
                                                onKeyDown={(event) => {
                                                    if (!isLast && (event.key === "Enter" || event.key === " ")) {
                                                        event.preventDefault();
                                                        (event.currentTarget as HTMLElement).click();
                                                    }
                                                }}
                                            >
                                                <span className={`${styles.avatar} ${mine ? styles.avatarMine : ""}`} aria-hidden="true">
                                                    {initials(name)}
                                                </span>
                                                <div className={styles.emailFrom}>
                                                    <div>
                                                        <strong>{name}</strong>
                                                        {message.fromName && message.fromEmail !== "you" ? (
                                                            <span>&lt;{message.fromEmail}&gt;</span>
                                                        ) : null}
                                                    </div>
                                                    {open ? (
                                                        <span className={styles.emailTo}>to {message.toEmail}</span>
                                                    ) : (
                                                        <span className={styles.emailSnippet}>
                                                            {message.bodyText.replace(/\s+/g, " ").slice(0, 120)}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className={styles.emailWhen}>
                                                    {message.direction === "inbound" && message.channel ? (
                                                        <span className={styles.emailTag}>
                                                            <ChannelLogo channel={message.channel} size={11} />
                                                            via {CHANNEL_LABEL[message.channel]}
                                                        </span>
                                                    ) : mine ? (
                                                        <span className={styles.emailTag}>
                                                            <ChannelLogo channel="cobrai" size={11} />
                                                            Sent via Resend
                                                        </span>
                                                    ) : null}
                                                    <time dateTime={message.createdAt}>{longTime(message.createdAt)}</time>
                                                </div>
                                            </header>

                                            {open ? (
                                                <>
                                                    {message.bodyHtml ? (
                                                        <div
                                                            className={`${styles.emailBody} ${styles.emailBodyHtml}`}
                                                            // Cleaned on the server (sanitizeEmailHtml) before it is stored.
                                                            dangerouslySetInnerHTML={{ __html: message.bodyHtml }}
                                                        />
                                                    ) : (
                                                        <div className={styles.emailBody}>{message.bodyText}</div>
                                                    )}
                                                    {mine &&
                                                    (message.openedAt ||
                                                        message.clickedAt ||
                                                        message.status === "failed" ||
                                                        message.status === "not_sent") ? (
                                                        <footer className={styles.meta}>
                                                            {message.status === "failed" ? (
                                                                <span className={styles.metaBad}>Failed to send</span>
                                                            ) : null}
                                                            {message.status === "not_sent" ? (
                                                                <span className={styles.metaWarn}>Not sent</span>
                                                            ) : null}
                                                            {message.openedAt ? (
                                                                <span>
                                                                    <Eye size={12} aria-hidden="true" /> Opened {relative(message.openedAt).toLowerCase()}
                                                                </span>
                                                            ) : null}
                                                            {message.clickedAt ? (
                                                                <span>
                                                                    <MousePointerClick size={12} aria-hidden="true" /> Clicked
                                                                </span>
                                                            ) : null}
                                                        </footer>
                                                    ) : null}
                                                </>
                                            ) : null}
                                        </article>
                                    );
                                })}

                                <div className={styles.compose}>
                                    {notice ? (
                                        <p className={`${styles.notice} ${styles[`notice_${notice.tone}`]}`} role="status">
                                            {notice.text}
                                        </p>
                                    ) : null}
                                    <div className={styles.composeBox}>
                                        <div className={styles.composeField}>
                                            <span>To</span>
                                            <b>
                                                {selected.customerName} &lt;{selected.counterpartEmail}&gt;
                                            </b>
                                        </div>
                                        <div className={styles.composeField}>
                                            <span>Subject</span>
                                            <b>Re: {selected.subject}</b>
                                        </div>
                                        <ReplyEditor
                                            key={selected.key}
                                            ref={replyRef}
                                            placeholder="Write your reply…"
                                            onChange={({ text, html }) => setDraftState({ key: selected.key, text, html })}
                                            onSubmit={() => void sendReply()}
                                            footer={
                                                <>
                                                    <span className={styles.composeHint}>⌘ + Enter to send</span>
                                                    <button
                                                        type="button"
                                                        className={styles.buttonPrimary}
                                                        onClick={() => void sendReply()}
                                                        disabled={!draft.text || sending}
                                                    >
                                                        <Send size={14} strokeWidth={1.8} aria-hidden="true" />
                                                        {sending ? "Sending…" : "Send"}
                                                    </button>
                                                </>
                                            }
                                        />
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <p className={styles.empty}>Select a conversation.</p>
                    )}
                </section>

                {selected && showAccount ? (
                    <AccountPanel
                        thread={selected}
                        onOpenAccount={(id) => router.push(`/dashboard/accounts-at-risk/${id}`)}
                    />
                ) : null}
            </div>
        </main>
    );
}

function AccountPanel({
    thread,
    onOpenAccount,
}: {
    thread: InboxThread;
    onOpenAccount: (id: string) => void;
}) {
    const account = thread.account ?? null;
    const contact = [...thread.messages].reverse().find((m) => m.direction === "inbound");
    const tone = account ? riskTone(account) : null;
    const trend =
        account && account.previousRiskScore != null ? account.riskScore - account.previousRiskScore : null;

    return (
        <aside className={styles.panel} aria-label="Account info">
            <div className={styles.acctHead}>
                <span className={styles.avatarLarge} aria-hidden="true">{initials(thread.customerName)}</span>
                <div className={styles.panelIdentity}>
                    <strong>{account?.name ?? thread.customerName}</strong>
                    <span>{contact?.fromName ? `${contact.fromName} · ${thread.counterpartEmail}` : thread.counterpartEmail}</span>
                </div>
            </div>

            {account ? (
                <div className={styles.panelScroll}>
                    <div className={`${styles.acctStatus} ${styles[`acctStatus_${tone}`]}`}>
                        <span className={styles.statusDot} aria-hidden="true" />
                        <strong>{account.status}</strong>
                        <span className={styles.acctRisk}>
                            Risk {account.riskScore}
                            {trend ? (
                                <em className={trend > 0 ? styles.trendUp : styles.trendDown}>
                                    {trend > 0 ? "↑" : "↓"} {Math.abs(trend)}
                                </em>
                            ) : null}
                        </span>
                    </div>

                    <dl className={styles.acctStats}>
                        <div>
                            <dt>MRR</dt>
                            <dd>£{Math.round(account.mrr).toLocaleString("en-GB")}</dd>
                        </div>
                        <div>
                            <dt>Plan</dt>
                            <dd>{account.plan ?? "—"}</dd>
                        </div>
                        <div>
                            <dt>Last active</dt>
                            <dd>{relative(account.lastActiveAt)}</dd>
                        </div>
                        <div>
                            <dt>Active days</dt>
                            <dd>{account.activeDays30d != null ? `${account.activeDays30d} of 30` : "—"}</dd>
                        </div>
                    </dl>

                    <section className={styles.acctSection}>
                        <h3>Why they&apos;re at risk</h3>
                        {account.riskReasons.length ? (
                            <ul className={styles.reasonList}>
                                {account.riskReasons.map((reason) => (
                                    <li key={reason}>{reason}</li>
                                ))}
                            </ul>
                        ) : (
                            <p className={styles.panelNote}>No risk signals right now.</p>
                        )}
                    </section>

                    <section className={styles.acctSection}>
                        <h3>Billing</h3>
                        {account.unpaid.count ? (
                            <p className={styles.billingBad}>
                                £{Math.round(account.unpaid.amount).toLocaleString("en-GB")} unpaid ·{" "}
                                {account.unpaid.count} {account.unpaid.count === 1 ? "invoice" : "invoices"}
                            </p>
                        ) : (
                            <p className={styles.panelNote}>All invoices paid.</p>
                        )}
                    </section>

                    <section className={styles.acctSection}>
                        <h3>Recent outreach</h3>
                        {account.recentActions.length ? (
                            <ul className={styles.outreachList}>
                                {account.recentActions.map((action) => (
                                    <li key={`${action.title}-${action.at}`}>
                                        <span>{action.title}</span>
                                        <small>
                                            {action.status === "failed"
                                                ? "Failed"
                                                : action.replied
                                                  ? "Replied"
                                                  : action.opened
                                                    ? "Opened"
                                                    : "No response"}{" "}
                                            · {relative(action.at).toLowerCase()}
                                        </small>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className={styles.panelNote}>Nothing sent yet.</p>
                        )}
                    </section>

                    <div className={styles.acctFooter}>
                        <button type="button" className={styles.button} onClick={() => onOpenAccount(account.id)}>
                            Open account
                        </button>
                    </div>
                </div>
            ) : (
                <div className={styles.panelScroll}>
                    <section className={styles.acctSection}>
                        <p className={styles.panelNote}>
                            {thread.counterpartEmail} doesn&apos;t match a customer in Cobrai, so there&apos;s no risk or billing
                            data for this conversation.
                        </p>
                    </section>
                </div>
            )}
        </aside>
    );
}
