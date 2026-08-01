// src/ability-item-sheet.ts
import { EZD6AbilityLikeItemSheet } from "./ability-like-item-sheet";

export class EZD6AbilityItemSheet extends EZD6AbilityLikeItemSheet {
    static DEFAULT_OPTIONS: any = { classes: ["ezd6-item-sheet--ability", "theme-light"] };

    protected getItemLabel(): string {
        return "EZD6.ItemLabels.Ability";
    }

    protected getSheetClass(): string {
        return "ezd6-item-sheet--ability";
    }

    protected getDefaultIcon(): string {
        return "icons/magic/symbols/cog-orange-red.webp";
    }
}
