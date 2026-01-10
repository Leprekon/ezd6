// src/aspect-item-sheet.ts
import { buildAbilityLikeSheetOptions, EZD6AbilityLikeItemSheet } from "./ability-like-item-sheet";

export class EZD6AspectItemSheet extends EZD6AbilityLikeItemSheet {
    static get defaultOptions() {
        return buildAbilityLikeSheetOptions(super.defaultOptions, "ezd6-item-sheet--aspect");
    }

    protected getItemLabel(): string {
        return "Aspect";
    }

    protected getSheetClass(): string {
        return "ezd6-item-sheet--aspect";
    }

    protected getDefaultIcon(): string {
        return "icons/environment/people/group.webp";
    }
}
