// src/character.ts
import { getDieImagePath } from "./ezd6-core";

export type DiceChangeBehavior = "none" | "karma" | "stress";

export interface Ability {
    id: string;
    title: string;
    description: string;
    category: string;
    numberOfDice: number;
    rollKeyword?: string;
}

export interface Resource {
    id: string;
    title: string;
    iconAvailable: string;
    iconSpent: string;
    usedForDiceBurn: boolean;
    diceChangeBehavior: DiceChangeBehavior;
    value: number;
    maxValue: number;
    defaultValue: number;
    defaultMaxValue: number;
}

export interface Save {
    id: string;
    title: string;
    targetValue: number;
    numberOfDice: number;
}

const DEFAULT_ABILITY_CATEGORIES = ["Inclinations", "Aspects", "Equipment"] as const;
const TASK_ROLLS = [
    {
        id: "double-bane",
        label: "Double bane",
        formula: "3d6kl",
        dice: ["red", "red", "grey"] as const,
    },
    {
        id: "single-bane",
        label: "Single bane",
        formula: "2d6kl",
        dice: ["red", "grey"] as const,
    },
    {
        id: "normal",
        label: "Normal roll",
        formula: "1d6",
        dice: ["grey"] as const,
    },
    {
        id: "single-boon",
        label: "Single boon",
        formula: "2d6kh",
        dice: ["grey", "green"] as const,
    },
    {
        id: "double-boon",
        label: "Double boon",
        formula: "3d6kh",
        dice: ["grey", "green", "green"] as const,
    },
] as const;

function createId(prefix: string): string {
    const random = Math.random().toString(36).slice(2, 8);
    return `${prefix}-${random}`;
}

function ensureKeyword(keyword?: string): string {
    if (!keyword) return "default";
    return keyword.trim() === "" ? "default" : keyword.trim();
}

function createElement<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    textContent?: string
): HTMLElementTagNameMap[K] {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (textContent) el.textContent = textContent;
    return el;
}

/**
 * Character data container. This class does not attempt to mirror Foundry's Actor API
 * but provides a convenient place for the character sheet and rollers to read/write
 * values in a predictable way.
 */
export class Character {
    avatarUrl: string | null = null;
    name = "";
    description = "";
    abilities: Ability[] = [];
    resources: Resource[] = [];
    saves: Save[] = [];

    private readonly categoryOrder = new Map<string, number>();
    private static _health = 3;

    constructor() {
        DEFAULT_ABILITY_CATEGORIES.forEach((cat, idx) => this.categoryOrder.set(cat, idx));
    }

    setAvatar(url: string, token?: any) {
        this.avatarUrl = url;
        const target = token?.document ?? token;
        target?.update?.({ img: url }).catch(() => {
            // ignore token update failures; users can retry later
        });
    }

    setName(value: string, token?: any) {
        this.name = value;
        const target = token?.document ?? token;
        target?.update?.({ name: value }).catch(() => undefined);
    }

    setDescription(value: string) {
        this.description = value;
    }

    addAbility(partial: Partial<Ability>): Ability {
        const ability: Ability = {
            id: partial.id ?? createId("abl"),
            title: partial.title ?? "New Ability",
            description: partial.description ?? "",
            category: partial.category ?? DEFAULT_ABILITY_CATEGORIES[0],
            numberOfDice: partial.numberOfDice ?? 0,
            rollKeyword: partial.rollKeyword ?? "default",
        };
        this.abilities.push(ability);
        if (!this.categoryOrder.has(ability.category)) {
            this.categoryOrder.set(ability.category, this.categoryOrder.size);
        }
        return ability;
    }

