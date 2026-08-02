"use client";

import { FormEvent, useState } from "react";

import {
    ArrowRight,
    BarChart3,
    Check,
    CircleCheck,
    Gauge,
    Mail,
    ShieldCheck,
    TrendingDown,
    UploadCloud,
} from "lucide-react";

import MarketingHeader from "@/components/MarketingHeader";

import styles from "./retention-audit.module.css";

const auditAreas = [
    {
        icon: Gauge,
        title: "Customer health",
        description:
            "Identify inactive accounts, declining usage and early signs of weakening engagement.",
    },
    {
        icon: TrendingDown,
        title: "Churn risk",
        description:
            "See which customers are most likely to leave and understand the signals behind the risk.",
    },
    {
        icon: BarChart3,
        title: "Revenue exposure",
        description:
            "Calculate how much recurring revenue is at risk and where recovery is still possible.",
    },
    {
        icon: Mail,
        title: "Retention actions",
        description:
            "Receive clear recommendations for outreach, payment recovery and re-engagement.",
    },
];

const reportItems = [
    "Your overall retention health score",
    "High-risk customers ranked by urgency",
    "Estimated monthly recurring revenue at risk",
    "Failed-payment recovery opportunities",
    "The strongest churn signals in your data",
    "A prioritised action plan for the next 30 days",
];

