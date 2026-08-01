import { format, localize } from "./i18n";
import { getSystemPath } from "../system-path";

const LEGACY_DEFAULT_ICON = "icons/svg/item-bag.svg";

export function clampInteger(value: unknown, min: number, max: number, fallback = min): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(numeric)));
}

type DefaultPresentationOptions = {
    label: string;
    icon: string;
    legacyNames?: string[];
};

export async function ensureDefaultItemPresentation(item: any, {
    label,
    icon,
    legacyNames = [],
}: DefaultPresentationOptions) {
    const currentName = String(item?.name ?? "").trim();
    const placeholderNames = new Set([
        "",
        localize("EZD6.Defaults.NewItem", "New Item"),
        format("EZD6.Defaults.NewItemTyped", { itemLabel: label }, `New ${label}`),
        "New Item",
        `New ${label}`,
        ...legacyNames,
    ]);
    const currentIcon = String(item?.img ?? "");
    const updates: Record<string, any> = {};
    if (placeholderNames.has(currentName)) updates.name = label;
    if (!currentIcon || currentIcon === LEGACY_DEFAULT_ICON) updates.img = icon;
    if (Object.keys(updates).length) await item.update(updates);
}

type DicePickerOptions = {
    root: HTMLElement;
    item: any;
    selector: string;
    min: number;
    max: number;
    value?: number;
};

export function refreshDicePicker({
    root,
    item,
    selector,
    min,
    max,
    value,
}: DicePickerOptions): number | null {
    const picker = root?.querySelector?.(selector) as HTMLElement | null;
    if (!picker) return null;
    const current = value ?? item?.system?.numberOfDice ?? picker.dataset.count ?? min;
    const clamped = clampInteger(current, min, max, min);
    picker.dataset.count = String(clamped);

    const stack = picker.querySelector(".ezd6-ability-dice-stack") as HTMLElement | null;
    if (stack) {
        stack.replaceChildren();
        if (clamped <= 0) {
            const dash = document.createElement("span");
            dash.className = "ezd6-ability-dice-empty";
            dash.textContent = "-";
            stack.appendChild(dash);
        } else {
            for (let i = 0; i < clamped; i++) {
                const image = document.createElement("img");
                image.className = "ezd6-ability-dice-icon";
                image.src = getSystemPath("assets/dice/grey/d6-6.png");
                image.alt = "d6";
                stack.appendChild(image);
            }
        }
    }

    const input = root.querySelector("input[name='system.numberOfDice']") as HTMLInputElement | null;
    if (input) input.value = String(clamped);

    const decrease = picker.querySelector(".ezd6-ability-dice-btn[data-delta='-1']") as HTMLButtonElement | null;
    const increase = picker.querySelector(".ezd6-ability-dice-btn[data-delta='1']") as HTMLButtonElement | null;
    if (decrease) decrease.disabled = clamped <= min;
    if (increase) increase.disabled = clamped >= max;
    return clamped;
}

export function bindDicePicker(options: Omit<DicePickerOptions, "value">) {
    const { root, item, selector, min, max } = options;
    refreshDicePicker(options);
    const picker = root?.querySelector?.(selector) as HTMLElement | null;
    if (!picker) return;

    picker.addEventListener("click", async (event: Event) => {
        const target = event.target as HTMLElement | null;
        const button = target?.closest?.(".ezd6-ability-dice-btn") as HTMLElement | null;
        if (!button) return;
        event.preventDefault();

        const delta = Number(button.dataset.delta) || 0;
        const current = clampInteger(item?.system?.numberOfDice, min, max, min);
        const next = clampInteger(current + delta, min, max, min);
        if (next === current) return;

        await item.update({ "system.numberOfDice": next }, { render: false });
        refreshDicePicker({ ...options, value: next });
    });
}
