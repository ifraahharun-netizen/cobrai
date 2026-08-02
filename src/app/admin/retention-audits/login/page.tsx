import { redirect } from "next/navigation";

import { isRetentionAuditAdmin } from "@/lib/retention-audit/admin-auth";

import styles from "../retention-audits.module.css";

type Props = {
    searchParams: Promise<{
        error?: string;
    }>;
};

export default async function RetentionAuditAdminLoginPage({
    searchParams,
}: Props) {
    if (await isRetentionAuditAdmin()) {
        redirect("/admin/retention-audits");
    }

    const { error } = await searchParams;

    return (
        <main className={styles.loginPage}>
            <form
                className={styles.loginCard}
                action="/api/admin/retention-audits/login"
                method="POST"
            >
                <span className={styles.eyebrow}>Cobrai admin</span>
                <h1>Retention audit review</h1>
                <p>
                    Enter the private admin password to review and approve
                    customer audits.
                </p>

                <label>
                    Admin password
                    <input
                        type="password"
                        name="secret"
                        autoComplete="current-password"
                        required
                        autoFocus
                    />
                </label>

                {error ? (
                    <p className={styles.errorMessage}>
                        The password is incorrect.
                    </p>
                ) : null}

                <button type="submit">Open audit dashboard</button>
            </form>
        </main>
    );
}
