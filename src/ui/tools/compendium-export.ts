type ExportPayload = Record<string, Record<string, string>>;

const normalizeString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const shouldTreatAsLocalizationKey = (value: string): boolean => value.startsWith("EZD6.");

const resolveTranslationValue = (source: any, key: string): string => {
    if (!source || !key) return "";
    const parts = key.split(".");
    let current: any = source;
    for (const part of parts) {
        if (!current || typeof current !== "object") return "";
        current = current[part];
    }
    return typeof current === "string" ? current.trim() : "";
};

const getFallbackLocalizationValue = (localizationId: string, suffix: string): string => {
    const id = normalizeString(localizationId);
    if (!id) return "";
    const fallback = (game as any)?.i18n?._fallback;
    return resolveTranslationValue(fallback, `${id}.${suffix}`);
};

const resolveExportField = (
    localizationId: string,
    suffix: "Name" | "Desc",
    fallback: unknown
): string => {
    const localized = getFallbackLocalizationValue(localizationId, suffix);
    if (localized) return localized;
    return normalizeString(fallback);
};

const buildExportEntry = (data: {
    localizationId: string;
    name?: string;
    description?: string;
    category?: string;
}): Record<string, string> | null => {
    const localizationId = normalizeString(data.localizationId);
    if (!localizationId) return null;

    const fields: Record<string, string> = {};
    const addField = (suffix: string, value: string) => {
        if (!value) return;
        fields[`${localizationId}.${suffix}`] = value;
    };

    const nameValue = resolveExportField(localizationId, "Name", data.name);
    const descValue = resolveExportField(localizationId, "Desc", data.description);
    const rawCategory = normalizeString(data.category);

    addField("Name", nameValue);
    addField("Desc", descValue);

    return {
        ...fields,
        ...(rawCategory && shouldTreatAsLocalizationKey(rawCategory) ? { [rawCategory]: "" } : {}),
    };
};

const collectCompendiumLocalization = async (): Promise<ExportPayload> => {
    const packs = Array.from((game as any)?.packs ?? []).filter((pack: any) => Boolean(pack));

    const payload: ExportPayload = {};

    for (const pack of packs) {
        let docs: any[] = [];
        try {
            docs = await pack.getDocuments();
        } catch {
            continue;
        }

        const packId = String(pack?.collection ?? "");
        if (!packId) continue;
        if (!payload[packId]) payload[packId] = {};

        for (const doc of docs) {
            const system = doc?.system ?? {};
            const entry = buildExportEntry({
                localizationId: system.localizationId,
                name: doc?.name,
                description: system.description,
                category: system.category,
            });
            if (!entry) continue;
            Object.assign(payload[packId], entry);

            if (doc?.type !== "archetype") continue;
            const abilities = Array.isArray(system.abilities) ? system.abilities : [];
            const aspects = Array.isArray(system.aspects) ? system.aspects : [];
            const equipment = Array.isArray(system.equipment) ? system.equipment : [];
            const resources = Array.isArray(system.resources) ? system.resources : [];
            const saves = Array.isArray(system.saves) ? system.saves : [];

            const itemLists = [...abilities, ...aspects, ...equipment];
            itemLists.forEach((item: any) => {
                const itemSystem = item?.system ?? {};
                const fields = buildExportEntry({
                    localizationId: itemSystem.localizationId ?? item?.localizationId,
                    name: item?.name,
                    description: itemSystem.description,
                    category: itemSystem.category,
                });
                if (fields) Object.assign(payload[packId], fields);
            });

            resources.forEach((resource: any) => {
                const fields = buildExportEntry({
                    localizationId: resource?.localizationId,
                    name: resource?.title ?? resource?.name,
                    description: resource?.description,
                });
                if (fields) Object.assign(payload[packId], fields);
            });

            saves.forEach((save: any) => {
                const fields = buildExportEntry({
                    localizationId: save?.localizationId,
                    name: save?.title ?? save?.name,
                    description: save?.description,
                });
                if (fields) Object.assign(payload[packId], fields);
            });
        }
    }

    return payload;
};

const downloadExport = async () => {
    const payload = await collectCompendiumLocalization();
    const entries = Object.entries(payload).filter(([, map]) => Object.keys(map).length > 0);
    if (!entries.length) return 0;

    const saveData = (foundry as any)?.utils?.saveDataToFile;
    let count = 0;
    for (const [packId, map] of entries) {
        const filename = `${packId}.json`;
        const json = JSON.stringify(map, null, 2);
        if (typeof saveData === "function") {
            saveData(json, "application/json", filename);
            count += 1;
            continue;
        }
        const blob = new Blob([json], { type: "application/json" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
        URL.revokeObjectURL(link.href);
        count += 1;
    }
    return count;
};

export function registerCompendiumExportTool() {
    Hooks.on("renderCompendiumDirectory", (_app: any, html: any) => {
        try {
            const root = html?.[0] as HTMLElement | undefined;
            if (!root || root.querySelector(".ezd6-compendium-export")) return;
            const button = document.createElement("button");
            button.type = "button";
            button.className = "ezd6-compendium-export";
            button.innerHTML = `<i class="fas fa-language"></i> Export Localization`;
            button.addEventListener("click", async () => {
                try {
                    const count = await downloadExport();
                    if (count > 0) {
                        ui?.notifications?.info?.(`Compendium localization exports saved (${count}).`);
                    } else {
                        ui?.notifications?.warn?.("No compendium localization data to export.");
                    }
                } catch {
                    ui?.notifications?.error?.("Failed to export compendium localization.");
                }
            });

            const header = root.querySelector(".directory-header") as HTMLElement | null;
            if (header) {
                header.appendChild(button);
                return;
            }
            root.prepend(button);
        } catch {
            // ignore compendium export failures
        }
    });
}
