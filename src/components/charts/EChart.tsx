"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import type { EChartsOption, ECharts } from "echarts";

type EChartProps = {
    option: EChartsOption;
    onEvents?: Record<string, (params: any) => void>;
};

export default function EChart({ option, onEvents }: EChartProps) {
    const ref = useRef<HTMLDivElement>(null);
    const chartRef = useRef<ECharts | null>(null);

    useEffect(() => {
        if (!ref.current) return;

        if (!chartRef.current) {
            chartRef.current = echarts.init(ref.current);
        }

        const frame = window.requestAnimationFrame(() => {
            chartRef.current?.setOption(option, true);
            chartRef.current?.resize();
        });

        // Redraw whenever the chart's own box changes size (card width, layout
        // breakpoints), not just when the window resizes. Without this the
        // canvas keeps its old size and gets clipped or stretched.
        const resize = () => chartRef.current?.resize();
        const observer =
            typeof ResizeObserver !== "undefined"
                ? new ResizeObserver(() => resize())
                : null;
        observer?.observe(ref.current);
        window.addEventListener("resize", resize);

        return () => {
            window.cancelAnimationFrame(frame);
            observer?.disconnect();
            window.removeEventListener("resize", resize);
        };
    }, [option]);

    useEffect(() => {
        const chart = chartRef.current;
        if (!chart || !onEvents) return;

        Object.entries(onEvents).forEach(([eventName, handler]) => {
            chart.off(eventName);
            chart.on(eventName, handler);
        });

        return () => {
            Object.keys(onEvents).forEach((eventName) => {
                chart.off(eventName);
            });
        };
    }, [onEvents]);

    useEffect(() => {
        return () => {
            chartRef.current?.dispose();
            chartRef.current = null;
        };
    }, []);

    return <div ref={ref} style={{ width: "100%", height: "100%" }} />;
}