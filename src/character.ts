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
const MAGICK_ROLLS = [
    {
        id: "magick-1",
        label: "1 die",
        dice: 1,
    },
    {
        id: "magick-2",
        label: "2 dice",
        dice: 2,
    },
    {
        id: "magick-3",
        label: "3 dice",
        dice: 3,
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
            await roll.evaluate();
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
        await roll.evaluate();
        const flavor = `${save.title} #save (target ${save.targetValue})`;
        await roll.toMessage({ flavor, speaker: ChatMessage.getSpeaker?.() });
    }

    async rollTask(label: string, formula: string) {
        const roll = new Roll(formula, {});
        await roll.evaluate();
        const flavor = `${label} #task`;
        await roll.toMessage({ flavor, speaker: ChatMessage.getSpeaker?.() });
    }

    async rollMagick(diceCount: number) {
        const roll = new Roll(`${diceCount}d6`, {});
        await roll.evaluate();
        const flavor = `Magick ${diceCount}d6 #magick`;
        await roll.toMessage({ flavor, speaker: ChatMessage.getSpeaker?.() });
    }
}

export class CharacterSheetView {
    private expandedAbilityId: string | null = null;

    constructor(
        private readonly character: Character,
        private readonly options: {
            onAvatarPick?: (path: string) => void;
            onNameCommit?: (name: string) => void;
            actor?: any;
        } = {}
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
        right.append(this.renderTaskSection(), this.renderMagickSection(), this.renderAbilitySections());

        layout.append(left, right);
        container.append(layout);
    }

    private renderAvatarSection(): HTMLElement {
        const { block, section } = this.buildSectionBlock("Avatar", "ezd6-section--avatar");
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
        section.appendChild(avatarWrapper);
        return block;
    }

    private renderNameSection(): HTMLElement {
        const { block, section } = this.buildSectionBlock("Name", "ezd6-section--name");
        const nameInput = createElement("input", "ezd6-name-input") as HTMLInputElement;
        nameInput.placeholder = "Character Name";
        nameInput.value = this.character.name;
        const commit = () => {
            const rawName = nameInput.value ?? "";
            const trimmed = rawName.trim();
            const fallback = this.character.name || "Unnamed";
            const nextName = trimmed ? trimmed : fallback;
            nameInput.value = nextName;
            this.character.setName(nextName, game?.canvas?.tokens?.controlled?.[0]);
            this.options.onNameCommit?.(nextName);
        };
        nameInput.addEventListener("change", commit);
        nameInput.addEventListener("blur", commit);
        section.appendChild(nameInput);
        return block;
    }

    private renderAbilitySections(): HTMLElement {
        const { block: sectionBlock, section } = this.buildSectionBlock("Abilities", "ezd6-section--abilities");
        const titleRow = createElement("div", "ezd6-section__title-row");
        const titleLabel = createElement("div", "ezd6-section__title", "Abilities");
        const addBtn = createElement("button", "ezd6-section__add-btn", "+") as HTMLButtonElement;
        addBtn.type = "button";
        addBtn.title = "Add ability";
        addBtn.addEventListener("click", async () => {
            await this.createAbilityItem();
            this.reRender(section);
        });
        titleRow.append(titleLabel, addBtn);
        const existingTitle = sectionBlock.querySelector(".ezd6-section__title");
        if (existingTitle) {
            existingTitle.replaceWith(titleRow);
        } else {
            sectionBlock.prepend(titleRow);
        }

        const list = createElement("div", "ezd6-ability-list");
        this.getAbilityItems().forEach((item) => list.appendChild(this.renderAbilityRow(item)));
        section.appendChild(list);

        return sectionBlock;
    }

    private renderTaskSection(): HTMLElement {
        const { block, section } = this.buildSectionBlock("Task", "ezd6-section--tasks");

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

        section.appendChild(buttons);
        return block;
    }

    private renderMagickSection(): HTMLElement {
        const { block, section } = this.buildSectionBlock("Magick", "ezd6-section--magick");

        const buttons = createElement("div", "ezd6-task-buttons");
        const placeholderDice = [3, 2];
        placeholderDice.forEach((count) => {
            const placeholder = createElement("button", "ezd6-task-btn ezd6-task-btn--placeholder");
            placeholder.type = "button";
            placeholder.tabIndex = -1;
            const diceRow = createElement("span", "ezd6-dice-stack");
            for (let i = 0; i < count; i++) {
                const dieImg = createElement("img", "ezd6-die-icon") as HTMLImageElement;
                dieImg.alt = "grey d6";
                dieImg.src = getDieImagePath(6, "grey");
                diceRow.appendChild(dieImg);
            }
            placeholder.append(diceRow);
            buttons.appendChild(placeholder);
        });
        MAGICK_ROLLS.forEach((magick) => {
            const btn = createElement("button", "ezd6-task-btn");
            btn.type = "button";
            btn.title = magick.label;

            const diceRow = createElement("span", "ezd6-dice-stack");
            for (let i = 0; i < magick.dice; i++) {
                const dieImg = createElement("img", "ezd6-die-icon") as HTMLImageElement;
                dieImg.alt = "white d6";
                dieImg.src = getDieImagePath(6, "grey");
                diceRow.appendChild(dieImg);
            }

            btn.append(diceRow);
            btn.addEventListener("click", () => this.character.rollMagick(magick.dice));
            buttons.appendChild(btn);
        });

        section.appendChild(buttons);
        return block;
    }

