// src/resource-item-sheet.ts
import { getTagOptionMap, getTagOptions, normalizeTag } from "./ui/sheet-utils";
import { localize } from "./ui/i18n";
import { applyNativeItemFields } from "./ui/item-editor-utils";
import { getSystemPath } from "./system-path";
import { EZD6ItemSheetV2 } from "./sheet/document-sheet-v2";
import { bindDicePicker, ensureDefaultItemPresentation } from "./ui/item-sheet-controls";

const DEFAULT_RESOURCE_ICON = "icons/svg/d20-black.svg";

export class EZD6ResourceItemSheet extends EZD6ItemSheetV2 {
    static DEFAULT_OPTIONS = {
        classes: ["ezd6-item-sheet-wrapper", "ezd6-item-sheet--resource", "theme-light"],
        position: { width: 420, height: 600 },
        window: { resizable: true },
        form: { submitOnChange: true, closeOnSubmit: false },
    };

    static PARTS = {
        sheet: { template: getSystemPath("templates/resource-item-sheet.hbs"), root: true },
    };

    async _prepareContext(options: any) {
        const data = await super._prepareContext(options) as any;
        const system = data?.item?.system ?? {};
        const rawLogic = typeof system.replenishLogic === "string" ? system.replenishLogic : "disabled";
        const logic = this.getReplenishLogic(rawLogic);
        const localizationId = typeof system.localizationId === "string" ? system.localizationId.trim() : "";
        data.tagOptions = getTagOptionMap();
        data.replenishLogicOptions = {
            disabled: localize("EZD6.Replenish.Disabled", "Disabled"),
            reset: localize("EZD6.Replenish.Reset", "Reset"),
            restore: localize("EZD6.Replenish.RestoreOne", "Restore 1"),
        };
        data.replenishEnabled = logic !== "disabled";
        data.isGM = game?.user?.isGM ?? false;
        data.localizationId = localizationId;

        const label = localize("EZD6.ItemLabels.Resource", "Resource");
        const nameFallback = typeof data?.item?.name === "string" ? data.item.name : label;
        const descFallback = typeof system.description === "string" ? system.description : "";
        applyNativeItemFields(data, {
            nameValue: nameFallback,
            descriptionValue: descFallback,
        });
        return data;
    }

