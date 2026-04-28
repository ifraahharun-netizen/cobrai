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

        chartRef.current.setOption(option, true);

        const resize = () => chartRef.current?.resize();
        window.addEventListener("resize", resize);

        requestAnimationFrame(() => {
            chartRef.current?.resize();
        });

        return () => {
            window.removeEventListener("resize", resize);
        };
    }, [option]);

    useEffect(() => {
        const chart = chartRef.current;
        if (!chart) return;

        if (!onEvents) return;

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