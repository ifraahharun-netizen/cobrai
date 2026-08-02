const ISO_CURRENCY_PATTERN = /^[A-Z]{3}$/;

export type RegionalContext = {
    locale?: string | null;
    timeZone?: string | null;
    currencyCode?: string | null;
    countryCode?: string | null;
};

export function normaliseLocale(value: string | null | undefined) {
    if (!value) return undefined;

    try {
        return Intl.getCanonicalLocales(value)[0];
    } catch {
        return undefined;
    }
}

export function normaliseTimeZone(value: string | null | undefined) {
    if (!value) return undefined;

    try {
        new Intl.DateTimeFormat("en", { timeZone: value }).format();
        return value;
    } catch {
        return undefined;
    }
}

export function normaliseCurrencyCode(value: string | null | undefined) {
    const currencyCode = value?.trim().toUpperCase();

    if (!currencyCode || !ISO_CURRENCY_PATTERN.test(currencyCode)) {
        return undefined;
    }

    try {
        new Intl.NumberFormat("en", {
            style: "currency",
            currency: currencyCode,
        }).format(0);
        return currencyCode;
    } catch {
        return undefined;
    }
}

export function formatMinorCurrency(
    valueMinor: number,
    context: RegionalContext,
) {
    const locale = normaliseLocale(context.locale);
    const currency = normaliseCurrencyCode(context.currencyCode);
    const amount = Number.isFinite(valueMinor) ? valueMinor / 100 : 0;

    if (!currency) {
        return new Intl.NumberFormat(locale, {
            maximumFractionDigits: 2,
            minimumFractionDigits: 0,
        }).format(amount);
    }

    return new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
    }).format(amount);
}

export function formatRegionalDateTime(
    value: Date | null,
    context: RegionalContext,
) {
    if (!value) return "Not available";

    const locale = normaliseLocale(context.locale);
    const timeZone = normaliseTimeZone(context.timeZone);

    return new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
        ...(timeZone ? { timeZone } : {}),
    }).format(value);
}

export function regionalContextFromFormData(formData: FormData) {
    return {
        locale: normaliseLocale(String(formData.get("locale") ?? "")) ?? null,
        timeZone:
            normaliseTimeZone(String(formData.get("timeZone") ?? "")) ?? null,
        currencyCode:
            normaliseCurrencyCode(
                String(formData.get("currencyCode") ?? ""),
            ) ?? null,
    };
}
