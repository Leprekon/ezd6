// src/index.ts
import { registerChatMessageHooks } from "./chat-message";
import { EZD6CharacterSheet } from "./actor-sheet";
export { Character, CharacterSheetView, Ability, Resource, Save, DiceChangeBehavior } from "./character";

registerChatMessageHooks();

Hooks.once("init", () => {
    Actors.registerSheet("ezd6-new", EZD6CharacterSheet, {
        types: ["character"],
        makeDefault: true,
    });
});
