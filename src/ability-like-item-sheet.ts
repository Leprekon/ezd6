// src/ability-like-item-sheet.ts
import { getTagOptionMap, getTagOptions, normalizeTag } from "./ui/sheet-utils";
import { format, localize } from "./ui/i18n";
import { applyNativeItemFields } from "./ui/item-editor-utils";
import { getSystemPath } from "./system-path";
import { EZD6ItemSheetV2 } from "./sheet/document-sheet-v2";
import { bindDicePicker, ensureDefaultItemPresentation } from "./ui/item-sheet-controls";

export abstract class EZD6AbilityLikeItemSheet extends EZD6ItemSheetV2 {
    protected abstract getItemLabel(): string;
    protected abstract getSheetClass(): string;
    protected abstract getDefaultIcon(): string;

    static DEFAULT_OPTIONS: any = {
        classes: ["ezd6-item-sheet-wrapper", "theme-light"],
        position: { width: 480, height: 520 },
        window: { resizable: true },
        form: { submitOnChange: true, closeOnSubmit: false },
    };

    static PARTS = {
        sheet: { template: getSystemPath("templates/ability-item-sheet.hbs"), root: true },
    };

    async _prepareContext(options: any) {
        const data = await super._prepareContext(options) as any;
        const itemLabel = localize(this.getItemLabel(), this.getItemLabel());
        const itemLabelLower = itemLabel.toLowerCase();
        const system = data?.item?.system ?? {};
        const localizationId = typeof system.localizationId === "string" ? system.localizationId.trim() : "";
        data.tagOptions = getTagOptionMap();
        data.itemLabel = itemLabel;
        data.itemLabelLower = itemLabelLower;
        data.itemTitlePlaceholder = format(
            "EZD6.Placeholders.ItemTitle",
            { itemLabel },
            `${itemLabel} title`
        );
        data.itemDescriptionPlaceholder = format(
            "EZD6.Placeholders.ItemDescription",
            { itemLabelLower },
            `Describe the ${itemLabelLower}`
        );
        data.sheetClass = this.getSheetClass();
        data.isGM = game?.user?.isGM ?? false;
        data.localizationId = localizationId;

        const nameFallback = typeof data?.item?.name === "string" ? data.item.name : itemLabel;
        const descFallback = typeof system.description === "string" ? system.description : "";
        const categoryFallback = typeof system.category === "string" ? system.category : "";
        applyNativeItemFields(data, {
            nameValue: nameFallback,
            descriptionValue: descFallback,
            categoryValue: categoryFallback,
        });
        return data;
    }

    async _onRender(context: any, options: any) {
        await super._onRender(context, options);
        const root = this.element;
        const label = localize(this.getItemLabel(), this.getItemLabel());
        void ensureDefaultItemPresentation(this.item, {
            label,
            icon: this.getDefaultIcon(),
            legacyNames: ["New Ability", "New Aspect"],
        });
        bindDicePicker({ root, item: this.item, selector: ".ezd6-ability-dice-picker", min: 0, max: 5 });
    }

    _processFormData(event: Event, form: HTMLFormElement, formData: any) {
        const data = super._processFormData(event, form, formData) as any;
        if (data.system && "tag" in data.system) {
            data.system.tag = normalizeTag(data.system.tag, getTagOptions());
        }
        return data;
    }

}