    async _onRender(context: any, options: any) {
        await super._onRender(context, options);
        const root = this.element;
        const label = localize("EZD6.ItemLabels.Resource", "Resource");
        void ensureDefaultItemPresentation(this.item, {
            label,
            icon: DEFAULT_RESOURCE_ICON,
            legacyNames: ["New Resource"],
        });
        this.refreshPicker(root, "value");
        this.refreshPicker(root, "maxValue");
        bindDicePicker({ root, item: this.item, selector: ".ezd6-resource-dice-picker", min: 0, max: 3 });
        this.refreshReplenishCostPicker(root);
        this.toggleReplenishFields(root);

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

            await this.item.update({ [`system.${key}`]: next }, { render: false });
            this.refreshPicker(root, key, next);
        });

        const logicSelect = root?.querySelector?.("select[name='system.replenishLogic']") as HTMLSelectElement | null;
        if (logicSelect) {
            logicSelect.addEventListener("change", () => {
                this.toggleReplenishFields(root);
            });
        }

        const replenishPicker = root?.querySelector?.(".ezd6-replenish-cost-picker") as HTMLElement | null;
        if (!replenishPicker) return;
        replenishPicker.addEventListener("click", async (event: Event) => {
            const target = event.target as HTMLElement | null;
            const btn = target?.closest?.(".ezd6-qty-btn") as HTMLElement | null;
            if (!btn) return;
            event.preventDefault();

            const delta = Number(btn.dataset.delta) || 0;
            const current = this.getReplenishCost();
            const next = this.clampReplenishCost(current + delta);
            if (next === current) return;

            await this.item.update({ "system.replenishCost": next }, { render: false });
            this.refreshReplenishCostPicker(root, next);
        });

        const replenishInput = replenishPicker.querySelector("input[name='system.replenishCost']") as HTMLInputElement | null;
        if (replenishInput) {
            const commitCost = async () => {
                const raw = Number(replenishInput.value);
                const next = this.clampReplenishCost(Number.isFinite(raw) ? raw : 1);
                if (String(next) === replenishInput.value) return;
                replenishInput.value = String(next);
                await this.item.update({ "system.replenishCost": next }, { render: false });
                this.refreshReplenishCostPicker(root, next);
            };
            replenishInput.addEventListener("blur", () => {
                void commitCost();
            });
            replenishInput.addEventListener("change", () => {
                void commitCost();
            });
        }
    }

    _processFormData(event: Event, form: HTMLFormElement, formData: any) {
        const data = super._processFormData(event, form, formData) as any;
        const system = data.system ??= {};
        if ("tag" in system) {
            system.tag = normalizeTag(system.tag, getTagOptions());
        }
        if ("replenishTag" in system) {
            const rawReplenish = String(system.replenishTag ?? "");
            system.replenishTag = rawReplenish.trim()
                ? normalizeTag(rawReplenish, getTagOptions())
                : "";
        }
        if ("replenishLogic" in system) {
            system.replenishLogic = this.getReplenishLogic(String(system.replenishLogic ?? "disabled"));
        }
        if ("replenishCost" in system) {
            const rawCost = Number(system.replenishCost);
            system.replenishCost = this.clampReplenishCost(
                Number.isFinite(rawCost) ? rawCost : 1
            );
        }
        system.value = this.clampValue(Number(system.value), 1);
        system.maxValue = this.clampValue(Number(system.maxValue), 0);
        const rawDice = Number(system.numberOfDice);
        if (Number.isFinite(rawDice)) {
            system.numberOfDice = Math.max(0, Math.min(3, Math.floor(rawDice)));
        }
        return data;
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

    private getReplenishLogic(raw: string): "disabled" | "reset" | "restore" {
        if (raw === "reset" || raw === "restore") return raw;
        return "disabled";
    }

    private getReplenishCost(): number {
        const raw = Number((this.item as any)?.system?.replenishCost ?? 1);
        return this.clampReplenishCost(Number.isFinite(raw) ? raw : 1);
    }

    private clampReplenishCost(value: number): number {
        const numeric = Math.floor(value);
        if (!Number.isFinite(numeric)) return 1;
        return Math.max(1, Math.min(100, numeric));
    }

    private toggleReplenishFields(root: HTMLElement) {
        const logicSelect = root?.querySelector?.("select[name='system.replenishLogic']") as HTMLSelectElement | null;
        const logic = this.getReplenishLogic(String(logicSelect?.value ?? "disabled"));
        const enabled = logic !== "disabled";
        root.querySelectorAll(".ezd6-item-field--replenish").forEach((field) => {
            field.classList.toggle("is-hidden", !enabled);
        });
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

    private refreshReplenishCostPicker(root: HTMLElement, value?: number) {
        const picker = root?.querySelector?.(".ezd6-replenish-cost-picker") as HTMLElement | null;
        if (!picker) return;
        const current = typeof value === "number"
            ? value
            : this.getReplenishCost();
        const clamped = this.clampReplenishCost(current);
        picker.dataset.count = String(clamped);

        const input = picker.querySelector("input[name='system.replenishCost']") as HTMLInputElement | null;
        if (input) input.value = String(clamped);

        const decBtn = picker.querySelector(".ezd6-qty-btn[data-delta='-1']") as HTMLButtonElement | null;
        const incBtn = picker.querySelector(".ezd6-qty-btn[data-delta='1']") as HTMLButtonElement | null;
        if (decBtn) decBtn.disabled = clamped <= 1;
        if (incBtn) incBtn.disabled = clamped >= 100;
    }

}
