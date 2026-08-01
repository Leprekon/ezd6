// src/aspect-item-sheet.ts
import { EZD6AbilityLikeItemSheet } from "./ability-like-item-sheet";

export class EZD6AspectItemSheet extends EZD6AbilityLikeItemSheet {
    static DEFAULT_OPTIONS: any = { classes: ["ezd6-item-sheet--aspect", "theme-light"] };

    protected getItemLabel(): string {
        return "EZD6.ItemLabels.Aspect";
    }

    protected getSheetClass(): string {
        return "ezd6-item-sheet--aspect";
    }

    protected getDefaultIcon(): string {
        return "icons/environment/people/group.webp";
    }
}