    private renderAbilityRow(item: any): HTMLElement {
        const system = item?.system ?? {};
        const numberOfDice = Math.max(0, Number(system.numberOfDice) || 0);
        const tag = typeof system.tag === "string"
            ? system.tag
            : typeof system.tag === "number"
                ? String(system.tag)
                : "";
        const description = typeof system.description === "string" ? system.description : "";
        const wrapper = createElement("div", "ezd6-ability-item");
        const row = createElement("div", "ezd6-ability-row");
        row.setAttribute("role", "button");
        row.tabIndex = 0;
        row.title = "Toggle details";

        const iconWrap = createElement("span", "ezd6-ability-icon");
        const icon = createElement("img", "ezd6-ability-icon__img") as HTMLImageElement;
        icon.src = item?.img || "icons/svg/item-bag.svg";
        icon.alt = item?.name ?? "Ability icon";
        iconWrap.appendChild(icon);

        const title = createElement("span", "ezd6-ability-row__title", item?.name ?? "Ability");
        row.append(iconWrap, title);

        if (numberOfDice > 0) {
            const rollBtn = createElement("button", "ezd6-task-btn ezd6-ability-roll-btn") as HTMLButtonElement;
            rollBtn.type = "button";
            rollBtn.title = `Roll ${numberOfDice}d6 ${this.normalizeAbilityTag(tag)}`.trim();
            const diceRow = createElement("span", "ezd6-dice-stack");
            for (let i = 0; i < numberOfDice; i++) {
                const kind = i === 0 ? "grey" : "green";
                const dieImg = createElement("img", "ezd6-die-icon") as HTMLImageElement;
                dieImg.alt = `${kind} d6`;
                dieImg.src = getDieImagePath(6, kind);
                diceRow.appendChild(dieImg);
            }
            rollBtn.append(diceRow);
            rollBtn.addEventListener("click", (event) => {
                event.stopPropagation();
                this.rollAbilityItem(item, numberOfDice, tag, description);
            });
            row.appendChild(rollBtn);
        }

        const detail = createElement("div", "ezd6-ability-detail");
        if (this.expandedAbilityId && item?.id === this.expandedAbilityId) {
            row.classList.add("is-open");
            detail.classList.add("is-open");
        }

        const detailMain = createElement("div", "ezd6-ability-detail__main");
        const detailHeader = createElement("div", "ezd6-ability-detail__header");
        detailHeader.appendChild(createElement("span", "ezd6-ability-detail__label", "Description"));

        const detailText = createElement("div", "ezd6-ability-detail__text");
        const trimmedDescription = description.trim();
        if (trimmedDescription) {
            detailText.innerHTML = trimmedDescription;
        } else {
            detailText.textContent = "No description.";
            detailText.classList.add("is-empty");
        }

        const detailMeta = createElement("div", "ezd6-ability-detail__meta");
        const messageBtn = createElement("button", "ezd6-ability-msg-btn") as HTMLButtonElement;
        messageBtn.type = "button";
        messageBtn.title = "Post ability to chat";
        messageBtn.appendChild(createElement("i", "fas fa-comment"));
        messageBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            this.postAbilityMessage(item, description);
        });
        detailMeta.appendChild(createElement("span", "ezd6-ability-tag", this.normalizeAbilityTag(tag)));

        const detailActions = createElement("div", "ezd6-ability-detail__actions");
        const editBtn = createElement("button", "ezd6-ability-edit-btn") as HTMLButtonElement;
        editBtn.type = "button";
        editBtn.title = "Edit ability";
        editBtn.appendChild(createElement("i", "fas fa-pen"));
        editBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            item?.sheet?.render?.(true);
        });

        const deleteBtn = createElement("button", "ezd6-ability-delete-btn") as HTMLButtonElement;
        deleteBtn.type = "button";
        deleteBtn.title = "Delete ability";
        deleteBtn.appendChild(createElement("i", "fas fa-trash"));
        deleteBtn.addEventListener("click", async (event) => {
            event.stopPropagation();
            await item?.delete?.();
            const list = wrapper.parentElement ?? wrapper;
            this.reRender(list);
        });

        detailActions.append(editBtn, deleteBtn);
        detailMain.append(detailHeader, detailText, detailMeta);

        const detailSide = createElement("div", "ezd6-ability-detail__side");
        detailSide.append(messageBtn, detailActions);

        const detailContent = createElement("div", "ezd6-ability-detail__content");
        detailContent.append(detailMain, detailSide);

        detail.append(detailContent);

        const toggleDetail = () => {
            const list = wrapper.closest(".ezd6-ability-list") as HTMLElement | null;
            if (list) {
                list.querySelectorAll(".ezd6-ability-detail.is-open").forEach((openDetail) => {
                    if (openDetail !== detail) openDetail.classList.remove("is-open");
                });
                list.querySelectorAll(".ezd6-ability-row.is-open").forEach((openRow) => {
                    if (openRow !== row) openRow.classList.remove("is-open");
                });
            }
            const isOpen = detail.classList.contains("is-open");
            detail.classList.toggle("is-open", !isOpen);
            row.classList.toggle("is-open", !isOpen);
            this.expandedAbilityId = !isOpen ? item?.id ?? null : null;
        };

        row.addEventListener("click", (event) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest?.(".ezd6-ability-roll-btn, .ezd6-ability-msg-btn, .ezd6-ability-edit-btn, .ezd6-ability-delete-btn")) {
                return;
            }
            toggleDetail();
        });
        row.addEventListener("keydown", (event: KeyboardEvent) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            toggleDetail();
        });

        wrapper.append(row, detail);
        return wrapper;
    }

    private renderResourceSection(): HTMLElement {
        const { block, section } = this.buildSectionBlock("Resources", "ezd6-section--resources");

        const list = createElement("div", "ezd6-resource-list");
        this.character.resources.forEach((resource) => list.appendChild(this.renderResourceRow(resource)));
        section.appendChild(list);
        return block;
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
        const { block, section } = this.buildSectionBlock("Saves", "ezd6-section--saves");
        const list = createElement("div", "ezd6-save-list");
        this.character.saves.forEach((save) => list.appendChild(this.renderSaveRow(save)));
        section.appendChild(list);
        return block;
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

    private buildSectionBlock(title: string, sectionClass: string) {
        const block = createElement("div", "ezd6-section-block");
        block.appendChild(createElement("div", "ezd6-section__title", title));
        const section = createElement("div", `ezd6-section ${sectionClass}`.trim());
        block.appendChild(section);
        return { block, section };
    }

    private reRender(container: HTMLElement) {
        const root = container.closest(".ezd6-sheet") as HTMLElement | null;
        if (root) {
            this.render(root);
        }
    }

    private getAbilityItems(): any[] {
        const items = this.options.actor?.items?.filter?.((item: any) => item.type === "ability") ?? [];
        const list = Array.isArray(items) ? items.slice() : Array.from(items);
        return list.sort((a: any, b: any) => (a.sort ?? 0) - (b.sort ?? 0) || (a.name ?? "").localeCompare(b.name ?? ""));
    }

    private async createAbilityItem() {
        const actor = this.options.actor;
        if (!actor?.createEmbeddedDocuments) return;
        const [created] = await actor.createEmbeddedDocuments("Item", [
            {
                name: "New Ability",
                type: "ability",
                system: {
                    description: "",
                    numberOfDice: 0,
                    tag: "",
                },
            },
        ]);
        created?.sheet?.render?.(true);
    }

    private normalizeAbilityTag(tag: string): string {
        const trimmed = (tag ?? "").trim();
        if (!trimmed) return "#task";

        const asNumber = Number(trimmed);
        if (!Number.isNaN(asNumber) && Number.isInteger(asNumber)) {
            const options = this.getAbilityTagOptions();
            const option = options[asNumber];
            if (option) return option.startsWith("#") ? option : `#${option}`;
        }

        return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
    }

    private getAbilityTagOptions(): string[] {
        const predefined = ["#task", "#default", "#attack", "#brutal", "#magick", "#miracle"];
        let custom: string[] = [];
        try {
            const stored = game?.settings?.get?.("ezd6-new", "customTags");
            if (Array.isArray(stored)) custom = stored.filter((tag) => typeof tag === "string");
        } catch {
            custom = [];
        }
        return [...new Set([...predefined, ...custom])];
    }

    private async postAbilityMessage(item: any, description: string) {
        if (!item) return;
        const contentPieces = [
            `<strong>${item.name ?? "Ability"}</strong>`,
            description ? `<div>${description}</div>` : "",
        ];
        await ChatMessage.create({ content: contentPieces.join(""), speaker: ChatMessage.getSpeaker?.() });
    }

    private async rollAbilityItem(item: any, numberOfDice: number, tag: string, description: string) {
        if (!item) return;
        if (numberOfDice > 0) {
            const formula = `${numberOfDice}d6`;
            const flavor = `${item.name ?? "Ability"} ${this.normalizeAbilityTag(tag)}`.trim();
            const roll = new Roll(formula, {});
            await roll.evaluate();
            await roll.toMessage({ flavor, speaker: ChatMessage.getSpeaker?.() });
            return;
        }

        const contentPieces = [
            `<strong>${item.name ?? "Ability"}</strong>`,
            description ? `<div>${description}</div>` : "",
        ];
        await ChatMessage.create({ content: contentPieces.join(""), speaker: ChatMessage.getSpeaker?.() });
    }
}

