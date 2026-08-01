import {
    cloneSource,
    getEmbeddedSources,
    replaceEmbeddedDocuments,
} from "./embedded-document-utils";

export const LEGACY_ITEM_CATEGORIES: Record<string, string> = {
    heropath: "EZD6.Category.HeroPath",
    boon: "EZD6.Category.Boons",
    inclination: "EZD6.Category.Inclinations",
    species: "EZD6.Category.Species",
    feature: "EZD6.Category.PathFeatures",
};

const DND_ITEM_TARGET_TYPES: Record<string, "ability" | "equipment"> = {
    weapon: "equipment",
    equipment: "equipment",
    consumable: "equipment",
    loot: "equipment",
    tool: "equipment",
    backpack: "equipment",
    armor: "equipment",
    container: "equipment",
    feat: "ability",
    spell: "ability",
    class: "ability",
    subclass: "ability",
    race: "ability",
    background: "ability",
};

export const LEGACY_MIGRATION_FLAG_SCOPE = "ezd6-reforged";
export const LEGACY_MIGRATION_FLAG = "legacyItemType";

function toFiniteNumber(value: unknown, fallback: number): number {
    const numeric = typeof value === "number" ? value : Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}

function buildAbilityUpdate(source: any) {
    const system = source?.system ?? {};
    return {
        _id: source._id,
        type: "ability",
        system: {
            ...system,
            localizationId: typeof system.localizationId === "string" ? system.localizationId : "",
            description: typeof system.description === "string" ? system.description : "",
            numberOfDice: Math.max(0, Math.min(5, Math.trunc(toFiniteNumber(system.numberOfDice, 0)))),
            tag: typeof system.tag === "string" && system.tag.trim() ? system.tag : "#task",
            category: typeof system.category === "string" && system.category.trim()
                ? system.category
                : LEGACY_ITEM_CATEGORIES[source.type],
        },
    };
}

function isDndItemSource(source: any): boolean {
    if (!(source?.type in DND_ITEM_TARGET_TYPES)) return false;
    if (source.type !== "equipment") return true;

    const system = source?.system ?? {};
    return typeof system.description === "object"
        || "activation" in system
        || "equipped" in system
        || "attunement" in system
        || "rarity" in system;
}

function extractDndDescription(system: any): string {
    if (typeof system?.description === "string") return system.description;
    if (typeof system?.description?.value === "string") return system.description.value;
    if (typeof system?.description?.chat === "string") return system.description.chat;
    return "";
}

function buildDndItemSystem(source: any) {
    const originalSystem = source?.system ?? {};
    const originalType = String(source?.type ?? "item");
    const common = {
        localizationId: "",
        description: extractDndDescription(originalSystem),
        numberOfDice: 0,
        tag: "#task",
        category: `D&D ${originalType.charAt(0).toUpperCase()}${originalType.slice(1)}`,
    };

    if (DND_ITEM_TARGET_TYPES[originalType] === "equipment") {
        const quantity = Math.max(0, Math.trunc(toFiniteNumber(originalSystem.quantity, 1)));
        return {
            ...common,
            quantifiable: originalType === "consumable" || originalType === "loot" || quantity !== 1,
            quantity,
        };
    }
    return common;
}

export function isLegacyItemSource(source: any): boolean {
    return source?.type in LEGACY_ITEM_CATEGORIES || isDndItemSource(source);
}

export function convertLegacyItemSource(source: any) {
    if (isDndItemSource(source)) {
        const targetType = DND_ITEM_TARGET_TYPES[source.type];
        source.system = buildDndItemSystem(source);
        source.type = targetType;
        return source;
    }

    const update = buildAbilityUpdate(source);
    source.type = update.type;
    source.system = update.system;
    return source;
}

function getMigratedLegacyType(source: any): string | null {
    const value = source?.flags?.[LEGACY_MIGRATION_FLAG_SCOPE]?.[LEGACY_MIGRATION_FLAG];
    return typeof value === "string"
        && (value in LEGACY_ITEM_CATEGORIES || value in DND_ITEM_TARGET_TYPES)
        ? value
        : null;
}