export default function RetentionAuditPage() {
    const [file, setFile] = useState<File | null>(null);
    const [status, setStatus] = useState<
        "idle" | "creating" | "uploading" | "analysing" | "complete" | "error"
    >("idle");
    const [message, setMessage] = useState("");

    const isWorking =
        status === "creating" ||
        status === "uploading" ||
        status === "analysing";

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!file) {
            setStatus("error");
            setMessage("Choose a customer CSV before requesting your audit.");
            return;
        }

        const fileName = file.name.toLowerCase();
        const isCsv = fileName.endsWith(".csv");

        if (!isCsv) {
            setStatus("error");
            setMessage(
                "Please upload a .csv file. Excel and Numbers files must be exported as CSV first.",
            );
            return;
        }

        if (file.size > 20 * 1024 * 1024) {
            setStatus("error");
            setMessage("Your CSV must be 5 MB or smaller.");
            return;
        }

        try {
            setStatus("creating");
            setMessage("Creating your secure audit request…");

            const form = event.currentTarget;
            const formData = new FormData(form);
            formData.delete("file");

            const requestResponse = await fetch("/api/retention-audit", {
                method: "POST",
                headers: {
                    "content-type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({
                    name: String(formData.get("name") ?? ""),
                    email: String(formData.get("email") ?? ""),
                    website: String(formData.get("website") ?? ""),
                    mrr: String(formData.get("mrr") ?? ""),
                }),
            });

            const contentType =
                requestResponse.headers.get("content-type") ?? "";

            if (!contentType.includes("application/json")) {
                throw new Error(
                    "The audit request endpoint must return JSON containing the audit id and upload token.",
                );
            }

            const requestResult = await requestResponse.json();

            if (!requestResponse.ok) {
                throw new Error(
                    requestResult.error ??
                    "Your audit request could not be created.",
                );
            }

            const auditId =
                requestResult.id ??
                requestResult.auditId ??
                requestResult.audit?.id;

            const token =
                requestResult.token ??
                requestResult.uploadToken ??
                requestResult.audit?.uploadToken;

            if (!auditId || !token) {
                throw new Error(
                    "The audit request was created, but its secure upload details were not returned.",
                );
            }

            setStatus("uploading");
            setMessage("Uploading and validating your customer data…");

            const uploadData = new FormData();
            uploadData.set("file", file);
            uploadData.set("token", token);

            const uploadResponse = await fetch(
                `/api/retention-audit/${auditId}/upload`,
                {
                    method: "POST",
                    body: uploadData,
                },
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
                `/api/retention-audit/${auditId}/analyse`,
                {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                    },
                    body: JSON.stringify({ token }),
                },
            );

            const analysisResult = await analysisResponse.json();

            if (!analysisResponse.ok) {
                throw new Error(
                    analysisResult.error ??
                    "Analysis could not be completed.",
                );
            }

            setStatus("complete");
            setMessage(
                "Your audit has been generated and is awaiting a final quality review. We will send your report link when it is approved.",
            );

            form.reset();
            setFile(null);
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
        <>
            <main className={styles.page}>
                {/* SECTION 1 — AUDIT FORM */}
                <section
                    className={styles.formSection}
                    id="audit-form"
                >
                    <div className={styles.formCopy}>
                        <span className={styles.formEyebrow}>
                            Free founder audit
                        </span>

                        <h2>
                            See what is putting your recurring revenue at risk.
                        </h2>

                        <p>
                            Complete the short form and upload one customer CSV.
                            Cobrai will analyse your customer data and prepare
                            your retention report.
                        </p>

                        <div className={styles.formBenefits}>
                            <span>
                                <Check size={15} />
                                No credit card required
                            </span>

                            <span>
                                <Check size={15} />
                                One simple CSV upload
                            </span>

                            <span>
                                <Check size={15} />
                                Built for B2B SaaS
                            </span>
                        </div>
                    </div>

                    <form
                        className={styles.form}
                        onSubmit={handleSubmit}
                    >
                        <div className={styles.formHeader}>
                            <h3>Request your free audit</h3>
                            <p>Complete the details and attach your CSV.</p>
                        </div>

                        <label>
                            Your name

                            <input
                                type="text"
                                name="name"
                                placeholder="Your full name"
                                autoComplete="name"
                                minLength={2}
                                maxLength={100}
                                disabled={isWorking || status === "complete"}
                                required
                            />
                        </label>

                        <label>
                            Work email

                            <input
                                type="email"
                                name="email"
                                placeholder="you@company.com"
                                autoComplete="email"
                                maxLength={254}
                                disabled={isWorking || status === "complete"}
                                required
                            />
                        </label>

                        <label>
                            Company website

                            <input
                                type="url"
                                name="website"
                                placeholder="https://yourcompany.com"
                                autoComplete="url"
                                disabled={isWorking || status === "complete"}
                                required
                            />
                        </label>

                        <label>
                            Current monthly recurring revenue

                            <select
                                name="mrr"
                                defaultValue=""
                                disabled={isWorking || status === "complete"}
                                required
                            >
                                <option value="" disabled>
                                    Select a range
                                </option>

                                <option value="pre-revenue">
                                    Pre-revenue
                                </option>

                                <option value="under-5k">
                                    Under £5k MRR
                                </option>

                                <option value="5k-20k">
                                    £5k–£20k MRR
                                </option>

                                <option value="20k-50k">
                                    £20k–£50k MRR
                                </option>

                                <option value="50k-100k">
                                    £50k–£100k MRR
                                </option>

                                <option value="100k-plus">
                                    £100k+ MRR
                                </option>
                            </select>
                        </label>

                        <label className={styles.uploadField}>
                            Customer CSV

                            <span className={styles.dropzone}>
                                <input
                                    type="file"
                                    name="file"
                                    accept=".csv"
                                    disabled={isWorking || status === "complete"}
                                    onChange={(event) => {
                                        const selectedFile = event.target.files?.[0] ?? null;

                                        setFile(selectedFile);

                                        if (status === "error") {
                                            setStatus("idle");
                                            setMessage("");
                                        }
                                    }}
                                    required
                                />

                                <span className={styles.uploadIcon}>
                                    <UploadCloud size={18} />
                                </span>

                                <span className={styles.uploadText}>
                                    <strong>
                                        {file
                                            ? file.name
                                            : "Choose customer CSV"}
                                    </strong>
                                    <small>
                                        Required: customer_name and mrr · Max 20 MB
                                    </small>
                                </span>
                            </span>
                        </label>

                        <button
                            type="submit"
                            disabled={
                                !file ||
                                isWorking ||
                                status === "complete"
                            }
                        >
                            {status === "creating"
                                ? "Creating secure request…"
                                : status === "uploading"
                                    ? "Validating customer data…"
                                    : status === "analysing"
                                        ? "Generating your audit…"
                                        : status === "complete"
                                            ? "Audit generated"
                                            : "Request my free audit"}

                            {status === "idle" || status === "error" ? (
                                <ArrowRight size={17} />
                            ) : null}
                        </button>

                        {message ? (
                            <p
                                className={
                                    status === "error"
                                        ? styles.formError
                                        : styles.formStatus
                                }
                                role="status"
                            >
                                {message}
                            </p>
                        ) : null}

                        <small className={styles.privacyNote}>
                            Your raw CSV is processed securely and is not sent
                            to OpenAI.
                        </small>
                    </form>
                </section>
                {/* SECTION 2 — REPORT VALUE */}
                <section className={styles.reportSection}>
                    <div className={styles.reportCard}>
                        <div className={styles.reportCardHeader}>
                            <div>
                                <span>Included in your audit</span>
                                <h2>Everything you need to act</h2>
                            </div>
                        </div>

                        <div className={styles.reportList}>
                            {reportItems.map((item) => (
                                <div key={item}>
                                    <CircleCheck size={16} />
                                    <span>{item}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className={styles.reportCopy}>
                        <span className={styles.sectionLabel}>
                            Your retention audit
                        </span>

                        <h1>
                            Clear findings.
                            <br />
                            Prioritised actions.
                            <br />
                            <span>No guesswork.</span>
                        </h1>

                        <p>
                            Receive a focused report showing what is happening,
                            why it matters and which actions are most likely to
                            protect your recurring revenue.
                        </p>

                        <div className={styles.reportProof}>
                            <span>
                                <CircleCheck size={15} />
                                Designed for fast review
                            </span>

                            <span>
                                <ShieldCheck size={15} />
                                Built from your own data
                            </span>
                        </div>
                    </div>
                </section>

                {/* SECTION 3 — WHAT COBRAI CHECKS */}
                <section className={styles.checksSection}>
                    <div className={styles.checksHeading}>
                        <span className={styles.sectionLabel}>
                            What Cobrai checks
                        </span>

                        <h2>
                            A complete view of your retention health.
                        </h2>

                        <p>
                            Cobrai connects customer behaviour, billing and
                            engagement signals to reveal where retention is
                            breaking down.
                        </p>
                    </div>

                    <div className={styles.checksGrid}>
                        {auditAreas.map((area) => {
                            const Icon = area.icon;

                            return (
                                <article
                                    key={area.title}
                                    className={styles.checkCard}
                                >
                                    <span className={styles.checkIcon}>
                                        <Icon
                                            size={19}
                                            strokeWidth={1.8}
                                        />
                                    </span>

                                    <h3>{area.title}</h3>
                                    <p>{area.description}</p>
                                </article>
                            );
                        })}
                    </div>
                </section>

            </main>
        </>
    );
}
