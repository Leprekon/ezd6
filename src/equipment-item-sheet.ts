// src/equipment-item-sheet.ts
import { clampDimension, getTagOptionMap, getTagOptions, normalizeTag } from "./ui/sheet-utils";

const DEFAULT_EQUIPMENT_ICON = "icons/containers/bags/coinpouch-simple-leather-tan.webp";
const LEGACY_DEFAULT_ICON = "icons/svg/item-bag.svg";

const coerceQuantity = (value: unknown) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(0, Math.floor(numeric));
};

export class EZD6EquipmentItemSheet extends ItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["ezd6-item-sheet", "ezd6-item-sheet--equipment"],
            width: 460,
            height: 520,
            minWidth: 480,
            maxWidth: 660,
            minHeight: 420,
            maxHeight: 760,
            resizable: true,
            submitOnChange: true,
            submitOnClose: true,
        });
    }

    get template() {
        return "systems/ezd6-new/templates/equipment-item-sheet.hbs";
    }

    setPosition(position: any = {}) {
        const minWidth = this.options.minWidth as number | undefined;
        const maxWidth = this.options.maxWidth as number | undefined;
        const minHeight = this.options.minHeight as number | undefined;
        const maxHeight = this.options.maxHeight as number | undefined;
        const width = Number.isFinite(position.width) ? position.width : this.position?.width;
        const height = Number.isFinite(position.height) ? position.height : this.position?.height;

        return super.setPosition({
            ...position,
            width: Number.isFinite(width) ? clampDimension(width, minWidth, maxWidth) : width,
            height: Number.isFinite(height) ? clampDimension(height, minHeight, maxHeight) : height,
        });
    }

    getData(options?: any) {
        const data = super.getData(options) as any;
        data.tagOptions = getTagOptionMap();
        return data;
    }

    activateListeners(html: any) {
        super.activateListeners(html);
        const root = html[0] ?? html;
        void this.ensureDefaultName();
        void this.ensureDefaultIcon();

        const system = (this.item as any)?.system ?? {};
        if (system.quantity == null && system.defaultQuantity != null) {
            const migrated = coerceQuantity(system.defaultQuantity);
            this.item.update({ "system.quantity": migrated }, { render: false });
        }

        this.refreshDicePicker(root);

        const picker = root?.querySelector?.(".ezd6-quantity-picker") as HTMLElement | null;
        const qtyField = root?.querySelector?.(".ezd6-item-field--quantity") as HTMLElement | null;
        const qtyToggle = root?.querySelector?.("input[name='system.quantifiable']") as HTMLInputElement | null;
        if (qtyToggle && qtyField) {
            const syncQtyVisibility = () => {
                qtyField.classList.toggle("is-hidden", !qtyToggle.checked);
            };
            syncQtyVisibility();
            qtyToggle.addEventListener("change", async () => {
                const formData = this._getSubmitData?.() ?? {};
                formData["system.quantifiable"] = qtyToggle.checked;
                await this.item.update(formData, { render: false });
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

                const formData = this._getSubmitData?.() ?? {};
                formData["system.quantity"] = next;
                await this.item.update(formData, { render: false });
                syncPicker(next);
            });

            const input = picker.querySelector(".ezd6-quantity-input") as HTMLInputElement | null;
            if (input) {
                const commit = async () => {
                    const next = coerceQuantity(input.value);
                    const formData = this._getSubmitData?.() ?? {};
                    formData["system.quantity"] = next;
                    await this.item.update(formData, { render: false });
                    syncPicker(next);
                };
                input.addEventListener("change", commit);
                input.addEventListener("blur", commit);
            }
        }

        const dicePicker = root?.querySelector?.(".ezd6-ability-dice-picker") as HTMLElement | null;
        if (!dicePicker) return;
        dicePicker.addEventListener("click", async (event: Event) => {
            const target = event.target as HTMLElement | null;
            const btn = target?.closest?.(".ezd6-ability-dice-btn") as HTMLElement | null;
            if (!btn) return;
            event.preventDefault();

            const delta = Number(btn.dataset.delta) || 0;
            const current = Number((this.item as any)?.system?.numberOfDice ?? 0) || 0;
            const next = Math.min(5, Math.max(0, current + delta));
            if (next === current) return;

            const formData = this._getSubmitData?.() ?? {};
            formData["system.numberOfDice"] = next;
            await this.item.update(formData, { render: false });
            this.refreshDicePicker(root, next);
        });
    }

    protected async _updateObject(_event: Event, formData: Record<string, any>) {
        if ("system.tag" in formData) {
            formData["system.tag"] = normalizeTag(formData["system.tag"], getTagOptions());
        }
        if ("system.quantity" in formData) {
            formData["system.quantity"] = coerceQuantity(formData["system.quantity"]);
        }

        await this.item.update(formData, { render: false });
    }

    private async ensureDefaultName() {
        const current = this.item?.name ?? "";
        if (!current || current === "New Item" || current === "New Equipment") {
            await this.item.update({ name: "Equipment" });
        }
    }

    private async ensureDefaultIcon() {
        const current = this.item?.img ?? "";
        if (!current || current === LEGACY_DEFAULT_ICON) {
            await this.item.update({ img: DEFAULT_EQUIPMENT_ICON });
        }
    }

    private refreshDicePicker(root: HTMLElement, count?: number) {
        const picker = root?.querySelector?.(".ezd6-ability-dice-picker") as HTMLElement | null;
        if (!picker) return;
        const value = typeof count === "number"
            ? count
            : Number((this.item as any)?.system?.numberOfDice ?? picker.dataset.count ?? 0) || 0;
        picker.dataset.count = String(value);

        const stack = picker.querySelector(".ezd6-ability-dice-stack") as HTMLElement | null;
        if (stack) {
            stack.innerHTML = "";
            if (value <= 0) {
                const dash = document.createElement("span");
                dash.className = "ezd6-ability-dice-empty";
                dash.textContent = "-";
                stack.appendChild(dash);
            } else {
                for (let i = 0; i < value; i++) {
                    const img = document.createElement("img");
                    img.className = "ezd6-ability-dice-icon";
                    img.src = "systems/ezd6-new/assets/dice/grey/d6-6.png";
                    img.alt = "d6";
                    stack.appendChild(img);
                }
            }
        }

        const input = root?.querySelector?.("input[name='system.numberOfDice']") as HTMLInputElement | null;
        if (input) input.value = String(value);

        const decBtn = picker.querySelector(".ezd6-ability-dice-btn[data-delta='-1']") as HTMLButtonElement | null;
        const incBtn = picker.querySelector(".ezd6-ability-dice-btn[data-delta='1']") as HTMLButtonElement | null;
        if (decBtn) decBtn.disabled = value <= 0;
        if (incBtn) incBtn.disabled = value >= 5;
    }
}
