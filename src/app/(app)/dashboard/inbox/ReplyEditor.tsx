"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
    AlignCenter,
    AlignLeft,
    AlignRight,
    Bold,
    ChevronDown,
    Italic,
    Link2,
    List,
    ListOrdered,
    RemoveFormatting,
    Type,
    Underline,
} from "lucide-react";
import styles from "./inbox.module.css";

export type ReplyEditorHandle = {
    focus: () => void;
    clear: () => void;
};

export type ReplyContent = { text: string; html: string };

const FONTS = [
    { label: "Sans serif", value: "Helvetica, Arial, sans-serif" },
    { label: "Serif", value: "Georgia, 'Times New Roman', serif" },
    { label: "Monospace", value: "Menlo, Consolas, monospace" },
    { label: "Rounded", value: "'Trebuchet MS', Verdana, sans-serif" },
];

// execCommand font sizes 1–7.
const SIZES = [
    { label: "Small", value: "2" },
    { label: "Normal", value: "3" },
    { label: "Large", value: "5" },
    { label: "Huge", value: "6" },
];

const COLOURS = ["#1f1e1b", "#6f6e69", "#c2412d", "#c96442", "#d49a1f", "#3a7d4f", "#2f5d9b", "#7856ff"];

type Marks = {
    bold: boolean;
    italic: boolean;
    underline: boolean;
    left: boolean;
    center: boolean;
    right: boolean;
    ul: boolean;
    ol: boolean;
};

const NO_MARKS: Marks = { bold: false, italic: false, underline: false, left: false, center: false, right: false, ul: false, ol: false };

/**
 * Small rich-text editor for inbox replies. Uses the browser's built-in
 * editing commands; the server cleans the HTML before it is sent.
 */
const ReplyEditor = forwardRef<
    ReplyEditorHandle,
    {
        placeholder?: string;
        onChange: (content: ReplyContent) => void;
        onSubmit: () => void;
        footer: React.ReactNode;
    }
