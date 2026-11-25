// "Your trial ends soon" email. Pure (no imports), so it's unit-tested directly.
// Mirrors the in-app report: leads with the customer's own numbers when there
// are any, otherwise a short, honest reminder.

export type TrialEmailAccount = { name: string; reason: string; mrrMinor: number };

export type TrialEmailInput = {
    daysRemaining: number;
    currency: string;
    appUrl: string;
    atRiskMinor: number;
    atRiskAccounts: number;
    failedPaymentsMinor: number;
    failedPayments: number;
    topAccounts: TrialEmailAccount[];
};

function money(minor: number, currency: string) {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(
        Math.max(0, minor) / 100
    );
}

function plural(n: number, one: string, many = `${one}s`) {
    return `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;
}

function escapeHtml(value: string) {
    return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function buildTrialEndingEmail(input: TrialEmailInput): { subject: string; html: string; text: string } {
    const { currency } = input;
    const when = input.daysRemaining <= 1 ? "tomorrow" : `in ${input.daysRemaining} days`;
    const atStakeMinor = input.atRiskMinor + input.failedPaymentsMinor;
    const hasStake = atStakeMinor > 0;
    const reportUrl = `${input.appUrl.replace(/\/$/, "")}/dashboard`;

    const subject = hasStake
        ? `Your Cobrai trial ends ${when}: ${money(atStakeMinor, currency)} a month needs attention`
        : `Your Cobrai trial ends ${when}`;

    const facts: string[] = [];
    if (input.atRiskMinor > 0) {
        facts.push(
            `${money(input.atRiskMinor, currency)} a month at risk across ${plural(input.atRiskAccounts, "account")} (${money(input.atRiskMinor * 12, currency)} a year if they leave)`
        );
    }
    if (input.failedPaymentsMinor > 0) {
        facts.push(`${money(input.failedPaymentsMinor, currency)} in ${plural(input.failedPayments, "failed payment")} waiting to be recovered`);
    }

    const accounts = input.topAccounts.slice(0, 3);

    const intro = hasStake
        ? `Your free trial ends ${when}. Here's what Cobrai found in your business:`
        : `Your free trial ends ${when}. Choose a plan now and nothing changes: your data, settings and history stay as they are.`;

    const outro = hasStake
        ? "Cobrai has a next step ready for each of these. Choose a plan before your trial ends and you keep working on them without interruption."
        : "If you haven't connected Stripe yet, do it before your trial ends to see the revenue at risk in your business.";

    // Plain text
    const text = [
        "Hi,",
        "",
        intro,
        ...(facts.length ? ["", ...facts.map((f) => `- ${f}`)] : []),
        ...(accounts.length
            ? ["", "Accounts that need action:", ...accounts.map((a) => `- ${a.name}: ${a.reason} (${money(a.mrrMinor, currency)}/mo)`)]
            : []),
        "",
        outro,
        "",
        `See your report and choose a plan: ${reportUrl}`,
        "",
        "Questions? Just reply to this email.",
        "",
        "The Cobrai team",
    ].join("\n");

    // HTML: simple, email-client-safe (inline styles, tables for layout).
    const factRows = facts
        .map((f) => `<li style="margin:0 0 6px;">${escapeHtml(f)}</li>`)
        .join("");
    const accountRows = accounts
        .map(
            (a) =>
                `<tr><td style="padding:8px 0;border-top:1px solid #f0eee6;font-size:14px;color:#1f1e1d;"><strong style="font-weight:600;">${escapeHtml(a.name)}</strong><br><span style="color:#73726c;font-size:13px;">${escapeHtml(a.reason)}</span></td><td style="padding:8px 0;border-top:1px solid #f0eee6;font-size:14px;color:#1f1e1d;text-align:right;white-space:nowrap;">${money(a.mrrMinor, currency)}/mo</td></tr>`
        )
        .join("");

    const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#ffffff;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f1e1d;">
<tr><td style="font-size:15px;font-weight:600;padding-bottom:24px;">Cobrai</td></tr>
<tr><td style="font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.2;padding-bottom:12px;">${
        hasStake ? `${money(atStakeMinor, currency)} a month needs your attention` : "Your trial ends soon"
    }</td></tr>
<tr><td style="font-size:15px;line-height:1.55;color:#3d3d3a;padding-bottom:12px;">${escapeHtml(intro)}</td></tr>
${factRows ? `<tr><td style="font-size:15px;line-height:1.5;color:#3d3d3a;padding-bottom:8px;"><ul style="margin:0;padding-left:20px;">${factRows}</ul></td></tr>` : ""}
${
        accountRows
            ? `<tr><td style="padding:8px 0 4px;font-size:13px;font-weight:600;color:#1f1e1d;">Accounts that need action</td></tr><tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${accountRows}</table></td></tr>`
            : ""
    }
<tr><td style="font-size:15px;line-height:1.55;color:#3d3d3a;padding:16px 0 20px;">${escapeHtml(outro)}</td></tr>
<tr><td style="padding-bottom:24px;"><a href="${escapeHtml(reportUrl)}" style="display:inline-block;padding:11px 18px;border-radius:8px;background:#1f1e1d;color:#ffffff;font-size:14px;font-weight:500;text-decoration:none;">See your report and choose a plan</a></td></tr>
<tr><td style="font-size:13px;line-height:1.5;color:#73726c;border-top:1px solid #e8e6dc;padding-top:16px;">Questions? Just reply to this email.<br>The Cobrai team</td></tr>
</table>
</td></tr>
</table>
</body></html>`;

    return { subject, html, text };
}
