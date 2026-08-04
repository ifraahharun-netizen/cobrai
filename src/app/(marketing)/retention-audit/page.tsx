"use client";

import {
    FormEvent,
    useEffect,
    useMemo,
    useState,
} from "react";

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

const countryOptions = [
    {
        code: "GB",
        name: "United Kingdom",
        currency: "GBP",
    },
    {
        code: "US",
        name: "United States",
        currency: "USD",
    },
    {
        code: "IE",
        name: "Ireland",
        currency: "EUR",
    },
    {
        code: "DE",
        name: "Germany",
        currency: "EUR",
    },
    {
        code: "FR",
        name: "France",
        currency: "EUR",
    },
    {
        code: "ES",
        name: "Spain",
        currency: "EUR",
    },
    {
        code: "IT",
        name: "Italy",
        currency: "EUR",
    },
    {
        code: "NL",
        name: "Netherlands",
        currency: "EUR",
    },
    {
        code: "BE",
        name: "Belgium",
        currency: "EUR",
    },
    {
        code: "PT",
        name: "Portugal",
        currency: "EUR",
    },
    {
        code: "AT",
        name: "Austria",
        currency: "EUR",
    },
    {
        code: "FI",
        name: "Finland",
        currency: "EUR",
    },
    {
        code: "SE",
        name: "Sweden",
        currency: "SEK",
    },
    {
        code: "NO",
        name: "Norway",
        currency: "NOK",
    },
    {
        code: "DK",
        name: "Denmark",
        currency: "DKK",
    },
    {
        code: "CH",
        name: "Switzerland",
        currency: "CHF",
    },
    {
        code: "PL",
        name: "Poland",
        currency: "PLN",
    },
    {
        code: "CZ",
        name: "Czech Republic",
        currency: "CZK",
    },
    {
        code: "CA",
        name: "Canada",
        currency: "CAD",
    },
    {
        code: "AU",
        name: "Australia",
        currency: "AUD",
    },
    {
        code: "NZ",
        name: "New Zealand",
        currency: "NZD",
    },
    {
        code: "KE",
        name: "Kenya",
        currency: "KES",
    },
    {
        code: "NG",
        name: "Nigeria",
        currency: "NGN",
    },
    {
        code: "ZA",
        name: "South Africa",
        currency: "ZAR",
    },
    {
        code: "GH",
        name: "Ghana",
        currency: "GHS",
    },
    {
        code: "AE",
        name: "United Arab Emirates",
        currency: "AED",
    },
    {
        code: "SA",
        name: "Saudi Arabia",
        currency: "SAR",
    },
    {
        code: "IN",
        name: "India",
        currency: "INR",
    },
    {
        code: "SG",
        name: "Singapore",
        currency: "SGD",
    },
    {
        code: "JP",
        name: "Japan",
        currency: "JPY",
    },
];

function inferCountryCode(locale: string) {
    const region =
        locale
            .split("-")
            .find(
                (part) =>
                    /^[A-Z]{2}$/i.test(part) &&
                    part.length === 2,
            )
            ?.toUpperCase() ?? "";

    return countryOptions.some(
        (country) => country.code === region,
    )
        ? region
        : "";
}

function getCurrencySymbol(
    currencyCode: string,
    locale: string,
) {
    try {
        const parts =
            new Intl.NumberFormat(
                locale || undefined,
                {
                    style: "currency",
                    currency: currencyCode,
                    currencyDisplay: "narrowSymbol",
                    maximumFractionDigits: 0,
                },
            ).formatToParts(0);

        return (
            parts.find(
                (part) =>
                    part.type === "currency",
            )?.value ?? currencyCode
        );
    } catch {
        return currencyCode;
    }
}