>(function ReplyEditor({ placeholder, onChange, onSubmit, footer }, ref) {
    const editorRef = useRef<HTMLDivElement>(null);
    const savedRange = useRef<Range | null>(null);
    const [empty, setEmpty] = useState(true);
    const [showToolbar, setShowToolbar] = useState(true);
    const [marks, setMarks] = useState<Marks>(NO_MARKS);
    const [colourOpen, setColourOpen] = useState(false);
    const [colour, setColour] = useState(COLOURS[0]);
    const [font, setFont] = useState(FONTS[0].value);
    const [size, setSize] = useState("3");

    const emit = useCallback(() => {
        const el = editorRef.current;
        if (!el) return;
        const text = el.innerText.replace(/ /g, " ").trim();
        setEmpty(!text);
        onChange({ text, html: text ? el.innerHTML : "" });
    }, [onChange]);

    useImperativeHandle(ref, () => ({
        focus: () => editorRef.current?.focus(),
        clear: () => {
            if (editorRef.current) editorRef.current.innerHTML = "";
            setEmpty(true);
            onChange({ text: "", html: "" });
        },
    }));

    // Keep the toolbar's active states in sync with the cursor.
    useEffect(() => {
        function onSelection() {
            const el = editorRef.current;
            const selection = document.getSelection();
            if (!el || !selection || !selection.rangeCount) return;
            const range = selection.getRangeAt(0);
            if (!el.contains(range.commonAncestorContainer)) return;
            savedRange.current = range.cloneRange();
            setMarks({
                bold: document.queryCommandState("bold"),
                italic: document.queryCommandState("italic"),
                underline: document.queryCommandState("underline"),
                left: document.queryCommandState("justifyLeft"),
                center: document.queryCommandState("justifyCenter"),
                right: document.queryCommandState("justifyRight"),
                ul: document.queryCommandState("insertUnorderedList"),
                ol: document.queryCommandState("insertOrderedList"),
            });
        }
        document.addEventListener("selectionchange", onSelection);
        return () => document.removeEventListener("selectionchange", onSelection);
    }, []);

    /** Run an editing command on the editor's last selection. */
    function run(command: string, value?: string) {
        const el = editorRef.current;
        if (!el) return;
        el.focus();
        const selection = document.getSelection();
        if (savedRange.current && selection) {
            selection.removeAllRanges();
            selection.addRange(savedRange.current);
        }
        document.execCommand("styleWithCSS", false, "true");
        document.execCommand(command, false, value);
        emit();
    }

    function addLink() {
        const url = window.prompt("Link address (https://…)");
        if (!url) return;
        const clean = url.trim();
        if (!/^(https?:\/\/|mailto:)/i.test(clean)) {
            window.alert("Links must start with https://, http:// or mailto:");
            return;
        }
        run("createLink", clean);
    }

    const markButton = (key: keyof Marks, label: string, command: string, Icon: typeof Bold) => (
        <button
            type="button"
            className={`${styles.toolButton} ${marks[key] ? styles.toolButtonOn : ""}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => run(command)}
            aria-pressed={marks[key]}
            aria-label={label}
            title={label}
        >
            <Icon size={14} strokeWidth={2} aria-hidden="true" />
        </button>
    );

    return (
        <>
            <div className={styles.editorWrap}>
                {empty && placeholder ? (
                    <span className={styles.editorPlaceholder} aria-hidden="true">
                        {placeholder}
                    </span>
                ) : null}
                <div
                    ref={editorRef}
                    className={styles.editor}
                    contentEditable
                    suppressContentEditableWarning
                    role="textbox"
                    aria-multiline="true"
                    aria-label="Reply"
                    onInput={emit}
                    onKeyDown={(event) => {
                        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                            event.preventDefault();
                            onSubmit();
                        }
                    }}
                    onPaste={(event) => {
                        // Paste as plain text so outside styles don't come along.
                        event.preventDefault();
                        document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
                    }}
                />
            </div>

            {showToolbar ? (
                <div className={styles.toolbarWrap}>
                {colourOpen ? (
                    <div className={styles.colourMenu} role="menu">
                        {COLOURS.map((c) => (
                            <button
                                key={c}
                                type="button"
                                role="menuitem"
                                className={styles.swatch}
                                style={{ background: c }}
                                aria-label={`Colour ${c}`}
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => {
                                    setColour(c);
                                    setColourOpen(false);
                                    run("foreColor", c);
                                }}
                            />
                        ))}
                    </div>
                ) : null}
                <div className={styles.toolbar} role="toolbar" aria-label="Formatting">
                    <label className={styles.toolSelect}>
                        <select
                            value={font}
                            aria-label="Font"
                            onChange={(event) => {
                                setFont(event.target.value);
                                run("fontName", event.target.value);
                            }}
                        >
                            {FONTS.map((f) => (
                                <option key={f.value} value={f.value}>
                                    {f.label}
                                </option>
                            ))}
                        </select>
                        <ChevronDown size={12} aria-hidden="true" />
                    </label>

                    <label className={styles.toolSelect}>
                        <select
                            value={size}
                            aria-label="Text size"
                            onChange={(event) => {
                                setSize(event.target.value);
                                run("fontSize", event.target.value);
                            }}
                        >
                            {SIZES.map((s) => (
                                <option key={s.value} value={s.value}>
                                    {s.label}
                                </option>
                            ))}
                        </select>
                        <ChevronDown size={12} aria-hidden="true" />
                    </label>

                    <span className={styles.toolDivider} aria-hidden="true" />

                    <div className={styles.colourWrap}>
                        <button
                            type="button"
                            className={styles.toolButton}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => setColourOpen((open) => !open)}
                            aria-expanded={colourOpen}
                            aria-label="Text colour"
                            title="Text colour"
                        >
                            <span className={styles.colourA} style={{ borderColor: colour }}>
                                A
                            </span>
                            <ChevronDown size={11} aria-hidden="true" />
                        </button>
                    </div>

                    {markButton("bold", "Bold", "bold", Bold)}
                    {markButton("italic", "Italic", "italic", Italic)}
                    {markButton("underline", "Underline", "underline", Underline)}

                    <span className={styles.toolDivider} aria-hidden="true" />

                    {markButton("left", "Align left", "justifyLeft", AlignLeft)}
                    {markButton("center", "Align centre", "justifyCenter", AlignCenter)}
                    {markButton("right", "Align right", "justifyRight", AlignRight)}

                    <span className={styles.toolDivider} aria-hidden="true" />

                    {markButton("ul", "Bulleted list", "insertUnorderedList", List)}
                    {markButton("ol", "Numbered list", "insertOrderedList", ListOrdered)}

                    <button
                        type="button"
                        className={styles.toolButton}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={addLink}
                        aria-label="Add link"
                        title="Add link"
                    >
                        <Link2 size={14} strokeWidth={2} aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        className={styles.toolButton}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => run("removeFormat")}
                        aria-label="Clear formatting"
                        title="Clear formatting"
                    >
                        <RemoveFormatting size={14} strokeWidth={2} aria-hidden="true" />
                    </button>
                </div>
                </div>
            ) : null}

            <div className={styles.composeBar}>
                <button
                    type="button"
                    className={`${styles.toolButton} ${showToolbar ? styles.toolButtonOn : ""}`}
                    onClick={() => setShowToolbar((v) => !v)}
                    aria-pressed={showToolbar}
                    aria-label={showToolbar ? "Hide formatting" : "Show formatting"}
                    title={showToolbar ? "Hide formatting" : "Show formatting"}
                >
                    <Type size={14} strokeWidth={2} aria-hidden="true" />
                </button>
                {footer}
            </div>
        </>
    );
});

export default ReplyEditor;
