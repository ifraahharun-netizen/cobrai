import { useEffect, useState } from "react";

type Point = {
    month: string;
    churnPct: number;
};

function normalizeChurnPct(value: unknown) {
    const num = Number(value ?? 0);

    if (!Number.isFinite(num)) return 0;

    // Fix values like 34 being shown as 34% instead of 3.4%
    if (num > 20) return Number((num / 10).toFixed(1));

    return Number(num.toFixed(1));
}

export function useChurnTrend() {
    const [points, setPoints] = useState<Point[]>([]);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            try {
                const res = await fetch("/api/dashboard/metrics/churn-trend", {
                    cache: "no-store",
                });

                if (!res.ok) throw new Error("Failed to fetch churn trend");

                const json = await res.json();

                const pts = Array.isArray(json?.points) ? json.points : [];

                const clean: Point[] = pts.map((p: any) => ({
                    month: String(p?.month ?? ""),
                    churnPct: normalizeChurnPct(p?.churnPct),
                }));

                if (!cancelled) {
                    setPoints(clean);
                }
            } catch {
                if (!cancelled) {
                    setPoints([]);
                }
            }
        }

        load();

        return () => {
            cancelled = true;
        };
    }, []);

    return {
        x: points.map((d) => d.month),
        y: points.map((d) => d.churnPct),
        raw: points,
    };
}