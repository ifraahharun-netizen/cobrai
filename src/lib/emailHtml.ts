// lib/emailHtml.ts
//
// Cleans HTML written in the inbox reply editor before it is emailed or stored.
// Only simple formatting survives: fonts, sizes, colours, bold/italic/underline,
// alignment, lists and links (http, https, mailto). Scripts, event handlers,
// images, iframes and any other styles are removed.

import sanitizeHtml from "sanitize-html";

const MAX_HTML = 50_000;

const FONT_FAMILY =
    /^[\w\s,'"-]{1,120}$/; // names like Georgia, "Helvetica Neue", serif
const FONT_SIZE =
    /^(?:\d{1,2}(?:\.\d+)?(?:px|pt|em|rem)|xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large)$/;
const COLOUR = /^(?:#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\))$/i;

export function sanitizeEmailHtml(html: string): string {
    if (!html || html.length > MAX_HTML) return "";

    return sanitizeHtml(html, {
        allowedTags: ["p", "div", "br", "span", "b", "strong", "i", "em", "u", "ul", "ol", "li", "a", "blockquote", "font"],
        allowedAttributes: {
            a: ["href", "target", "rel"],
            font: ["face", "size", "color"],
            "*": ["style"],
        },
        allowedSchemes: ["http", "https", "mailto"],
        allowedSchemesAppliedToAttributes: ["href"],
        allowProtocolRelative: false,
        allowedStyles: {
            "*": {
                color: [COLOUR],
                "font-family": [FONT_FAMILY],
                "font-size": [FONT_SIZE],
                "font-weight": [/^(?:bold|normal|[1-9]00)$/],
                "font-style": [/^(?:italic|normal)$/],
                "text-decoration": [/^(?:underline|none)$/],
                "text-decoration-line": [/^(?:underline|none)$/],
                "text-align": [/^(?:left|right|center|justify)$/],
            },
        },
        transformTags: {
            a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }),
        },
        exclusiveFilter: (frame) => frame.tag === "font" && !frame.text.trim() && !frame.mediaChildren?.length,
    }).trim();
}
