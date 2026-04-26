"use client";

import { useEffect, useState } from "react";
import KpiCard from "./KpiCard";

type Metrics = {
    mrrProtected: number;
    atRisk: number;
    retentionRate: number;
    supportLoad: number;
};

type AtRiskCustomer = {
    id: string;
    name: string;
    segment: string;
    churnRisk: number;
    topDriver: string;
    mrr: number;
};

export default function DashboardPage() {
    const [metrics, setMetrics] = useState<Metrics | null>(null);
    const [atRisk, setAtRisk] = useState<AtRiskCustomer[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch("/api/customers/customers-at-risk")
            .then((res) => res.json())
            .then((data) => setAtRisk(data.list))
            .catch(console.error);
    }, []);


    if (error) return <div className="p-6">❌ {error}</div>;
    if (!metrics) return <div className="p-6">Loading dashboard…</div>;

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <KpiCard title="MRR Protected" value={`£${metrics.mrrProtected.toLocaleString()}`} />
                <KpiCard title="Accounts at Risk" value={metrics.atRisk} />
                <KpiCard title="Retention Rate" value={`${metrics.retentionRate}%`} />
                <KpiCard title="Support Load" value={metrics.supportLoad} />
            </div>

            <div className="rounded-xl border p-4 bg-white/5">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold">Customers at Risk</h3>
                    <span className="text-sm opacity-70">Sorted by churn risk</span>
                </div>

                <div className="overflow-auto">
                    <table className="w-full text-sm">
                        <thead className="opacity-70">
                            <tr>
                                <th className="text-left py-2">Customer</th>
                                <th className="text-left py-2">Segment</th>
                                <th className="text-left py-2">Risk</th>
                                <th className="text-left py-2">Top driver</th>
                                <th className="text-left py-2">MRR</th>
                            </tr>
                        </thead>
                        <tbody>
                            {atRisk.map((c) => (
                                <tr key={c.id} className="border-t">
                                    <td className="py-2">{c.name}</td>
                                    <td className="py-2">{c.segment}</td>
                                    <td className="py-2">{c.churnRisk}</td>
                                    <td className="py-2">{c.topDriver}</td>
                                    <td className="py-2">£{c.mrr.toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

