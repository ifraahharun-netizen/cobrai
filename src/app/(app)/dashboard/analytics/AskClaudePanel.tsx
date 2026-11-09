"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUp, RotateCcw, Sparkles, X } from "lucide-react";
import { getFirebaseAuth } from "@/lib/firebase.client";
import type { MetricsSnapshot } from "@/lib/ai/claudeMetricsRead";
import type { AskAccount } from "@/lib/ai/claudeMetricsAsk";
import styles from "./metrics.module.css";

type Turn = {
    role: "user" | "assistant";
    text: string;
    followUps?: string[];
    error?: boolean;
};

export type AskRequest = { question: string; id: number };

const STARTERS = [
    "What's the biggest risk to revenue right now?",
    "Which accounts should I contact first, and why?",
    "Why is churn moving the way it is?",
    "What should we do this week to reduce churn?",
];

/** Renders Claude's plain-text answer: paragraphs and "- " bullet lines. */
function AnswerText({ text }: { text: string }) {
    const blocks: Array<{ type: "p"; text: string } | { type: "ul"; items: string[] }> = [];

    for (const raw of text.split("\n")) {
        const line = raw.trim();
        if (!line) continue;
        const bullet = line.match(/^[-•*]\s+(.*)$/);
        const last = blocks[blocks.length - 1];
        if (bullet) {
            if (last?.type === "ul") last.items.push(bullet[1]);
            else blocks.push({ type: "ul", items: [bullet[1]] });
        } else {
            blocks.push({ type: "p", text: line });
        }
    }

    return (
        <>
            {blocks.map((block, index) =>
                block.type === "p" ? (
                    <p key={index}>{block.text}</p>
                ) : (
                    <ul key={index}>
                        {block.items.map((item) => (
                            <li key={item}>{item}</li>
                        ))}
                    </ul>
                )
            )}
        </>
    );
}

/**
 * Slide-over chat for asking Claude about the Metrics page. Every question is
 * answered from the page's own figures and Revenue Impact Queue.
 */