    addResource(partial: Partial<Resource>): Resource {
        const resource: Resource = {
            id: partial.id ?? createId("res"),
            title: partial.title ?? "Resource",
            iconAvailable: partial.iconAvailable ?? "systems/ezd6-new/assets/icons/resource-available.svg",
            iconSpent: partial.iconSpent ?? "systems/ezd6-new/assets/icons/resource-spent.svg",
            usedForDiceBurn: partial.usedForDiceBurn ?? false,
            diceChangeBehavior: partial.diceChangeBehavior ?? "none",
            value: partial.value ?? partial.defaultValue ?? 0,
            maxValue: partial.maxValue ?? partial.defaultMaxValue ?? 0,
            defaultValue: partial.defaultValue ?? 0,
            defaultMaxValue: partial.defaultMaxValue ?? 0,
        };
        this.resources.push(resource);
        return resource;
    }

    addSave(partial: Partial<Save>): Save {
        const save: Save = {
            id: partial.id ?? createId("sav"),
            title: partial.title ?? "New Save",
            targetValue: partial.targetValue ?? 0,
            numberOfDice: partial.numberOfDice ?? 2,
        };
        this.saves.push(save);
        return save;
    }

    /** Check if Burn 1 is allowed */
    static canBurnOne(): boolean {
        return Character._health > 0;
    }

    /** Consume one health (Burn 1) */
    static consumeHealth(): boolean {
        if (Character._health <= 0) return false;
        Character._health -= 1;
        console.log(`[EZD6] Burn 1 used. Remaining health: ${Character._health}`);
        return true;
    }

    /** For debugging / UI: get current health */
    static getHealth(): number {
        return Character._health;
    }

    /** Reset health for testing */
    static resetHealth(value: number = 3) {
        Character._health = value;
    }

    getAbilitiesByCategory(): [string, Ability[]][] {
        const grouped = new Map<string, Ability[]>();
        DEFAULT_ABILITY_CATEGORIES.forEach((cat) => grouped.set(cat, []));

        for (const ability of this.abilities) {
            const bucket = grouped.get(ability.category) ?? [];
            bucket.push(ability);
            grouped.set(ability.category, bucket);
        }

        const entries = Array.from(grouped.entries());
        return entries.sort((a, b) => (this.categoryOrder.get(a[0]) ?? 999) - (this.categoryOrder.get(b[0]) ?? 999));
    }

    adjustResource(resourceId: string, delta: number) {
        const res = this.resources.find((r) => r.id === resourceId);
        if (!res) return;
        const max = res.maxValue > 0 ? res.maxValue : Infinity;
        const next = Math.min(max, Math.max(0, res.value + delta));
        res.value = next;
    }

    updateResourceMax(resourceId: string, newMax: number) {
        const res = this.resources.find((r) => r.id === resourceId);
        if (!res) return;
        res.maxValue = Math.max(0, newMax);
        if (res.maxValue > 0 && res.value > res.maxValue) {
            res.value = res.maxValue;
        }
    }

    async rollAbility(abilityId: string) {
        const ability = this.abilities.find((a) => a.id === abilityId);
        if (!ability) return;

        if (ability.numberOfDice > 0) {
            const keyword = ensureKeyword(ability.rollKeyword ?? "default");
            const formula = `${ability.numberOfDice}d6`;
            const flavor = `${ability.title} #${keyword}`;
            const roll = new Roll(formula, {});
            await roll.roll({ async: true });
            await roll.toMessage({ flavor, speaker: ChatMessage.getSpeaker?.() });
        } else {
            const contentPieces = [
                `<strong>${ability.title}</strong>`,
                ability.description ? `<div>${ability.description}</div>` : "",
            ];
            await ChatMessage.create({ content: contentPieces.join(""), speaker: ChatMessage.getSpeaker?.() });
        }
    }

    async rollSave(saveId: string) {
        const save = this.saves.find((s) => s.id === saveId);
        if (!save) return;
        const roll = new Roll(`${save.numberOfDice}d6`, {});
        await roll.roll({ async: true });
        const flavor = `${save.title} #save (target ${save.targetValue})`;
        await roll.toMessage({ flavor, speaker: ChatMessage.getSpeaker?.() });
    }

    async rollTask(label: string, formula: string) {
        const roll = new Roll(formula, {});
        await roll.roll({ async: true });
        const flavor = `${label} #task`;
        await roll.toMessage({ flavor, speaker: ChatMessage.getSpeaker?.() });
    }
}

