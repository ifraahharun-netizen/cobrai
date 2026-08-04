type ApprovalEmailInput = {
    to: string;
    name: string;
    website: string;
    reportUrl: string;
};

function escapeHtml(value: string) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

export async function sendRetentionAuditApprovedEmail(
    input: ApprovalEmailInput,
) {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const from =
        process.env.RETENTION_AUDIT_FROM_EMAIL?.trim() ||
        "Cobrai <audits@cobrai.uk>";

    if (!apiKey) {
        throw new Error("RESEND_API_KEY is not configured.");
    }

    const firstName =
        input.name.trim().split(/\s+/)[0] || "there";

    const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
        },
        body: JSON.stringify({
            from,
            to: [input.to],
            subject: "Your Cobrai retention audit is ready",
            html: `
                <div style="margin:0;background:#f5f7fa;padding:32px 16px;font-family:Arial,sans-serif;color:#111827;">
                    <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:18px;padding:36px;">
                        <div style="font-size:20px;font-weight:700;margin-bottom:28px;">Cobrai</div>

                        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;">
                            Hi ${escapeHtml(firstName)},
                        </p>

                        <h1 style="margin:0 0 16px;font-size:27px;line-height:1.2;letter-spacing:-0.03em;">
                            Your retention audit is ready.
                        </h1>

                        <p style="margin:0 0 24px;color:#667085;font-size:14px;line-height:1.75;">
                            We reviewed the customer data submitted for
                            ${escapeHtml(input.website)}. Your report now shows
                            the accounts requiring attention, the recurring
                            revenue exposed and the actions Cobrai recommends.
                        </p>

                        <a
                            href="${escapeHtml(input.reportUrl)}"
                            style="display:inline-block;padding:13px 20px;border-radius:9px;background:#1d9bf0;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;"
                        >
                            View your retention audit
                        </a>

                        <p style="margin:28px 0 0;color:#98a2b3;font-size:12px;line-height:1.7;">
                            This report link is private. Please do not forward it
                            outside your company.
                        </p>
                    </div>
                </div>
            `,
        }),
        cache: "no-store",
    });

    const result = await response.json().catch(() => null);

    if (!response.ok) {
        throw new Error(
            result?.message ||
            result?.error ||
            "The approval email could not be sent.",
        );
    }

    return result;
}
