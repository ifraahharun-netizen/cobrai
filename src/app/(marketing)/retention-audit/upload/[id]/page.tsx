"use client";

import { FormEvent, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

import styles from "./upload.module.css";

export default function RetentionAuditUploadPage() {
    const params = useParams<{ id: string }>();
    const searchParams = useSearchParams();
    const token = searchParams.get("token") ?? "";

    const [file, setFile] = useState<File | null>(null);
    const [status, setStatus] = useState<
        "idle" | "uploading" | "analysing" | "complete" | "error"
    >("idle");
    const [message, setMessage] = useState("");

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!file || !token) {
            setStatus("error");
            setMessage("Select a CSV file using the secure upload link.");
            return;
        }

        try {
            setStatus("uploading");
            setMessage("Uploading and validating your customer data…");

            const formData = new FormData();
            formData.set("file", file);
            formData.set("token", token);

            const uploadResponse = await fetch(
                `/api/retention-audit/${params.id}/upload`,
                { method: "POST", body: formData },
            );
            const uploadResult = await uploadResponse.json();

            if (!uploadResponse.ok) {
                throw new Error(uploadResult.error ?? "Upload failed.");
            }

            setStatus("analysing");
            setMessage(
                `Cobrai validated ${uploadResult.rowCount} accounts. Building your report…`,
            );

            const analysisResponse = await fetch(
                `/api/retention-audit/${params.id}/analyse`,
                {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ token }),
                },
            );
            const analysisResult = await analysisResponse.json();

            if (!analysisResponse.ok) {
                throw new Error(
                    analysisResult.error ?? "Analysis could not be completed.",
                );
            }

            setStatus("complete");
            setMessage(
                "Your audit has been generated and is awaiting a final quality review. We will send your report link when it is approved.",
            );
        } catch (error) {
            setStatus("error");
            setMessage(
                error instanceof Error
                    ? error.message
                    : "Something went wrong.",
            );
        }
    }

    return (
        <main className={styles.page}>
            <section className={styles.shell}>
                <div className={styles.copy}>
                    <span>Secure data upload</span>
                    <h1>Let Cobrai find the revenue that needs attention.</h1>
                    <p>
                        Upload a customer CSV. Cobrai validates the data,
                        calculates account-level risk and produces a report for
                        human review.
                    </p>

                    <div className={styles.points}>
                        <p>Maximum file size: 5 MB</p>
                        <p>Maximum accounts: 5,000</p>
                        <p>Your raw CSV is not sent to OpenAI</p>
                    </div>
                </div>

                <form className={styles.card} onSubmit={handleSubmit}>
                    <div>
                        <span>Customer dataset</span>
                        <h2>Upload your CSV</h2>
                        <p>
                            Required columns: customer_name and mrr. Add usage,
                            billing, support and renewal data for a stronger
                            analysis.
                        </p>
                    </div>

                    <label className={styles.dropzone}>
                        <input
                            type="file"
                            accept=".csv,text/csv"
                            disabled={
                                status === "uploading" ||
                                status === "analysing" ||
                                status === "complete"
                            }
                            onChange={(event) =>
                                setFile(event.target.files?.[0] ?? null)
                            }
                        />
                        <strong>
                            {file ? file.name : "Choose customer CSV"}
                        </strong>
                        <span>Click to browse from your device</span>
                    </label>

                    <button
                        type="submit"
                        disabled={
                            !file ||
                            !token ||
                            status === "uploading" ||
                            status === "analysing" ||
                            status === "complete"
                        }
                    >
                        {status === "uploading"
                            ? "Validating data…"
                            : status === "analysing"
                                ? "Generating audit…"
                                : status === "complete"
                                    ? "Audit generated"
                                    : "Analyse my customer data"}
                    </button>

                    {message ? (
                        <p
                            className={
                                status === "error"
                                    ? styles.error
                                    : styles.status
                            }
                        >
                            {message}
                        </p>
                    ) : null}
                </form>
            </section>
        </main>
    );
}
