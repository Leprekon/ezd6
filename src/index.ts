// src/index.ts
import { registerChatMessageHooks, registerResourceChangeChatHooks } from "./chat";
import { EZD6CharacterSheet } from "./actor-sheet";
import { EZD6AbilityItemSheet } from "./ability-item-sheet";
import { EZD6AspectItemSheet } from "./aspect-item-sheet";
import { EZD6ArchetypeItemSheet } from "./archetype-item-sheet";
import { EZD6EquipmentItemSheet } from "./equipment-item-sheet";
import { EZD6ResourceItemSheet } from "./resource-item-sheet";
import { EZD6SaveItemSheet } from "./save-item-sheet";
import { DEFAULT_AVATAR } from "./character";
import { getTagOptions, normalizeTag } from "./ui/sheet-utils";
import { registerCompendiumLocalization } from "./ui/compendium-localization";
import { registerCompendiumExportTool } from "./ui/tools/compendium-export";
import { registerPlayerResourceDisplay } from "./ui/player-resources";
import { getSystemId } from "./system-path";
export { Character, Ability, Resource, Save, DiceChangeBehavior } from "./character";
export { CharacterSheetView } from "./character-sheet-view";

registerChatMessageHooks();
registerResourceChangeChatHooks();
registerCompendiumLocalization();
registerCompendiumExportTool();
registerPlayerResourceDisplay();

Hooks.on("preCreateActor", (document: any, data: any) => {
    if (document?.type !== "character") return;
    const img = data?.img ?? document?.img ?? "";
    const avatarUrl = data?.system?.avatarUrl ?? document?.system?.avatarUrl ?? "";
    const tokenSrc = data?.prototypeToken?.texture?.src ?? document?.prototypeToken?.texture?.src ?? "";
    const defaultActor = "icons/svg/mystery-man.svg";
    const updates: Record<string, any> = {};
    if (!img || img === defaultActor) updates.img = DEFAULT_AVATAR;
    if (!avatarUrl || avatarUrl === defaultActor) updates["system.avatarUrl"] = DEFAULT_AVATAR;
    if (!tokenSrc || tokenSrc === defaultActor) updates["prototypeToken.texture.src"] = DEFAULT_AVATAR;
    if (Object.keys(updates).length) {
        document.updateSource(updates);
    }
});

const normalizeTagValue = (value: unknown) => {
    if (value == null) return value;
    const raw = String(value).trim();
    if (!raw) return "";
    return normalizeTag(raw, getTagOptions());
};

const normalizeItemTagChanges = (changes: Record<string, any>) => {
    if (!changes) return;
    const hasDotTag = Object.prototype.hasOwnProperty.call(changes, "system.tag");
    const hasDotReplenish = Object.prototype.hasOwnProperty.call(changes, "system.replenishTag");
    if (hasDotTag) {
        changes["system.tag"] = normalizeTagValue(changes["system.tag"]);
    }
    if (hasDotReplenish) {
        changes["system.replenishTag"] = normalizeTagValue(changes["system.replenishTag"]);
    }

    if (changes.system?.tag != null) {
        changes.system.tag = normalizeTagValue(changes.system.tag);
    }
    if (changes.system?.replenishTag != null) {
        changes.system.replenishTag = normalizeTagValue(changes.system.replenishTag);
    }
};

Hooks.on("preCreateItem", (document: any, data: any) => {
    if (!document) return;
    if (!data?.system) return;
    const updates: Record<string, any> = {};
    if (data.system.tag != null) {
        updates["system.tag"] = normalizeTagValue(data.system.tag);
    }
    if (data.system.replenishTag != null) {
        updates["system.replenishTag"] = normalizeTagValue(data.system.replenishTag);
    }
    if (Object.keys(updates).length) {
        document.updateSource(updates);
    }
});

Hooks.on("preUpdateItem", (_document: any, changes: any) => {
    normalizeItemTagChanges(changes);
});

Hooks.once("init", () => {
    const systemId = getSystemId();
    Actors.registerSheet(systemId, EZD6CharacterSheet, {
        types: ["character"],
        makeDefault: true,
    });
    Items.registerSheet(systemId, EZD6AbilityItemSheet, {
        types: ["ability"],
        makeDefault: true,
    });
    Items.registerSheet(systemId, EZD6AspectItemSheet, {
        types: ["aspect"],
        makeDefault: true,
    });
    Items.registerSheet(systemId, EZD6EquipmentItemSheet, {
        types: ["equipment"],
        makeDefault: true,
    });
    Items.registerSheet(systemId, EZD6ResourceItemSheet, {
        types: ["resource"],
        makeDefault: true,
    });
    Items.registerSheet(systemId, EZD6SaveItemSheet, {
        types: ["save"],
        makeDefault: true,
    });
    Items.registerSheet(systemId, EZD6ArchetypeItemSheet, {
        types: ["archetype"],
        makeDefault: true,
    });
});
