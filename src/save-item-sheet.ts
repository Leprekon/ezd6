// src/save-item-sheet.ts
import { localize } from "./ui/i18n";
import { applyNativeItemFields } from "./ui/item-editor-utils";
import { getSystemPath } from "./system-path";
import { EZD6ItemSheetV2 } from "./sheet/document-sheet-v2";
import { bindDicePicker, ensureDefaultItemPresentation } from "./ui/item-sheet-controls";

const DEFAULT_SAVE_ICON = "icons/equipment/shield/heater-steel-worn.webp";

export class EZD6SaveItemSheet extends EZD6ItemSheetV2 {
    static DEFAULT_OPTIONS = {
        classes: ["ezd6-item-sheet-wrapper", "ezd6-item-sheet--save", "theme-light"],
        position: { width: 460, height: 420 },
        window: { resizable: true },
        form: { submitOnChange: true, closeOnSubmit: false },
    };

    static PARTS = {
        sheet: { template: getSystemPath("templates/save-item-sheet.hbs"), root: true },
    };

    async _onRender(context: any, options: any) {
        await super._onRender(context, options);
        const root = this.element;
        const label = localize("EZD6.ItemLabels.Save", "Save");
        void ensureDefaultItemPresentation(this.item, {
            label,
            icon: DEFAULT_SAVE_ICON,
            legacyNames: ["New Save"],
        });
        bindDicePicker({ root, item: this.item, selector: ".ezd6-ability-dice-picker", min: 1, max: 6 });
        this.refreshTargetPicker(root);

        const targetPicker = root?.querySelector?.(".ezd6-save-target-picker") as HTMLElement | null;
        if (!targetPicker) return;
        targetPicker.addEventListener("click", async (event: Event) => {
            const target = event.target as HTMLElement | null;
            const btn = target?.closest?.(".ezd6-qty-btn") as HTMLElement | null;
            if (!btn) return;
            event.preventDefault();

            const delta = Number(btn.dataset.delta) || 0;
            const current = Number((this.item as any)?.system?.targetValue ?? 6) || 6;
            const next = this.clampTarget(current + delta);
            if (next === current) return;

            await this.item.update({ "system.targetValue": next }, { render: false });
            this.refreshTargetPicker(root, next);
        });

    }

    _processFormData(event: Event, form: HTMLFormElement, formData: any) {
        const data = super._processFormData(event, form, formData) as any;
        const system = data.system ??= {};
        const rawTarget = Number(system.targetValue);
        const clampedTarget = Number.isFinite(rawTarget)
            ? this.clampTarget(rawTarget)
            : this.clampTarget(1);
        system.targetValue = clampedTarget;

        const rawDice = Number(system.numberOfDice);
        if (Number.isFinite(rawDice)) {
            system.numberOfDice = Math.max(1, Math.min(6, Math.floor(rawDice)));
        }
        return data;
    }

    async _prepareContext(options: any) {
        const data = await super._prepareContext(options) as any;
        const system = data?.item?.system ?? {};
        const localizationId = typeof system.localizationId === "string" ? system.localizationId.trim() : "";
        data.isGM = game?.user?.isGM ?? false;
        data.localizationId = localizationId;

        const label = localize("EZD6.ItemLabels.Save", "Save");
        const nameFallback = typeof data?.item?.name === "string" ? data.item.name : label;
        const descFallback = typeof system.description === "string" ? system.description : "";
        applyNativeItemFields(data, {
            nameValue: nameFallback,
            descriptionValue: descFallback,
        });
        return data;
    }

    private refreshTargetPicker(root: HTMLElement, value?: number) {
        const picker = root?.querySelector?.(".ezd6-save-target-picker") as HTMLElement | null;
        if (!picker) return;
        const current = typeof value === "number"
            ? value
            : Number((this.item as any)?.system?.targetValue ?? picker.dataset.count ?? 6) || 6;
        const clamped = this.clampTarget(current);
        picker.dataset.count = String(clamped);

        const display = picker.querySelector("[data-role='target-display']") as HTMLElement | null;
        if (display) display.textContent = this.formatTargetLabel(clamped);

        const input = picker.querySelector("input[name='system.targetValue']") as HTMLInputElement | null;
        if (input) input.value = String(clamped);

        const decBtn = picker.querySelector(".ezd6-qty-btn[data-delta='-1']") as HTMLButtonElement | null;
        const incBtn = picker.querySelector(".ezd6-qty-btn[data-delta='1']") as HTMLButtonElement | null;
        if (decBtn) decBtn.disabled = clamped <= 1;
        if (incBtn) incBtn.disabled = clamped >= 7;
    }

    private clampTarget(value: number): number {
        const numeric = Math.floor(value);
        if (!Number.isFinite(numeric)) return 1;
        return Math.max(1, Math.min(7, numeric));
    }

    private formatTargetLabel(value: number): string {
        if (value >= 7) return "Magick";
        return String(value);
    }

}
