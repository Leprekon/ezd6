type LocalizationSource = {
    localizationId?: string | null;
    name?: string | null;
    description?: string | null;
    system?: {
        localizationId?: string | null;
        description?: string | null;
    };
};

export function resolveLocalizedText(
    localizationId: string | null | undefined,
    suffix: string,
    fallback: string,
    resolver: (id: string | null | undefined, suffix: string, fallback: string) => string
): string {
    return resolver(localizationId, suffix, fallback);
}

export function resolveItemName(
    item: LocalizationSource | null | undefined,
    fallback: string,
    resolver: (id: string | null | undefined, suffix: string, fallback: string) => string
): string {
    const localizationId = typeof item?.system?.localizationId === "string"
        ? item.system.localizationId.trim()
        : "";
    return resolveLocalizedText(localizationId, "Name", fallback, resolver);
}

export function resolveItemDescription(
    item: LocalizationSource | null | undefined,
    fallback: string,
    resolver: (id: string | null | undefined, suffix: string, fallback: string) => string
): string {
    const localizationId = typeof item?.system?.localizationId === "string"
        ? item.system.localizationId.trim()
        : "";
    return resolveLocalizedText(localizationId, "Desc", fallback, resolver);
}

export function resolveEntryName(
    localizationId: string | null | undefined,
    fallback: string,
    resolver: (id: string | null | undefined, suffix: string, fallback: string) => string
): string {
    return resolveLocalizedText(localizationId, "Name", fallback, resolver);
}

export function resolveEntryDescription(
    localizationId: string | null | undefined,
    fallback: string,
    resolver: (id: string | null | undefined, suffix: string, fallback: string) => string
): string {
    return resolveLocalizedText(localizationId, "Desc", fallback, resolver);
}