export default function RetentionAuditPage() {
    const [file, setFile] =
        useState<File | null>(null);

    const [status, setStatus] = useState<
        | "idle"
        | "creating"
        | "uploading"
        | "analysing"
        | "complete"
        | "error"
    >("idle");

    const [message, setMessage] =
        useState("");

    const [locale, setLocale] =
        useState("");

    const [timeZone, setTimeZone] =
        useState("");

    const [countryCode, setCountryCode] =
        useState("");

    const [currencyCode, setCurrencyCode] =
        useState("");

    useEffect(() => {
        const detectedLocale =
            navigator.languages?.[0] ||
            navigator.language ||
            "";

        const detectedTimeZone =
            Intl.DateTimeFormat()
                .resolvedOptions()
                .timeZone || "";

        const detectedCountry =
            inferCountryCode(detectedLocale);

        const country =
            countryOptions.find(
                (option) =>
                    option.code ===
                    detectedCountry,
            );

        setLocale(detectedLocale);
        setTimeZone(detectedTimeZone);
        setCountryCode(detectedCountry);
        setCurrencyCode(
            country?.currency ?? "",
        );
    }, []);

    const currencies = useMemo(() => {
        if (
            typeof Intl.supportedValuesOf ===
            "function"
        ) {
            return Intl.supportedValuesOf(
                "currency",
            );
        }

        return Array.from(
            new Set(
                countryOptions.map(
                    (country) =>
                        country.currency,
                ),
            ),
        ).sort();
    }, []);

    const currencyDisplayNames =
        useMemo(() => {
            try {
                return new Intl.DisplayNames(
                    locale || undefined,
                    {
                        type: "currency",
                    },
                );
            } catch {
                return null;
            }
        }, [locale]);

    const currencySymbol =
        getCurrencySymbol(
            currencyCode || "GBP",
            locale,
        );

    const isWorking =
        status === "creating" ||
        status === "uploading" ||
        status === "analysing";

    function handleCountryChange(
        selectedCountryCode: string,
    ) {
        setCountryCode(
            selectedCountryCode,
        );

        const selectedCountry =
            countryOptions.find(
                (country) =>
                    country.code ===
                    selectedCountryCode,
            );

        if (selectedCountry) {
            setCurrencyCode(
                selectedCountry.currency,
            );
        }
    }

    async function handleSubmit(
        event: FormEvent<HTMLFormElement>,
    ) {
        event.preventDefault();

        if (!file) {
            setStatus("error");
            setMessage(
                "Choose a customer CSV before requesting your audit.",
            );
            return;
        }

        const fileName =
            file.name.toLowerCase();

        const isCsv =
            fileName.endsWith(".csv");

        if (!isCsv) {
            setStatus("error");
            setMessage(
                "Please upload a .csv file. Excel and Numbers files must be exported as CSV first.",
            );
            return;
        }

        if (
            file.size >
            20 * 1024 * 1024
        ) {
            setStatus("error");
            setMessage(
                "Your CSV must be 20 MB or smaller.",
            );
            return;
        }

        try {
            setStatus("creating");
            setMessage(
                "Creating your secure audit request…",
            );

            const form =
                event.currentTarget;

            const formData =
                new FormData(form);

            formData.delete("file");

            const requestResponse =
                await fetch(
                    "/api/retention-audit",
                    {
                        method: "POST",
                        headers: {
                            "content-type":
                                "application/x-www-form-urlencoded",
                        },
                        body:
                            new URLSearchParams(
                                {
                                    name: String(
                                        formData.get(
                                            "name",
                                        ) ?? "",
                                    ),
                                    email: String(
                                        formData.get(
                                            "email",
                                        ) ?? "",
                                    ),
                                    website:
                                        String(
                                            formData.get(
                                                "website",
                                            ) ??
                                            "",
                                        ),
                                    mrr: String(
                                        formData.get(
                                            "mrr",
                                        ) ?? "",
                                    ),
                                    countryCode:
                                        String(
                                            formData.get(
                                                "countryCode",
                                            ) ??
                                            "",
                                        ),
                                    currencyCode:
                                        String(
                                            formData.get(
                                                "currencyCode",
                                            ) ??
                                            "",
                                        ),
                                    locale:
                                        String(
                                            formData.get(
                                                "locale",
                                            ) ??
                                            "",
                                        ),
                                    timeZone:
                                        String(
                                            formData.get(
                                                "timeZone",
                                            ) ??
                                            "",
                                        ),
                                },
                            ),
                    },
                );

            const contentType =
                requestResponse.headers.get(
                    "content-type",
                ) ?? "";

            if (
                !contentType.includes(
                    "application/json",
                )
            ) {
                throw new Error(
                    "The audit request endpoint must return JSON containing the audit id and upload token.",
                );
            }

            const requestResult =
                await requestResponse.json();

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
                requestResult.audit
                    ?.uploadToken;

            if (!auditId || !token) {
                throw new Error(
                    "The audit request was created, but its secure upload details were not returned.",
                );
            }

            setStatus("uploading");
            setMessage(
                "Uploading and validating your customer data…",
            );

            const uploadData =
                new FormData();

            uploadData.set("file", file);
            uploadData.set(
                "token",
                token,
            );

            const uploadResponse =
                await fetch(
                    `/api/retention-audit/${auditId}/upload`,
                    {
                        method: "POST",
                        body: uploadData,
                    },
                );

            const uploadResult =
                await uploadResponse.json();

            if (!uploadResponse.ok) {
                throw new Error(
                    uploadResult.error ??
                    "Upload failed.",
                );
            }

            setStatus("analysing");
            setMessage(
                `Cobrai validated ${uploadResult.rowCount} accounts. Building your report…`,
            );

            const analysisResponse =
                await fetch(
                    `/api/retention-audit/${auditId}/analyse`,
                    {
                        method: "POST",
                        headers: {
                            "content-type":
                                "application/json",
                        },
                        body: JSON.stringify({
                            token,
                        }),
                    },
                );

            const analysisResult =
                await analysisResponse.json();

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
                    className={
                        styles.formSection
                    }
                    id="audit-form"
                >
                    <div
                        className={
                            styles.formCopy
                        }
                    >
                        <span
                            className={
                                styles.formEyebrow
                            }
                        >
                            Free founder audit
                        </span>

                        <h2>
                            See what is putting your
                            recurring revenue at
                            risk.
                        </h2>

                        <p>
                            Complete the short form
                            and upload one customer
                            CSV. Cobrai will analyse
                            your customer data and
                            prepare your retention
                            report.
                        </p>

                        <div
                            className={
                                styles.formBenefits
                            }
                        >
                            <span>
                                <Check size={15} />
                                No credit card
                                required
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
                        <input
                            type="hidden"
                            name="locale"
                            value={locale}
                        />

                        <input
                            type="hidden"
                            name="timeZone"
                            value={timeZone}
                        />

                        <div
                            className={
                                styles.formHeader
                            }
                        >
                            <h3>
                                Request your free
                                audit
                            </h3>

                            <p>
                                Complete the details
                                and attach your CSV.
                            </p>
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
                                disabled={
                                    isWorking ||
                                    status ===
                                    "complete"
                                }
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
                                disabled={
                                    isWorking ||
                                    status ===
                                    "complete"
                                }
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
                                disabled={
                                    isWorking ||
                                    status ===
                                    "complete"
                                }
                                required
                            />
                        </label>

                        <label>
                            Country

                            <select
                                name="countryCode"
                                value={countryCode}
                                onChange={(event) =>
                                    handleCountryChange(
                                        event.target
                                            .value,
                                    )
                                }
                                autoComplete="country"
                                disabled={
                                    isWorking ||
                                    status ===
                                    "complete"
                                }
                                required
                            >
                                <option
                                    value=""
                                    disabled
                                >
                                    Select your
                                    country
                                </option>

                                {countryOptions.map(
                                    (country) => (
                                        <option
                                            key={
                                                country.code
                                            }
                                            value={
                                                country.code
                                            }
                                        >
                                            {
                                                country.name
                                            }
                                        </option>
                                    ),
                                )}
                            </select>
                        </label>

                        <label>
                            Currency

                            <select
                                name="currencyCode"
                                value={currencyCode}
                                onChange={(event) =>
                                    setCurrencyCode(
                                        event.target
                                            .value,
                                    )
                                }
                                disabled={
                                    isWorking ||
                                    status ===
                                    "complete"
                                }
                                required
                            >
                                <option
                                    value=""
                                    disabled
                                >
                                    Select your
                                    currency
                                </option>

                                {currencies.map(
                                    (code) => (
                                        <option
                                            value={
                                                code
                                            }
                                            key={code}
                                        >
                                            {currencyDisplayNames?.of(
                                                code,
                                            ) ??
                                                code}{" "}
                                            ({code})
                                        </option>
                                    ),
                                )}
                            </select>
                        </label>

                        <label>
                            Current monthly recurring
                            revenue

                            <select
                                name="mrr"
                                defaultValue=""
                                disabled={
                                    isWorking ||
                                    status ===
                                    "complete"
                                }
                                required
                            >
                                <option
                                    value=""
                                    disabled
                                >
                                    Select a range
                                </option>

                                <option value="pre-revenue">
                                    Pre-revenue
                                </option>

                                <option value="under-5k">
                                    Under{" "}
                                    {currencySymbol}
                                    5k MRR
                                </option>

                                <option value="5k-20k">
                                    {currencySymbol}
                                    5k–
                                    {currencySymbol}
                                    20k MRR
                                </option>

                                <option value="20k-50k">
                                    {currencySymbol}
                                    20k–
                                    {currencySymbol}
                                    50k MRR
                                </option>

                                <option value="50k-100k">
                                    {currencySymbol}
                                    50k–
                                    {currencySymbol}
                                    100k MRR
                                </option>

                                <option value="100k-plus">
                                    {currencySymbol}
                                    100k+ MRR
                                </option>
                            </select>
                        </label>

                        <label
                            className={
                                styles.uploadField
                            }
                        >
                            Customer CSV

                            <span
                                className={
                                    styles.dropzone
                                }
                            >
                                <input
                                    type="file"
                                    name="file"
                                    accept=".csv"
                                    disabled={
                                        isWorking ||
                                        status ===
                                        "complete"
                                    }
                                    onChange={(
                                        event,
                                    ) => {
                                        const selectedFile =
                                            event
                                                .target
                                                .files?.[0] ??
                                            null;

                                        setFile(
                                            selectedFile,
                                        );

                                        if (
                                            status ===
                                            "error"
                                        ) {
                                            setStatus(
                                                "idle",
                                            );
                                            setMessage(
                                                "",
                                            );
                                        }
                                    }}
                                    required
                                />

                                <span
                                    className={
                                        styles.uploadIcon
                                    }
                                >
                                    <UploadCloud
                                        size={18}
                                    />
                                </span>

                                <span
                                    className={
                                        styles.uploadText
                                    }
                                >
                                    <strong>
                                        {file
                                            ? file.name
                                            : "Choose customer CSV"}
                                    </strong>

                                    <small>
                                        Required:
                                        customer_name
                                        and mrr · Max
                                        20 MB
                                    </small>
                                </span>
                            </span>
                        </label>

                        <button
                            type="submit"
                            disabled={
                                !file ||
                                isWorking ||
                                status ===
                                "complete"
                            }
                        >
                            {status ===
                                "creating"
                                ? "Creating secure request…"
                                : status ===
                                    "uploading"
                                    ? "Validating customer data…"
                                    : status ===
                                        "analysing"
                                        ? "Generating your audit…"
                                        : status ===
                                            "complete"
                                            ? "Audit generated"
                                            : "Request my free audit"}

                            {status === "idle" ||
                                status === "error" ? (
                                <ArrowRight
                                    size={17}
                                />
                            ) : null}
                        </button>

                        {message ? (
                            <p
                                className={
                                    status ===
                                        "error"
                                        ? styles.formError
                                        : styles.formStatus
                                }
                                role="status"
                            >
                                {message}
                            </p>
                        ) : null}

                        <small
                            className={
                                styles.privacyNote
                            }
                        >
                            Your raw CSV is processed
                            securely and is not sent
                            to OpenAI.
                        </small>
                    </form>
                </section>

                {/* SECTION 2 — REPORT VALUE */}
                <section
                    className={
                        styles.reportSection
                    }
                >
                    <div
                        className={
                            styles.reportCard
                        }
                    >
                        <div
                            className={
                                styles.reportCardHeader
                            }
                        >
                            <div>
                                <span>
                                    Included in your
                                    audit
                                </span>

                                <h2>
                                    Everything you
                                    need to act
                                </h2>
                            </div>
                        </div>

                        <div
                            className={
                                styles.reportList
                            }
                        >
                            {reportItems.map(
                                (item) => (
                                    <div key={item}>
                                        <CircleCheck
                                            size={
                                                16
                                            }
                                        />

                                        <span>
                                            {item}
                                        </span>
                                    </div>
                                ),
                            )}
                        </div>
                    </div>

                    <div
                        className={
                            styles.reportCopy
                        }
                    >
                        <span
                            className={
                                styles.sectionLabel
                            }
                        >
                            Your retention audit
                        </span>

                        <h1>
                            Clear findings.
                            <br />
                            Prioritised actions.
                            <br />
                            <span>
                                No guesswork.
                            </span>
                        </h1>

                        <p>
                            Receive a focused report
                            showing what is
                            happening, why it
                            matters and which
                            actions are most likely
                            to protect your
                            recurring revenue.
                        </p>

                        <div
                            className={
                                styles.reportProof
                            }
                        >
                            <span>
                                <CircleCheck
                                    size={15}
                                />
                                Designed for fast
                                review
                            </span>

                            <span>
                                <ShieldCheck
                                    size={15}
                                />
                                Built from your own
                                data
                            </span>
                        </div>
                    </div>
                </section>

                {/* SECTION 3 — WHAT COBRAI CHECKS */}
                <section
                    className={
                        styles.checksSection
                    }
                >
                    <div
                        className={
                            styles.checksHeading
                        }
                    >
                        <span
                            className={
                                styles.sectionLabel
                            }
                        >
                            What Cobrai checks
                        </span>

                        <h2>
                            A complete view of your
                            retention health.
                        </h2>

                        <p>
                            Cobrai connects customer
                            behaviour, billing and
                            engagement signals to
                            reveal where retention
                            is breaking down.
                        </p>
                    </div>

                    <div
                        className={
                            styles.checksGrid
                        }
                    >
                        {auditAreas.map((area) => {
                            const Icon =
                                area.icon;

                            return (
                                <article
                                    key={
                                        area.title
                                    }
                                    className={
                                        styles.checkCard
                                    }
                                >
                                    <span
                                        className={
                                            styles.checkIcon
                                        }
                                    >
                                        <Icon
                                            size={
                                                19
                                            }
                                            strokeWidth={
                                                1.8
                                            }
                                        />
                                    </span>

                                    <h3>
                                        {area.title}
                                    </h3>

                                    <p>
                                        {
                                            area.description
                                        }
                                    </p>
                                </article>
                            );
                        })}
                    </div>
                </section>
            </main>
        </>
    );
}