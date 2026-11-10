import Link from "next/link";
import type { ReactNode } from "react";

// Links to the /login and /signup pages.
export default function AuthButton({
    view,
    className,
    children,
}: {
    view: "signup" | "login";
    className?: string;
    children: ReactNode;
}) {
    return (
        <Link href={view === "signup" ? "/signup" : "/login"} className={className}>
            {children}
        </Link>
    );
}