function clearMigrationFlag(source: any) {
    const scope = source?.flags?.[LEGACY_MIGRATION_FLAG_SCOPE];
    if (!scope) return source;
    delete scope[LEGACY_MIGRATION_FLAG];
    if (!Object.keys(scope).length) delete source.flags[LEGACY_MIGRATION_FLAG_SCOPE];
    return source;
}

function buildCurrentItemUpdate(source: any): Record<string, any> | null {
    const system = source?.system ?? {};
    if (!["ability", "aspect", "equipment"].includes(source?.type)) return null;
    const update: Record<string, any> = { _id: source._id };
    const systemUpdate: Record<string, any> = {};

    if (typeof system.numberOfDice !== "number") {
        systemUpdate.numberOfDice = Math.max(0, Math.min(5, Math.trunc(toFiniteNumber(system.numberOfDice, 0))));
    }
    if (source.type === "equipment") {
        if (system.quantity != null && typeof system.quantity !== "number") {
            systemUpdate.quantity = Math.max(0, Math.trunc(toFiniteNumber(system.quantity, 1)));
        }
        if (system.quantifiable != null && typeof system.quantifiable !== "boolean") {
            systemUpdate.quantifiable = system.quantifiable === true || system.quantifiable === "true";
        }
    }
    if (!Object.keys(systemUpdate).length) return null;
    update.system = systemUpdate;
    return update;
}

async function migrateEmbeddedItems(actor: any): Promise<number> {
    const rawItems = getEmbeddedSources(actor, "items");
    const legacyItems = rawItems.filter(isLegacyItemSource);
    const loadMigratedItems = rawItems.filter((item: any) => getMigratedLegacyType(item) != null);
    const legacyCreates = legacyItems.map((sourceItem: any) => {
        const item = cloneSource(sourceItem);
        return convertLegacyItemSource(item);
    }).concat(loadMigratedItems.map((sourceItem: any) => {
        return clearMigrationFlag(cloneSource(sourceItem));
    }));
    const currentUpdates = rawItems
        .filter((item: any) => !isLegacyItemSource(item) && getMigratedLegacyType(item) == null)
        .map(buildCurrentItemUpdate)
        .filter((update): update is Record<string, any> => update != null);

    if (legacyCreates.length) {
        await replaceEmbeddedDocuments({
            parent: actor,
            documentName: "Item",
            documentClass: CONFIG.Item.documentClass,
            replacements: legacyCreates,
        });
    }

    if (currentUpdates.length) await actor.updateEmbeddedDocuments("Item", currentUpdates);
    return legacyCreates.length + currentUpdates.length;
}

export function registerLegacyItemTypeMigration() {
    Hooks.once("ready", async () => {
        if (!game?.user?.isGM) return;
        let migrated = 0;
        for (const actor of game.actors ?? []) {
            try {
                migrated += await migrateEmbeddedItems(actor);
            } catch (error) {
                console.error(`EZD6 | Legacy item migration failed for Actor [${actor.id}] ${actor.name}`, error);
            }
        }

        // Unlinked scene tokens store their own ActorDelta Item collections.
        // Materialize only tokens which actually contain a migrated source so
        // large worlds do not pay the cost for every placed token.
        for (const scene of game.scenes ?? []) {
            for (const token of scene.tokens ?? []) {
                if (token.actorLink) continue;
                const deltaSources = token?.delta?.items?._source ?? token?._source?.delta?.items;
                const rawDeltaItems = deltaSources ? Array.from(deltaSources as Iterable<any>) : [];
                if (!rawDeltaItems.some((item: any) => isLegacyItemSource(item) || getMigratedLegacyType(item))) continue;
                try {
                    if (token.actor) migrated += await migrateEmbeddedItems(token.actor);
                } catch (error) {
                    console.error(
                        `EZD6 | Legacy item migration failed for Token [${scene.id}.${token.id}] ${token.name}`,
                        error,
                    );
                }
            }
        }
        if (migrated) console.info(`EZD6 | Migrated ${migrated} legacy embedded items to current EZD6 types.`);
    });
}
