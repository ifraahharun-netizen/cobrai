"use client";

import { motion } from "framer-motion";

export default function FeatureHeroVisual() {
    return (
        <div className="relative mt-20 flex items-center justify-center">

            {/* Background Glow */}
            <div className="absolute h-[500px] w-[500px] rounded-full bg-blue-500/20 blur-3xl" />

            {/* Main Dashboard */}
            <motion.div
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8 }}
                className="relative z-10 w-full max-w-6xl overflow-hidden rounded-[32px] border border-white/10 bg-neutral-950 shadow-[0_0_80px_rgba(59,130,246,0.12)]"
            >

                {/* Top Bar */}
                <div className="flex items-center justify-between border-b border-white/10 px-8 py-5">

                    <div>
                        <p className="text-sm uppercase tracking-[0.2em] text-blue-400">
                            Cobrai Intelligence
                        </p>

                        <h3 className="mt-2 text-xl font-semibold text-white">
                            AI Retention Overview
                        </h3>
                    </div>

                    <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-400">
                        Live monitoring active
                    </div>

                </div>

                {/* Main Content */}
                <div className="grid gap-6 p-8 lg:grid-cols-[1.2fr_0.8fr]">

                    {/* LEFT */}
                    <div className="space-y-6">

                        {/* KPI Row */}
                        <div className="grid grid-cols-3 gap-4">

                            <StatCard
                                title="MRR at risk"
                                value="£34.8K"
                                change="+12%"
                            />

                            <StatCard
                                title="High-risk accounts"
                                value="12"
                                change="+4"
                            />

                            <StatCard
                                title="Retention uplift"
                                value="£6.9K"
                                change="+18%"
                            />

                        </div>

                        {/* Graph */}
                        <div className="rounded-3xl border border-white/10 bg-neutral-900 p-6">

                            <div className="mb-6 flex items-center justify-between">

                                <div>
                                    <h4 className="text-lg font-medium text-white">
                                        Churn forecast
                                    </h4>

                                    <p className="text-sm text-neutral-400">
                                        AI prediction over the next 90 days
                                    </p>
                                </div>

                                <div className="rounded-full bg-blue-500/10 px-3 py-1 text-sm text-blue-400">
                                    AI Forecasting
                                </div>

                            </div>

                            <div className="relative h-[260px] overflow-hidden rounded-2xl bg-gradient-to-b from-blue-500/10 to-transparent">

                                <motion.div
                                    animate={{
                                        x: [0, 10, 0],
                                    }}
                                    transition={{
                                        repeat: Infinity,
                                        duration: 6,
                                        ease: "easeInOut",
                                    }}
                                    className="absolute inset-0"
                                >

                                    <svg
                                        viewBox="0 0 700 260"
                                        className="h-full w-full"
                                        fill="none"
                                    >

                                        <path
                                            d="M0 200C80 180 120 120 200 130C260 138 320 210 410 170C500 130 580 60 700 80"
                                            stroke="#3B82F6"
                                            strokeWidth="4"
                                            strokeLinecap="round"
                                        />

                                        <path
                                            d="M0 260L0 200C80 180 120 120 200 130C260 138 320 210 410 170C500 130 580 60 700 80L700 260Z"
                                            fill="url(#paint0_linear)"
                                            opacity="0.18"
                                        />

                                        <defs>
                                            <linearGradient
                                                id="paint0_linear"
                                                x1="0"
                                                y1="0"
                                                x2="700"
                                                y2="0"
                                            >
                                                <stop stopColor="#3B82F6" />
                                                <stop
                                                    offset="1"
                                                    stopColor="#8B5CF6"
                                                />
                                            </linearGradient>
                                        </defs>

                                    </svg>

                                </motion.div>

                            </div>

                        </div>

                    </div>

                    {/* RIGHT */}
                    <div className="space-y-5">

                        {/* Floating Insight */}
                        <motion.div
                            animate={{
                                y: [0, -10, 0],
                            }}
                            transition={{
                                repeat: Infinity,
                                duration: 4,
                                ease: "easeInOut",
                            }}
                            className="rounded-3xl border border-white/10 bg-neutral-900/90 p-6 backdrop-blur-xl"
                        >

                            <div className="mb-4 flex items-center gap-2">

                                <div className="h-2 w-2 rounded-full bg-emerald-400" />

                                <span className="text-sm text-emerald-400">
                                    AI Insight
                                </span>

                            </div>

                            <h4 className="text-lg font-semibold text-white">
                                CedarWorks shows elevated churn risk
                            </h4>

                            <p className="mt-3 text-sm leading-relaxed text-neutral-400">
                                Product usage declined 34% while support engagement
                                and payment reliability also dropped.
                            </p>

                            <div className="mt-5 rounded-2xl bg-blue-500/10 p-4 text-sm text-blue-300">
                                Recommended action: retention outreach within 48 hours.
                            </div>

                        </motion.div>

                        {/* Activity Feed */}
                        <div className="rounded-3xl border border-white/10 bg-neutral-900 p-6">

                            <div className="mb-5 flex items-center justify-between">

                                <h4 className="text-lg font-medium text-white">
                                    Live activity
                                </h4>

                                <div className="flex items-center gap-2 text-xs text-neutral-400">

                                    <div className="h-2 w-2 rounded-full bg-emerald-400" />

                                    Live
                                </div>

                            </div>

                            <div className="space-y-4">

                                <FeedItem
                                    title="Risk score increased"
                                    value="+18%"
                                />

                                <FeedItem
                                    title="Payment issue detected"
                                    value="High"
                                />

                                <FeedItem
                                    title="Expansion opportunity"
                                    value="£4.2K"
                                />

                            </div>

                        </div>

                    </div>

                </div>

            </motion.div>

        </div>
    );
}

function StatCard({
    title,
    value,
    change,
}: {
    title: string;
    value: string;
    change: string;
}) {
    return (
        <motion.div
            whileHover={{ scale: 1.03 }}
            className="rounded-2xl border border-white/10 bg-neutral-900 p-5"
        >

            <p className="text-sm text-neutral-400">
                {title}
            </p>

            <h3 className="mt-2 text-3xl font-bold text-white">
                {value}
            </h3>

            <div className="mt-3 inline-flex rounded-full bg-emerald-500/10 px-3 py-1 text-sm text-emerald-400">
                {change}
            </div>

        </motion.div>
    );
}

function FeedItem({
    title,
    value,
}: {
    title: string;
    value: string;
}) {
    return (
        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-neutral-950 px-4 py-3">

            <span className="text-sm text-neutral-300">
                {title}
            </span>

            <span className="rounded-full bg-blue-500/10 px-3 py-1 text-xs text-blue-400">
                {value}
            </span>

        </div>
    );
}