"use client";

import { useEffect, useMemo, useState } from "react";

type Props = {
    currencySelectClassName?: string;
    currencyLabelClassName?: string;
    defaultCurrencyCode?: string | null;
};

export function RegionalContextFields({
    currencySelectClassName,
    currencyLabelClassName,
    defaultCurrencyCode,
}: Props) {
    const [locale, setLocale] = useState("");
    const [timeZone, setTimeZone] = useState("");
    const [currencyCode, setCurrencyCode] = useState(
        defaultCurrencyCode?.trim().toUpperCase() ?? "",
    );

    useEffect(() => {
        setLocale(navigator.languages?.[0] || navigator.language || "");
        setTimeZone(
            Intl.DateTimeFormat().resolvedOptions().timeZone || "",
        );
    }, []);

    const currencies = useMemo(() => {
        if (typeof Intl.supportedValuesOf !== "function") return [];
        return Intl.supportedValuesOf("currency");
    }, []);

    const displayNames = useMemo(() => {
        try {
            return new Intl.DisplayNames(locale || undefined, {
                type: "currency",
            });
        } catch {
            return null;
        }
    }, [locale]);

    return (
        <>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="timeZone" value={timeZone} />

            <label className={currencyLabelClassName}>
                Currency
                <select
                    className={currencySelectClassName}
                    name="currencyCode"
                    value={currencyCode}
                    onChange={(event) => setCurrencyCode(event.target.value)}
                    required
                >
                    <option value="" disabled>
                        Select your currency
                    </option>
                    {currencies.map((code) => (
                        <option value={code} key={code}>
                            {displayNames?.of(code) ?? code} ({code})
                        </option>
                    ))}
                </select>
            </label>
        </>
    );
}
