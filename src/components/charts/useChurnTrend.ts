import { useEffect, useState } from "react";

type Point = {
    month: string;
    churnPct: number;
};

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

                // Your API returns { points: [...] }
                const pts = Array.isArray(json?.points) ? json.points : [];

                const clean: Point[] = pts.map((p: any) => ({
                    month: String(p?.month ?? ""),
                    churnPct: Number(p?.churnPct ?? 0),
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