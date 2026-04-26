import type { RiskAccount } from "@/types";

export const RISK_ACCOUNTS: RiskAccount[] = [
    {
        id: "1",
        company: "Acme Ltd",
        reason: "Usage down 42% (7d) + unresolved tickets",
        risk: 82,
        mrr: 190,
    },
    {
        id: "2",
        company: "Beta Systems",
        reason: "Payment failed + no login in 10 days",
        risk: 71,
        mrr: 49,
    },
    {
        id: "3",
        company: "Northwind",
        reason: "Negative ticket sentiment detected",
        risk: 66,
        mrr: 320,
    },
    {
        id: "4",
        company: "Peak Analytics",
        reason: "Feature adoption low (key feature unused)",
        risk: 59,
        mrr: 210,
    },
];