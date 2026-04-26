export function hubspotHeaders(token?: string) {
    const t = token || process.env.HUBSPOT_APP_TOKEN || "";
    return {
        Authorization: `Bearer ${t}`,
        "Content-Type": "application/json",
    };
}