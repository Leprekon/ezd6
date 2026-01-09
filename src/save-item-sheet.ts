// src/save-item-sheet.ts
import { clampDimension } from "./ui/sheet-utils";

const DEFAULT_SAVE_ICON = "icons/svg/shield.svg";
const LEGACY_DEFAULT_ICON = "icons/svg/item-bag.svg";

export class EZD6SaveItemSheet extends ItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["ezd6-item-sheet", "ezd6-item-sheet--save"],
            width: 460,
            height: 420,
            minWidth: 460,
            maxWidth: 660,
            minHeight: 340,
            maxHeight: 560,
            resizable: true,
            submitOnChange: true,
            submitOnClose: true,
        });
    }

    get template() {
        return "systems/ezd6-new/templates/save-item-sheet.hbs";
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

    activateListeners(html: any) {
        super.activateListeners(html);
        const root = html[0] ?? html;
        void this.ensureDefaultName();
        void this.ensureDefaultIcon();
        this.refreshDicePicker(root);
        this.refreshTargetPicker(root);

        const picker = root?.querySelector?.(".ezd6-ability-dice-picker") as HTMLElement | null;
        if (!picker) return;
        picker.addEventListener("click", async (event: Event) => {
            const target = event.target as HTMLElement | null;
            const btn = target?.closest?.(".ezd6-ability-dice-btn") as HTMLElement | null;
            if (!btn) return;
            event.preventDefault();

            const delta = Number(btn.dataset.delta) || 0;
            const current = Number((this.item as any)?.system?.numberOfDice ?? 1) || 1;
            const next = Math.min(6, Math.max(1, current + delta));
            if (next === current) return;

            const formData = this._getSubmitData?.() ?? {};
            formData["system.numberOfDice"] = next;
            await this.item.update(formData);
            this.refreshDicePicker(root, next);
        });

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

            const formData = this._getSubmitData?.() ?? {};
            formData["system.targetValue"] = next;
            await this.item.update(formData);
            this.refreshTargetPicker(root, next);
        });

        const targetInput = targetPicker.querySelector("input[name='system.targetValue']") as HTMLInputElement | null;
        if (targetInput) {
            const commitTarget = async () => {
                const raw = Number(targetInput.value);
                const next = this.clampTarget(Number.isFinite(raw) ? raw : 2);
                if (String(next) === targetInput.value) return;
                targetInput.value = String(next);
                const formData = this._getSubmitData?.() ?? {};
                formData["system.targetValue"] = next;
                await this.item.update(formData);
                this.refreshTargetPicker(root, next);
            };
            targetInput.addEventListener("blur", () => {
                void commitTarget();
            });
            targetInput.addEventListener("change", () => {
                void commitTarget();
            });
        }
    }

    protected async _updateObject(_event: Event, formData: Record<string, any>) {
        const rawTarget = Number(formData["system.targetValue"]);
        const clampedTarget = Number.isFinite(rawTarget)
            ? this.clampTarget(rawTarget)
            : this.clampTarget(2);
        formData["system.targetValue"] = clampedTarget;

        const rawDice = Number(formData["system.numberOfDice"]);
        if (Number.isFinite(rawDice)) {
            formData["system.numberOfDice"] = Math.max(1, Math.min(6, Math.floor(rawDice)));
        }

        await this.item.update(formData);
    }

    private refreshDicePicker(root: HTMLElement, count?: number) {
        const picker = root?.querySelector?.(".ezd6-ability-dice-picker") as HTMLElement | null;
        if (!picker) return;
        const value = typeof count === "number"
            ? count
            : Number((this.item as any)?.system?.numberOfDice ?? picker.dataset.count ?? 1) || 1;
        const clamped = Math.max(1, Math.min(6, Math.floor(value)));
        picker.dataset.count = String(clamped);

        const stack = picker.querySelector(".ezd6-ability-dice-stack") as HTMLElement | null;
        if (stack) {
            stack.innerHTML = "";
            if (clamped <= 0) {
                const dash = document.createElement("span");
                dash.className = "ezd6-ability-dice-empty";
                dash.textContent = "-";
                stack.appendChild(dash);
            } else {
                for (let i = 0; i < clamped; i++) {
                    const img = document.createElement("img");
                    img.className = "ezd6-ability-dice-icon";
                    img.src = "systems/ezd6-new/assets/dice/grey/d6-6.png";
                    img.alt = "d6";
                    stack.appendChild(img);
                }
            }
        }

        const input = root?.querySelector?.("input[name='system.numberOfDice']") as HTMLInputElement | null;
        if (input) input.value = String(clamped);

        const decBtn = picker.querySelector(".ezd6-ability-dice-btn[data-delta='-1']") as HTMLButtonElement | null;
        const incBtn = picker.querySelector(".ezd6-ability-dice-btn[data-delta='1']") as HTMLButtonElement | null;
        if (decBtn) decBtn.disabled = clamped <= 1;
        if (incBtn) incBtn.disabled = clamped >= 6;
    }

    private refreshTargetPicker(root: HTMLElement, value?: number) {
        const picker = root?.querySelector?.(".ezd6-save-target-picker") as HTMLElement | null;
        if (!picker) return;
        const current = typeof value === "number"
            ? value
            : Number((this.item as any)?.system?.targetValue ?? picker.dataset.count ?? 6) || 6;
        const clamped = this.clampTarget(current);
        picker.dataset.count = String(clamped);

        const input = picker.querySelector("input[name='system.targetValue']") as HTMLInputElement | null;
        if (input) input.value = String(clamped);

        const decBtn = picker.querySelector(".ezd6-qty-btn[data-delta='-1']") as HTMLButtonElement | null;
        const incBtn = picker.querySelector(".ezd6-qty-btn[data-delta='1']") as HTMLButtonElement | null;
        if (decBtn) decBtn.disabled = clamped <= 2;
        if (incBtn) incBtn.disabled = clamped >= 6;
    }

    private clampTarget(value: number): number {
        const numeric = Math.floor(value);
        if (!Number.isFinite(numeric)) return 2;
        return Math.max(2, Math.min(6, numeric));
    }

    private async ensureDefaultName() {
        const current = this.item?.name ?? "";
        if (!current || current === "New Item" || current === "New Save") {
            await this.item.update({ name: "Save" });
        }
    }

    private async ensureDefaultIcon() {
        const current = this.item?.img ?? "";
        if (!current || current === LEGACY_DEFAULT_ICON) {
            await this.item.update({ img: DEFAULT_SAVE_ICON });
        }
    }
}
