// src/resource-item-sheet.ts
const clampDimension = (value: number, min?: number, max?: number) => {
    let next = value;
    if (Number.isFinite(min)) next = Math.max(min as number, next);
    if (Number.isFinite(max)) next = Math.min(max as number, next);
    return next;
};

export class EZD6ResourceItemSheet extends ItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["ezd6-item-sheet", "ezd6-item-sheet--resource"],
            width: 420,
            height: 320,
            minWidth: 420,
            maxWidth: 620,
            minHeight: 260,
            maxHeight: 520,
            resizable: true,
            submitOnChange: true,
            submitOnClose: true,
        });
    }

    get template() {
        return "systems/ezd6-new/templates/resource-item-sheet.hbs";
    }

    activateListeners(html: any) {
        super.activateListeners(html);
        const root = html[0] ?? html;
        void this.ensureDefaultName();
        this.refreshValuePicker(root);

        const picker = root?.querySelector?.(".ezd6-resource-value-picker") as HTMLElement | null;
        if (!picker) return;
        picker.addEventListener("click", async (event: Event) => {
            const target = event.target as HTMLElement | null;
            const btn = target?.closest?.(".ezd6-qty-btn") as HTMLElement | null;
            if (!btn) return;
            event.preventDefault();

            const delta = Number(btn.dataset.delta) || 0;
            const current = Number((this.item as any)?.system?.value ?? 1) || 1;
            const next = this.clampValue(current + delta);
            if (next === current) return;

            const formData = this._getSubmitData?.() ?? {};
            formData["system.value"] = next;
            await this.item.update(formData);
            this.refreshValuePicker(root, next);
        });
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

    protected async _updateObject(_event: Event, formData: Record<string, any>) {
        const rawValue = Number(formData["system.value"]);
        if (Number.isFinite(rawValue)) {
            formData["system.value"] = this.clampValue(rawValue);
        }
        await this.item.update(formData);
    }

    private clampValue(value: number): number {
        const numeric = Math.floor(value);
        if (!Number.isFinite(numeric)) return 1;
        return Math.max(1, Math.min(100, numeric));
    }

    private refreshValuePicker(root: HTMLElement, value?: number) {
        const picker = root?.querySelector?.(".ezd6-resource-value-picker") as HTMLElement | null;
        if (!picker) return;
        const current = typeof value === "number"
            ? value
            : Number((this.item as any)?.system?.value ?? picker.dataset.count ?? 1) || 1;
        const clamped = this.clampValue(current);
        picker.dataset.count = String(clamped);

        const input = root?.querySelector?.("input[name='system.value']") as HTMLInputElement | null;
        if (input) input.value = String(clamped);

        const decBtn = picker.querySelector(".ezd6-qty-btn[data-delta='-1']") as HTMLButtonElement | null;
        const incBtn = picker.querySelector(".ezd6-qty-btn[data-delta='1']") as HTMLButtonElement | null;
        if (decBtn) decBtn.disabled = clamped <= 1;
        if (incBtn) incBtn.disabled = clamped >= 100;

        const display = picker.querySelector(".ezd6-resource-value-display") as HTMLElement | null;
        if (!display) return;
        display.innerHTML = "";
        const iconPath = (this.item as any)?.img ?? "";
        const showIcons = clamped <= 5;
        if (!iconPath) {
            const label = document.createElement("strong");
            label.className = "ezd6-resource-value-number";
            label.textContent = String(clamped);
            display.appendChild(label);
            return;
        }

        if (showIcons) {
            for (let i = 0; i < clamped; i++) {
                const img = document.createElement("img");
                img.className = "ezd6-resource-value-icon";
                img.src = iconPath;
                img.alt = this.item?.name ?? "Resource icon";
                display.appendChild(img);
            }
        } else {
            const label = document.createElement("strong");
            label.className = "ezd6-resource-value-number";
            label.textContent = String(clamped);
            const img = document.createElement("img");
            img.className = "ezd6-resource-value-icon";
            img.src = iconPath;
            img.alt = this.item?.name ?? "Resource icon";
            display.append(label, img);
        }
    }

    private async ensureDefaultName() {
        const current = this.item?.name ?? "";
        if (!current || current === "New Item" || current === "New Resource") {
            await this.item.update({ name: "Resource" });
        }
    }
}
