import { getDieImagePath } from "./ezd6-core";
import { Character, Resource, Save, DEFAULT_RESOURCE_ICON, isLockedResource } from "./character";
import {
    buildDetailContent,
    buildStandardRollKinds,
    createDiceStack,
    createElement,
    createRollButton,
    getTagOptions,
    normalizeTag,
    wireExpandableRow,
} from "./ui/sheet-utils";

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

type ResourceReplenishState = {
    visible: boolean;
    mode: "reset" | "restore" | null;
    disabled: boolean;
    target: Resource | null;
};

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
        this.enableDragReorder(list, "ability");
        this.appendCategorizedRows(
            list,
            this.getAbilityItems(),
            (item) => item?.system?.category ?? "",
            (item) => this.renderAbilityRow(item)
        );
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
        this.enableDragReorder(list, "equipment");
        this.appendCategorizedRows(
            list,
            this.getEquipmentItems(),
            (item) => item?.system?.category ?? "",
            (item) => this.renderEquipmentRow(item)
        );
        section.appendChild(list);

        return sectionBlock;
    }

    private renderTaskSection(): HTMLElement {
        const { block, section } = this.buildSectionBlock("Task", "ezd6-section--tasks");

        const buttons = createElement("div", "ezd6-task-buttons");
        TASK_ROLLS.forEach((task) => {
            const btn = createRollButton({
                className: "ezd6-task-btn",
                title: `${task.label} (${task.formula})`,
                kinds: [...task.dice],
                onClick: () => this.character.rollTask(task.label, task.formula, this.getChatSpeaker()),
            });
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
            placeholder.append(createDiceStack(Array.from({ length: count }, () => "grey" as const)));
            buttons.appendChild(placeholder);
        });
        MAGICK_ROLLS.forEach((magick) => {
            const btn = createRollButton({
                className: "ezd6-task-btn",
                title: magick.label,
                kinds: Array.from({ length: magick.dice }, () => "grey" as const),
                onClick: () => this.character.rollMagick(magick.dice, this.getChatSpeaker()),
            });
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
        if (item?.id) {
            wrapper.dataset.itemId = item.id;
        }
        wrapper.draggable = Boolean(this.options.editable);
        const row = createElement("div", "ezd6-ability-row");
        row.setAttribute("role", "button");
        row.tabIndex = 0;
        row.title = "Toggle details";

        const iconWrap = createElement("span", "ezd6-ability-icon");
        const icon = createElement("img", "ezd6-ability-icon__img") as HTMLImageElement;
        icon.src = item?.img || "icons/svg/item-bag.svg";
        icon.alt = item?.name ?? "Ability icon";
        icon.draggable = false;
        iconWrap.appendChild(icon);

        const title = createElement("span", "ezd6-ability-row__title", item?.name ?? "Ability");
        row.append(iconWrap, title);

        if (numberOfDice > 0) {
            const rollBtn = createRollButton({
                className: "ezd6-task-btn ezd6-ability-roll-btn",
                title: `Roll ${numberOfDice}d6 ${this.normalizeAbilityTag(tag)}`.trim(),
                kinds: buildStandardRollKinds(numberOfDice),
                onClick: (event) => {
                    event.stopPropagation();
                    this.rollAbilityItem(item, numberOfDice, tag, description);
                },
            });
            row.appendChild(rollBtn);
        }

        const detail = createElement("div", "ezd6-ability-detail");
        const messageBtn = createElement("button", "ezd6-ability-msg-btn") as HTMLButtonElement;
        messageBtn.type = "button";
        messageBtn.title = "Post ability to chat";
        messageBtn.appendChild(createElement("i", "fas fa-comment"));
        messageBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            this.postAbilityMessage(item, description);
        });

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

        const tagSpan = createElement("span", "ezd6-ability-tag", this.normalizeAbilityTag(tag));
        const detailContent = buildDetailContent({
            prefix: "ezd6-ability",
            description,
            metaItems: [tagSpan],
            messageButton: messageBtn,
            actionButtons: [editBtn, deleteBtn],
        });
        detail.append(detailContent);

        wireExpandableRow({
            wrapper,
            row,
            detail,
            listSelector: ".ezd6-ability-list",
            rowSelector: ".ezd6-ability-row",
            detailSelector: ".ezd6-ability-detail",
            id: item?.id ?? null,
            expandedId: this.expandedAbilityId,
            setExpandedId: (id) => {
                this.expandedAbilityId = id;
            },
            ignoreSelector: ".ezd6-ability-roll-btn, .ezd6-ability-msg-btn, .ezd6-ability-edit-btn, .ezd6-ability-delete-btn",
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
        if (item?.id) {
            wrapper.dataset.itemId = item.id;
        }
        wrapper.draggable = Boolean(this.options.editable);
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
        icon.draggable = false;
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
            const rollBtn = createRollButton({
                className: "ezd6-task-btn ezd6-equipment-roll-btn",
                title: `Roll ${numberOfDice}d6 ${this.normalizeAbilityTag(tag)}`.trim(),
                kinds: buildStandardRollKinds(numberOfDice),
                onClick: (event) => {
                    event.stopPropagation();
                    this.rollEquipmentItem(item, numberOfDice, tag, description, quantity, isQuantifiable);
                },
            });
            rollSlot.appendChild(rollBtn);
        } else if (isQuantifiable) {
            rollSlot.appendChild(createElement("span", "ezd6-equipment-roll-spacer"));
        }
        row.appendChild(rollSlot);

        const detail = createElement("div", "ezd6-equipment-detail");
        const messageBtn = createElement("button", "ezd6-equipment-msg-btn") as HTMLButtonElement;
        messageBtn.type = "button";
        messageBtn.title = "Post equipment to chat";
        messageBtn.appendChild(createElement("i", "fas fa-comment"));
        messageBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            this.postEquipmentMessage(item, description, quantity, isQuantifiable);
        });

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

        const tagSpan = createElement("span", "ezd6-equipment-tag", this.normalizeAbilityTag(tag));
        const detailContent = buildDetailContent({
            prefix: "ezd6-equipment",
            description,
            metaItems: [tagSpan],
            messageButton: messageBtn,
            actionButtons: [editBtn, deleteBtn],
        });
        detail.append(detailContent);

        wireExpandableRow({
            wrapper,
            row,
            detail,
            listSelector: ".ezd6-equipment-list",
            rowSelector: ".ezd6-equipment-row",
            detailSelector: ".ezd6-equipment-detail",
            id: item?.id ?? null,
            expandedId: this.expandedEquipmentId,
            setExpandedId: (id) => {
                this.expandedEquipmentId = id;
            },
            ignoreSelector: ".ezd6-equipment-roll-btn, .ezd6-equipment-qty, .ezd6-equipment-qty-slot, .ezd6-qty-btn, .ezd6-qty-value, .ezd6-equipment-msg-btn, .ezd6-equipment-edit-btn, .ezd6-equipment-delete-btn",
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
        this.enableDragReorder(list, "resource");
        this.character.resources.forEach((resource) => list.appendChild(this.renderResourceRow(resource)));
        this.updateResourceRollWidth(list);
        this.updateResourceCounterLimits(list);
        section.appendChild(list);
        return sectionBlock;
    }

    private renderResourceRow(resource: Resource): HTMLElement {
        const wrapper = createElement("div", "ezd6-resource-item");
        wrapper.dataset.resourceId = resource.id;
        wrapper.dataset.itemId = resource.id;
        wrapper.draggable = Boolean(this.options.editable);
        const row = createElement("div", "ezd6-resource-row");
        row.setAttribute("role", "button");
        row.tabIndex = 0;
        row.title = "Toggle details";

        const title = typeof resource.title === "string" ? resource.title.trim() || "Resource" : "Resource";

        const subBtn = createElement("button", "ezd6-qty-btn", "-") as HTMLButtonElement;
        const addBtn = createElement("button", "ezd6-qty-btn", "+") as HTMLButtonElement;
        subBtn.type = "button";
        addBtn.type = "button";
        subBtn.title = "Decrease resource";
        addBtn.title = "Increase resource";

        const counter = createElement("div", "ezd6-resource-counter");
        const currentValue = this.getResourceValue(resource);
        subBtn.disabled = currentValue <= 0;
        this.renderResourceCounter(counter, resource);

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

        const rollSlot = createElement("div", "ezd6-resource-roll-slot");
        this.renderResourceRoll(rollSlot, resource);
        row.append(subBtn, counter, addBtn, rollSlot);

        const detail = createElement("div", "ezd6-resource-detail");
        detail.appendChild(this.buildResourceDetailContent(resource, wrapper));

        wireExpandableRow({
            wrapper,
            row,
            detail,
            listSelector: ".ezd6-resource-list",
            rowSelector: ".ezd6-resource-row",
            detailSelector: ".ezd6-resource-detail",
            id: resource.id,
            expandedId: this.expandedResourceId,
            setExpandedId: (id) => {
                this.expandedResourceId = id;
            },
            ignoreSelector: ".ezd6-qty-btn, .ezd6-resource-roll-btn",
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
        this.enableDragReorder(list, "save");
        this.character.saves.forEach((save) => list.appendChild(this.renderSaveRow(save)));
        section.appendChild(list);
        return sectionBlock;
    }

    private renderSaveRow(save: Save): HTMLElement {
        const wrapper = createElement("div", "ezd6-save-item");
        wrapper.dataset.itemId = save.id;
        wrapper.draggable = Boolean(this.options.editable);
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
        icon.draggable = false;
        iconWrap.appendChild(icon);

        const name = createElement("span", "ezd6-save-row__title", title);

        const target = createElement("div", "ezd6-save-target");
        const targetBadge = createElement("strong", "ezd6-save-target-number", String(targetValue));
        target.appendChild(targetBadge);

        const rollBtn = createRollButton({
            className: "ezd6-task-btn ezd6-save-roll-btn",
            title: `Roll ${diceCount}d6 #target${targetValue}`.trim(),
            kinds: buildStandardRollKinds(diceCount),
            onClick: (event) => {
                event.stopPropagation();
                this.character.rollSave(save.id, this.getChatSpeaker());
            },
        });

        row.append(iconWrap, target, name, rollBtn);

        const detail = createElement("div", "ezd6-save-detail");
        detail.appendChild(this.buildSaveDetailContent(save, wrapper));

        wireExpandableRow({
            wrapper,
            row,
            detail,
            listSelector: ".ezd6-save-list",
            rowSelector: ".ezd6-save-row",
            detailSelector: ".ezd6-save-detail",
            id: save.id,
            expandedId: this.expandedSaveId,
            setExpandedId: (id) => {
                this.expandedSaveId = id;
            },
            ignoreSelector: ".ezd6-save-roll-btn",
        });

        wrapper.append(row, detail);
        return wrapper;
    }

    private buildResourceDetailContent(resource: Resource, wrapper: HTMLElement): HTMLElement {
        const title = typeof resource.title === "string" ? resource.title.trim() || "Resource" : "Resource";
        const messageBtn = createElement("button", "ezd6-resource-msg-btn") as HTMLButtonElement;
        messageBtn.type = "button";
        messageBtn.title = "Post resource to chat";
        messageBtn.appendChild(createElement("i", "fas fa-comment"));
        messageBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            this.postResourceMessage(resource);
        });

        const actionButtons: HTMLButtonElement[] = [];
        if (this.options.editable) {
            const editBtn = createElement("button", "ezd6-equipment-edit-btn") as HTMLButtonElement;
            editBtn.type = "button";
            editBtn.title = "Edit resource";
            editBtn.appendChild(createElement("i", "fas fa-pen"));
            editBtn.addEventListener("click", (event) => {
                event.stopPropagation();
                void this.editResource(resource, wrapper);
            });
            actionButtons.push(editBtn);
            if (!isLockedResource(resource)) {
                const deleteBtn = createElement("button", "ezd6-equipment-delete-btn") as HTMLButtonElement;
                deleteBtn.type = "button";
                deleteBtn.title = "Delete resource";
                deleteBtn.appendChild(createElement("i", "fas fa-trash"));
                deleteBtn.addEventListener("click", async (event) => {
                    event.stopPropagation();
                    const root = wrapper.closest(".ezd6-sheet") as HTMLElement | null;
                    await this.deleteResource(resource.id, root ?? undefined);
                });
                actionButtons.push(deleteBtn);
            }
        }

        return buildDetailContent({
            prefix: "ezd6-resource",
            title,
            description: resource.description ?? "",
            messageButton: messageBtn,
            actionButtons,
            actionsSingleClass: "is-single",
        });
    }

    private buildSaveDetailContent(save: Save, wrapper: HTMLElement): HTMLElement {
        const title = typeof save.title === "string" ? save.title.trim() || "Save" : "Save";
        const messageBtn = createElement("button", "ezd6-save-msg-btn") as HTMLButtonElement;
        messageBtn.type = "button";
        messageBtn.title = "Post save to chat";
        messageBtn.appendChild(createElement("i", "fas fa-comment"));
        messageBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            this.postSaveMessage(save);
        });

        const actionButtons: HTMLButtonElement[] = [];
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
                const root = wrapper.closest(".ezd6-sheet") as HTMLElement | null;
                await this.deleteSave(save.id, root ?? undefined);
            });

            actionButtons.push(editBtn, deleteBtn);
        }

        return buildDetailContent({
            prefix: "ezd6-save",
            title,
            description: save.description ?? "",
            messageButton: messageBtn,
            actionButtons,
        });
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

    private getResourceMaxValue(resource: Resource): number {
        const direct = Number(resource.maxValue);
        if (Number.isFinite(direct)) return Math.max(0, Math.floor(direct));
        const legacy = Number(resource.defaultMaxValue ?? 0);
        return Number.isFinite(legacy) ? Math.max(0, Math.floor(legacy)) : 0;
    }

    private getResourceDiceCount(resource: Resource): number {
        const raw = Number(resource.numberOfDice);
        return Number.isFinite(raw) ? this.clampInt(Math.floor(raw), 0, 3) : 0;
    }

    private getResourceTag(resource: Resource): string {
        const raw = (resource as any)?.rollKeyword ?? (resource as any)?.tag ?? "default";
        return this.normalizeAbilityTag(String(raw));
    }

    private getResourceReplenishLogic(raw: any): "disabled" | "reset" | "restore" {
        const logic = typeof raw === "string" ? raw : "disabled";
        if (logic === "reset" || logic === "restore") return logic;
        return "disabled";
    }

    private getResourceReplenishTag(resource: Resource): string {
        const raw = (resource as any)?.replenishTag ?? "";
        const trimmed = String(raw).trim();
        if (!trimmed) return "";
        return this.normalizeAbilityTag(trimmed);
    }

    private getResourceReplenishCost(resource: Resource): number {
        const raw = Number((resource as any)?.replenishCost ?? 1);
        if (!Number.isFinite(raw)) return 1;
        return this.clampInt(Math.floor(raw), 1, 100);
    }

    private getReplenishTargetResource(resource: Resource): Resource | null {
        const targetTag = this.getResourceReplenishTag(resource);
        if (!targetTag) return null;
        return this.character.resources.find((entry) => {
            if (entry.id === resource.id) return false;
            return this.getResourceTag(entry) === targetTag;
        }) ?? null;
    }

    private getResourceReplenishState(resource: Resource): ResourceReplenishState {
        const logic = this.getResourceReplenishLogic(resource?.replenishLogic);
        const maxValue = this.getResourceMaxValue(resource);
        if (logic === "disabled" || maxValue <= 0) {
            return { visible: false, mode: null, disabled: true, target: null };
        }
        const target = this.getReplenishTargetResource(resource);
        if (!target) {
            return { visible: false, mode: null, disabled: true, target: null };
        }
        const current = this.getResourceValue(resource);
        const targetValue = this.getResourceValue(target);
        const cost = this.getResourceReplenishCost(resource);
        if (logic === "reset") {
            const visible = current >= maxValue;
            return { visible, mode: visible ? "reset" : null, disabled: targetValue < cost, target };
        }
        const visible = current < maxValue;
        return { visible, mode: visible ? "restore" : null, disabled: targetValue < cost, target };
    }

    private canShowReplenishButton(
        resource: Resource,
        state: ResourceReplenishState,
        diceCount: number,
        currentValue: number
    ): boolean {
        if (diceCount > 0 && currentValue > 0) return false;
        return state.visible && Boolean(state.mode && state.target);
    }

    private buildReplenishTitle(mode: "reset" | "restore", cost: number, targetTag: string): string {
        const label = mode === "reset" ? "Reset" : "Restore 1";
        return `${label} by spending ${cost} ${targetTag}`.trim();
    }

    private async applyReplenishAction(
        resource: Resource,
        state: ResourceReplenishState,
        slot: HTMLElement
    ) {
        if (!state.mode || !state.target) return;
        const cost = this.getResourceReplenishCost(resource);
        const target = state.target;
        const targetValue = this.getResourceValue(target);
        if (targetValue < cost) return;

        if (state.mode === "reset") {
            resource.value = 0;
        } else {
            const maxValue = this.getResourceMaxValue(resource);
            const current = this.getResourceValue(resource);
            resource.value = Math.min(maxValue, current + 1);
        }

        this.character.adjustResource(target.id, -cost);
        const wrapper = slot.closest(".ezd6-resource-item") as HTMLElement | null;
        if (wrapper) {
            this.updateResourceRowUI(wrapper, resource);
        }
        const root = wrapper?.closest(".ezd6-sheet") as HTMLElement | null;
        if (root) {
            const targetRow = root.querySelector(
                `.ezd6-resource-item[data-resource-id="${target.id}"]`
            ) as HTMLElement | null;
            if (targetRow) {
                this.updateResourceRowUI(targetRow, target);
            }
        }
        await this.persistResources();
    }

    private getResourceIcon(resource: Resource): string {
        const candidates = [resource.icon, resource.iconAvailable, resource.iconSpent];
        const match = candidates.find((entry) => typeof entry === "string" && entry.trim() !== "");
        return match ?? DEFAULT_RESOURCE_ICON;
    }

    private getResourceIconLimit(counter: HTMLElement): number {
        let width = counter.clientWidth;
        const row = counter.closest(".ezd6-resource-row") as HTMLElement | null;
        if (row) {
            const style = getComputedStyle(row);
            const gap = Number.parseFloat(style.columnGap || style.gap || "6") || 6;
            const padLeft = Number.parseFloat(style.paddingLeft || "0") || 0;
            const padRight = Number.parseFloat(style.paddingRight || "0") || 0;
            const rollSlot = row.querySelector(".ezd6-resource-roll-slot") as HTMLElement | null;
            const rollWidth = rollSlot?.clientWidth ?? 0;
            const minusBtn = row.querySelector(".ezd6-qty-btn[data-delta='-1']") as HTMLElement | null;
            const plusBtn = row.querySelector(".ezd6-qty-btn[data-delta='1']") as HTMLElement | null;
            const minusWidth = minusBtn?.getBoundingClientRect().width ?? 24;
            const plusWidth = plusBtn?.getBoundingClientRect().width ?? 24;
            const available = row.clientWidth - padLeft - padRight - rollWidth - minusWidth - plusWidth - (gap * 3);
            width = Math.max(width, available);
        }
        if (width <= 0) return 6;
        const style = getComputedStyle(counter);
        const gap = Number.parseFloat(style.gap || style.columnGap || "3") || 3;
        const iconSize = 32;
        const unit = iconSize + gap;
        const count = Math.floor((width + gap) / unit);
        return Math.max(1, count);
    }

    private updateResourceCounterLimits(container: HTMLElement) {
        const list = container.classList.contains("ezd6-resource-list")
            ? container
            : (container.querySelector(".ezd6-resource-list") as HTMLElement | null);
        if (!list) return;
        requestAnimationFrame(() => {
            const items = list.querySelectorAll(".ezd6-resource-item");
            items.forEach((item) => {
                const wrapper = item as HTMLElement;
                const id = wrapper.dataset.resourceId;
                if (!id) return;
                const resource = this.character.resources.find((entry) => entry.id === id);
                if (!resource) return;
                const counter = wrapper.querySelector(".ezd6-resource-counter") as HTMLElement | null;
                if (!counter) return;
                const limit = this.getResourceIconLimit(counter);
                const prev = Number(counter.dataset.maxIcons || "0");
                if (limit === prev) return;
                counter.dataset.maxIcons = String(limit);
                this.renderResourceCounter(counter, resource, limit);
            });
        });
    }

    private async rollResource(resource: Resource) {
        const diceCount = this.getResourceDiceCount(resource);
        if (diceCount <= 0) return;
        const tag = this.normalizeAbilityTag(resource.rollKeyword ?? "default");
        const title = typeof resource.title === "string" ? resource.title.trim() || "Resource" : "Resource";
        const roll = new Roll(`${diceCount}d6`, {});
        await roll.evaluate();
        const flavor = `${title} ${tag}`.trim();
        await roll.toMessage({ flavor, speaker: this.getChatSpeaker() });
    }

    private renderResourceCounter(counter: HTMLElement, resource: Resource, maxIcons: number = 6) {
        counter.innerHTML = "";
        const title = typeof resource.title === "string" ? resource.title.trim() || "Resource" : "Resource";
        const iconPath = this.getResourceIcon(resource);
        const currentValue = this.getResourceValue(resource);
        const maxValue = this.getResourceMaxValue(resource);
        const N = Math.max(1, Math.floor(maxIcons));
        const iconMode = maxValue > 0
            ? !(currentValue > N || (currentValue === N && maxValue > N))
            : currentValue <= N;

        if (maxValue > 0) {
            if (!iconMode) {
                const count = createElement(
                    "span",
                    "ezd6-resource-counter-number",
                    `${currentValue} / ${maxValue}`
                );
                const img = createElement("img", "ezd6-resource-icon") as HTMLImageElement;
                img.src = iconPath;
                img.alt = `${title} icon`;
                img.draggable = false;
                counter.append(count, img);
                return;
            }

            const normalCount = Math.min(currentValue, N);
            for (let i = 0; i < normalCount; i++) {
                const img = createElement("img", "ezd6-resource-icon") as HTMLImageElement;
                img.src = iconPath;
                img.alt = `${title} icon`;
                img.draggable = false;
                counter.appendChild(img);
            }
            const missing = Math.max(0, maxValue - currentValue);
            const fadedCount = Math.max(0, Math.min(N - normalCount, missing));
            for (let i = 0; i < fadedCount; i++) {
                const img = createElement("img", "ezd6-resource-icon ezd6-resource-icon--faded") as HTMLImageElement;
                img.src = iconPath;
                img.alt = `${title} icon`;
                img.draggable = false;
                counter.appendChild(img);
            }
            return;
        }

        if (currentValue <= 0) {
            const img = createElement("img", "ezd6-resource-icon ezd6-resource-icon--faded") as HTMLImageElement;
            img.src = iconPath;
            img.alt = `${title} icon`;
            img.draggable = false;
            counter.appendChild(img);
            return;
        }

        if (currentValue > N) {
            const count = createElement("span", "ezd6-resource-counter-number", String(currentValue));
            const img = createElement("img", "ezd6-resource-icon") as HTMLImageElement;
            img.src = iconPath;
            img.alt = `${title} icon`;
            img.draggable = false;
            counter.append(count, img);
            return;
        }

        const normalCount = Math.min(currentValue, N);
        for (let i = 0; i < normalCount; i++) {
            const img = createElement("img", "ezd6-resource-icon") as HTMLImageElement;
            img.src = iconPath;
            img.alt = `${title} icon`;
            img.draggable = false;
            counter.appendChild(img);
        }
    }

    private renderResourceRoll(slot: HTMLElement, resource: Resource) {
        slot.innerHTML = "";
        const diceCount = this.getResourceDiceCount(resource);
        const currentValue = this.getResourceValue(resource);
        const replenishState = this.getResourceReplenishState(resource);
        if (this.canShowReplenishButton(resource, replenishState, diceCount, currentValue)) {
            const target = replenishState.target;
            const cost = this.getResourceReplenishCost(resource);
            const targetTag = this.getResourceTag(target);
            const targetIcon = this.getResourceIcon(target);
            const btn = createElement("button", "ezd6-task-btn ezd6-resource-replenish-btn") as HTMLButtonElement;
            const icon = createElement("img", "ezd6-resource-replenish-icon") as HTMLImageElement;
            btn.type = "button";
            btn.disabled = replenishState.disabled;
            btn.title = this.buildReplenishTitle(replenishState.mode ?? "reset", cost, targetTag);
            icon.src = targetIcon;
            icon.alt = targetTag || "Replenish";
            icon.draggable = false;
            if (btn.disabled) {
                icon.classList.add("ezd6-resource-replenish-icon--disabled");
            }
            btn.appendChild(icon);
            btn.addEventListener("click", async (event) => {
                event.stopPropagation();
                if (btn.disabled) return;
                await this.applyReplenishAction(resource, replenishState, slot);
            });
            slot.appendChild(btn);
            return;
        }

        if (diceCount <= 0) return;
        const title = typeof resource.title === "string" ? resource.title.trim() || "Resource" : "Resource";
        const tag = this.normalizeAbilityTag(resource.rollKeyword ?? "default");
        const rollBtn = createRollButton({
            className: "ezd6-task-btn ezd6-resource-roll-btn",
            title: `Roll ${diceCount}d6 ${tag}`.trim(),
            kinds: buildStandardRollKinds(diceCount),
            onClick: async (event) => {
                event.stopPropagation();
                await this.rollResource(resource);
                this.character.adjustResource(resource.id, -1);
                const wrapper = slot.closest(".ezd6-resource-item") as HTMLElement | null;
                if (wrapper) {
                    this.updateResourceRowUI(wrapper, resource);
                }
                await this.persistResources();
            },
        });
        slot.appendChild(rollBtn);
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

    private normalizeCategory(raw: unknown): string {
        if (typeof raw !== "string") return "";
        return raw.trim();
    }

    private renderCategoryDivider(category: string): HTMLElement {
        const divider = createElement("div", "ezd6-category-divider", category);
        divider.dataset.category = category;
        divider.setAttribute("role", "separator");
        return divider;
    }

    private buildCategorizedRows(
        items: any[],
        getCategory: (item: any) => string,
        renderRow: (item: any) => HTMLElement
    ): HTMLElement[] {
        const uncategorized: any[] = [];
        const grouped = new Map<string, any[]>();

        items.forEach((item) => {
            const category = this.normalizeCategory(getCategory(item));
            if (!category) {
                uncategorized.push(item);
                return;
            }
            const bucket = grouped.get(category) ?? [];
            bucket.push(item);
            grouped.set(category, bucket);
        });

        const rows: HTMLElement[] = [];
        uncategorized.forEach((item) => rows.push(renderRow(item)));

        const categories = Array.from(grouped.keys())
            .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
        categories.forEach((category) => {
            rows.push(this.renderCategoryDivider(category));
            grouped.get(category)?.forEach((item) => rows.push(renderRow(item)));
        });

        return rows;
    }

    private appendCategorizedRows(
        list: HTMLElement,
        items: any[],
        getCategory: (item: any) => string,
        renderRow: (item: any) => HTMLElement
    ) {
        this.buildCategorizedRows(items, getCategory, renderRow).forEach((row) => list.appendChild(row));
    }

    refresh(container: HTMLElement) {
        this.reRender(container);
    }

    refreshAbilityList(container: HTMLElement) {
        this.refreshList(container, ".ezd6-ability-list", () =>
            this.buildCategorizedRows(
                this.getAbilityItems(),
                (item) => item?.system?.category ?? "",
                (item) => this.renderAbilityRow(item)
            )
        );
    }

    refreshEquipmentList(container: HTMLElement) {
        this.refreshList(container, ".ezd6-equipment-list", () =>
            this.buildCategorizedRows(
                this.getEquipmentItems(),
                (item) => item?.system?.category ?? "",
                (item) => this.renderEquipmentRow(item)
            )
        );
    }

    refreshResourceList(container: HTMLElement) {
        this.refreshList(container, ".ezd6-resource-list", () =>
            this.character.resources.map((resource) => this.renderResourceRow(resource))
        );
        this.updateResourceRollWidth(container);
        this.updateResourceCounterLimits(container);
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

    private enableDragReorder(list: HTMLElement, type: "ability" | "equipment" | "resource" | "save") {
        if (!this.options.editable) return;
        const selector = type === "ability"
            ? ".ezd6-ability-item"
            : type === "equipment"
                ? ".ezd6-equipment-item"
                : type === "resource"
                    ? ".ezd6-resource-item"
                    : ".ezd6-save-item";
        let dragged: HTMLElement | null = null;

        list.addEventListener("dragstart", (event) => {
            const target = (event.target as HTMLElement | null)?.closest(selector) as HTMLElement | null;
            if (!target) return;
            dragged = target;
            target.classList.add("is-dragging");
            if (event.dataTransfer) {
                event.dataTransfer.effectAllowed = "move";
                const id = target.dataset.itemId ?? "";
                event.dataTransfer.setData("text/plain", id);
            }
        });

        list.addEventListener("dragend", () => {
            if (!dragged) return;
            dragged.classList.remove("is-dragging");
            dragged = null;
        });

        list.addEventListener("dragover", (event) => {
            if (!dragged) return;
            event.preventDefault();
            const targetEl = event.target as HTMLElement | null;
            if (!targetEl) return;
            const target = targetEl.closest(selector) as HTMLElement | null;
            const divider = targetEl.closest(".ezd6-category-divider") as HTMLElement | null;
            const rectSource = target ?? divider;
            if (rectSource) {
                if (rectSource === dragged) return;
                const rect = rectSource.getBoundingClientRect();
                const shouldInsertAfter = event.clientY > rect.top + rect.height / 2;
                if (shouldInsertAfter) {
                    rectSource.after(dragged);
                } else {
                    rectSource.before(dragged);
                }
                return;
            }
            if (targetEl === list) {
                list.appendChild(dragged);
            }
        });

        list.addEventListener("drop", async (event) => {
            if (!dragged) return;
            event.preventDefault();
            if (type === "ability" || type === "equipment") {
                await this.persistItemSort(list, selector);
            } else {
                await this.persistSystemSort(list, selector, type);
            }
        });
    }

    private async persistItemSort(list: HTMLElement, selector: string) {
        const actor = this.options.actor;
        if (!actor?.updateEmbeddedDocuments) return;
        const updates: Array<{ _id: string; sort: number; "system.category": string }> = [];
        let sortIndex = 0;
        let currentCategory = "";
        Array.from(list.children).forEach((node) => {
            const el = node as HTMLElement;
            if (el.classList.contains("ezd6-category-divider")) {
                currentCategory = this.normalizeCategory(el.dataset.category ?? "");
                return;
            }
            if (!el.matches(selector)) return;
            const id = el.dataset.itemId;
            if (!id) return;
            updates.push({
                _id: id,
                sort: sortIndex * 10,
                "system.category": currentCategory,
            });
            sortIndex += 1;
        });
        if (!updates.length) return;
        try {
            await actor.updateEmbeddedDocuments("Item", updates);
        } catch {
            // ignore drag failures; list still reflects order until refresh
        }
    }

    private async persistSystemSort(
        list: HTMLElement,
        selector: string,
        type: "resource" | "save"
    ) {
        const orderedIds = Array.from(list.querySelectorAll(selector))
            .map((node) => (node as HTMLElement).dataset.itemId)
            .filter((id): id is string => Boolean(id));
        if (!orderedIds.length) return;
        const target = type === "resource" ? this.character.resources : this.character.saves;
        const byId = new Map(target.map((entry) => [entry.id, entry]));
        const seen = new Set(orderedIds);
        const reordered = orderedIds
            .map((id) => byId.get(id))
            .filter((entry): entry is Resource | Save => Boolean(entry));
        const remainder = target.filter((entry) => !seen.has(entry.id));
        const next = reordered.concat(remainder);
        if (type === "resource") {
            this.character.resources = next as Resource[];
            await this.persistResources();
        } else {
            this.character.saves = next as Save[];
            await this.persistSaves();
        }
    }

    private getAbilityItems(): any[] {
        const items = this.options.actor?.items?.filter?.((item: any) => item.type === "ability") ?? [];
        const list = Array.isArray(items) ? items.slice() : Array.from(items);
        return list.sort((a: any, b: any) => (a.sort ?? 0) - (b.sort ?? 0));
    }

    private getEquipmentItems(): any[] {
        const items = this.options.actor?.items?.filter?.((item: any) => item.type === "equipment") ?? [];
        const list = Array.isArray(items) ? items.slice() : Array.from(items);
        return list.sort((a: any, b: any) => (a.sort ?? 0) - (b.sort ?? 0));
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
                    category: "",
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
                    category: "",
                },
            },
        ]);
        created?.sheet?.render?.(true);
    }

    private normalizeAbilityTag(tag: string): string {
        return normalizeTag(tag, this.getAbilityTagOptions());
    }

    private getAbilityTagOptions(): string[] {
        return getTagOptions();
    }

    private getChatSpeaker(): any {
        return ChatMessage.getSpeaker?.({ actor: this.options.actor }) ?? ChatMessage.getSpeaker?.();
    }

    private async postAbilityMessage(item: any, description: string) {
        if (!item) return;
        const contentPieces = [
            `<strong>${item.name ?? "Ability"}</strong>`,
            description ? `<div>${description}</div>` : "",
        ];
        await ChatMessage.create({ content: contentPieces.join(""), speaker: this.getChatSpeaker() });
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
        await ChatMessage.create({ content: contentPieces.join(""), speaker: this.getChatSpeaker() });
    }

    private async postResourceMessage(resource: Resource) {
        if (!resource) return;
        const title = typeof resource.title === "string" ? resource.title.trim() || "Resource" : "Resource";
        const description = typeof resource.description === "string" ? resource.description : "";
        const contentPieces = [
            `<strong>${title}</strong>`,
            description ? `<div>${description}</div>` : "",
        ];
        await ChatMessage.create({ content: contentPieces.join(""), speaker: this.getChatSpeaker() });
    }

    private async rollAbilityItem(item: any, numberOfDice: number, tag: string, description: string) {
        if (!item) return;
        if (numberOfDice > 0) {
            const formula = `${numberOfDice}d6`;
            const flavor = `${item.name ?? "Ability"} ${this.normalizeAbilityTag(tag)}`.trim();
            const roll = new Roll(formula, {});
            await roll.evaluate();
            await roll.toMessage({ flavor, speaker: this.getChatSpeaker() });
            return;
        }

        const contentPieces = [
            `<strong>${item.name ?? "Ability"}</strong>`,
            description ? `<div>${description}</div>` : "",
        ];
        await ChatMessage.create({ content: contentPieces.join(""), speaker: this.getChatSpeaker() });
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
            await roll.toMessage({ flavor, speaker: this.getChatSpeaker() });
            return;
        }

        const qtyLine = isQuantifiable ? `<div>Quantity: ${quantity}</div>` : "";
        const contentPieces = [
            `<strong>${item.name ?? "Equipment"}</strong>`,
            description ? `<div>${description}</div>` : "",
            qtyLine,
        ];
        await ChatMessage.create({ content: contentPieces.join(""), speaker: this.getChatSpeaker() });
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
                system: {
                    value: this.getResourceValue(resource),
                    maxValue: this.getResourceMaxValue(resource),
                    description: resource.description ?? "",
                    numberOfDice: this.getResourceDiceCount(resource),
                    tag: resource.rollKeyword ?? "default",
                    replenishLogic: resource.replenishLogic ?? "disabled",
                    replenishTag: resource.replenishTag ?? "",
                    replenishCost: this.getResourceReplenishCost(resource),
                },
            },
            (item: any) => {
                const system = item?.system ?? {};
                const nextValue = Number(system.value ?? 1);
                const clamped = Number.isFinite(nextValue) ? this.clampInt(Math.floor(nextValue), 0, 100) : 0;
                const nextMax = Number(system.maxValue ?? 0);
                const clampedMax = Number.isFinite(nextMax) ? this.clampInt(Math.floor(nextMax), 0, 100) : 0;
                const nextDescription = typeof system.description === "string" ? system.description : "";
                const nextDice = Number(system.numberOfDice ?? 0);
                const clampedDice = Number.isFinite(nextDice) ? this.clampInt(Math.floor(nextDice), 0, 3) : 0;
                const nextTag = typeof system.tag === "string" ? system.tag : "default";
                const nextReplenishLogic = this.getResourceReplenishLogic(system.replenishLogic);
                const nextReplenishTag = typeof system.replenishTag === "string" ? system.replenishTag : "";
                const nextReplenishCost = this.getResourceReplenishCost(system);
                const targetResource = this.character.resources.find((entry) => entry.id === resource.id) ?? resource;
                targetResource.title = item?.name ?? targetResource.title;
                targetResource.icon = item?.img ?? targetResource.icon;
                targetResource.value = clamped;
                targetResource.maxValue = clampedMax;
                targetResource.description = nextDescription;
                targetResource.numberOfDice = clampedDice;
                targetResource.rollKeyword = nextTag;
                targetResource.replenishLogic = nextReplenishLogic;
                targetResource.replenishTag = nextReplenishTag;
                targetResource.replenishCost = nextReplenishCost;
                if (!Number.isFinite(targetResource.defaultValue)) {
                    targetResource.defaultValue = clamped;
                }
                void this.persistResources();
                this.updateResourceRowUI(rerenderFrom, targetResource);
            }
        );
    }

    private async deleteResource(resourceId: string, container?: HTMLElement) {
        const target = this.character.resources.find((res) => res.id === resourceId);
        if (target && isLockedResource(target)) return;
        this.character.resources = this.character.resources.filter((res) => res.id !== resourceId);
        if (this.expandedResourceId === resourceId) {
            this.expandedResourceId = null;
        }
        await this.persistResources();
        if (container) this.refreshResourceList(container);
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
                    description: save.description ?? "",
                },
            },
            (item: any) => {
                const system = item?.system ?? {};
                const targetValue = Number(system.targetValue ?? 6);
                const numberOfDice = Number(system.numberOfDice ?? 3);
                const nextDescription = typeof system.description === "string" ? system.description : "";
                const targetSave = this.character.saves.find((entry) => entry.id === save.id) ?? save;
                targetSave.title = item?.name ?? targetSave.title;
                targetSave.icon = item?.img ?? targetSave.icon;
                targetSave.targetValue = Number.isFinite(targetValue) ? this.clampInt(Math.floor(targetValue), 2, 6) : 6;
                targetSave.numberOfDice = Number.isFinite(numberOfDice) ? this.clampInt(Math.floor(numberOfDice), 1, 6) : 3;
                targetSave.description = nextDescription;
                void this.persistSaves();
                this.updateSaveRowUI(rerenderFrom, targetSave);
            }
        );
    }

    private async postSaveMessage(save: Save) {
        if (!save) return;
        const title = typeof save.title === "string" ? save.title.trim() || "Save" : "Save";
        const description = typeof save.description === "string" ? save.description : "";
        const contentPieces = [
            `<strong>${title}</strong>`,
            description ? `<div>${description}</div>` : "",
        ];
        await ChatMessage.create({ content: contentPieces.join(""), speaker: this.getChatSpeaker() });
    }

    private async deleteSave(saveId: string, container?: HTMLElement) {
        this.character.saves = this.character.saves.filter((entry) => entry.id !== saveId);
        if (this.expandedSaveId === saveId) {
            this.expandedSaveId = null;
        }
        await this.persistSaves();
        if (container) this.refreshSaveList(container);
    }

    private updateResourceRowUI(wrapper: HTMLElement, resource: Resource) {
        const row = wrapper.querySelector(".ezd6-resource-row") as HTMLElement | null;
        const counter = row?.querySelector(".ezd6-resource-counter") as HTMLElement | null;
        const title = typeof resource.title === "string" ? resource.title.trim() || "Resource" : "Resource";
        const value = this.getResourceValue(resource);

        const detailTitle = wrapper.querySelector(".ezd6-resource-detail__title") as HTMLElement | null;
        if (detailTitle) detailTitle.textContent = title;

        if (counter) {
            const stored = Number(counter.dataset.maxIcons || "0");
            const limit = Number.isFinite(stored) && stored > 0 ? stored : this.getResourceIconLimit(counter);
            counter.dataset.maxIcons = String(limit);
            this.renderResourceCounter(counter, resource, limit);
        }

        const rollSlot = row?.querySelector(".ezd6-resource-roll-slot") as HTMLElement | null;
        if (rollSlot) {
            this.renderResourceRoll(rollSlot, resource);
        }

        const subBtn = row?.querySelector(".ezd6-qty-btn[data-delta='-1']") as HTMLButtonElement | null;
        if (subBtn) subBtn.disabled = value <= 0;

        const detail = wrapper.querySelector(".ezd6-resource-detail") as HTMLElement | null;
        if (detail) {
            const content = detail.querySelector(".ezd6-resource-detail__content") as HTMLElement | null;
            const nextContent = this.buildResourceDetailContent(resource, wrapper);
            if (content) {
                content.replaceWith(nextContent);
            } else {
                detail.appendChild(nextContent);
            }
        }

        const list = wrapper.closest(".ezd6-resource-list") as HTMLElement | null;
        if (list) {
            this.updateResourceRollWidth(list);
            this.updateResourceCounterLimits(list);
        }

        if (row) {
            requestAnimationFrame(() => {
                const addBtn = row.querySelector(".ezd6-qty-btn[data-delta='1']") as HTMLButtonElement | null;
                const rollSlot = row.querySelector(".ezd6-resource-roll-slot") as HTMLElement | null;
                if (!addBtn || !rollSlot) return;
                const addRect = addBtn.getBoundingClientRect();
                const rollRect = rollSlot.getBoundingClientRect();
                const gap = Math.max(0, rollRect.left - addRect.right);
        // gap debug removed
            });
        }
    }

    private updateResourceRollWidth(container: HTMLElement) {
        const list = container.classList.contains("ezd6-resource-list")
            ? container
            : (container.querySelector(".ezd6-resource-list") as HTMLElement | null);
        if (!list) return;
        const maxDice = this.character.resources.reduce((max, resource) => {
            const count = this.getResourceDiceCount(resource);
            return Math.max(max, count);
        }, 0);
        const hasReplenish = this.character.resources.some(
            (resource) => {
                const diceCount = this.getResourceDiceCount(resource);
                const currentValue = this.getResourceValue(resource);
                const state = this.getResourceReplenishState(resource);
                return this.canShowReplenishButton(resource, state, diceCount, currentValue);
            }
        );
        const maxRollWidth = maxDice > 0 ? (maxDice * 26) + 12 : 0;
        const replenishWidth = hasReplenish ? 38 : 0;
        const width = Math.max(maxRollWidth, replenishWidth);
        list.dataset.ezd6MaxDice = String(maxDice);
        if (width <= 0) {
            list.style.setProperty("--resource-roll-width", "0px");
            list.style.setProperty("--resource-row-pad-right", "0px");
            list.style.setProperty("--resource-roll-pad", "0px");
            return;
        }
        list.style.setProperty("--resource-roll-width", `${Math.max(0, width)}px`);
        list.style.setProperty("--resource-row-pad-right", "0px");
        list.style.setProperty("--resource-roll-pad", "8px");
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
            iconImg.draggable = false;
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
                buildStandardRollKinds(diceCount).forEach((kind) => {
                    const dieImg = createElement("img", "ezd6-die-icon") as HTMLImageElement;
                    dieImg.alt = `${kind} d6`;
                    dieImg.src = getDieImagePath(6, kind);
                    dieImg.draggable = false;
                    stack.appendChild(dieImg);
                });
            }
        }

        const detailTitle = wrapper.querySelector(".ezd6-save-detail__title") as HTMLElement | null;
        if (detailTitle) detailTitle.textContent = title;

        const detail = wrapper.querySelector(".ezd6-save-detail") as HTMLElement | null;
        if (detail) {
            const content = detail.querySelector(".ezd6-save-detail__content") as HTMLElement | null;
            const nextContent = this.buildSaveDetailContent(save, wrapper);
            if (content) {
                content.replaceWith(nextContent);
            } else {
                detail.appendChild(nextContent);
            }
        }
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
            maxValue: 0,
            description: "",
            numberOfDice: 0,
            rollKeyword: "default",
        });
        await this.persistResources();
    }

    private async createSaveEntry() {
        this.character.addSave({
            title: "Save",
            targetValue: 6,
            numberOfDice: 3,
            description: "",
        });
        await this.persistSaves();
    }
}
