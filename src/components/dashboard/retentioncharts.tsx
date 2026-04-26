"use client";

import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid,
} from "recharts";

type Props = {
    data: {
        date: string;
        retention: number;
    }[];
};

export default function RetentionChart({ data }: Props) {
    return (
        <div
            style={{
                height: 260,
                background: "#fff",
                borderRadius: 12,
                padding: 16,
                border: "1px solid #e5e7eb",
            }}
        >
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
                Store Retention Trend
            </h3>

            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis domain={[80, 100]} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Line
                        type="monotone"
                        dataKey="retention"
                        stroke="#6366f1"
                        strokeWidth={2}
                        dot={false}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
