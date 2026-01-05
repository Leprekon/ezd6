// src/index.ts
import { registerChatMessageHooks } from "./chat-message";
import { EZD6CharacterSheet } from "./actor-sheet";
import { EZD6AbilityItemSheet } from "./ability-item-sheet";
import { EZD6EquipmentItemSheet } from "./equipment-item-sheet";
export { Character, CharacterSheetView, Ability, Resource, Save, DiceChangeBehavior } from "./character";

registerChatMessageHooks();

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
});
