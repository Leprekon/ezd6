// src/ability-like-item-sheet.ts
import { clampDimension, getTagOptionMap, getTagOptions, normalizeTag } from "./ui/sheet-utils";

const LEGACY_DEFAULT_ICON = "icons/svg/item-bag.svg";

export const buildAbilityLikeSheetOptions = (baseOptions: Record<string, any>, sheetClass: string) =>
    foundry.utils.mergeObject(baseOptions, {
        classes: ["ezd6-item-sheet", sheetClass],
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

export abstract class EZD6AbilityLikeItemSheet extends ItemSheet {
    protected abstract getItemLabel(): string;
    protected abstract getSheetClass(): string;
    protected abstract getDefaultIcon(): string;

    get template() {
        return "systems/ezd6-new/templates/ability-item-sheet.hbs";
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
        const itemLabel = this.getItemLabel();
        const itemLabelLower = itemLabel.toLowerCase();
        data.tagOptions = getTagOptionMap();
        data.itemLabel = itemLabel;
        data.itemLabelLower = itemLabelLower;
        data.itemTitlePlaceholder = `${itemLabel} title`;
        data.itemDescriptionPlaceholder = `Describe the ${itemLabelLower}`;
        data.sheetClass = this.getSheetClass();
        return data;
    }

    activateListeners(html: any) {
        super.activateListeners(html);
        const root = html[0] ?? html;
        void this.ensureDefaultName();
        void this.ensureDefaultIcon();
        this.refreshDicePicker(root);

        const picker = root?.querySelector?.(".ezd6-ability-dice-picker") as HTMLElement | null;
        if (!picker) return;
        picker.addEventListener("click", async (event: Event) => {
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
        await this.item.update(formData, { render: false });
    }

    private async ensureDefaultName() {
        const label = this.getItemLabel();
        const current = (this.item?.name ?? "").trim();
        const shouldSetDefault = !current
            || current === "New Item"
            || current === `New ${label}`
            || current === "New Ability"
            || current === "New Aspect";
        if (shouldSetDefault) {
            await this.item.update({ name: label });
        }
    }

    private async ensureDefaultIcon() {
        const current = this.item?.img ?? "";
        if (!current || current === LEGACY_DEFAULT_ICON) {
            await this.item.update({ img: this.getDefaultIcon() });
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
