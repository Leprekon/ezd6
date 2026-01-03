// src/ability-item-sheet.ts
export class EZD6AbilityItemSheet extends ItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["ezd6-item-sheet", "ezd6-item-sheet--ability"],
            width: 460,
            height: 520,
            resizable: true,
            submitOnChange: true,
            submitOnClose: true,
        });
    }

    get template() {
        return "systems/ezd6-new/templates/ability-item-sheet.hbs";
    }

    getData(options?: any) {
        const data = super.getData(options) as any;
        const predefined = ["#task", "#default", "#attack", "#brutal", "#magick", "#miracle"];
        let custom: string[] = [];
        try {
            const stored = game?.settings?.get?.("ezd6-new", "customTags");
            if (Array.isArray(stored)) custom = stored.filter((tag) => typeof tag === "string");
        } catch {
            custom = [];
        }
        data.tagOptions = [...new Set([...predefined, ...custom])];
        return data;
    }

    activateListeners(html: any) {
        super.activateListeners(html);
        const root = html[0] ?? html;
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
            await this.item.update(formData);
            this.refreshDicePicker(root, next);
        });
    }

    protected async _updateObject(_event: Event, formData: Record<string, any>) {
        await this.item.update(formData);
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