export class CharacterSheetView {
    constructor(
        private readonly character: Character,
        private readonly options: { onAvatarPick?: (path: string) => void; onNameCommit?: (name: string) => void } = {}
    ) {}

    render(container: HTMLElement) {
        container.innerHTML = "";
        container.classList.add("ezd6-sheet");

        const layout = createElement("div", "ezd6-sheet__layout");
        const left = createElement("div", "ezd6-sheet__col ezd6-sheet__col--left");
        const right = createElement("div", "ezd6-sheet__col ezd6-sheet__col--right");

        left.append(
            this.renderAvatarSection(),
            this.renderNameSection(),
            this.renderResourceSection(),
            this.renderSavesSection(),
        );
        right.append(this.renderTaskSection(), this.renderAbilitySections());

        layout.append(left, right);
        container.append(layout);
    }

    private renderAvatarSection(): HTMLElement {
        const avatarSection = createElement("div", "ezd6-section ezd6-section--avatar");
        avatarSection.appendChild(createElement("div", "ezd6-section__title", "Avatar"));
        const avatarWrapper = createElement("div", "ezd6-avatar");
        const avatar = createElement("img", "ezd6-avatar__img") as HTMLImageElement;
        const placeholder = "systems/ezd6-new/assets/avatars/placeholder.png";
        avatar.alt = "Avatar";
        avatar.src = this.character.avatarUrl ?? placeholder;
        if (this.character.avatarUrl) {
            avatarWrapper.classList.add("ezd6-avatar--has-image");
        } else {
            avatarWrapper.classList.add("ezd6-avatar--empty");
        }
        avatar.addEventListener("error", () => {
            if (avatar.src !== placeholder) avatar.src = placeholder;
            avatarWrapper.classList.remove("ezd6-avatar--has-image");
            avatarWrapper.classList.add("ezd6-avatar--empty");
        });
        avatarWrapper.appendChild(avatar);
        if (this.options.onAvatarPick) {
            avatarWrapper.classList.add("ezd6-avatar--clickable");
            avatarWrapper.title = "Click to change avatar";
            avatarWrapper.addEventListener("click", () => {
                const picker = new FilePicker({
                    type: "image",
                    current: this.character.avatarUrl ?? "",
                    callback: (path: string) => {
                        this.character.setAvatar(path, game?.canvas?.tokens?.controlled?.[0]);
                        this.options.onAvatarPick?.(path);
                        avatar.src = path;
                        avatarWrapper.classList.add("ezd6-avatar--has-image");
                        avatarWrapper.classList.remove("ezd6-avatar--empty");
                    },
                });
                picker.render(true);
            });
        }
        avatarSection.appendChild(avatarWrapper);
        return avatarSection;
    }

    private renderNameSection(): HTMLElement {
        const nameSection = createElement("div", "ezd6-section ezd6-section--name");
        nameSection.appendChild(createElement("div", "ezd6-section__title", "Name"));
        const nameInput = createElement("input", "ezd6-name-input") as HTMLInputElement;
        nameInput.placeholder = "Character Name";
        nameInput.value = this.character.name;
        const commit = () => {
            this.character.setName(nameInput.value, game?.canvas?.tokens?.controlled?.[0]);
            this.options.onNameCommit?.(nameInput.value);
        };
        nameInput.addEventListener("change", commit);
        nameInput.addEventListener("blur", commit);
        nameSection.appendChild(nameInput);
        return nameSection;
    }

