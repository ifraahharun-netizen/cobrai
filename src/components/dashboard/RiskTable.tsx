type Row = {
    id: string;
    name: string;
    segment: string | null;
    churnRisk: number | null;
    topDriver: string | null;
    mrr: number | null;
};

function pill(risk: number) {
    if (risk >= 80) return { text: "High", bg: "#111", fg: "#fff" };
    if (risk >= 60) return { text: "Medium", bg: "#f1f1f3", fg: "#111" };
    return { text: "Low", bg: "#f7f7f9", fg: "#111" };
}

export default function AtRiskTable({ rows }: { rows: Row[] }) {
    return (
        <div
            style={{
                border: "1px solid rgba(0,0,0,0.08)",
                borderRadius: 16,
                background: "#fff",
                boxShadow: "0 8px 22px rgba(0,0,0,0.04)",
                overflow: "hidden",
            }}
        >
            <div style={{ padding: 14, display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div>
                    <div style={{ fontWeight: 900 }}>Customers at risk</div>
                    <div style={{ fontSize: 12, color: "rgba(0,0,0,0.55)" }}>
                        Ordered by churn probability × MRR
                    </div>
                </div>

                <button
                    style={{
                        border: "1px solid rgba(0,0,0,0.10)",
                        background: "#111",
                        color: "#fff",
                        padding: "10px 12px",
                        borderRadius: 999,
                        fontWeight: 900,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                    }}
                >
                    Start retention workflow
                </button>
            </div>

            <div style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }} />

            <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                        <tr style={{ background: "#fafafa" }}>
                            {["#", "Customer", "Segment", "Risk", "Top driver", "MRR"].map((h) => (
                                <th
                                    key={h}
                                    style={{
                                        textAlign: "left",
                                        fontSize: 12,
                                        padding: "10px 14px",
                                        color: "rgba(0,0,0,0.6)",
                                        fontWeight: 800,
                                    }}
                                >
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>

                    <tbody>
                        {rows.map((r, idx) => {
                            const risk = r.churnRisk ?? 0;
                            const p = pill(risk);
                            return (
                                <tr key={r.id} style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                                    <td style={{ padding: "12px 14px", fontWeight: 800 }}>{idx + 1}</td>
                                    <td style={{ padding: "12px 14px", fontWeight: 800 }}>{r.name}</td>
                                    <td style={{ padding: "12px 14px", color: "rgba(0,0,0,0.7)" }}>
                                        {r.segment ?? "—"}
                                    </td>
                                    <td style={{ padding: "12px 14px" }}>
                                        <span
                                            style={{
                                                display: "inline-flex",
                                                alignItems: "center",
                                                padding: "6px 10px",
                                                borderRadius: 999,
                                                background: p.bg,
                                                color: p.fg,
                                                fontSize: 12,
                                                fontWeight: 900,
                                            }}
                                        >
                                            {p.text} ({risk})
                                        </span>
                                    </td>
                                    <td style={{ padding: "12px 14px", color: "rgba(0,0,0,0.7)" }}>
                                        {r.topDriver ?? "—"}
                                    </td>
                                    <td style={{ padding: "12px 14px", fontWeight: 800 }}>
                                        {typeof r.mrr === "number" ? `£${r.mrr.toLocaleString()}` : "—"}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

