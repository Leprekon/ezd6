// src/equipment-item-sheet.ts
import { getTagOptionMap, getTagOptions, normalizeTag } from "./ui/sheet-utils";
import { localize } from "./ui/i18n";
import { applyNativeItemFields } from "./ui/item-editor-utils";
import { getSystemPath } from "./system-path";
import { EZD6ItemSheetV2 } from "./sheet/document-sheet-v2";
import { bindDicePicker, ensureDefaultItemPresentation } from "./ui/item-sheet-controls";

const DEFAULT_EQUIPMENT_ICON = "icons/containers/bags/coinpouch-simple-leather-tan.webp";

const coerceQuantity = (value: unknown) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(0, Math.floor(numeric));
};

export class EZD6EquipmentItemSheet extends EZD6ItemSheetV2 {
    static DEFAULT_OPTIONS = {
        classes: ["ezd6-item-sheet-wrapper", "ezd6-item-sheet--equipment", "theme-light"],
        position: { width: 480, height: 520 },
        window: { resizable: true },
        form: { submitOnChange: true, closeOnSubmit: false },
    };

    static PARTS = {
        sheet: { template: getSystemPath("templates/equipment-item-sheet.hbs"), root: true },
    };

    async _prepareContext(options: any) {
        const data = await super._prepareContext(options) as any;
        const system = data?.item?.system ?? {};
        const localizationId = typeof system.localizationId === "string" ? system.localizationId.trim() : "";
        data.tagOptions = getTagOptionMap();
        data.isGM = game?.user?.isGM ?? false;
        data.localizationId = localizationId;

        const label = localize("EZD6.ItemLabels.Equipment", "Equipment");
        const nameFallback = typeof data?.item?.name === "string" ? data.item.name : label;
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
        const label = localize("EZD6.ItemLabels.Equipment", "Equipment");
        void ensureDefaultItemPresentation(this.item, {
            label,
            icon: DEFAULT_EQUIPMENT_ICON,
            legacyNames: ["New Equipment"],
        });

        const system = (this.item as any)?.system ?? {};
        if (system.quantity == null && system.defaultQuantity != null) {
            const migrated = coerceQuantity(system.defaultQuantity);
            this.item.update({ "system.quantity": migrated }, { render: false });
        }

        bindDicePicker({ root, item: this.item, selector: ".ezd6-ability-dice-picker", min: 0, max: 5 });

        const picker = root?.querySelector?.(".ezd6-quantity-picker") as HTMLElement | null;
        const qtyField = root?.querySelector?.(".ezd6-item-field--quantity") as HTMLElement | null;
        const qtyToggle = root?.querySelector?.("input[name='system.quantifiable']") as HTMLInputElement | null;
        if (qtyToggle && qtyField) {
            const syncQtyVisibility = () => {
                qtyField.classList.toggle("is-hidden", !qtyToggle.checked);
            };
            syncQtyVisibility();
            qtyToggle.addEventListener("change", async () => {
                await this.item.update({ "system.quantifiable": qtyToggle.checked }, { render: false });
                syncQtyVisibility();
            });
        }

        if (picker) {
            const syncPicker = (value?: number) => {
                const next = typeof value === "number"
                    ? value
                    : coerceQuantity(
                        (this.item as any)?.system?.quantity ?? (this.item as any)?.system?.defaultQuantity ?? picker.dataset.count ?? 0
                    );
                picker.dataset.count = String(next);

                const input = picker.querySelector(".ezd6-quantity-input") as HTMLInputElement | null;
                if (input) input.value = String(next);

                const decBtn = picker.querySelector(".ezd6-qty-btn[data-delta='-1']") as HTMLButtonElement | null;
                if (decBtn) decBtn.disabled = next <= 0;
            };

            syncPicker();

            picker.addEventListener("click", async (event: Event) => {
                const target = event.target as HTMLElement | null;
                const btn = target?.closest?.(".ezd6-qty-btn") as HTMLElement | null;
                if (!btn) return;
                event.preventDefault();

                const delta = Number(btn.dataset.delta) || 0;
                const current = coerceQuantity((this.item as any)?.system?.quantity ?? 0);
                const next = coerceQuantity(current + delta);
                if (next === current) return;

                await this.item.update({ "system.quantity": next }, { render: false });
                syncPicker(next);
            });

            const input = picker.querySelector(".ezd6-quantity-input") as HTMLInputElement | null;
            if (input) {
                const commit = async () => {
                    const next = coerceQuantity(input.value);
                    await this.item.update({ "system.quantity": next }, { render: false });
                    syncPicker(next);
                };
                input.addEventListener("change", commit);
                input.addEventListener("blur", commit);
            }
        }

    }

    _processFormData(event: Event, form: HTMLFormElement, formData: any) {
        const data = super._processFormData(event, form, formData) as any;
        if (data.system && "tag" in data.system) {
            data.system.tag = normalizeTag(data.system.tag, getTagOptions());
        }
        if (data.system && "quantity" in data.system) {
            data.system.quantity = coerceQuantity(data.system.quantity);
        }
        return data;
    }

}