export default function AskClaudePanel({
    open,
    onClose,
    request,
    snapshot,
    accounts,
}: {
    open: boolean;
    onClose: () => void;
    /** A question to ask straight away (from an Explain button). */
    request: AskRequest | null;
    snapshot: MetricsSnapshot;
    accounts: AskAccount[];
}) {
    const [turns, setTurns] = useState<Turn[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const handled = useRef<number | null>(null);

    const ask = useCallback(
        async (question: string) => {
            const q = question.trim();
            if (!q || loading) return;

            const user = getFirebaseAuth().currentUser;
            if (!user) return;

            // Only successful turns go back to Claude as context.
            const history = turns
                .filter((turn) => !turn.error)
                .slice(-8)
                .map((turn) => ({ role: turn.role, text: turn.text.slice(0, 4000) }));

            setTurns((current) => [...current, { role: "user", text: q }]);
            setInput("");
            setLoading(true);

            try {
                const token = await user.getIdToken();
                const res = await fetch("/api/dashboard/ai/metrics-ask", {
                    method: "POST",
                    cache: "no-store",
                    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ question: q.slice(0, 500), history, snapshot, accounts }),
                });
                const data = (await res.json().catch(() => null)) as {
                    answer?: string;
                    followUps?: string[];
                    error?: string;
                } | null;

                if (!res.ok || !data?.answer) throw new Error(data?.error || "Claude could not answer right now.");

                setTurns((current) => [
                    ...current,
                    { role: "assistant", text: data.answer!, followUps: data.followUps ?? [] },
                ]);
            } catch (error) {
                setTurns((current) => [
                    ...current,
                    {
                        role: "assistant",
                        text: error instanceof Error ? error.message : "Claude could not answer right now.",
                        error: true,
                    },
                ]);
            } finally {
                setLoading(false);
            }
        },
        [accounts, loading, snapshot, turns]
    );

    // Ask a question handed over by an Explain button, once.
    useEffect(() => {
        if (!open || !request || handled.current === request.id) return;
        handled.current = request.id;
        void ask(request.question);
    }, [open, request, ask]);

    useEffect(() => {
        if (open) window.setTimeout(() => inputRef.current?.focus(), 50);
    }, [open]);

    useEffect(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [turns, loading]);

    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    if (!open || typeof document === "undefined") return null;

    const lastAssistant = [...turns].reverse().find((turn) => turn.role === "assistant" && !turn.error);

    // Render into <body> so the panel sits above everything on the page.
    return createPortal(
        <>
            <div className={styles.askBackdrop} onClick={onClose} aria-hidden="true" />
            <aside className={styles.askPanel} role="dialog" aria-modal="true" aria-labelledby="ask-claude-title">
                <header className={styles.askHead}>
                    <span className={styles.claudeTag}>
                        <Sparkles size={11} strokeWidth={2} aria-hidden="true" />
                        Claude
                    </span>
                    <h2 id="ask-claude-title">Ask about your metrics</h2>
                    {turns.length ? (
                        <button
                            type="button"
                            className={styles.askIconButton}
                            onClick={() => setTurns([])}
                            aria-label="Start a new conversation"
                            title="New conversation"
                            disabled={loading}
                        >
                            <RotateCcw size={15} strokeWidth={1.8} aria-hidden="true" />
                        </button>
                    ) : null}
                    <button
                        type="button"
                        className={styles.askIconButton}
                        onClick={onClose}
                        aria-label="Close"
                        title="Close"
                    >
                        <X size={16} strokeWidth={1.8} aria-hidden="true" />
                    </button>
                </header>

                <div className={styles.askBody} ref={scrollRef} aria-live="polite">
                    {turns.length === 0 ? (
                        <div className={styles.askIntro}>
                            <p>
                                Claude answers from the figures on this page and your Revenue Impact Queue
                                {snapshot.source === "demo" ? " (demo data)" : ""}.
                            </p>
                            <div className={styles.askChips}>
                                {STARTERS.map((starter) => (
                                    <button key={starter} type="button" onClick={() => void ask(starter)}>
                                        {starter}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : null}

                    {turns.map((turn, index) =>
                        turn.role === "user" ? (
                            <div key={index} className={styles.askUser}>
                                {turn.text}
                            </div>
                        ) : (
                            <div
                                key={index}
                                className={`${styles.askAnswer} ${turn.error ? styles.askAnswerError : ""}`}
                            >
                                <AnswerText text={turn.text} />
                            </div>
                        )
                    )}

                    {loading ? (
                        <div className={styles.askThinking}>
                            <span />
                            <span />
                            <span />
                            Claude is reading your numbers…
                        </div>
                    ) : null}

                    {!loading && lastAssistant?.followUps?.length && turns[turns.length - 1] === lastAssistant ? (
                        <div className={styles.askChips}>
                            {lastAssistant.followUps.map((followUp) => (
                                <button key={followUp} type="button" onClick={() => void ask(followUp)}>
                                    {followUp}
                                </button>
                            ))}
                        </div>
                    ) : null}
                </div>

                <form
                    className={styles.askForm}
                    onSubmit={(event) => {
                        event.preventDefault();
                        void ask(input);
                    }}
                >
                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={(event) => setInput(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey) {
                                event.preventDefault();
                                void ask(input);
                            }
                        }}
                        placeholder="Ask about revenue, churn or accounts…"
                        aria-label="Question for Claude"
                        rows={2}
                        maxLength={500}
                    />
                    <button
                        type="submit"
                        className={styles.askSend}
                        disabled={!input.trim() || loading}
                        aria-label="Ask Claude"
                    >
                        <ArrowUp size={16} strokeWidth={2} aria-hidden="true" />
                    </button>
                </form>
                <p className={styles.askDisclaimer}>Claude can make mistakes. Check before acting.</p>
            </aside>
        </>,
        document.body
    );
}
