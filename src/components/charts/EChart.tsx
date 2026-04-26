"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import type { EChartsOption, ECharts } from "echarts";

export default function EChart({ option }: { option: EChartsOption }) {
    const ref = useRef<HTMLDivElement>(null);
    const chartRef = useRef<ECharts | null>(null);

    useEffect(() => {
        if (!ref.current) return;

        // create once
        if (!chartRef.current) {
            chartRef.current = echarts.init(ref.current);
        }

        chartRef.current.setOption(option, true);

        const resize = () => chartRef.current?.resize();
        window.addEventListener("resize", resize);

        return () => {
            window.removeEventListener("resize", resize);
        };
    }, [option]);

    // dispose only on unmount
    useEffect(() => {
        return () => {
            chartRef.current?.dispose();
            chartRef.current = null;
        };
    }, []);

    return <div ref={ref} style={{ width: "100%", height: "100%" }} />;
}