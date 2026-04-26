import type { Metadata } from "next";
import AccountsAtRiskClient from "./AccountsAtRiskClient";

export const metadata: Metadata = {
    title: "Accounts at Risk • Cobrai",
};

export default function AccountsAtRiskPage() {
    return <AccountsAtRiskClient />;
}