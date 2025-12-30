// src/index.ts
import { registerChatMessageHooks } from "./chat-message";
export { Character, CharacterSheetView, Ability, Resource, Save, DiceChangeBehavior } from "./character";

registerChatMessageHooks();
