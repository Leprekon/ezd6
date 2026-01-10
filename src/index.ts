// src/index.ts
import { registerChatMessageHooks, registerResourceChangeChatHooks } from "./chat";
import { EZD6CharacterSheet } from "./actor-sheet";
import { EZD6AbilityItemSheet } from "./ability-item-sheet";
import { EZD6EquipmentItemSheet } from "./equipment-item-sheet";
import { EZD6ResourceItemSheet } from "./resource-item-sheet";
import { EZD6SaveItemSheet } from "./save-item-sheet";
import { DEFAULT_AVATAR } from "./character";
export { Character, Ability, Resource, Save, DiceChangeBehavior } from "./character";
export { CharacterSheetView } from "./character-sheet-view";

registerChatMessageHooks();
registerResourceChangeChatHooks();

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

Hooks.once("init", () => {
    Actors.registerSheet("ezd6-new", EZD6CharacterSheet, {
        types: ["character"],
        makeDefault: true,
    });
    Items.registerSheet("ezd6-new", EZD6AbilityItemSheet, {
        types: ["ability"],
        makeDefault: true,
    });
    Items.registerSheet("ezd6-new", EZD6EquipmentItemSheet, {
        types: ["equipment"],
        makeDefault: true,
    });
    Items.registerSheet("ezd6-new", EZD6ResourceItemSheet, {
        types: ["resource"],
        makeDefault: true,
    });
    Items.registerSheet("ezd6-new", EZD6SaveItemSheet, {
        types: ["save"],
        makeDefault: true,
    });
});