    private renderAbilitySections(): HTMLElement {
        const wrapper = createElement("div", "ezd6-section ezd6-section--abilities");
        const title = createElement("div", "ezd6-section__title", "Abilities");
        wrapper.appendChild(title);

        for (const [category, abilities] of this.character.getAbilitiesByCategory()) {
            const block = createElement("div", "ezd6-ability-category");
            const header = createElement("div", "ezd6-ability-category__header");
            header.appendChild(createElement("span", "ezd6-ability-category__title", category));

            const addBtn = createElement("button", "ezd6-ghost-btn", "+");
            addBtn.addEventListener("click", () => {
                this.character.addAbility({ category });
                this.reRender(wrapper);
            });
            header.appendChild(addBtn);
            block.appendChild(header);

            const list = createElement("div", "ezd6-ability-list");
            abilities.forEach((ability) => list.appendChild(this.renderAbilityRow(ability)));
            block.appendChild(list);
            wrapper.appendChild(block);
        }

        return wrapper;
    }

    private renderTaskSection(): HTMLElement {
        const wrapper = createElement("div", "ezd6-section ezd6-section--tasks");
        wrapper.appendChild(createElement("div", "ezd6-section__title", "Task"));

        const buttons = createElement("div", "ezd6-task-buttons");
        TASK_ROLLS.forEach((task) => {
            const btn = createElement("button", "ezd6-task-btn");
            btn.type = "button";
            btn.title = `${task.label} (${task.formula})`;

            const diceRow = createElement("span", "ezd6-dice-stack");
            task.dice.forEach((kind) => {
                const dieImg = createElement("img", "ezd6-die-icon") as HTMLImageElement;
                dieImg.alt = `${kind} d6`;
                dieImg.src = getDieImagePath(6, kind);
                diceRow.appendChild(dieImg);
            });

            btn.append(diceRow);
            btn.addEventListener("click", () => this.character.rollTask(task.label, task.formula));
            buttons.appendChild(btn);
        });

        wrapper.appendChild(buttons);
        return wrapper;
    }

    private renderAbilityRow(ability: Ability): HTMLElement {
        const row = createElement("div", "ezd6-ability-row");
        row.appendChild(createElement("span", "ezd6-ability-row__title", ability.title));

        const actions = createElement("div", "ezd6-ability-row__actions");

        const toggleBtn = createElement("button", "ezd6-icon-btn ezd6-icon-btn--ghost", "👁");
        const detail = this.renderAbilityDetail(ability);
        toggleBtn.addEventListener("click", () => {
            detail.classList.toggle("is-open");
        });
        actions.appendChild(toggleBtn);

        const rollBtn = createElement("button", "ezd6-roll-btn");
        if (ability.numberOfDice > 0) {
            rollBtn.title = `Roll ${ability.numberOfDice}d6 ${ability.rollKeyword ?? ""}`.trim();
            const iconRow = createElement("div", "ezd6-dice-stack");
            for (let i = 0; i < ability.numberOfDice; i++) {
                const dieImg = createElement("img", "ezd6-die-icon") as HTMLImageElement;
                dieImg.src = getDieImagePath(6, "grey");
                iconRow.appendChild(dieImg);
            }
            rollBtn.appendChild(iconRow);
        } else {
            rollBtn.title = "Post to chat";
            rollBtn.textContent = "💬";
        }
        rollBtn.addEventListener("click", () => this.character.rollAbility(ability.id));
        actions.appendChild(rollBtn);

        row.appendChild(actions);
        row.appendChild(detail);
        return row;
    }

    private renderAbilityDetail(ability: Ability): HTMLElement {
        const detail = createElement("div", "ezd6-ability-detail");
        const desc = createElement("textarea", "ezd6-textarea") as HTMLTextAreaElement;
        desc.value = ability.description;
        desc.placeholder = "Describe the ability";
        desc.addEventListener("input", () => {
            ability.description = desc.value;
        });

        const meta = createElement("div", "ezd6-ability-meta");
        const diceInput = createElement("input", "ezd6-number-input") as HTMLInputElement;
        diceInput.type = "number";
        diceInput.min = "0";
        diceInput.value = ability.numberOfDice.toString();
        diceInput.addEventListener("change", () => {
            ability.numberOfDice = Math.max(0, Number(diceInput.value) || 0);
            this.reRender(detail.parentElement?.parentElement?.parentElement ?? detail);
        });

        const keywordSelect = createElement("input", "ezd6-text-input") as HTMLInputElement;
        keywordSelect.placeholder = "Roll keyword";
        keywordSelect.value = ability.rollKeyword ?? "";
        keywordSelect.addEventListener("input", () => {
            ability.rollKeyword = keywordSelect.value;
        });

        meta.appendChild(this.buildLabeledField("Dice", diceInput));
        meta.appendChild(this.buildLabeledField("Keyword", keywordSelect));
        detail.append(desc, meta);
        return detail;
    }

