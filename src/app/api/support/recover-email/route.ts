import { NextResponse } from "next/server";
import { Resend } from "resend";
import { ratelimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const resend = new Resend(process.env.RESEND_API_KEY);

function clean(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function isEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** The caller's IP, from the proxy headers the host sets. */
function clientIp(req: Request) {
    const forwarded = req.headers.get("x-forwarded-for");
    return forwarded?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

export async function POST(req: Request) {
    // Public form (no sign-in), so limit by IP to stop it being used to spam the support inbox.
    const { success } = await ratelimit.limit(`recover-email:${clientIp(req)}`);
    if (!success) {
        return NextResponse.json(
            { ok: false, error: "Too many requests. Please wait a minute and try again." },
            { status: 429 }
        );
    }

    try {
        const body = await req.json();

        const name = clean(body.name);
        const contactEmail = clean(body.contactEmail).toLowerCase();
        const details = clean(body.details);

        if (!name) {
            return NextResponse.json(
                { ok: false, error: "Enter your name." },
                { status: 400 }
            );
        }

        if (!contactEmail || !isEmail(contactEmail)) {
            return NextResponse.json(
                { ok: false, error: "Enter a valid contact email." },
                { status: 400 }
            );
        }

        if (!details) {
            return NextResponse.json(
                { ok: false, error: "Enter account details." },
                { status: 400 }
            );
        }

        if (!process.env.RESEND_API_KEY) {
            return NextResponse.json(
                { ok: false, error: "Email service is not configured." },
                { status: 500 }
            );
        }

        const supportEmail = process.env.COBRAI_SUPPORT_EMAIL || "support@cobrai.uk";

        await resend.emails.send({
            from: "Cobrai Support <support@cobrai.uk>",
            to: supportEmail,
            replyTo: contactEmail,
            subject: "Cobrai email recovery request",
            text: `
New email recovery request

Name:
${name}

Contact email:
${contactEmail}

Account details:
${details}

Request:
The user cannot remember which email they used for their Cobrai account.

Reply instructions:
Reply directly to this email. The reply-to address is the user's contact email.
            `.trim(),
        });

        return NextResponse.json({
            ok: true,
            message: "Recovery request sent.",
        });
    } catch (error) {
        console.error("Recover email request failed:", error);

        return NextResponse.json(
            {
                ok: false,
                error: "Something went wrong. Please try again.",
            },
            { status: 500 }
        );
    }
}