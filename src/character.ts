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
    icon?: string;
    iconAvailable?: string;
    iconSpent?: string;
    usedForDiceBurn?: boolean;
    diceChangeBehavior?: DiceChangeBehavior;
    value: number;
    defaultValue: number;
    maxValue?: number;
    defaultMaxValue?: number;
}

export interface Save {
    id: string;
    title: string;
    icon?: string;
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
            title: partial.title ?? "Ability",
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
        const fallbackIcon = partial.iconAvailable
            ?? partial.iconSpent
            ?? "systems/ezd6-new/assets/icons/resource-available.svg";
        const resource: Resource = {
            id: partial.id ?? createId("res"),
            title: partial.title ?? "Resource",
            icon: partial.icon ?? fallbackIcon,
            iconAvailable: partial.iconAvailable,
            iconSpent: partial.iconSpent,
            usedForDiceBurn: partial.usedForDiceBurn ?? false,
            diceChangeBehavior: partial.diceChangeBehavior ?? "none",
            value: partial.value ?? partial.defaultValue ?? 0,
            defaultValue: partial.defaultValue ?? 0,
            maxValue: partial.maxValue,
            defaultMaxValue: partial.defaultMaxValue,
        };
        this.resources.push(resource);
        return resource;
    }

    addSave(partial: Partial<Save>): Save {
        const save: Save = {
            id: partial.id ?? createId("sav"),
            title: partial.title ?? "Save",
            icon: partial.icon,
            targetValue: partial.targetValue ?? 6,
            numberOfDice: partial.numberOfDice ?? 3,
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
        const rawCurrent = Number(res.value);
        const rawFallback = Number(res.defaultValue ?? res.defaultMaxValue ?? res.maxValue ?? 0);
        const current = Number.isFinite(rawCurrent)
            ? rawCurrent
            : Number.isFinite(rawFallback)
                ? rawFallback
                : 0;
        res.value = Math.max(0, Math.floor(current + delta));
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
        const diceCount = Number.isFinite(save.numberOfDice) ? Math.max(0, Math.floor(save.numberOfDice)) : 0;
        const roll = new Roll(`${diceCount}d6`, {});
        await roll.evaluate();
        const target = Number.isFinite(save.targetValue) && save.targetValue > 0 ? save.targetValue : 6;
        const flavor = `${save.title} #target${target}`;
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
    private expandedEquipmentId: string | null = null;
    private expandedResourceId: string | null = null;
    private expandedSaveId: string | null = null;
    private static readonly actorUpdateOptions = { render: false, diff: false };

    constructor(
        private readonly character: Character,
        private readonly options: {
            onAvatarPick?: (path: string) => void;
            onNameCommit?: (name: string) => void;
            actor?: any;
            editable?: boolean;
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
        right.append(
            this.renderTaskSection(),
            this.renderMagickSection(),
            this.renderAbilitySections(),
            this.renderEquipmentSection(),
        );

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
            this.refreshAbilityList(section);
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

    private renderEquipmentSection(): HTMLElement {
        const { block: sectionBlock, section } = this.buildSectionBlock("Equipment", "ezd6-section--equipment");
        const titleRow = createElement("div", "ezd6-section__title-row");
        const titleLabel = createElement("div", "ezd6-section__title", "Equipment");
        const addBtn = createElement("button", "ezd6-section__add-btn", "+") as HTMLButtonElement;
        addBtn.type = "button";
        addBtn.title = "Add equipment";
        addBtn.addEventListener("click", async () => {
            await this.createEquipmentItem();
            this.refreshEquipmentList(section);
        });
        titleRow.append(titleLabel, addBtn);
        const existingTitle = sectionBlock.querySelector(".ezd6-section__title");
        if (existingTitle) {
            existingTitle.replaceWith(titleRow);
        } else {
            sectionBlock.prepend(titleRow);
        }

        const list = createElement("div", "ezd6-equipment-list");
        this.getEquipmentItems().forEach((item) => list.appendChild(this.renderEquipmentRow(item)));
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

    private renderEquipmentRow(item: any): HTMLElement {
        const system = item?.system ?? {};
        const description = typeof system.description === "string" ? system.description : "";
        const numberOfDice = Math.max(0, Number(system.numberOfDice) || 0);
        const tag = typeof system.tag === "string"
            ? system.tag
            : typeof system.tag === "number"
                ? String(system.tag)
                : "";
        const isQuantifiable = Boolean(system.quantifiable);
        const quantity = this.coerceQuantity(
            system.quantity ?? system.defaultQuantity ?? 0
        );

        const wrapper = createElement("div", "ezd6-equipment-item");
        const row = createElement("div", "ezd6-equipment-row");
        if (!isQuantifiable) {
            row.classList.add("ezd6-equipment-row--no-qty");
        }
        row.setAttribute("role", "button");
        row.tabIndex = 0;
        row.title = "Toggle details";

        const iconWrap = createElement("span", "ezd6-equipment-icon");
        const icon = createElement("img", "ezd6-equipment-icon__img") as HTMLImageElement;
        icon.src = item?.img || "icons/svg/item-bag.svg";
        icon.alt = item?.name ?? "Equipment icon";
        iconWrap.appendChild(icon);

        const title = createElement("span", "ezd6-equipment-row__title", item?.name ?? "Equipment");
        row.append(iconWrap, title);

        const qtySlot = createElement("div", "ezd6-equipment-qty-slot");
        if (isQuantifiable) {
            const qtyWrap = createElement("div", "ezd6-equipment-qty");
            const decBtn = createElement("button", "ezd6-qty-btn", "-") as HTMLButtonElement;
            const incBtn = createElement("button", "ezd6-qty-btn", "+") as HTMLButtonElement;
            const value = createElement("span", "ezd6-qty-value", String(quantity));
            decBtn.type = "button";
            incBtn.type = "button";
            decBtn.disabled = quantity <= 0;
            decBtn.title = "Decrease quantity";
            incBtn.title = "Increase quantity";

            decBtn.addEventListener("click", async (event) => {
                event.stopPropagation();
                await this.setEquipmentQuantity(item, quantity - 1, wrapper);
            });
            incBtn.addEventListener("click", async (event) => {
                event.stopPropagation();
                await this.setEquipmentQuantity(item, quantity + 1, wrapper);
            });

            qtyWrap.append(decBtn, value, incBtn);
            qtySlot.appendChild(qtyWrap);
        } else {
            qtySlot.classList.add("is-empty");
        }
        row.appendChild(qtySlot);

        const rollSlot = createElement("div", "ezd6-equipment-roll-slot");
        if (numberOfDice > 0) {
            const rollBtn = createElement("button", "ezd6-task-btn ezd6-equipment-roll-btn") as HTMLButtonElement;
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
                this.rollEquipmentItem(item, numberOfDice, tag, description, quantity, isQuantifiable);
            });
            rollSlot.appendChild(rollBtn);
        } else if (isQuantifiable) {
            rollSlot.appendChild(createElement("span", "ezd6-equipment-roll-spacer"));
        }
        row.appendChild(rollSlot);

        const detail = createElement("div", "ezd6-equipment-detail");
        if (this.expandedEquipmentId && item?.id === this.expandedEquipmentId) {
            row.classList.add("is-open");
            detail.classList.add("is-open");
        }

        const detailMain = createElement("div", "ezd6-equipment-detail__main");
        const detailHeader = createElement("div", "ezd6-equipment-detail__header");
        detailHeader.appendChild(createElement("span", "ezd6-equipment-detail__label", "Description"));

        const detailText = createElement("div", "ezd6-equipment-detail__text");
        const trimmedDescription = description.trim();
        if (trimmedDescription) {
            detailText.innerHTML = trimmedDescription;
        } else {
            detailText.textContent = "No description.";
            detailText.classList.add("is-empty");
        }

        const detailMeta = createElement("div", "ezd6-equipment-detail__meta");
        detailMeta.appendChild(createElement("span", "ezd6-equipment-tag", this.normalizeAbilityTag(tag)));

        const messageBtn = createElement("button", "ezd6-equipment-msg-btn") as HTMLButtonElement;
        messageBtn.type = "button";
        messageBtn.title = "Post equipment to chat";
        messageBtn.appendChild(createElement("i", "fas fa-comment"));
        messageBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            this.postEquipmentMessage(item, description, quantity, isQuantifiable);
        });

        const detailActions = createElement("div", "ezd6-equipment-detail__actions");
        const editBtn = createElement("button", "ezd6-equipment-edit-btn") as HTMLButtonElement;
        editBtn.type = "button";
        editBtn.title = "Edit equipment";
        editBtn.appendChild(createElement("i", "fas fa-pen"));
        editBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            item?.sheet?.render?.(true);
        });

        const deleteBtn = createElement("button", "ezd6-equipment-delete-btn") as HTMLButtonElement;
        deleteBtn.type = "button";
        deleteBtn.title = "Delete equipment";
        deleteBtn.appendChild(createElement("i", "fas fa-trash"));
        deleteBtn.addEventListener("click", async (event) => {
            event.stopPropagation();
            await item?.delete?.();
            const list = wrapper.parentElement ?? wrapper;
            this.reRender(list);
        });

        detailActions.append(editBtn, deleteBtn);
        detailMain.append(detailHeader, detailText, detailMeta);

        const detailSide = createElement("div", "ezd6-equipment-detail__side");
        detailSide.append(messageBtn, detailActions);

        const detailContent = createElement("div", "ezd6-equipment-detail__content");
        detailContent.append(detailMain, detailSide);

        detail.append(detailContent);

        const toggleDetail = () => {
            const list = wrapper.closest(".ezd6-equipment-list") as HTMLElement | null;
            if (list) {
                list.querySelectorAll(".ezd6-equipment-detail.is-open").forEach((openDetail) => {
                    if (openDetail !== detail) openDetail.classList.remove("is-open");
                });
                list.querySelectorAll(".ezd6-equipment-row.is-open").forEach((openRow) => {
                    if (openRow !== row) openRow.classList.remove("is-open");
                });
            }
            const isOpen = detail.classList.contains("is-open");
            detail.classList.toggle("is-open", !isOpen);
            row.classList.toggle("is-open", !isOpen);
            this.expandedEquipmentId = !isOpen ? item?.id ?? null : null;
        };

        row.addEventListener("click", (event) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest?.(
                ".ezd6-equipment-roll-btn, .ezd6-equipment-qty, .ezd6-equipment-qty-slot, .ezd6-qty-btn, .ezd6-qty-value, .ezd6-equipment-msg-btn, .ezd6-equipment-edit-btn, .ezd6-equipment-delete-btn"
            )) {
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
        const { block: sectionBlock, section } = this.buildSectionBlock("Resources", "ezd6-section--resources");
        const titleRow = createElement("div", "ezd6-section__title-row");
        const titleLabel = createElement("div", "ezd6-section__title", "Resources");
        titleRow.append(titleLabel);
        if (this.options.editable) {
            const addBtn = createElement("button", "ezd6-section__add-btn", "+") as HTMLButtonElement;
            addBtn.type = "button";
            addBtn.title = "Add resource";
            addBtn.addEventListener("click", async () => {
                await this.createResourceEntry();
                this.refreshResourceList(section);
            });
            titleRow.appendChild(addBtn);
        }
        const existingTitle = sectionBlock.querySelector(".ezd6-section__title");
        if (existingTitle) {
            existingTitle.replaceWith(titleRow);
        } else {
            sectionBlock.prepend(titleRow);
        }

        const list = createElement("div", "ezd6-resource-list");
        this.character.resources.forEach((resource) => list.appendChild(this.renderResourceRow(resource)));
        section.appendChild(list);
        return sectionBlock;
    }

    private renderResourceRow(resource: Resource): HTMLElement {
        const wrapper = createElement("div", "ezd6-resource-item");
        const row = createElement("div", "ezd6-resource-row");
        row.setAttribute("role", "button");
        row.tabIndex = 0;
        row.title = "Toggle details";

        const title = typeof resource.title === "string" ? resource.title.trim() || "Resource" : "Resource";
        const iconPath = this.getResourceIcon(resource);

        const subBtn = createElement("button", "ezd6-qty-btn", "-") as HTMLButtonElement;
        const addBtn = createElement("button", "ezd6-qty-btn", "+") as HTMLButtonElement;
        subBtn.type = "button";
        addBtn.type = "button";
        subBtn.title = "Decrease resource";
        addBtn.title = "Increase resource";

        const counter = createElement("div", "ezd6-resource-counter");
        const currentValue = this.getResourceValue(resource);
        subBtn.disabled = currentValue <= 0;
        if (currentValue > 5) {
            const count = createElement("span", "ezd6-resource-counter-number", String(currentValue));
            const img = createElement("img", "ezd6-resource-icon") as HTMLImageElement;
            img.src = iconPath;
            img.alt = `${title} icon`;
            counter.append(count, img);
        } else {
            for (let i = 0; i < currentValue; i++) {
                const img = createElement("img", "ezd6-resource-icon") as HTMLImageElement;
                img.src = iconPath;
                img.alt = `${title} icon`;
                counter.appendChild(img);
            }
        }

        subBtn.addEventListener("click", async (event) => {
            event.stopPropagation();
            this.character.adjustResource(resource.id, -1);
            this.updateResourceRowUI(wrapper, resource);
            await this.persistResources();
        });
        addBtn.addEventListener("click", async (event) => {
            event.stopPropagation();
            this.character.adjustResource(resource.id, 1);
            this.updateResourceRowUI(wrapper, resource);
            await this.persistResources();
        });

        row.append(subBtn, counter, addBtn);

        const detail = createElement("div", "ezd6-resource-detail");
        if (this.expandedResourceId && resource.id === this.expandedResourceId) {
            row.classList.add("is-open");
            detail.classList.add("is-open");
        }

        const detailContent = createElement("div", "ezd6-resource-detail__content");
        const detailMain = createElement("div", "ezd6-resource-detail__main");
        detailMain.appendChild(createElement("div", "ezd6-resource-detail__title", title));

        const detailActions = createElement("div", "ezd6-resource-detail__actions");
        if (this.options.editable) {
            const editBtn = createElement("button", "ezd6-equipment-edit-btn") as HTMLButtonElement;
            editBtn.type = "button";
            editBtn.title = "Edit resource";
            editBtn.appendChild(createElement("i", "fas fa-pen"));
            editBtn.addEventListener("click", (event) => {
                event.stopPropagation();
                void this.editResource(resource, wrapper);
            });

            const deleteBtn = createElement("button", "ezd6-equipment-delete-btn") as HTMLButtonElement;
            deleteBtn.type = "button";
            deleteBtn.title = "Delete resource";
            deleteBtn.appendChild(createElement("i", "fas fa-trash"));
            deleteBtn.addEventListener("click", async (event) => {
                event.stopPropagation();
                await this.deleteResource(resource.id);
                const list = wrapper.parentElement ?? wrapper;
                this.refreshResourceList(list);
            });

            detailActions.append(editBtn, deleteBtn);
        }

        detailContent.append(detailMain, detailActions);
        detail.appendChild(detailContent);

        const toggleDetail = () => {
            const list = wrapper.closest(".ezd6-resource-list") as HTMLElement | null;
            if (list) {
                list.querySelectorAll(".ezd6-resource-detail.is-open").forEach((openDetail) => {
                    if (openDetail !== detail) openDetail.classList.remove("is-open");
                });
                list.querySelectorAll(".ezd6-resource-row.is-open").forEach((openRow) => {
                    if (openRow !== row) openRow.classList.remove("is-open");
                });
            }
            const isOpen = detail.classList.contains("is-open");
            detail.classList.toggle("is-open", !isOpen);
            row.classList.toggle("is-open", !isOpen);
            this.expandedResourceId = !isOpen ? resource.id : null;
        };

        row.addEventListener("click", (event) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest?.(".ezd6-qty-btn")) return;
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

    private renderSavesSection(): HTMLElement {
        const { block: sectionBlock, section } = this.buildSectionBlock("Saves", "ezd6-section--saves");
        const titleRow = createElement("div", "ezd6-section__title-row");
        const titleLabel = createElement("div", "ezd6-section__title", "Saves");
        titleRow.append(titleLabel);
        if (this.options.editable) {
            const addBtn = createElement("button", "ezd6-section__add-btn", "+") as HTMLButtonElement;
            addBtn.type = "button";
            addBtn.title = "Add save";
            addBtn.addEventListener("click", async () => {
                await this.createSaveEntry();
                this.refreshSaveList(section);
            });
            titleRow.appendChild(addBtn);
        }
        const existingTitle = sectionBlock.querySelector(".ezd6-section__title");
        if (existingTitle) {
            existingTitle.replaceWith(titleRow);
        } else {
            sectionBlock.prepend(titleRow);
        }

        const list = createElement("div", "ezd6-save-list");
        this.character.saves.forEach((save) => list.appendChild(this.renderSaveRow(save)));
        section.appendChild(list);
        return sectionBlock;
    }

    private renderSaveRow(save: Save): HTMLElement {
        const wrapper = createElement("div", "ezd6-save-item");
        const row = createElement("div", "ezd6-save-row");
        row.setAttribute("role", "button");
        row.tabIndex = 0;
        row.title = "Toggle details";

        const title = typeof save.title === "string" ? save.title.trim() || "Save" : "Save";
        const targetValue = this.getSaveTargetValue(save);
        const diceCount = this.getSaveDiceCount(save);
        const iconPath = this.getSaveIcon(save);

        const iconWrap = createElement("span", "ezd6-ability-icon ezd6-save-icon");
        const icon = createElement("img", "ezd6-ability-icon__img") as HTMLImageElement;
        icon.src = iconPath;
        icon.alt = `${title} icon`;
        iconWrap.appendChild(icon);

        const name = createElement("span", "ezd6-save-row__title", title);

        const target = createElement("div", "ezd6-save-target");
        const targetBadge = createElement("strong", "ezd6-save-target-number", String(targetValue));
        target.appendChild(targetBadge);

        const rollBtn = createElement("button", "ezd6-task-btn ezd6-save-roll-btn") as HTMLButtonElement;
        rollBtn.type = "button";
        rollBtn.title = `Roll ${diceCount}d6 #target${targetValue}`.trim();
        const diceRow = createElement("span", "ezd6-dice-stack");
        for (let i = 0; i < diceCount; i++) {
            const kind = i === 0 ? "grey" : "green";
            const dieImg = createElement("img", "ezd6-die-icon") as HTMLImageElement;
            dieImg.alt = `${kind} d6`;
            dieImg.src = getDieImagePath(6, kind);
            diceRow.appendChild(dieImg);
        }
        rollBtn.append(diceRow);
        rollBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            this.character.rollSave(save.id);
        });

        row.append(iconWrap, target, name, rollBtn);

        const detail = createElement("div", "ezd6-save-detail");
        if (this.expandedSaveId && save.id === this.expandedSaveId) {
            row.classList.add("is-open");
            detail.classList.add("is-open");
        }

        const detailContent = createElement("div", "ezd6-save-detail__content");
        const detailMain = createElement("div", "ezd6-save-detail__main");
        detailMain.appendChild(createElement("div", "ezd6-save-detail__title", title));

        const detailActions = createElement("div", "ezd6-save-detail__actions");
        if (this.options.editable) {
            const editBtn = createElement("button", "ezd6-equipment-edit-btn") as HTMLButtonElement;
            editBtn.type = "button";
            editBtn.title = "Edit save";
            editBtn.appendChild(createElement("i", "fas fa-pen"));
            editBtn.addEventListener("click", (event) => {
                event.stopPropagation();
                void this.editSave(save, wrapper);
            });

            const deleteBtn = createElement("button", "ezd6-equipment-delete-btn") as HTMLButtonElement;
            deleteBtn.type = "button";
            deleteBtn.title = "Delete save";
            deleteBtn.appendChild(createElement("i", "fas fa-trash"));
            deleteBtn.addEventListener("click", async (event) => {
                event.stopPropagation();
                await this.deleteSave(save.id);
                const list = wrapper.parentElement ?? wrapper;
                this.refreshSaveList(list);
            });

            detailActions.append(editBtn, deleteBtn);
        }

        detailContent.append(detailMain, detailActions);
        detail.appendChild(detailContent);

        const toggleDetail = () => {
            const list = wrapper.closest(".ezd6-save-list") as HTMLElement | null;
            if (list) {
                list.querySelectorAll(".ezd6-save-detail.is-open").forEach((openDetail) => {
                    if (openDetail !== detail) openDetail.classList.remove("is-open");
                });
                list.querySelectorAll(".ezd6-save-row.is-open").forEach((openRow) => {
                    if (openRow !== row) openRow.classList.remove("is-open");
                });
            }
            const isOpen = detail.classList.contains("is-open");
            detail.classList.toggle("is-open", !isOpen);
            row.classList.toggle("is-open", !isOpen);
            this.expandedSaveId = !isOpen ? save.id : null;
        };

        row.addEventListener("click", (event) => {
            const targetEl = event.target as HTMLElement | null;
            if (targetEl?.closest?.(".ezd6-save-roll-btn")) return;
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

    private getResourceDefaultValue(resource: Resource): number {
        const direct = Number(resource.defaultValue);
        if (Number.isFinite(direct)) return Math.max(0, Math.floor(direct));
        const legacy = Number(resource.defaultMaxValue ?? resource.maxValue ?? 0);
        return Number.isFinite(legacy) ? Math.max(0, Math.floor(legacy)) : 0;
    }

    private getResourceValue(resource: Resource): number {
        const raw = Number(resource.value);
        if (Number.isFinite(raw)) return Math.max(0, Math.floor(raw));
        return this.getResourceDefaultValue(resource);
    }

    private getResourceIcon(resource: Resource): string {
        const candidates = [resource.icon, resource.iconAvailable, resource.iconSpent];
        const match = candidates.find((entry) => typeof entry === "string" && entry.trim() !== "");
        return match ?? "systems/ezd6-new/assets/icons/resource-available.svg";
    }

    private getSaveTargetValue(save: Save): number {
        const raw = Number(save.targetValue);
        return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 6;
    }

    private getSaveDiceCount(save: Save): number {
        const raw = Number(save.numberOfDice);
        return Number.isFinite(raw) ? this.clampInt(Math.floor(raw), 1, 6) : 1;
    }

    private getSaveIcon(save: Save): string {
        const icon = typeof save.icon === "string" ? save.icon.trim() : "";
        return icon || "icons/svg/shield.svg";
    }

    private clampInt(value: number, min: number, max?: number): number {
        const clamped = Math.max(min, value);
        return Number.isFinite(max) ? Math.min(max as number, clamped) : clamped;
    }

    private coercePositiveInt(value: any, fallback: number): number {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return fallback;
        return Math.max(0, Math.floor(numeric));
    }

    private buildIconPickerButton(iconPath: string, altText: string): HTMLButtonElement {
        const btn = createElement("button", "ezd6-icon-picker") as HTMLButtonElement;
        btn.type = "button";
        if (iconPath) {
            const img = createElement("img", "ezd6-icon-picker__img") as HTMLImageElement;
            img.src = iconPath;
            img.alt = altText;
            btn.appendChild(img);
        } else {
            btn.classList.add("is-empty");
        }
        return btn;
    }

    private updateIconButton(btn: HTMLButtonElement, path: string, altText: string) {
        let img = btn.querySelector("img") as HTMLImageElement | null;
        if (!img) {
            img = createElement("img", "ezd6-icon-picker__img") as HTMLImageElement;
            btn.appendChild(img);
        }
        img.src = path;
        img.alt = altText;
        btn.classList.remove("is-empty");
    }

    private renderDiceStack(stack: HTMLElement, count: number) {
        stack.innerHTML = "";
        if (count <= 0) {
            const dash = createElement("span", "ezd6-ability-dice-empty", "-");
            stack.appendChild(dash);
            return;
        }
        for (let i = 0; i < count; i++) {
            const img = createElement("img", "ezd6-ability-dice-icon") as HTMLImageElement;
            img.src = getDieImagePath(6, "grey");
            img.alt = "d6";
            stack.appendChild(img);
        }
    }

    private openImagePicker(current: string, onPick: (path: string) => void) {
        const picker = new FilePicker({
            type: "image",
            current: current ?? "",
            callback: (path: string) => onPick(path),
        });
        picker.render(true);
    }

    private async persistResources() {
        await this.persistSystemArray("resources", this.character.resources);
    }

    private async persistSaves() {
        await this.persistSystemArray("saves", this.character.saves);
    }

    private async persistSystemArray(key: "resources" | "saves", value: unknown) {
        if (!this.options.actor?.update) return;
        try {
            await this.options.actor.update({ [`system.${key}`]: value }, CharacterSheetView.actorUpdateOptions);
        } catch {
            // ignore persistence errors; UI remains responsive
        }
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

    refresh(container: HTMLElement) {
        this.reRender(container);
    }

    refreshAbilityList(container: HTMLElement) {
        this.refreshList(container, ".ezd6-ability-list", () =>
            this.getAbilityItems().map((item) => this.renderAbilityRow(item))
        );
    }

    refreshEquipmentList(container: HTMLElement) {
        this.refreshList(container, ".ezd6-equipment-list", () =>
            this.getEquipmentItems().map((item) => this.renderEquipmentRow(item))
        );
    }

    refreshResourceList(container: HTMLElement) {
        this.refreshList(container, ".ezd6-resource-list", () =>
            this.character.resources.map((resource) => this.renderResourceRow(resource))
        );
    }

    refreshSaveList(container: HTMLElement) {
        this.refreshList(container, ".ezd6-save-list", () =>
            this.character.saves.map((save) => this.renderSaveRow(save))
        );
    }

    private reRender(container: HTMLElement) {
        const root = container.closest(".ezd6-sheet") as HTMLElement | null;
        if (root) {
            const scrollers: Array<{ el: HTMLElement; top: number }> = [];
            const addScroller = (el: HTMLElement | null) => {
                if (!el) return;
                if (scrollers.some((entry) => entry.el === el)) return;
                scrollers.push({ el, top: el.scrollTop });
            };
            const collectScrollParents = (start: HTMLElement | null) => {
                let current: HTMLElement | null = start;
                while (current) {
                    const style = getComputedStyle(current);
                    const overflowY = style.overflowY;
                    const isScrollable = overflowY === "auto"
                        || overflowY === "scroll"
                        || current.scrollHeight > current.clientHeight
                        || current.scrollTop > 0;
                    if (isScrollable) addScroller(current);
                    current = current.parentElement;
                }
            };
            const windowScroller = root.closest(".window-content") as HTMLElement | null;
            const sheetRoot = root.closest(".ezd6-sheet-root") as HTMLElement | null;
            collectScrollParents(container);
            collectScrollParents(root);
            addScroller(windowScroller);
            addScroller(sheetRoot);
            addScroller(document.body as HTMLElement | null);
            addScroller(document.documentElement as HTMLElement | null);
            addScroller(document.scrollingElement as HTMLElement | null);
            this.render(root);
            if (scrollers.length) {
                requestAnimationFrame(() => {
                    scrollers.forEach(({ el, top }) => {
                        el.scrollTop = top;
                    });
                    setTimeout(() => {
                        scrollers.forEach(({ el, top }) => {
                            el.scrollTop = top;
                        });
                    }, 50);
                });
            }
        }
    }

    private refreshList(container: HTMLElement, selector: string, buildRows: () => HTMLElement[]) {
        const list = container.querySelector(selector) as HTMLElement | null;
        if (!list) return;
        list.innerHTML = "";
        buildRows().forEach((row) => list.appendChild(row));
    }

    private getAbilityItems(): any[] {
        const items = this.options.actor?.items?.filter?.((item: any) => item.type === "ability") ?? [];
        const list = Array.isArray(items) ? items.slice() : Array.from(items);
        return list.sort((a: any, b: any) => (a.sort ?? 0) - (b.sort ?? 0) || (a.name ?? "").localeCompare(b.name ?? ""));
    }

    private getEquipmentItems(): any[] {
        const items = this.options.actor?.items?.filter?.((item: any) => item.type === "equipment") ?? [];
        const list = Array.isArray(items) ? items.slice() : Array.from(items);
        return list.sort((a: any, b: any) => (a.sort ?? 0) - (b.sort ?? 0) || (a.name ?? "").localeCompare(b.name ?? ""));
    }

    private async createAbilityItem() {
        const actor = this.options.actor;
        if (!actor?.createEmbeddedDocuments) return;
        const [created] = await actor.createEmbeddedDocuments("Item", [
            {
                name: "Ability",
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

    private async createEquipmentItem() {
        const actor = this.options.actor;
        if (!actor?.createEmbeddedDocuments) return;
        const [created] = await actor.createEmbeddedDocuments("Item", [
            {
                name: "Equipment",
                type: "equipment",
                system: {
                    description: "",
                    quantifiable: false,
                    quantity: 1,
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

    private async postEquipmentMessage(item: any, description: string, quantity: number, isQuantifiable: boolean) {
        if (!item) return;
        const details = isQuantifiable ? `<div>Quantity: ${quantity}</div>` : "";
        const tag = this.normalizeAbilityTag(item?.system?.tag ?? "");
        const contentPieces = [
            `<strong>${item.name ?? "Equipment"}</strong>`,
            description ? `<div>${description}</div>` : "",
            tag ? `<div>${tag}</div>` : "",
            details,
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

    private async rollEquipmentItem(
        item: any,
        numberOfDice: number,
        tag: string,
        description: string,
        quantity: number,
        isQuantifiable: boolean
    ) {
        if (!item) return;
        if (numberOfDice > 0) {
            const formula = `${numberOfDice}d6`;
            const flavor = `${item.name ?? "Equipment"} ${this.normalizeAbilityTag(tag)}`.trim();
            const roll = new Roll(formula, {});
            await roll.evaluate();
            await roll.toMessage({ flavor, speaker: ChatMessage.getSpeaker?.() });
            return;
        }

        const qtyLine = isQuantifiable ? `<div>Quantity: ${quantity}</div>` : "";
        const contentPieces = [
            `<strong>${item.name ?? "Equipment"}</strong>`,
            description ? `<div>${description}</div>` : "",
            qtyLine,
        ];
        await ChatMessage.create({ content: contentPieces.join(""), speaker: ChatMessage.getSpeaker?.() });
    }

    private async setEquipmentQuantity(item: any, nextValue: number, rerenderFrom: HTMLElement) {
        if (!item?.update) return;
        const next = this.coerceQuantity(nextValue);
        await item.update({ "system.quantity": next }, { render: false });
        const row = rerenderFrom.querySelector(".ezd6-equipment-row") as HTMLElement | null;
        if (row) {
            const value = row.querySelector(".ezd6-qty-value") as HTMLElement | null;
            if (value) value.textContent = String(next);
            const decBtn = row.querySelector(".ezd6-qty-btn[data-delta='-1']") as HTMLButtonElement | null;
            if (decBtn) decBtn.disabled = next <= 0;
        }
    }

    private coerceQuantity(value: any): number {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return 0;
        return Math.max(0, Math.floor(numeric));
    }

    private async editResource(resource: Resource, rerenderFrom: HTMLElement) {
        await this.openTemporaryItemEditor(
            {
                name: typeof resource.title === "string" ? resource.title.trim() || "Resource" : "Resource",
                type: "resource",
                img: this.getResourceIcon(resource),
                system: { value: this.getResourceValue(resource) },
            },
            (item: any) => {
                const system = item?.system ?? {};
                const nextValue = Number(system.value ?? 1);
                const clamped = Number.isFinite(nextValue) ? this.clampInt(Math.floor(nextValue), 1, 100) : 1;
                resource.title = item?.name ?? resource.title;
                resource.icon = item?.img ?? resource.icon;
                resource.value = clamped;
                if (!Number.isFinite(resource.defaultValue)) {
                    resource.defaultValue = clamped;
                }
                void this.persistResources();
                this.updateResourceRowUI(rerenderFrom, resource);
            }
        );
    }

    private async deleteResource(resourceId: string) {
        this.character.resources = this.character.resources.filter((res) => res.id !== resourceId);
        await this.persistResources();
    }

    private async editSave(save: Save, rerenderFrom: HTMLElement) {
        await this.openTemporaryItemEditor(
            {
                name: typeof save.title === "string" ? save.title.trim() || "Save" : "Save",
                type: "save",
                img: this.getSaveIcon(save),
                system: {
                    targetValue: this.getSaveTargetValue(save),
                    numberOfDice: this.getSaveDiceCount(save),
                },
            },
            (item: any) => {
                const system = item?.system ?? {};
                const targetValue = Number(system.targetValue ?? 6);
                const numberOfDice = Number(system.numberOfDice ?? 3);
                save.title = item?.name ?? save.title;
                save.icon = item?.img ?? save.icon;
                save.targetValue = Number.isFinite(targetValue) ? this.clampInt(Math.floor(targetValue), 2, 6) : 6;
                save.numberOfDice = Number.isFinite(numberOfDice) ? this.clampInt(Math.floor(numberOfDice), 1, 6) : 3;
                void this.persistSaves();
                this.updateSaveRowUI(rerenderFrom, save);
            }
        );
    }

    private async deleteSave(saveId: string) {
        this.character.saves = this.character.saves.filter((entry) => entry.id !== saveId);
        await this.persistSaves();
    }

    private updateResourceRowUI(wrapper: HTMLElement, resource: Resource) {
        const row = wrapper.querySelector(".ezd6-resource-row") as HTMLElement | null;
        const counter = row?.querySelector(".ezd6-resource-counter") as HTMLElement | null;
        const title = typeof resource.title === "string" ? resource.title.trim() || "Resource" : "Resource";
        const iconPath = this.getResourceIcon(resource);
        const value = this.getResourceValue(resource);

        const detailTitle = wrapper.querySelector(".ezd6-resource-detail__title") as HTMLElement | null;
        if (detailTitle) detailTitle.textContent = title;

        if (counter) {
            counter.innerHTML = "";
            if (value > 5) {
                const count = createElement("span", "ezd6-resource-counter-number", String(value));
                const img = createElement("img", "ezd6-resource-icon") as HTMLImageElement;
                img.src = iconPath;
                img.alt = `${title} icon`;
                counter.append(count, img);
            } else {
                for (let i = 0; i < value; i++) {
                    const img = createElement("img", "ezd6-resource-icon") as HTMLImageElement;
                    img.src = iconPath;
                    img.alt = `${title} icon`;
                    counter.appendChild(img);
                }
            }
        }
    }

    private updateSaveRowUI(wrapper: HTMLElement, save: Save) {
        const row = wrapper.querySelector(".ezd6-save-row") as HTMLElement | null;
        if (!row) return;
        const title = typeof save.title === "string" ? save.title.trim() || "Save" : "Save";
        const targetValue = this.getSaveTargetValue(save);
        const diceCount = this.getSaveDiceCount(save);
        const iconPath = this.getSaveIcon(save);

        const iconImg = row.querySelector(".ezd6-ability-icon__img") as HTMLImageElement | null;
        if (iconImg) {
            iconImg.src = iconPath;
            iconImg.alt = `${title} icon`;
        }

        const nameEl = row.querySelector(".ezd6-save-row__title") as HTMLElement | null;
        if (nameEl) nameEl.textContent = title;

        const targetEl = row.querySelector(".ezd6-save-target-number") as HTMLElement | null;
        if (targetEl) targetEl.textContent = String(targetValue);

        const rollBtn = row.querySelector(".ezd6-save-roll-btn") as HTMLButtonElement | null;
        if (rollBtn) {
            rollBtn.title = `Roll ${diceCount}d6 #target${targetValue}`.trim();
            const stack = rollBtn.querySelector(".ezd6-dice-stack") as HTMLElement | null;
            if (stack) {
                stack.innerHTML = "";
                for (let i = 0; i < diceCount; i++) {
                    const kind = i === 0 ? "grey" : "green";
                    const dieImg = createElement("img", "ezd6-die-icon") as HTMLImageElement;
                    dieImg.alt = `${kind} d6`;
                    dieImg.src = getDieImagePath(6, kind);
                    stack.appendChild(dieImg);
                }
            }
        }

        const detailTitle = wrapper.querySelector(".ezd6-save-detail__title") as HTMLElement | null;
        if (detailTitle) detailTitle.textContent = title;
    }

    private async openTemporaryItemEditor(data: Record<string, any>, onUpdate: (item: any) => void) {
        const ItemClass = (globalThis as any).CONFIG?.Item?.documentClass ?? (globalThis as any).Item;
        const idFactory = (foundry as any)?.utils?.randomID ?? (globalThis as any).randomID;
        const tempData = {
            _id: typeof idFactory === "function" ? idFactory() : `tmp-${Math.random().toString(36).slice(2, 10)}`,
            ...data,
        };
        const tempItem = ItemClass ? new ItemClass(tempData, { temporary: true }) : null;
        if (!tempItem) {
            ui?.notifications?.error?.("Failed to open editor.");
            return;
        }
        const expand = (foundry as any)?.utils?.expandObject;
        tempItem.update = async function update(this: any, updateData: Record<string, any>) {
            const expanded = typeof expand === "function" ? expand(updateData) : updateData;
            this.updateSource(expanded);
            this.prepareData?.();
            onUpdate(this);
            return this;
        };

        tempItem.sheet?.render?.(true);
    }

    private async createResourceEntry() {
        this.character.addResource({
            title: "Resource",
            value: 1,
            defaultValue: 1,
            icon: "systems/ezd6-new/assets/icons/resource-available.svg",
        });
        await this.persistResources();
    }

    private async createSaveEntry() {
        this.character.addSave({
            title: "Save",
            targetValue: 6,
            numberOfDice: 3,
        });
        await this.persistSaves();
    }
}

