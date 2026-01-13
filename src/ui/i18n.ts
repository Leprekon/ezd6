export const localize = (key: string, fallback?: string): string => {
    const value = (game as any)?.i18n?.localize?.(key);
    if (value && value !== key) return value;
    return fallback ?? value ?? key;
};

export const format = (
    key: string,
    data: Record<string, any>,
    fallback?: string
): string => {
    const value = (game as any)?.i18n?.format?.(key, data);
    if (value && value !== key) return value;
    return fallback ?? value ?? key;
};

export const resolveLocalizedField = (
    localizationId: string | null | undefined,
    suffix: string,
    fallback: string
): { value: string; locked: boolean; key: string } => {
    const base = typeof localizationId === "string" ? localizationId.trim() : "";
    if (!base) return { value: fallback, locked: false, key: "" };
    const key = `${base}.${suffix}`;
    const value = (game as any)?.i18n?.localize?.(key);
    if (value && value !== key) return { value, locked: true, key };
    return { value: fallback, locked: false, key };
};
