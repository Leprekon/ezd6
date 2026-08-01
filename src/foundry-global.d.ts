// src/foundry-globals.d.ts

// Provide minimal typing for Foundry globals so TS compiles
declare const Hooks: import("@league-of-foundry-developers/foundry-vtt-types").Hooks;
declare const game: import("@league-of-foundry-developers/foundry-vtt-types").Game;
declare const ui: import("@league-of-foundry-developers/foundry-vtt-types").UI;
declare const canvas: import("@league-of-foundry-developers/foundry-vtt-types").Canvas;
// Namespaced API used by Foundry v14.
declare const foundry: {
    dice: {
        terms: {
            Die: typeof import("@league-of-foundry-developers/foundry-vtt-types").Die;
            FudgeDie: any;
        };
    };
};
