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
            height: 380,
            minWidth: 420,
            maxWidth: 620,
            minHeight: 300,
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
        this.refreshPicker(root, "value");
        this.refreshPicker(root, "maxValue");

        const sheet = root as HTMLElement | null;
        if (!sheet) return;
        sheet.addEventListener("click", async (event: Event) => {
            const target = event.target as HTMLElement | null;
            const btn = target?.closest?.(".ezd6-qty-btn") as HTMLElement | null;
            if (!btn) return;
            const picker = target?.closest?.(".ezd6-resource-value-picker, .ezd6-resource-max-picker") as HTMLElement | null;
            if (!picker) return;
            event.preventDefault();

            const delta = Number(btn.dataset.delta) || 0;
            const key = picker.dataset.key === "maxValue" ? "maxValue" : "value";
            const fallback = key === "value" ? 1 : 0;
            const current = this.getSystemNumber(key, fallback);
            const next = this.clampValue(current + delta, fallback);
            if (next === current) return;

            const formData = this._getSubmitData?.() ?? {};
            formData[`system.${key}`] = next;
            await this.item.update(formData);
            this.refreshPicker(root, key, next);
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
        formData["system.value"] = this.clampValue(rawValue, 1);
        const rawMaxValue = Number(formData["system.maxValue"]);
        formData["system.maxValue"] = this.clampValue(rawMaxValue, 0);
        await this.item.update(formData);
    }

    private clampValue(value: number, fallback: number): number {
        const numeric = Math.floor(value);
        if (!Number.isFinite(numeric)) return fallback;
        return Math.max(0, Math.min(100, numeric));
    }

    private getSystemNumber(key: "value" | "maxValue", fallback: number): number {
        const raw = (this.item as any)?.system?.[key];
        const numeric = Number(raw);
        return Number.isFinite(numeric) ? numeric : fallback;
    }

    private refreshPicker(root: HTMLElement, key: "value" | "maxValue", value?: number) {
        const selector = key === "value" ? ".ezd6-resource-value-picker" : ".ezd6-resource-max-picker";
        const picker = root?.querySelector?.(selector) as HTMLElement | null;
        if (!picker) return;
        const fallback = key === "value" ? 1 : 0;
        const current = typeof value === "number"
            ? value
            : this.getSystemNumber(key, fallback);
        const clamped = this.clampValue(current, fallback);
        picker.dataset.count = String(clamped);

        const input = root?.querySelector?.(`input[name='system.${key}']`) as HTMLInputElement | null;
        if (input) input.value = String(clamped);

        const decBtn = picker.querySelector(".ezd6-qty-btn[data-delta='-1']") as HTMLButtonElement | null;
        const incBtn = picker.querySelector(".ezd6-qty-btn[data-delta='1']") as HTMLButtonElement | null;
        if (decBtn) decBtn.disabled = clamped <= 0;
        if (incBtn) incBtn.disabled = clamped >= 100;

        const display = picker.querySelector(".ezd6-resource-value-display") as HTMLElement | null;
        if (!display) return;
        display.innerHTML = "";
        const iconPath = (this.item as any)?.img ?? "";
        if (clamped <= 0) {
            const dash = document.createElement("span");
            dash.className = "ezd6-ability-dice-empty";
            dash.textContent = "-";
            display.appendChild(dash);
            return;
        }
        const showIcons = clamped <= 5;
        const faded = key === "maxValue";
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
                if (faded) img.classList.add("ezd6-resource-value-icon--faded");
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
            if (faded) img.classList.add("ezd6-resource-value-icon--faded");
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