    private renderResourceSection(): HTMLElement {
        const wrapper = createElement("div", "ezd6-section ezd6-section--resources");
        wrapper.appendChild(createElement("div", "ezd6-section__title", "Resources"));

        const list = createElement("div", "ezd6-resource-list");
        this.character.resources.forEach((resource) => list.appendChild(this.renderResourceRow(resource)));
        wrapper.appendChild(list);
        return wrapper;
    }

    private renderResourceRow(resource: Resource): HTMLElement {
        const row = createElement("div", "ezd6-resource-row");
        row.appendChild(createElement("span", "ezd6-resource-row__title", resource.title));

        const counter = createElement("div", "ezd6-resource-counter");
        const maxVal = resource.maxValue > 0
            ? resource.maxValue
            : resource.value || resource.defaultMaxValue || resource.defaultValue;
        const iconsToShow = Math.max(0, maxVal);
        for (let i = 0; i < iconsToShow; i++) {
            const img = createElement("img", "ezd6-resource-icon") as HTMLImageElement;
            const spent = resource.maxValue > 0 ? i >= resource.value : false;
            img.src = spent ? resource.iconSpent : resource.iconAvailable;
            counter.appendChild(img);
        }

        const actions = createElement("div", "ezd6-resource-actions");
        const addBtn = createElement("button", "ezd6-icon-btn", "+");
        const subBtn = createElement("button", "ezd6-icon-btn", "-");
        addBtn.addEventListener("click", () => {
            this.character.adjustResource(resource.id, 1);
            this.reRender(row.parentElement ?? row);
        });
        subBtn.addEventListener("click", () => {
            this.character.adjustResource(resource.id, -1);
            this.reRender(row.parentElement ?? row);
        });

        const maxInput = createElement("input", "ezd6-number-input") as HTMLInputElement;
        maxInput.type = "number";
        maxInput.min = "0";
        maxInput.value = resource.maxValue.toString();
        maxInput.title = "Max value (0 disables cap)";
        maxInput.addEventListener("change", () => {
            this.character.updateResourceMax(resource.id, Number(maxInput.value) || 0);
            this.reRender(row.parentElement ?? row);
        });

        actions.append(subBtn, addBtn, this.buildLabeledField("Max", maxInput));
        row.append(counter, actions);
        return row;
    }

    private renderSavesSection(): HTMLElement {
        const wrapper = createElement("div", "ezd6-section ezd6-section--saves");
        wrapper.appendChild(createElement("div", "ezd6-section__title", "Saves"));
        const list = createElement("div", "ezd6-save-list");
        this.character.saves.forEach((save) => list.appendChild(this.renderSaveRow(save)));
        wrapper.appendChild(list);
        return wrapper;
    }

    private renderSaveRow(save: Save): HTMLElement {
        const row = createElement("div", "ezd6-save-row");
        row.appendChild(createElement("span", "ezd6-save-row__title", `${save.title} (Target ${save.targetValue})`));

        const rollBtn = createElement("button", "ezd6-roll-btn", "Roll #save");
        rollBtn.addEventListener("click", () => this.character.rollSave(save.id));
        row.appendChild(rollBtn);
        return row;
    }

    private buildLabeledField(label: string, field: HTMLElement): HTMLElement {
        const wrapper = createElement("label", "ezd6-labeled");
        wrapper.append(createElement("span", "ezd6-label", label), field);
        return wrapper;
    }

    private reRender(container: HTMLElement) {
        const root = container.closest(".ezd6-sheet") as HTMLElement | null;
        if (root) {
            this.render(root);
        }
    }
}
