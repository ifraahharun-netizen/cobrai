"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

// IMPORTANT: dynamic import to avoid SSR issues in Next.js
const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

type Point = { label: string; value: number };

export default function RetentionTrendEChart() {
    const [data, setData] = useState<Point[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let alive = true;

        (async () => {
            try {
                // use your real endpoint (example below)
                const res = await fetch("/api/metrics/retention-trend", { cache: "no-store" });
                const json = await res.json();

                // Expecting either: [{ label, value }, ...]
                // or: { points: [{ label, value }, ...] }
                const points: Point[] = Array.isArray(json) ? json : json?.points ?? [];

                if (alive) setData(points);
            } catch {
                // fallback so chart still renders if API fails
                if (alive)
                    setData([
                        { label: "Mon", value: 78 },
                        { label: "Tue", value: 80 },
                        { label: "Wed", value: 77 },
                        { label: "Thu", value: 81 },
                        { label: "Fri", value: 83 },
                        { label: "Sat", value: 82 },
                        { label: "Sun", value: 84 },
                    ]);
            } finally {
                if (alive) setLoading(false);
            }
        })();

        return () => {
            alive = false;
        };
    }, []);

    const option = useMemo(() => {
        const labels = data.map((p) => p.label);
        const values = data.map((p) => p.value);

        return {
            backgroundColor: "transparent",
            animation: false, // ✅ kills “animated” feel
            grid: { left: 10, right: 10, top: 10, bottom: 0, containLabel: true },
            tooltip: {
                trigger: "axis",
                backgroundColor: "rgba(17, 24, 39, 0.92)",
                borderWidth: 0,
                textStyle: { color: "#fff", fontSize: 12 },
                axisPointer: { type: "line" },
                padding: [8, 10],
            },
            xAxis: {
                type: "category",
                data: labels,
                boundaryGap: false,
                axisTick: { show: false },
                axisLine: { lineStyle: { color: "rgba(15, 23, 42, 0.10)" } },
                axisLabel: { color: "rgba(15, 23, 42, 0.55)", fontSize: 11 },
            },
            yAxis: {
                type: "value",
                axisTick: { show: false },
                axisLine: { show: false },
                axisLabel: { color: "rgba(15, 23, 42, 0.55)", fontSize: 11 },
                splitLine: { lineStyle: { color: "rgba(15, 23, 42, 0.08)" } },
            },
            series: [
                {
                    name: "Retention",
                    type: "line",
                    data: values,
                    smooth: true,
                    showSymbol: false, // ✅ no chunky dots
                    lineStyle: { width: 2, color: "#2563eb" },
                    areaStyle: { opacity: 0.08 }, // ✅ soft fill (not bold)
                    emphasis: { focus: "series" },
                },
            ],
        };
    }, [data]);

    return (
        <div style={{ width: "100%", height: "100%" }}>
            {loading ? (
                <div style={{ height: "100%", display: "grid", placeItems: "center", fontSize: 12, opacity: 0.7 }}>
                    Loading…
                </div>
            ) : (
                <ReactECharts option={option} style={{ width: "100%", height: "100%" }} />
            )}
        </div>
    );
}
