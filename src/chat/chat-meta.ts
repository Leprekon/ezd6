export const EZD6_META_FLAG = "ezd6Meta";

export type EzD6ChatMetaType = "roll" | "info";
export type EzD6ChatMetaKind = "resource" | "save" | "equipment" | "generic";

export type EzD6ChatMeta = {
    type: EzD6ChatMetaType;
    title: string;
    description: string;
    tag: string;
    icon: string;
    kind: EzD6ChatMetaKind;
    resourceValue?: number;
    resourceMax?: number;
    resourceIcon?: string;
    saveTarget?: number;
    equipmentQty?: number;
};

export function isEzD6ChatMeta(raw: any): raw is EzD6ChatMeta {
    if (!raw || typeof raw !== "object") return false;
    if (raw.type !== "roll" && raw.type !== "info") return false;
    return typeof raw.title === "string";
}

const normalizeString = (value: any): string => (typeof value === "string" ? value.trim() : "");

export function buildRollMeta(data: Partial<EzD6ChatMeta> & { title: string }): EzD6ChatMeta {
    return {
        type: "roll",
        title: normalizeString(data.title) || "Roll",
        description: normalizeString(data.description),
        tag: normalizeString(data.tag),
        icon: normalizeString(data.icon),
        kind: data.kind ?? "generic",
        resourceValue: Number.isFinite(data.resourceValue) ? Number(data.resourceValue) : undefined,
        resourceMax: Number.isFinite(data.resourceMax) ? Number(data.resourceMax) : undefined,
        resourceIcon: normalizeString(data.resourceIcon) || undefined,
        saveTarget: Number.isFinite(data.saveTarget) ? Number(data.saveTarget) : undefined,
        equipmentQty: Number.isFinite(data.equipmentQty) ? Number(data.equipmentQty) : undefined,
    };
}

export function buildInfoMeta(data: Partial<EzD6ChatMeta> & { title: string }): EzD6ChatMeta {
    return {
        type: "info",
        title: normalizeString(data.title) || "Info",
        description: normalizeString(data.description),
        tag: normalizeString(data.tag),
        icon: normalizeString(data.icon),
        kind: data.kind ?? "generic",
        resourceValue: Number.isFinite(data.resourceValue) ? Number(data.resourceValue) : undefined,
        resourceMax: Number.isFinite(data.resourceMax) ? Number(data.resourceMax) : undefined,
        resourceIcon: normalizeString(data.resourceIcon) || undefined,
        saveTarget: Number.isFinite(data.saveTarget) ? Number(data.saveTarget) : undefined,
        equipmentQty: Number.isFinite(data.equipmentQty) ? Number(data.equipmentQty) : undefined,
    };
}
