import { Suspense } from "react";
import AccountsAtRiskClient from "./AccountsAtRiskClient";

export const dynamic = "force-dynamic";

export default function Page() {
    return (
        <Suspense fallback={null}>
            <AccountsAtRiskClient />
        </Suspense>
    );
}