import { localize } from "./i18n";
import { getTagOptions, normalizeTag } from "./sheet-utils";

export function buildArchetypeEntryFromItem(item: any): Record<string, any> | null {
    const data = typeof item?.toObject === "function" ? item.toObject() : item;
    const type = data?.type ?? item?.type;
    if (type !== "ability" && type !== "aspect" && type !== "equipment") return null;
    return {
        name: data?.name ?? item?.name,
        type,
        img: data?.img ?? item?.img,
        system: data?.system ?? item?.system ?? {},
    };
}

export function buildResourceFromItem(item: any): Record<string, any> {
    const system = item?.system ?? {};
    const rawValue = Number(system.value ?? system.defaultValue ?? 1);
    const value = Number.isFinite(rawValue) ? Math.max(0, Math.floor(rawValue)) : 1;
    const rawMax = Number(system.maxValue ?? system.defaultMaxValue ?? 0);
    const maxValue = Number.isFinite(rawMax) ? Math.max(0, Math.floor(rawMax)) : 0;
    const description = typeof system.description === "string" ? system.description : "";
    const rawDice = Number(system.numberOfDice ?? 0);
    const numberOfDice = Number.isFinite(rawDice) ? Math.max(0, Math.min(3, Math.floor(rawDice))) : 0;
    const rollKeyword = typeof system.tag === "string" ? system.tag : "default";
    const replenishLogic = system.replenishLogic === "reset" || system.replenishLogic === "restore"
        ? system.replenishLogic
        : "disabled";
    const rawReplenishTag = typeof system.replenishTag === "string" ? system.replenishTag : "";
    const replenishTag = rawReplenishTag.trim()
        ? normalizeTag(rawReplenishTag, getTagOptions())
        : "";
    const rawCost = Number(system.replenishCost ?? 1);
    const replenishCost = Number.isFinite(rawCost) ? Math.max(1, Math.min(100, Math.floor(rawCost))) : 1;
    return {
        title: item?.name ?? localize("EZD6.ItemLabels.Resource", "Resource"),
        icon: item?.img ?? undefined,
        localizationId: typeof system.localizationId === "string" ? system.localizationId.trim() : "",
        value,
        defaultValue: value,
        maxValue,
        description,
        numberOfDice,
        rollKeyword,
        replenishLogic,
        replenishTag,
        replenishCost,
        publicDisplay: Boolean(system.publicDisplay),
    };
}

export function buildSaveFromItem(item: any): Record<string, any> {
    const system = item?.system ?? {};
    const targetValue = Number(system.targetValue ?? 6);
    const numberOfDice = Number(system.numberOfDice ?? 1);
    const description = typeof system.description === "string" ? system.description : "";
    return {
        title: item?.name ?? localize("EZD6.ItemLabels.Save", "Save"),
        icon: item?.img ?? undefined,
        localizationId: typeof system.localizationId === "string" ? system.localizationId.trim() : "",
        targetValue: Number.isFinite(targetValue) ? Math.max(2, Math.floor(targetValue)) : 6,
        numberOfDice: Number.isFinite(numberOfDice) ? Math.max(1, Math.floor(numberOfDice)) : 1,
        description,
    };
}
