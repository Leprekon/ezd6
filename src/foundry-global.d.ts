// src/foundry-globals.d.ts

// Provide minimal typing for Foundry globals so TS compiles
declare const Hooks: import("@league-of-foundry-developers/foundry-vtt-types").Hooks;
declare const game: import("@league-of-foundry-developers/foundry-vtt-types").Game;
declare const ui: import("@league-of-foundry-developers/foundry-vtt-types").UI;
declare const canvas: import("@league-of-foundry-developers/foundry-vtt-types").Canvas;
declare const ChatMessage: import("@league-of-foundry-developers/foundry-vtt-types").ChatMessage;
declare const ChatMessageRenderOptions: import("@league-of-foundry-developers/foundry-vtt-types").ChatMessageRenderOptions;
declare const Roll: import("@league-of-foundry-developers/foundry-vtt-types").Roll;
declare const Actors: any;
declare const ActorSheet: any;
declare const FilePicker: any;

// V12+ uses namespaced Dice terms
declare const foundry: {
    dice: {
        terms: {
            Die: typeof import("@league-of-foundry-developers/foundry-vtt-types").Die;
            FudgeDie: any; // optional if you use fudge dice
            // ...add other dice terms if needed
        };
    };
    utils?: {
        mergeObject?: (original: any, other: any, options?: any) => any;
    };
};
