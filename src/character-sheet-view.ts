import { getDieImagePath, resolveKeywordRule } from "./ezd6-core";
import { Character, Resource, Save, DEFAULT_AVATAR, DEFAULT_RESOURCE_ICON } from "./character";
import {
    buildDetailContent,
    buildStandardRollKinds,
    createElement,
    createRollButton,
    getTagOptions,
    normalizeTag,
    wireExpandableRow,
} from "./ui/sheet-utils";
import { format, localize, resolveLocalizedField } from "./ui/i18n";
import {
    resolveEntryDescription,
    resolveEntryName,
    resolveItemDescription,
    resolveItemName,
    resolveLocalizedText,
} from "./ui/localization-utils";
import { renderResourceCounter as renderResourceCounterShared } from "./ui/resource-counter";
import { buildInfoMeta, buildRollMeta, EZD6_META_FLAG } from "./chat/chat-meta";
import { renderMarkdown } from "./ui/markdown";

const LEGACY_DEFAULT_ICON = "icons/svg/item-bag.svg";
const t = (key: string, fallback: string) => localize(key, fallback);
const tf = (key: string, data: Record<string, any>, fallback: string) => format(key, data, fallback);

const TASK_ROLLS = [
    {
        id: "double-bane",
        labelKey: "EZD6.Tasks.DoubleBane",
        labelFallback: "Double bane",
        formula: "3d6kl",
        dice: ["red", "red", "grey"] as const,
    },
    {
        id: "single-bane",
        labelKey: "EZD6.Tasks.SingleBane",
        labelFallback: "Single bane",
        formula: "2d6kl",
        dice: ["red", "grey"] as const,
    },
    {
        id: "normal",
        labelKey: "EZD6.Tasks.NormalRoll",
        labelFallback: "Normal roll",
        formula: "1d6",
        dice: ["grey"] as const,
    },
    {
        id: "single-boon",
        labelKey: "EZD6.Tasks.SingleBoon",
        labelFallback: "Single boon",
        formula: "2d6kh",
        dice: ["grey", "green"] as const,
    },
    {
        id: "double-boon",
        labelKey: "EZD6.Tasks.DoubleBoon",
        labelFallback: "Double boon",
        formula: "3d6kh",
        dice: ["grey", "green", "green"] as const,
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
    private expandedAspectId: string | null = null;
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
            mode?: "character" | "archetype";
            nameOverride?: string;
            nameLocked?: boolean;
            showLocalizationId?: boolean;
            localizationId?: string;
            onLocalizationIdCommit?: (value: string) => void;
            itemSourceOwnerId?: string;
            itemSource?: {
                getItems: (type: "ability" | "aspect" | "equipment") => any[];
                getItemById?: (id: string) => any | null;
                createItem?: (data: Record<string, any>) => Promise<void>;
                updateItem?: (id: string, updates: Record<string, any>) => Promise<void>;
                deleteItem?: (id: string) => Promise<void>;
                updateItemSort?: (updates: Array<{ _id: string; sort: number; "system.category": string }>) => Promise<void>;
                openItemEditor?: (item: any, onUpdate: () => void) => void;
            };
            systemUpdater?: (data: Record<string, any>) => Promise<void>;
        } = {}
    ) {}

    private resolveLocalizedText(localizationId: string | null | undefined, suffix: string, fallback: string): string {
        return resolveLocalizedField(localizationId, suffix, fallback).value;
    }

    private getLocalizedItemName(item: any, fallback: string): string {
        return resolveItemName(item, fallback, this.resolveLocalizedText.bind(this));
    }

    private getLocalizedItemDescription(item: any, fallback: string): string {
        return resolveItemDescription(item, fallback, this.resolveLocalizedText.bind(this));
    }

    private getLocalizedResourceTitle(resource: Resource, fallback: string): string {
        return resolveEntryName(resource.localizationId, fallback, this.resolveLocalizedText.bind(this));
    }

    private getLocalizedResourceDescription(resource: Resource, fallback: string): string {
        return resolveEntryDescription(resource.localizationId, fallback, this.resolveLocalizedText.bind(this));
    }

    private getLocalizedSaveTitle(save: Save, fallback: string): string {
        return resolveEntryName(save.localizationId, fallback, this.resolveLocalizedText.bind(this));
    }

    private getLocalizedSaveDescription(save: Save, fallback: string): string {
        return resolveEntryDescription(save.localizationId, fallback, this.resolveLocalizedText.bind(this));
    }

    render(container: HTMLElement) {
        container.innerHTML = "";
        container.classList.add("ezd6-sheet");

        const layout = createElement("div", "ezd6-sheet__layout");
        const left = createElement("div", "ezd6-sheet__col ezd6-sheet__col--left");
        const right = createElement("div", "ezd6-sheet__col ezd6-sheet__col--right");

        left.append(
            this.renderAvatarSection(),
            this.renderResourceSection(),
            this.renderSavesSection(),
            this.renderAspectSection(),
        );
        right.append(
            this.renderNameSection(),
            this.renderAbilitySections(),
            this.renderEquipmentSection(),
        );
        if (this.options.editable && (this.options.mode ?? "character") === "character") {
            right.insertBefore(this.renderTaskSection(), right.children[1] ?? null);
        }

        layout.append(left, right);
        container.append(layout);
        this.applyReadOnlyOverrides(container);
    }

    private renderAvatarSection(): HTMLElement {
        const isArchetype = (this.options.mode ?? "character") === "archetype";
        const title = isArchetype
            ? t("EZD6.Labels.Icon", "Icon")
            : t("EZD6.Sections.Avatar", "Avatar");
        const tooltip = isArchetype
            ? t("EZD6.Tooltips.ChangeIcon", "Click to change icon")
            : t("EZD6.Tooltips.ChangeAvatar", "Click to change avatar");
        const { block, section } = this.buildSectionBlock(title, "ezd6-section--avatar");
        const avatarWrapper = createElement("div", "ezd6-avatar");
        const avatar = createElement("img", "ezd6-avatar__img") as HTMLImageElement;
        const placeholder = DEFAULT_AVATAR;
        avatar.alt = title;
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
        if (this.options.editable && this.options.onAvatarPick) {
            avatarWrapper.classList.add("ezd6-avatar--clickable");
            avatarWrapper.dataset.changeLabel = t("EZD6.Actions.Change", "Change");
            avatarWrapper.title = tooltip;
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
        const { block, section } = this.buildSectionBlock(
            t("EZD6.Sections.Name", "Name"),
            "ezd6-section--name"
        );
        const nameInput = createElement("input", "ezd6-name-input") as HTMLInputElement;
        nameInput.placeholder = t("EZD6.Placeholders.CharacterName", "Character Name");
        nameInput.value = this.options.nameOverride ?? this.character.name;
        if (this.options.nameLocked) {
            nameInput.disabled = true;
        }
        const commit = () => {
            if (this.options.nameLocked) return;
            const rawName = nameInput.value ?? "";
            const trimmed = rawName.trim();
            const fallback = this.character.name || t("EZD6.Defaults.Unnamed", "Unnamed");
            const nextName = trimmed ? trimmed : fallback;
            nameInput.value = nextName;
            this.character.setName(nextName, game?.canvas?.tokens?.controlled?.[0]);
            this.options.onNameCommit?.(nextName);
        };
        nameInput.addEventListener("change", commit);
        nameInput.addEventListener("blur", commit);
        section.appendChild(nameInput);

        if (this.options.showLocalizationId) {
            const label = t("EZD6.Labels.LocalizationId", "Localization ID");
            const title = createElement("div", "ezd6-section__title", label);
            const input = createElement("input", "ezd6-name-input ezd6-name-input--small") as HTMLInputElement;
            input.type = "text";
            input.placeholder = "EZD6.Compendium.";
            input.value = this.options.localizationId ?? "";
            input.disabled = !this.options.editable;
            const commitLocalization = () => {
                const next = input.value ?? "";
                this.options.onLocalizationIdCommit?.(next);
            };
            input.addEventListener("change", commitLocalization);
            input.addEventListener("blur", commitLocalization);
            section.append(title, input);
        }
        return block;
    }

    private renderAbilitySections(): HTMLElement {
        return this.renderAbilityLikeSection({
            title: t("EZD6.Sections.Abilities", "Abilities"),
            sectionClass: "ezd6-section--abilities",
            addTitle: t("EZD6.Actions.AddAbility", "Add ability"),
            listClass: "ezd6-ability-list",
            dragType: "ability",
            getItems: () => this.getAbilityItems(),
            renderRow: (item) => this.renderAbilityRow(item),
            onCreate: async (section) => {
                await this.createAbilityItem();
                this.refreshAbilityList(section);
            },
        });
    }

    private renderEquipmentSection(): HTMLElement {
        const equipmentLabel = t("EZD6.ItemLabels.Equipment", "Equipment");
        const { block: sectionBlock, section } = this.buildSectionBlock(
            t("EZD6.Sections.Equipment", "Equipment"),
            "ezd6-section--equipment"
        );
        const titleRow = createElement("div", "ezd6-section__title-row");
        const titleLabel = createElement("div", "ezd6-section__title", equipmentLabel);
        titleRow.append(titleLabel);
        if (this.options.editable) {
            const addBtn = createElement("button", "ezd6-section__add-btn", "+") as HTMLButtonElement;
            addBtn.type = "button";
            addBtn.title = t("EZD6.Actions.AddEquipment", "Add equipment");
            addBtn.addEventListener("click", async () => {
                await this.createEquipmentItem();
                this.refreshEquipmentList(section);
            });
            titleRow.append(addBtn);
        }
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
        const { block, section } = this.buildSectionBlock(
            t("EZD6.Sections.Tasks", "Task"),
            "ezd6-section--tasks"
        );

        const buttons = createElement("div", "ezd6-task-buttons");
        TASK_ROLLS.forEach((task) => {
            const label = t(task.labelKey, task.labelFallback);
            const btn = createRollButton({
                className: "ezd6-task-btn",
                title: tf("EZD6.Tooltips.TaskRoll", { label, formula: task.formula }, `${label} (${task.formula})`),
                kinds: [...task.dice],
                onClick: () => this.character.rollTask(label, task.formula, this.getChatSpeaker()),
            });
            buttons.appendChild(btn);
        });

        section.appendChild(buttons);
        return block;
    }

    private renderAbilityRow(item: any): HTMLElement {
        return this.renderAbilityLikeRow(item, {
            label: t("EZD6.ItemLabels.Ability", "Ability"),
            labelLower: t("EZD6.ItemLabels.Ability", "Ability"),
            defaultIcon: "icons/magic/symbols/cog-orange-red.webp",
            listSelector: ".ezd6-ability-list",
            rowSelector: ".ezd6-ability-row",
            detailSelector: ".ezd6-ability-detail",
            itemClassName: "ezd6-ability-item",
            rowClassName: "ezd6-ability-row",
            detailClassName: "ezd6-ability-detail",
            expandedId: this.expandedAbilityId,
            setExpandedId: (id) => {
                this.expandedAbilityId = id;
            },
        });
    }

    private renderAspectRow(item: any): HTMLElement {
        return this.renderAbilityLikeRow(item, {
            label: t("EZD6.ItemLabels.Aspect", "Aspect"),
            labelLower: t("EZD6.ItemLabels.Aspect", "Aspect"),
            defaultIcon: "icons/environment/people/group.webp",
            listSelector: ".ezd6-aspect-list",
            rowSelector: ".ezd6-aspect-row",
            detailSelector: ".ezd6-aspect-detail",
            itemClassName: "ezd6-ability-item ezd6-aspect-item",
            rowClassName: "ezd6-ability-row ezd6-aspect-row",
            detailClassName: "ezd6-ability-detail ezd6-aspect-detail",
            expandedId: this.expandedAspectId,
            setExpandedId: (id) => {
                this.expandedAspectId = id;
            },
        });
    }

    private renderAbilityLikeRow(
        item: any,
        options: {
            label: string;
            labelLower: string;
            defaultIcon: string;
            listSelector: string;
            rowSelector: string;
            detailSelector: string;
            itemClassName: string;
            rowClassName: string;
            detailClassName: string;
            expandedId: string | null;
            setExpandedId: (id: string | null) => void;
        }
    ): HTMLElement {
        const isArchetype = (this.options.mode ?? "character") === "archetype";
        const system = item?.system ?? {};
        const numberOfDice = Math.max(0, Number(system.numberOfDice) || 0);
        const tag = typeof system.tag === "string"
            ? system.tag
            : typeof system.tag === "number"
                ? String(system.tag)
                : "";
        const rawDescription = typeof system.description === "string" ? system.description : "";
        const nameFallback = item?.name ?? options.label;
        const description = this.getLocalizedItemDescription(item, rawDescription);
        const displayName = this.getLocalizedItemName(item, nameFallback);
        const descriptionHtml = this.renderDescriptionHtml(description);
        const canEdit = Boolean(this.options.editable);
        const wrapper = createElement("div", options.itemClassName);
        if (item?.id) {
            wrapper.dataset.itemId = item.id;
        }
        wrapper.draggable = Boolean(this.options.editable);
        const row = createElement("div", options.rowClassName);
        row.setAttribute("role", "button");
        row.tabIndex = 0;
        row.title = t("EZD6.Actions.ToggleDetails", "Toggle details");

        const iconWrap = createElement("span", "ezd6-ability-icon");
        const icon = createElement("img", "ezd6-ability-icon__img") as HTMLImageElement;
        const abilityIcon = item?.img && item.img !== LEGACY_DEFAULT_ICON
            ? item.img
            : options.defaultIcon;
        icon.src = abilityIcon;
        icon.alt = displayName || tf("EZD6.Alts.ItemIcon", { label: options.label }, `${options.label} icon`);
        icon.draggable = false;
        iconWrap.appendChild(icon);

        const title = createElement("span", "ezd6-ability-row__title", displayName);
        row.append(iconWrap, title);

        if (numberOfDice > 0) {
            const rollBtn = createRollButton({
                className: "ezd6-task-btn ezd6-ability-roll-btn",
                title: tf(
                    "EZD6.Tooltips.RollWithTag",
                    { dice: numberOfDice, tag: this.normalizeAbilityTag(tag) },
                    `Roll ${numberOfDice}d6 ${this.normalizeAbilityTag(tag)}`
                ).trim(),
                kinds: buildStandardRollKinds(numberOfDice),
                onClick: (event) => {
                    event.stopPropagation();
                    this.rollAbilityItem(item, numberOfDice, tag, description, options.label);
                },
            });
            if (isArchetype) {
                rollBtn.disabled = true;
                rollBtn.setAttribute("aria-disabled", "true");
            }
            row.appendChild(rollBtn);
        }

        const detail = createElement("div", options.detailClassName);
        let messageBtn: HTMLButtonElement | null = null;
        const actionButtons: HTMLButtonElement[] = [];
        if (canEdit) {
            messageBtn = createElement("button", "ezd6-ability-msg-btn") as HTMLButtonElement;
            messageBtn.type = "button";
            messageBtn.title = tf(
                "EZD6.Actions.PostToChat",
                { label: options.labelLower },
                `Post ${options.labelLower} to chat`
            );
            messageBtn.appendChild(createElement("i", "fas fa-comment"));
            messageBtn.addEventListener("click", (event) => {
                event.stopPropagation();
                this.postAbilityMessage(item, description, options.label);
            });

            const editBtn = createElement("button", "ezd6-ability-edit-btn") as HTMLButtonElement;
            editBtn.type = "button";
            editBtn.title = tf("EZD6.Actions.Edit", { label: options.labelLower }, `Edit ${options.labelLower}`);
            editBtn.appendChild(createElement("i", "fas fa-pen"));
            editBtn.addEventListener("click", (event) => {
                event.stopPropagation();
                if (this.options.itemSource?.openItemEditor) {
                    this.options.itemSource.openItemEditor(item, () => {
                        const list = wrapper.parentElement ?? wrapper;
                        this.reRender(list);
                    });
                    return;
                }
                item?.sheet?.render?.(true);
            });

            const deleteBtn = createElement("button", "ezd6-ability-delete-btn") as HTMLButtonElement;
            deleteBtn.type = "button";
            deleteBtn.title = tf("EZD6.Actions.Delete", { label: options.labelLower }, `Delete ${options.labelLower}`);
            deleteBtn.appendChild(createElement("i", "fas fa-trash"));
            deleteBtn.addEventListener("click", async (event) => {
                event.stopPropagation();
                if (this.options.itemSource?.deleteItem && item?.id) {
                    await this.options.itemSource.deleteItem(item.id);
                } else {
                    await item?.delete?.();
                }
                const list = wrapper.parentElement ?? wrapper;
                this.reRender(list);
            });
            actionButtons.push(editBtn, deleteBtn);
        }

        const tagSpan = createElement("span", "ezd6-ability-tag", this.normalizeAbilityTag(tag));
        const detailContent = buildDetailContent({
            prefix: "ezd6-ability",
            description: descriptionHtml,
            metaItems: [tagSpan],
            messageButton: messageBtn ?? undefined,
            actionButtons,
        });
        detail.append(detailContent);

        wireExpandableRow({
            wrapper,
            row,
            detail,
            listSelector: options.listSelector,
            rowSelector: options.rowSelector,
            detailSelector: options.detailSelector,
            id: item?.id ?? null,
            expandedId: options.expandedId,
            setExpandedId: options.setExpandedId,
            ignoreSelector: ".ezd6-ability-roll-btn, .ezd6-ability-msg-btn, .ezd6-ability-edit-btn, .ezd6-ability-delete-btn",
        });

        wrapper.append(row, detail);
        return wrapper;
    }

    private renderEquipmentRow(item: any): HTMLElement {
        const isArchetype = (this.options.mode ?? "character") === "archetype";
        const system = item?.system ?? {};
        const rawDescription = typeof system.description === "string" ? system.description : "";
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
        const canEdit = Boolean(this.options.editable);

        const equipmentLabel = t("EZD6.ItemLabels.Equipment", "Equipment");
        const nameFallback = item?.name ?? equipmentLabel;
        const displayName = this.getLocalizedItemName(item, nameFallback);
        const description = this.getLocalizedItemDescription(item, rawDescription);
        const descriptionHtml = this.renderDescriptionHtml(description);
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
        row.title = t("EZD6.Actions.ToggleDetails", "Toggle details");

        const iconWrap = createElement("span", "ezd6-equipment-icon");
        const icon = createElement("img", "ezd6-equipment-icon__img") as HTMLImageElement;
        icon.src = item?.img || "icons/containers/bags/coinpouch-simple-leather-tan.webp";
        icon.alt = displayName || tf("EZD6.Alts.ItemIcon", { label: equipmentLabel }, `${equipmentLabel} icon`);
        icon.draggable = false;
        iconWrap.appendChild(icon);

        const title = createElement("span", "ezd6-equipment-row__title", displayName);
        row.append(iconWrap, title);

        const qtySlot = createElement("div", "ezd6-equipment-qty-slot");
        if (isQuantifiable) {
            const qtyWrap = createElement("div", "ezd6-equipment-qty");
            const decBtn = createElement("button", "ezd6-qty-btn", "-") as HTMLButtonElement;
            const incBtn = createElement("button", "ezd6-qty-btn", "+") as HTMLButtonElement;
            const value = createElement("span", "ezd6-qty-value", String(quantity));
            decBtn.type = "button";
            incBtn.type = "button";
            decBtn.disabled = !canEdit || quantity <= 0;
            decBtn.title = t("EZD6.Tooltips.DecreaseQuantity", "Decrease quantity");
            incBtn.title = t("EZD6.Tooltips.IncreaseQuantity", "Increase quantity");
            incBtn.disabled = !canEdit;

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
                title: tf(
                    "EZD6.Tooltips.RollWithTag",
                    { dice: numberOfDice, tag: this.normalizeAbilityTag(tag) },
                    `Roll ${numberOfDice}d6 ${this.normalizeAbilityTag(tag)}`
                ).trim(),
                kinds: buildStandardRollKinds(numberOfDice),
                onClick: (event) => {
                    event.stopPropagation();
                    this.rollEquipmentItem(item, numberOfDice, tag, description, quantity, isQuantifiable);
                },
            });
            if (isArchetype) {
                rollBtn.disabled = true;
                rollBtn.setAttribute("aria-disabled", "true");
            }
            rollSlot.appendChild(rollBtn);
        } else if (isQuantifiable) {
            rollSlot.appendChild(createElement("span", "ezd6-equipment-roll-spacer"));
        }
        row.appendChild(rollSlot);

        const detail = createElement("div", "ezd6-equipment-detail");
        let messageBtn: HTMLButtonElement | null = null;
        const actionButtons: HTMLButtonElement[] = [];
        if (canEdit) {
            messageBtn = createElement("button", "ezd6-equipment-msg-btn") as HTMLButtonElement;
            messageBtn.type = "button";
            messageBtn.title = tf(
                "EZD6.Actions.PostToChat",
                { label: equipmentLabel },
                "Post equipment to chat"
            );
            messageBtn.appendChild(createElement("i", "fas fa-comment"));
            messageBtn.addEventListener("click", (event) => {
                event.stopPropagation();
                this.postEquipmentMessage(item, description, quantity, isQuantifiable);
            });

            const editBtn = createElement("button", "ezd6-equipment-edit-btn") as HTMLButtonElement;
            editBtn.type = "button";
            editBtn.title = tf("EZD6.Actions.Edit", { label: equipmentLabel }, "Edit equipment");
            editBtn.appendChild(createElement("i", "fas fa-pen"));
            editBtn.addEventListener("click", (event) => {
                event.stopPropagation();
                if (this.options.itemSource?.openItemEditor) {
                    this.options.itemSource.openItemEditor(item, () => {
                        const list = wrapper.parentElement ?? wrapper;
                        this.reRender(list);
                    });
                    return;
                }
                item?.sheet?.render?.(true);
            });

            const deleteBtn = createElement("button", "ezd6-equipment-delete-btn") as HTMLButtonElement;
            deleteBtn.type = "button";
            deleteBtn.title = tf("EZD6.Actions.Delete", { label: equipmentLabel }, "Delete equipment");
            deleteBtn.appendChild(createElement("i", "fas fa-trash"));
            deleteBtn.addEventListener("click", async (event) => {
                event.stopPropagation();
                if (this.options.itemSource?.deleteItem && item?.id) {
                    await this.options.itemSource.deleteItem(item.id);
                } else {
                    await item?.delete?.();
                }
                const list = wrapper.parentElement ?? wrapper;
                this.reRender(list);
            });
            actionButtons.push(editBtn, deleteBtn);
        }

        const tagSpan = createElement("span", "ezd6-equipment-tag", this.normalizeAbilityTag(tag));
        const detailContent = buildDetailContent({
            prefix: "ezd6-equipment",
            description: descriptionHtml,
            metaItems: [tagSpan],
            messageButton: messageBtn ?? undefined,
            actionButtons,
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
        const { block: sectionBlock, section } = this.buildSectionBlock(
            t("EZD6.Sections.Resources", "Resources"),
            "ezd6-section--resources"
        );
        const titleRow = createElement("div", "ezd6-section__title-row");
        const titleLabel = createElement("div", "ezd6-section__title", t("EZD6.Sections.Resources", "Resources"));
        titleRow.append(titleLabel);
        if (this.options.editable) {
            const addBtn = createElement("button", "ezd6-section__add-btn", "+") as HTMLButtonElement;
            addBtn.type = "button";
            addBtn.title = t("EZD6.Actions.AddResource", "Add resource");
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
        const resourceLabel = t("EZD6.ItemLabels.Resource", "Resource");
        const wrapper = createElement("div", "ezd6-resource-item");
        wrapper.dataset.resourceId = resource.id;
        wrapper.dataset.itemId = resource.id;
        wrapper.draggable = Boolean(this.options.editable);
        const canEdit = Boolean(this.options.editable);
        const row = createElement("div", "ezd6-resource-row");
        row.setAttribute("role", "button");
        row.tabIndex = 0;
        row.title = t("EZD6.Actions.ToggleDetails", "Toggle details");

        const fallbackTitle = typeof resource.title === "string" ? resource.title.trim() || resourceLabel : resourceLabel;
        const title = this.getLocalizedResourceTitle(resource, fallbackTitle);

        const subBtn = createElement("button", "ezd6-qty-btn", "-") as HTMLButtonElement;
        const addBtn = createElement("button", "ezd6-qty-btn", "+") as HTMLButtonElement;
        subBtn.type = "button";
        addBtn.type = "button";
        subBtn.title = t("EZD6.Tooltips.DecreaseResource", "Decrease resource");
        addBtn.title = t("EZD6.Tooltips.IncreaseResource", "Increase resource");

        const counter = createElement("div", "ezd6-resource-counter");
        const currentValue = this.getResourceValue(resource);
        subBtn.disabled = !canEdit || currentValue <= 0;
        addBtn.disabled = !canEdit;
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
        const { block: sectionBlock, section } = this.buildSectionBlock(
            t("EZD6.Sections.Saves", "Saves"),
            "ezd6-section--saves"
        );
        const titleRow = createElement("div", "ezd6-section__title-row");
        const titleLabel = createElement("div", "ezd6-section__title", t("EZD6.Sections.Saves", "Saves"));
        titleRow.append(titleLabel);
        if (this.options.editable) {
            const addBtn = createElement("button", "ezd6-section__add-btn", "+") as HTMLButtonElement;
            addBtn.type = "button";
            addBtn.title = t("EZD6.Actions.AddSave", "Add save");
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

    private renderAspectSection(): HTMLElement {
        return this.renderAbilityLikeSection({
            title: t("EZD6.Sections.Aspects", "Aspects"),
            sectionClass: "ezd6-section--aspects",
            addTitle: t("EZD6.Actions.AddAspect", "Add aspect"),
            listClass: "ezd6-aspect-list",
            dragType: "aspect",
            getItems: () => this.getAspectItems(),
            renderRow: (item) => this.renderAspectRow(item),
            onCreate: async (section) => {
                await this.createAspectItem();
                this.refreshAspectList(section);
            },
        });
    }

    private renderAbilityLikeSection(options: {
        title: string;
        sectionClass: string;
        addTitle: string;
        listClass: string;
        dragType: "ability" | "aspect";
        getItems: () => any[];
        renderRow: (item: any) => HTMLElement;
        onCreate: (section: HTMLElement) => Promise<void>;
    }): HTMLElement {
        const { block: sectionBlock, section } = this.buildSectionBlock(options.title, options.sectionClass);
        const titleRow = createElement("div", "ezd6-section__title-row");
        const titleLabel = createElement("div", "ezd6-section__title", options.title);
        titleRow.append(titleLabel);
        if (this.options.editable) {
            const addBtn = createElement("button", "ezd6-section__add-btn", "+") as HTMLButtonElement;
            addBtn.type = "button";
            addBtn.title = options.addTitle;
            addBtn.addEventListener("click", async () => {
                await options.onCreate(section);
            });
            titleRow.append(addBtn);
        }
        const existingTitle = sectionBlock.querySelector(".ezd6-section__title");
        if (existingTitle) {
            existingTitle.replaceWith(titleRow);
        } else {
            sectionBlock.prepend(titleRow);
        }

        const list = createElement("div", options.listClass);
        this.enableDragReorder(list, options.dragType);
        this.appendCategorizedRows(
            list,
            options.getItems(),
            (item) => item?.system?.category ?? "",
            (item) => options.renderRow(item)
        );
        section.appendChild(list);

        return sectionBlock;
    }

    private renderSaveRow(save: Save): HTMLElement {
        const isArchetype = (this.options.mode ?? "character") === "archetype";
        const saveLabel = t("EZD6.ItemLabels.Save", "Save");
        const wrapper = createElement("div", "ezd6-save-item");
        wrapper.dataset.itemId = save.id;
        wrapper.draggable = Boolean(this.options.editable);
        const row = createElement("div", "ezd6-save-row");
        row.setAttribute("role", "button");
        row.tabIndex = 0;
        row.title = t("EZD6.Actions.ToggleDetails", "Toggle details");

        const fallbackTitle = typeof save.title === "string" ? save.title.trim() || saveLabel : saveLabel;
        const title = this.getLocalizedSaveTitle(save, fallbackTitle);
        const targetValue = this.getSaveTargetValue(save);
        const targetLabel = this.getSaveTargetLabel(targetValue);
        const diceCount = this.getSaveDiceCount(save);
        const iconPath = this.getSaveIcon(save);

        const iconWrap = createElement("span", "ezd6-ability-icon ezd6-save-icon");
        const icon = createElement("img", "ezd6-ability-icon__img") as HTMLImageElement;
        icon.src = iconPath;
        icon.alt = tf("EZD6.Alts.ItemIcon", { label: title }, `${title} icon`);
        icon.draggable = false;
        iconWrap.appendChild(icon);

        const name = createElement("span", "ezd6-save-row__title", title);

        const target = createElement("div", "ezd6-save-target");
        const targetBadge = createElement("strong", "ezd6-save-target-number", targetLabel);
        target.appendChild(targetBadge);

        const rollBtn = createRollButton({
            className: "ezd6-task-btn ezd6-save-roll-btn",
            title: this.buildSaveRollTitle(diceCount, targetValue),
            kinds: buildStandardRollKinds(diceCount),
            onClick: async (event) => {
                event.stopPropagation();
                const keyword = this.getSaveTargetKeyword(targetValue);
                const performRoll = async (rolledDiceCount: number) => {
                    await this.rollSaveWithDice(save, rolledDiceCount);
                };
                await this.maybePromptPowerRoll(keyword, diceCount, performRoll);
            },
        });
        if (isArchetype) {
            rollBtn.disabled = true;
            rollBtn.setAttribute("aria-disabled", "true");
        }

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
        const tag = this.getResourceTag(resource);
        const canEdit = Boolean(this.options.editable);
        const resourceLabel = t("EZD6.ItemLabels.Resource", "Resource");
        let messageBtn: HTMLButtonElement | null = null;
        if (canEdit) {
            messageBtn = createElement("button", "ezd6-resource-msg-btn") as HTMLButtonElement;
            messageBtn.type = "button";
            messageBtn.title = tf("EZD6.Actions.PostToChat", { label: resourceLabel }, "Post resource to chat");
            messageBtn.appendChild(createElement("i", "fas fa-comment"));
            messageBtn.addEventListener("click", (event) => {
                event.stopPropagation();
                this.postResourceMessage(resource);
            });
        }

        const actionButtons: HTMLButtonElement[] = [];
        if (canEdit) {
            const editBtn = createElement("button", "ezd6-equipment-edit-btn") as HTMLButtonElement;
            editBtn.type = "button";
            editBtn.title = tf("EZD6.Actions.Edit", { label: resourceLabel }, "Edit resource");
            editBtn.appendChild(createElement("i", "fas fa-pen"));
            editBtn.addEventListener("click", (event) => {
                event.stopPropagation();
                void this.editResource(resource, wrapper);
            });
            actionButtons.push(editBtn);
            const deleteBtn = createElement("button", "ezd6-equipment-delete-btn") as HTMLButtonElement;
            deleteBtn.type = "button";
            deleteBtn.title = tf("EZD6.Actions.Delete", { label: resourceLabel }, "Delete resource");
            deleteBtn.appendChild(createElement("i", "fas fa-trash"));
            deleteBtn.addEventListener("click", async (event) => {
                event.stopPropagation();
                const root = wrapper.closest(".ezd6-sheet") as HTMLElement | null;
                await this.deleteResource(resource.id, root ?? undefined);
            });
            actionButtons.push(deleteBtn);
        }

        const tagSpan = createElement("span", "ezd6-resource-tag", tag);
        const rawDescription = typeof resource.description === "string" ? resource.description : "";
        const description = this.getLocalizedResourceDescription(resource, rawDescription);
        return buildDetailContent({
            prefix: "ezd6-resource",
            description: this.renderDescriptionHtml(description),
            metaItems: [tagSpan],
            messageButton: messageBtn ?? undefined,
            actionButtons,
            actionsSingleClass: "is-single",
        });
    }

    private buildSaveDetailContent(save: Save, wrapper: HTMLElement): HTMLElement {
        const targetValue = this.getSaveTargetValue(save);
        const tag = this.getSaveTargetTag(targetValue);
        const canEdit = Boolean(this.options.editable);
        const saveLabel = t("EZD6.ItemLabels.Save", "Save");
        let messageBtn: HTMLButtonElement | null = null;
        if (canEdit) {
            messageBtn = createElement("button", "ezd6-save-msg-btn") as HTMLButtonElement;
            messageBtn.type = "button";
            messageBtn.title = tf("EZD6.Actions.PostToChat", { label: saveLabel }, "Post save to chat");
            messageBtn.appendChild(createElement("i", "fas fa-comment"));
            messageBtn.addEventListener("click", (event) => {
                event.stopPropagation();
                this.postSaveMessage(save);
            });
        }

        const actionButtons: HTMLButtonElement[] = [];
        if (canEdit) {
            const editBtn = createElement("button", "ezd6-equipment-edit-btn") as HTMLButtonElement;
            editBtn.type = "button";
            editBtn.title = tf("EZD6.Actions.Edit", { label: saveLabel }, "Edit save");
            editBtn.appendChild(createElement("i", "fas fa-pen"));
            editBtn.addEventListener("click", (event) => {
                event.stopPropagation();
                void this.editSave(save, wrapper);
            });

            const deleteBtn = createElement("button", "ezd6-equipment-delete-btn") as HTMLButtonElement;
            deleteBtn.type = "button";
            deleteBtn.title = tf("EZD6.Actions.Delete", { label: saveLabel }, "Delete save");
            deleteBtn.appendChild(createElement("i", "fas fa-trash"));
            deleteBtn.addEventListener("click", async (event) => {
                event.stopPropagation();
                const root = wrapper.closest(".ezd6-sheet") as HTMLElement | null;
                await this.deleteSave(save.id, root ?? undefined);
            });

            actionButtons.push(editBtn, deleteBtn);
        }

        const tagSpan = createElement("span", "ezd6-save-tag", tag);
        const rawDescription = typeof save.description === "string" ? save.description : "";
        const description = this.getLocalizedSaveDescription(save, rawDescription);
        return buildDetailContent({
            prefix: "ezd6-save",
            description: this.renderDescriptionHtml(description),
            metaItems: [tagSpan],
            messageButton: messageBtn ?? undefined,
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
        if (mode === "reset") {
            return tf(
                "EZD6.Replenish.TitleReset",
                { cost, targetTag },
                `Reset by spending ${cost} ${targetTag}`
            ).trim();
        }
        return tf(
            "EZD6.Replenish.TitleRestore",
            { cost, targetTag },
            `Restore 1 by spending ${cost} ${targetTag}`
        ).trim();
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
        const match = candidates.find((entry) => {
            if (typeof entry !== "string") return false;
            const trimmed = entry.trim();
            return trimmed !== "" && trimmed !== LEGACY_DEFAULT_ICON;
        });
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

    private async rollResource(resource: Resource, diceCountOverride?: number) {
        const override = Number.isFinite(diceCountOverride) ? Math.floor(diceCountOverride as number) : null;
        const diceCount = override !== null ? Math.max(0, override) : this.getResourceDiceCount(resource);
        if (diceCount <= 0) return;
        const tag = this.normalizeAbilityTag(resource.rollKeyword ?? "default");
        const resourceLabel = t("EZD6.ItemLabels.Resource", "Resource");
        const fallbackTitle = typeof resource.title === "string" ? resource.title.trim() || resourceLabel : resourceLabel;
        const title = this.getLocalizedResourceTitle(resource, fallbackTitle);
        const icon = this.getResourceIcon(resource);
        const roll = new Roll(`${diceCount}d6`, {});
        await roll.evaluate();
        const flavor = `${title} ${tag}`.trim();
        const rawDescription = typeof resource.description === "string" ? resource.description : "";
        const description = this.getLocalizedResourceDescription(resource, rawDescription);
        await roll.toMessage({
            flavor,
            speaker: this.getChatSpeaker(),
            flags: {
                [EZD6_META_FLAG]: buildRollMeta({
                    title,
                    description,
                    tag,
                    icon,
                    kind: "resource",
                    resourceValue: this.getResourceValue(resource),
                    resourceMax: this.getResourceMaxValue(resource),
                    resourceIcon: icon,
                }),
            },
        });
    }

    private async rollSaveWithDice(save: Save, diceCountOverride?: number) {
        const override = Number.isFinite(diceCountOverride) ? Math.floor(diceCountOverride as number) : null;
        const diceCount = override !== null ? this.clampInt(override, 1, 6) : this.getSaveDiceCount(save);
        const roll = new Roll(`${diceCount}d6`, {});
        await roll.evaluate();
        const target = this.getSaveTargetValue(save);
        const tag = this.getSaveTargetTag(target);
        const saveLabel = t("EZD6.ItemLabels.Save", "Save");
        const fallbackTitle = typeof save.title === "string" ? save.title.trim() || saveLabel : saveLabel;
        const saveTitle = this.getLocalizedSaveTitle(save, fallbackTitle);
        const flavor = `${saveTitle} ${tag}`.trim();
        const icon = this.getSaveIcon(save);
        const rawDescription = typeof save.description === "string" ? save.description : "";
        const description = this.getLocalizedSaveDescription(save, rawDescription);
        await roll.toMessage({
            flavor,
            speaker: this.getChatSpeaker(),
            flags: {
                [EZD6_META_FLAG]: buildRollMeta({
                    title: saveTitle,
                    description,
                    tag,
                    icon,
                    kind: "save",
                    saveTarget: target,
                }),
            },
        });
    }

    private renderResourceCounter(counter: HTMLElement, resource: Resource, maxIcons: number = 6) {
        const resourceLabel = t("EZD6.ItemLabels.Resource", "Resource");
        const fallbackTitle = typeof resource.title === "string" ? resource.title.trim() || resourceLabel : resourceLabel;
        const title = this.getLocalizedResourceTitle(resource, fallbackTitle);
        const iconPath = this.getResourceIcon(resource);
        const currentValue = this.getResourceValue(resource);
        const maxValue = this.getResourceMaxValue(resource);
        renderResourceCounterShared(counter, {
            title,
            iconPath,
            currentValue,
            maxValue,
            maxIcons,
        });
    }

    private renderResourceRoll(slot: HTMLElement, resource: Resource) {
        const isArchetype = (this.options.mode ?? "character") === "archetype";
        slot.innerHTML = "";
        slot.classList.remove("has-replenish");
        const diceCount = this.getResourceDiceCount(resource);
        const currentValue = this.getResourceValue(resource);
        const replenishState = this.getResourceReplenishState(resource);
        if (this.canShowReplenishButton(resource, replenishState, diceCount, currentValue)) {
            slot.classList.add("has-replenish");
            const target = replenishState.target;
            const cost = this.getResourceReplenishCost(resource);
            const targetTag = this.getResourceTag(target);
            const targetIcon = this.getResourceIcon(target);
            const btn = createElement("button", "ezd6-task-btn ezd6-resource-replenish-btn") as HTMLButtonElement;
            const iconWrap = createElement("span", "ezd6-icon-slash");
            const icon = createElement("img", "ezd6-resource-replenish-icon") as HTMLImageElement;
            btn.type = "button";
            btn.disabled = replenishState.disabled;
            btn.dataset.ezd6IntentDisabled = btn.disabled ? "1" : "0";
            btn.title = this.buildReplenishTitle(replenishState.mode ?? "reset", cost, targetTag);
            icon.src = targetIcon;
            icon.alt = targetTag || t("EZD6.Labels.Replenish", "Replenish");
            icon.draggable = false;
            if (btn.disabled) {
                icon.classList.add("ezd6-resource-replenish-icon--disabled");
            }
            iconWrap.appendChild(icon);
            btn.appendChild(iconWrap);
            btn.addEventListener("click", async (event) => {
                event.stopPropagation();
                if (btn.disabled) return;
                await this.applyReplenishAction(resource, replenishState, slot);
            });
            slot.appendChild(btn);
            return;
        }

        if (diceCount <= 0) return;
        const resourceLabel = t("EZD6.ItemLabels.Resource", "Resource");
        const fallbackTitle = typeof resource.title === "string" ? resource.title.trim() || resourceLabel : resourceLabel;
        const title = this.getLocalizedResourceTitle(resource, fallbackTitle);
        const tag = this.normalizeAbilityTag(resource.rollKeyword ?? "default");
        const keyword = this.getKeywordFromTag(resource.rollKeyword ?? "default");
        const rollBtn = createRollButton({
            className: "ezd6-task-btn ezd6-resource-roll-btn",
            title: tf("EZD6.Tooltips.RollWithTag", { dice: diceCount, tag }, `Roll ${diceCount}d6 ${tag}`).trim(),
            kinds: buildStandardRollKinds(diceCount),
            onClick: async (event) => {
                event.stopPropagation();
                const performRoll = async (rolledDiceCount: number) => {
                    await this.rollResource(resource, rolledDiceCount);
                    this.character.adjustResource(resource.id, -1);
                    const wrapper = slot.closest(".ezd6-resource-item") as HTMLElement | null;
                    if (wrapper) {
                        this.updateResourceRowUI(wrapper, resource);
                    }
                    await this.persistResources();
                };
                await this.maybePromptPowerRoll(keyword, diceCount, performRoll);
            },
        });
        if (isArchetype) {
            rollBtn.disabled = true;
            rollBtn.setAttribute("aria-disabled", "true");
        }
        slot.appendChild(rollBtn);
    }

    private getSaveTargetValue(save: Save): number {
        const raw = Number(save.targetValue);
        if (!Number.isFinite(raw)) return 6;
        return this.clampInt(Math.floor(raw), 1, 7);
    }

    private isMagickSaveTarget(targetValue: number): boolean {
        return targetValue >= 7;
    }

    private getSaveTargetLabel(targetValue: number): string {
        return this.isMagickSaveTarget(targetValue) ? "M" : String(targetValue);
    }

    private getSaveTargetTag(targetValue: number): string {
        return this.isMagickSaveTarget(targetValue) ? "#magicksave" : `#target${targetValue}`;
    }

    private getSaveTargetKeyword(targetValue: number): string {
        return this.isMagickSaveTarget(targetValue) ? "magicksave" : `target${targetValue}`;
    }

    private buildSaveRollTitle(diceCount: number, targetValue: number): string {
        if (this.isMagickSaveTarget(targetValue)) {
            const tag = this.getSaveTargetTag(targetValue);
            return tf(
                "EZD6.Tooltips.RollWithTag",
                { dice: diceCount, tag },
                `Roll ${diceCount}d6 ${tag}`
            ).trim();
        }
        return tf(
            "EZD6.Tooltips.RollSave",
            { dice: diceCount, target: targetValue },
            `Roll ${diceCount}d6 #target${targetValue}`
        ).trim();
    }

    private getSaveDiceCount(save: Save): number {
        const raw = Number(save.numberOfDice);
        return Number.isFinite(raw) ? this.clampInt(Math.floor(raw), 1, 6) : 1;
    }

    private getSaveIcon(save: Save): string {
        const icon = typeof save.icon === "string" ? save.icon.trim() : "";
        if (!icon || icon === LEGACY_DEFAULT_ICON) return "icons/equipment/shield/heater-steel-worn.webp";
        return icon;
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
        try {
            if (this.options.systemUpdater) {
                await this.options.systemUpdater({ [`system.${key}`]: value });
                return;
            }
            if (!this.options.actor?.update) return;
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

    private parseCategory(raw: string): { raw: string; label: string; order: number | null } {
        const trimmed = raw.trim();
        const match = trimmed.match(/^(\d+)(?:\s*\.\s*|\s+)(.+)$/);
        if (!match) {
            return { raw: trimmed, label: this.resolveCategoryLabel(trimmed), order: null };
        }
        const label = this.resolveCategoryLabel(match[2].trim());
        const order = Number.parseInt(match[1], 10);
        return {
            raw: trimmed,
            label: label || trimmed,
            order: Number.isFinite(order) ? order : null,
        };
    }

    private resolveCategoryLabel(raw: string): string {
        const trimmed = raw.trim();
        if (!trimmed) return raw;
        const localized = localize(trimmed, trimmed);
        return localized === trimmed ? raw : localized;
    }

    private renderCategoryDivider(label: string, raw: string): HTMLElement {
        const divider = createElement("div", "ezd6-category-divider", label);
        divider.dataset.category = raw;
        divider.setAttribute("role", "separator");
        return divider;
    }

    private buildCategorizedRows(
        items: any[],
        getCategory: (item: any) => string,
        renderRow: (item: any) => HTMLElement
    ): HTMLElement[] {
        const uncategorized: any[] = [];
        const grouped = new Map<string, { label: string; order: number | null; items: any[] }>();

        items.forEach((item) => {
            const rawCategory = this.normalizeCategory(getCategory(item));
            if (!rawCategory) {
                uncategorized.push(item);
                return;
            }
            const parsed = this.parseCategory(rawCategory);
            const bucket = grouped.get(parsed.raw);
            if (bucket) {
                bucket.items.push(item);
            } else {
                grouped.set(parsed.raw, { label: parsed.label, order: parsed.order, items: [item] });
            }
        });

        const rows: HTMLElement[] = [];
        uncategorized.forEach((item) => rows.push(renderRow(item)));

        const categories = Array.from(grouped.entries())
            .sort((a, b) => {
                const aOrder = a[1].order ?? Number.POSITIVE_INFINITY;
                const bOrder = b[1].order ?? Number.POSITIVE_INFINITY;
                if (aOrder !== bOrder) return aOrder - bOrder;
                return a[1].label.localeCompare(b[1].label, undefined, { sensitivity: "base" });
            });
        categories.forEach(([raw, category]) => {
            rows.push(this.renderCategoryDivider(category.label, raw));
            category.items.forEach((item) => rows.push(renderRow(item)));
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

    refreshAspectList(container: HTMLElement) {
        this.refreshList(container, ".ezd6-aspect-list", () =>
            this.buildCategorizedRows(
                this.getAspectItems(),
                (item) => item?.system?.category ?? "",
                (item) => this.renderAspectRow(item)
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

    private applyReadOnlyOverrides(container: HTMLElement) {
        const isArchetype = (this.options.mode ?? "character") === "archetype";
        if (!this.options.editable || isArchetype) {
            const rollButtons = container.querySelectorAll(".ezd6-task-btn");
            rollButtons.forEach((button) => {
                const btn = button as HTMLButtonElement;
                btn.disabled = true;
                btn.setAttribute("aria-disabled", "true");
            });
        }
        if (isArchetype) {
            const messageButtons = container.querySelectorAll(
                ".ezd6-ability-msg-btn, .ezd6-equipment-msg-btn, .ezd6-resource-msg-btn, .ezd6-save-msg-btn"
            );
            messageButtons.forEach((btn) => (btn as HTMLElement).classList.add("is-hidden"));
        }
    }

    private enableDragReorder(list: HTMLElement, type: "ability" | "aspect" | "equipment" | "resource" | "save") {
        if (!this.options.editable) return;
        const selector = this.getDragSelector(type);
        const dragState: {
            dragged: HTMLElement | null;
            droppedInside: boolean;
            originalOrder: HTMLElement[] | null;
        } = { dragged: null, droppedInside: false, originalOrder: null };

        list.addEventListener("dragstart", (event) => {
            const target = (event.target as HTMLElement | null)?.closest(selector) as HTMLElement | null;
            if (!target) return;
            dragState.dragged = target;
            dragState.droppedInside = false;
            dragState.originalOrder = Array.from(list.children) as HTMLElement[];
            target.classList.add("is-dragging");
            if (event.dataTransfer) {
                const id = target.dataset.itemId ?? "";
                const dragData = this.buildDragData(type, id);
                this.setDragPayload(event.dataTransfer, dragData, id);
            }
        });

        list.addEventListener("dragend", () => {
            if (!dragState.dragged) return;
            dragState.dragged.classList.remove("is-dragging");
            if (!dragState.droppedInside && dragState.originalOrder) {
                list.innerHTML = "";
                dragState.originalOrder.forEach((node) => list.appendChild(node));
            }
            dragState.dragged = null;
            dragState.originalOrder = null;
        });

        list.addEventListener("dragover", (event) => {
            if (!dragState.dragged) return;
            event.preventDefault();
            const targetEl = event.target as HTMLElement | null;
            if (!targetEl) return;
            const target = targetEl.closest(selector) as HTMLElement | null;
            const divider = targetEl.closest(".ezd6-category-divider") as HTMLElement | null;
            const rectSource = target ?? divider;
            if (rectSource) {
                if (rectSource === dragState.dragged) return;
                const rect = rectSource.getBoundingClientRect();
                const shouldInsertAfter = event.clientY > rect.top + rect.height / 2;
                if (shouldInsertAfter) {
                    rectSource.after(dragState.dragged);
                } else {
                    rectSource.before(dragState.dragged);
                }
                return;
            }
            if (targetEl === list) {
                list.appendChild(dragState.dragged);
            }
        });

        list.addEventListener("drop", async (event) => {
            if (!dragState.dragged) return;
            event.preventDefault();
            dragState.droppedInside = true;
            if (type === "ability" || type === "aspect" || type === "equipment") {
                await this.persistItemSort(list, selector);
            } else {
                await this.persistSystemSort(list, selector, type);
            }
        });
    }

    private getDragSelector(type: "ability" | "aspect" | "equipment" | "resource" | "save"): string {
        switch (type) {
            case "ability":
                return ".ezd6-ability-item";
            case "aspect":
                return ".ezd6-aspect-item";
            case "equipment":
                return ".ezd6-equipment-item";
            case "resource":
                return ".ezd6-resource-item";
            case "save":
                return ".ezd6-save-item";
        }
    }

    private setDragPayload(transfer: DataTransfer, dragData: Record<string, any> | null, fallback: string) {
        if (dragData) {
            const raw = JSON.stringify(dragData);
            transfer.effectAllowed = "copyMove";
            transfer.setData("text/plain", raw);
            transfer.setData("application/json", raw);
            return;
        }
        transfer.effectAllowed = "move";
        transfer.setData("text/plain", fallback);
    }

    private async persistItemSort(list: HTMLElement, selector: string) {
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
            if (this.options.itemSource?.updateItemSort) {
                await this.options.itemSource.updateItemSort(updates);
                return;
            }
            const actor = this.options.actor;
            if (!actor?.updateEmbeddedDocuments) return;
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

    private buildDragData(
        type: "ability" | "aspect" | "equipment" | "resource" | "save",
        id: string
    ): Record<string, any> | null {
        if (!id) return null;
        if (type === "ability" || type === "aspect" || type === "equipment") {
            return this.buildEmbeddedItemDragData(id);
        }
        if (type === "resource") {
            return this.buildResourceDragData(id);
        }
        return this.buildSaveDragData(id);
    }

    private buildEmbeddedItemDragData(id: string): Record<string, any> | null {
        const item = this.getActorItemById(id);
        if (!item) return null;
        if (typeof item.toDragData === "function") {
            return item.toDragData();
        }
        const data = typeof item.toObject === "function" ? item.toObject() : item;
        const payload: Record<string, any> = { type: "Item", uuid: item.uuid, data };
        if (this.options.itemSourceOwnerId) {
            payload.sourceOwnerId = this.options.itemSourceOwnerId;
        }
        return payload;
    }

    private buildResourceDragData(id: string): Record<string, any> | null {
        const resource = this.character.resources.find((entry) => entry.id === id);
        if (!resource) return null;
        const resourceLabel = t("EZD6.ItemLabels.Resource", "Resource");
        const fallbackTitle = typeof resource.title === "string" ? resource.title.trim() || resourceLabel : resourceLabel;
        const title = this.getLocalizedResourceTitle(resource, fallbackTitle);
        return {
            type: "Item",
            sourceActorId: this.options.actor?.id ?? null,
            sourceOwnerId: this.options.itemSourceOwnerId ?? null,
            data: {
                name: title,
                type: "resource",
                img: this.getResourceIcon(resource),
                system: {
                    value: this.getResourceValue(resource),
                    defaultValue: this.getResourceDefaultValue(resource),
                    maxValue: this.getResourceMaxValue(resource),
                    defaultMaxValue: this.getResourceMaxValue(resource),
                    description: resource.description ?? "",
                    localizationId: resource.localizationId ?? "",
                    numberOfDice: this.getResourceDiceCount(resource),
                    tag: this.getResourceTag(resource),
                    replenishLogic: this.getResourceReplenishLogic(resource?.replenishLogic),
                    replenishTag: this.getResourceReplenishTag(resource),
                    replenishCost: this.getResourceReplenishCost(resource),
                    publicDisplay: Boolean(resource.publicDisplay),
                },
            },
        };
    }

    private buildSaveDragData(id: string): Record<string, any> | null {
        const save = this.character.saves.find((entry) => entry.id === id);
        if (!save) return null;
        const saveLabel = t("EZD6.ItemLabels.Save", "Save");
        const fallbackTitle = typeof save.title === "string" ? save.title.trim() || saveLabel : saveLabel;
        const title = this.getLocalizedSaveTitle(save, fallbackTitle);
        return {
            type: "Item",
            sourceActorId: this.options.actor?.id ?? null,
            sourceOwnerId: this.options.itemSourceOwnerId ?? null,
            data: {
                name: title,
                type: "save",
                img: this.getSaveIcon(save),
                system: {
                    targetValue: this.getSaveTargetValue(save),
                    numberOfDice: this.getSaveDiceCount(save),
                    description: save.description ?? "",
                    localizationId: save.localizationId ?? "",
                },
            },
        };
    }

    private getActorItemById(id: string): any | null {
        if (this.options.itemSource?.getItemById) {
            return this.options.itemSource.getItemById(id);
        }
        const items = this.options.actor?.items;
        if (!items) return null;
        if (typeof items.get === "function") {
            return items.get(id) ?? null;
        }
        if (typeof items.find === "function") {
            return items.find((item: any) => item?.id === id) ?? null;
        }
        const list = Array.isArray(items) ? items : Array.from(items);
        return list.find((item: any) => item?.id === id) ?? null;
    }

    private getAbilityItems(): any[] {
        return this.getItemsByType("ability");
    }

    private getAspectItems(): any[] {
        return this.getItemsByType("aspect");
    }

    private getEquipmentItems(): any[] {
        return this.getItemsByType("equipment");
    }

    private getItemsByType(type: string): any[] {
        if (this.options.itemSource) {
            const items = this.options.itemSource.getItems(type as "ability" | "aspect" | "equipment") ?? [];
            const list = Array.isArray(items) ? items.slice() : Array.from(items);
            return list.sort((a: any, b: any) => (a.sort ?? 0) - (b.sort ?? 0));
        }
        const items = this.options.actor?.items?.filter?.((item: any) => item.type === type) ?? [];
        const list = Array.isArray(items) ? items.slice() : Array.from(items);
        return list.sort((a: any, b: any) => (a.sort ?? 0) - (b.sort ?? 0));
    }

    private async createAbilityItem() {
        await this.createAbilityLikeItem("ability");
    }

    private async createAspectItem() {
        await this.createAbilityLikeItem("aspect");
    }

    private async createAbilityLikeItem(type: "ability" | "aspect") {
        const label = type === "ability"
            ? t("EZD6.ItemLabels.Ability", "Ability")
            : t("EZD6.ItemLabels.Aspect", "Aspect");
        const data = {
            name: label,
            type,
            system: {
                description: "",
                numberOfDice: 0,
                tag: "",
                category: "",
            },
        };
        if (this.options.itemSource?.createItem) {
            await this.options.itemSource.createItem(data);
            return;
        }
        const actor = this.options.actor;
        if (!actor?.createEmbeddedDocuments) return;
        const [created] = await actor.createEmbeddedDocuments("Item", [data]);
        created?.sheet?.render?.(true);
    }

    private async createEquipmentItem() {
        const label = t("EZD6.ItemLabels.Equipment", "Equipment");
        const data = {
            name: label,
            type: "equipment",
            system: {
                description: "",
                quantifiable: false,
                quantity: 1,
                numberOfDice: 0,
                tag: "",
                category: "",
            },
        };
        if (this.options.itemSource?.createItem) {
            await this.options.itemSource.createItem(data);
            return;
        }
        const actor = this.options.actor;
        if (!actor?.createEmbeddedDocuments) return;
        const [created] = await actor.createEmbeddedDocuments("Item", [data]);
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

    private getKeywordFromTag(tag: string): string {
        const normalized = this.normalizeAbilityTag(tag);
        const raw = normalized.startsWith("#") ? normalized.slice(1) : normalized;
        return raw.toLowerCase();
    }

    private async maybePromptPowerRoll(
        keyword: string,
        defaultDiceCount: number,
        roll: (diceCount: number) => Promise<void>
    ) {
        const rule = resolveKeywordRule(keyword);
        if (!rule.rollPower) {
            await roll(defaultDiceCount);
            return;
        }
        const picked = await this.showPowerRollDialog(rule.rollDialogue);
        if (picked === null) return;
        await roll(picked);
    }

    private async showPowerRollDialog(dialogue: string): Promise<number | null> {
        return await new Promise<number | null>((resolve) => {
            const dialog = new Dialog({
                title: t("EZD6.Dialogs.PowerRollTitle", "Power Roll"),
                content: `<div class="ezd6-power-roll-dialogue"></div>`,
                buttons: {},
                render: (html: any) => {
                    const root = html?.[0] as HTMLElement | undefined;
                    const container = root?.querySelector(".ezd6-power-roll-dialogue") as HTMLElement | null;
                    if (!container) return;
                    container.innerHTML = "";
                    const trimmed = (dialogue ?? "").trim();
                    if (trimmed) {
                        const text = createElement("div", "ezd6-power-roll-dialogue__text");
                        text.innerHTML = trimmed;
                        container.appendChild(text);
                    }
                    const buttons = createElement("div", "ezd6-task-buttons");
                    [1, 2, 3].forEach((diceCount) => {
                        const btn = createRollButton({
                            className: "ezd6-task-btn ezd6-power-roll-btn",
                            title: tf(
                                "EZD6.Tooltips.DiceCount",
                                { count: diceCount },
                                `${diceCount} die${diceCount === 1 ? "" : "s"}`
                            ),
                            kinds: Array.from({ length: diceCount }, () => "grey" as const),
                            onClick: (event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                resolve(diceCount);
                                dialog.close();
                            },
                        });
                        buttons.appendChild(btn);
                    });
                    container.appendChild(buttons);
                },
                close: () => resolve(null),
            });
            dialog.render(true);
        });
    }

    private async postAbilityMessage(item: any, description: string, label = t("EZD6.ItemLabels.Ability", "Ability")) {
        if (!item) return;
        const title = this.getLocalizedItemName(item, label);
        const tag = this.normalizeAbilityTag(item?.system?.tag ?? "");
        const icon = item?.type === "aspect"
            ? (item?.img && item.img !== LEGACY_DEFAULT_ICON
                ? item.img
                : "icons/environment/people/group.webp")
            : (item?.img && item.img !== LEGACY_DEFAULT_ICON
                ? item.img
                : "icons/magic/symbols/cog-orange-red.webp");
        const descHtml = this.renderDescriptionHtml(description);
        const contentPieces = [
            `<strong>${title}</strong>`,
            descHtml ? `<div>${descHtml}</div>` : "",
        ];
        await ChatMessage.create({
            content: contentPieces.join(""),
            speaker: this.getChatSpeaker(),
            flags: {
                [EZD6_META_FLAG]: buildInfoMeta({
                    title,
                    description: descHtml,
                    tag,
                    icon,
                    kind: "generic",
                }),
            },
        });
    }

    private async postEquipmentMessage(item: any, description: string, quantity: number, isQuantifiable: boolean) {
        if (!item) return;
        const descHtml = this.renderDescriptionHtml(description);
        const details = isQuantifiable
            ? `<div>${tf("EZD6.Chat.QuantityLine", { quantity }, `Quantity: ${quantity}`)}</div>`
            : "";
        const tag = this.normalizeAbilityTag(item?.system?.tag ?? "");
        const equipmentLabel = t("EZD6.ItemLabels.Equipment", "Equipment");
        const nameFallback = item?.name ?? equipmentLabel;
        const title = this.getLocalizedItemName(item, nameFallback);
        const icon = item?.img || "icons/containers/bags/coinpouch-simple-leather-tan.webp";
        const qtyValue = Math.max(0, Math.floor(Number(quantity ?? 0)));
        const contentPieces = [
            `<strong>${title}</strong>`,
            descHtml ? `<div>${descHtml}</div>` : "",
            tag ? `<div>${tag}</div>` : "",
            details,
        ];
        await ChatMessage.create({
            content: contentPieces.join(""),
            speaker: this.getChatSpeaker(),
            flags: {
                [EZD6_META_FLAG]: buildInfoMeta({
                    title,
                    description: descHtml,
                    tag,
                    icon,
                    kind: "equipment",
                    equipmentQty: qtyValue,
                }),
            },
        });
    }

    private async postResourceMessage(resource: Resource) {
        if (!resource) return;
        const resourceLabel = t("EZD6.ItemLabels.Resource", "Resource");
        const fallbackTitle = typeof resource.title === "string" ? resource.title.trim() || resourceLabel : resourceLabel;
        const title = this.getLocalizedResourceTitle(resource, fallbackTitle);
        const tag = this.getResourceTag(resource);
        const icon = this.getResourceIcon(resource);
        const rawDescription = typeof resource.description === "string" ? resource.description : "";
        const description = this.getLocalizedResourceDescription(resource, rawDescription);
        const descHtml = this.renderDescriptionHtml(description);
        const value = this.getResourceValue(resource);
        const maxValue = this.getResourceMaxValue(resource);
        const contentPieces = [
            `<strong>${title}</strong>`,
            descHtml ? `<div>${descHtml}</div>` : "",
        ];
        await ChatMessage.create({
            content: contentPieces.join(""),
            speaker: this.getChatSpeaker(),
            flags: {
                [EZD6_META_FLAG]: buildInfoMeta({
                    title,
                    description: descHtml,
                    tag,
                    icon,
                    kind: "resource",
                    resourceValue: value,
                    resourceMax: maxValue,
                    resourceIcon: icon,
                }),
            },
        });
    }

    private async rollAbilityItem(
        item: any,
        numberOfDice: number,
        tag: string,
        description: string,
        label = t("EZD6.ItemLabels.Ability", "Ability")
    ) {
        if (!item) return;
        const title = this.getLocalizedItemName(item, label);
        if (numberOfDice > 0) {
            const normalizedTag = this.normalizeAbilityTag(tag);
            const keyword = this.getKeywordFromTag(tag);
            const rollWithDice = async (diceCount: number) => {
                const formula = `${diceCount}d6`;
                const flavor = `${title} ${normalizedTag}`.trim();
                const icon = item?.type === "aspect"
                    ? (item?.img && item.img !== LEGACY_DEFAULT_ICON
                        ? item.img
                        : "icons/environment/people/group.webp")
                    : (item?.img && item.img !== LEGACY_DEFAULT_ICON
                        ? item.img
                        : "icons/magic/symbols/cog-orange-red.webp");
                const descHtml = this.renderDescriptionHtml(description);
                const roll = new Roll(formula, {});
                await roll.evaluate();
                await roll.toMessage({
                    flavor,
                    speaker: this.getChatSpeaker(),
                    flags: {
                        [EZD6_META_FLAG]: buildRollMeta({
                            title,
                            description: descHtml,
                            tag: normalizedTag,
                            icon,
                        }),
                    },
                });
            };
            await this.maybePromptPowerRoll(keyword, numberOfDice, rollWithDice);
            return;
        }

        const descHtml = this.renderDescriptionHtml(description);
        const contentPieces = [
            `<strong>${title}</strong>`,
            descHtml ? `<div>${descHtml}</div>` : "",
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
        const equipmentLabel = t("EZD6.ItemLabels.Equipment", "Equipment");
        const nameFallback = item?.name ?? equipmentLabel;
        const title = this.getLocalizedItemName(item, nameFallback);
        if (numberOfDice > 0) {
            const normalizedTag = this.normalizeAbilityTag(tag);
            const keyword = this.getKeywordFromTag(tag);
            const rollWithDice = async (diceCount: number) => {
                const formula = `${diceCount}d6`;
                const flavor = `${title} ${normalizedTag}`.trim();
                const icon = item?.img || "icons/containers/bags/coinpouch-simple-leather-tan.webp";
                const descHtml = this.renderDescriptionHtml(description);
                const roll = new Roll(formula, {});
                await roll.evaluate();
                await roll.toMessage({
                    flavor,
                    speaker: this.getChatSpeaker(),
                    flags: {
                        [EZD6_META_FLAG]: buildRollMeta({
                            title,
                            description: descHtml,
                            tag: normalizedTag,
                            icon,
                        }),
                    },
                });
            };
            await this.maybePromptPowerRoll(keyword, numberOfDice, rollWithDice);
            return;
        }

        const qtyLine = isQuantifiable
            ? `<div>${tf("EZD6.Chat.QuantityLine", { quantity }, `Quantity: ${quantity}`)}</div>`
            : "";
        const descHtml = this.renderDescriptionHtml(description);
        const contentPieces = [
            `<strong>${title}</strong>`,
            descHtml ? `<div>${descHtml}</div>` : "",
            qtyLine,
        ];
        await ChatMessage.create({ content: contentPieces.join(""), speaker: this.getChatSpeaker() });
    }

    private async setEquipmentQuantity(item: any, nextValue: number, rerenderFrom: HTMLElement) {
        const next = this.coerceQuantity(nextValue);
        if (item?.update) {
            await item.update({ "system.quantity": next }, { render: false });
        } else if (this.options.itemSource?.updateItem && item?.id) {
            await this.options.itemSource.updateItem(item.id, { "system.quantity": next });
        } else {
            return;
        }
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
        const resourceLabel = t("EZD6.ItemLabels.Resource", "Resource");
        await this.openTemporaryItemEditor(
            {
                name: typeof resource.title === "string" ? resource.title.trim() || resourceLabel : resourceLabel,
                type: "resource",
                img: this.getResourceIcon(resource),
                system: {
                    value: this.getResourceValue(resource),
                    maxValue: this.getResourceMaxValue(resource),
                    description: resource.description ?? "",
                    localizationId: resource.localizationId ?? "",
                    numberOfDice: this.getResourceDiceCount(resource),
                    tag: resource.rollKeyword ?? "default",
                    replenishLogic: resource.replenishLogic ?? "disabled",
                    replenishTag: resource.replenishTag ?? "",
                    replenishCost: this.getResourceReplenishCost(resource),
                    publicDisplay: Boolean(resource.publicDisplay),
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
                const nextLocalizationId = typeof system.localizationId === "string" ? system.localizationId.trim() : "";
                const nextPublicDisplay = Boolean(system.publicDisplay);
                const targetResource = this.character.resources.find((entry) => entry.id === resource.id) ?? resource;
                targetResource.title = item?.name ?? targetResource.title;
                targetResource.icon = item?.img ?? targetResource.icon;
                targetResource.value = clamped;
                targetResource.maxValue = clampedMax;
                targetResource.description = nextDescription;
                targetResource.localizationId = nextLocalizationId;
                targetResource.numberOfDice = clampedDice;
                targetResource.rollKeyword = nextTag;
                targetResource.replenishLogic = nextReplenishLogic;
                targetResource.replenishTag = nextReplenishTag;
                targetResource.replenishCost = nextReplenishCost;
                targetResource.publicDisplay = nextPublicDisplay;
                if (!Number.isFinite(targetResource.defaultValue)) {
                    targetResource.defaultValue = clamped;
                }
                void this.persistResources();
                this.updateResourceRowUI(rerenderFrom, targetResource);
            }
        );
    }

    private async deleteResource(resourceId: string, container?: HTMLElement) {
        this.character.resources = this.character.resources.filter((res) => res.id !== resourceId);
        if (this.expandedResourceId === resourceId) {
            this.expandedResourceId = null;
        }
        await this.persistResources();
        if (container) this.refreshResourceList(container);
    }

    private async editSave(save: Save, rerenderFrom: HTMLElement) {
        const saveLabel = t("EZD6.ItemLabels.Save", "Save");
        await this.openTemporaryItemEditor(
            {
                name: typeof save.title === "string" ? save.title.trim() || saveLabel : saveLabel,
                type: "save",
                img: this.getSaveIcon(save),
                system: {
                    targetValue: this.getSaveTargetValue(save),
                    numberOfDice: this.getSaveDiceCount(save),
                    description: save.description ?? "",
                    localizationId: save.localizationId ?? "",
                },
            },
            (item: any) => {
                const system = item?.system ?? {};
                const targetValue = Number(system.targetValue ?? 6);
                const numberOfDice = Number(system.numberOfDice ?? 1);
                const nextDescription = typeof system.description === "string" ? system.description : "";
                const nextLocalizationId = typeof system.localizationId === "string" ? system.localizationId.trim() : "";
                const targetSave = this.character.saves.find((entry) => entry.id === save.id) ?? save;
                targetSave.title = item?.name ?? targetSave.title;
                targetSave.icon = item?.img ?? targetSave.icon;
                targetSave.targetValue = Number.isFinite(targetValue) ? this.clampInt(Math.floor(targetValue), 1, 7) : 6;
                targetSave.numberOfDice = Number.isFinite(numberOfDice) ? this.clampInt(Math.floor(numberOfDice), 1, 6) : 1;
                targetSave.description = nextDescription;
                targetSave.localizationId = nextLocalizationId;
                void this.persistSaves();
                this.updateSaveRowUI(rerenderFrom, targetSave);
            }
        );
    }

    private async postSaveMessage(save: Save) {
        if (!save) return;
        const saveLabel = t("EZD6.ItemLabels.Save", "Save");
        const fallbackTitle = typeof save.title === "string" ? save.title.trim() || saveLabel : saveLabel;
        const title = this.getLocalizedSaveTitle(save, fallbackTitle);
        const rawDescription = typeof save.description === "string" ? save.description : "";
        const description = this.getLocalizedSaveDescription(save, rawDescription);
        const descHtml = this.renderDescriptionHtml(description);
        const targetValue = this.getSaveTargetValue(save);
        const tag = this.getSaveTargetTag(targetValue);
        const icon = this.getSaveIcon(save);
        const contentPieces = [
            `<strong>${title}</strong>`,
            descHtml ? `<div>${descHtml}</div>` : "",
        ];
        await ChatMessage.create({
            content: contentPieces.join(""),
            speaker: this.getChatSpeaker(),
            flags: {
                [EZD6_META_FLAG]: buildInfoMeta({
                    title,
                    description: descHtml,
                    tag,
                    icon,
                    kind: "save",
                    saveTarget: targetValue,
                }),
            },
        });
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
        const value = this.getResourceValue(resource);

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
        const saveLabel = t("EZD6.ItemLabels.Save", "Save");
        const fallbackTitle = typeof save.title === "string" ? save.title.trim() || saveLabel : saveLabel;
        const title = this.getLocalizedSaveTitle(save, fallbackTitle);
        const targetValue = this.getSaveTargetValue(save);
        const targetLabel = this.getSaveTargetLabel(targetValue);
        const diceCount = this.getSaveDiceCount(save);
        const iconPath = this.getSaveIcon(save);

        const iconImg = row.querySelector(".ezd6-ability-icon__img") as HTMLImageElement | null;
        if (iconImg) {
            iconImg.src = iconPath;
            iconImg.alt = tf("EZD6.Alts.ItemIcon", { label: title }, `${title} icon`);
            iconImg.draggable = false;
        }

        const nameEl = row.querySelector(".ezd6-save-row__title") as HTMLElement | null;
        if (nameEl) nameEl.textContent = title;

        const targetEl = row.querySelector(".ezd6-save-target-number") as HTMLElement | null;
        if (targetEl) targetEl.textContent = targetLabel;

        const rollBtn = row.querySelector(".ezd6-save-roll-btn") as HTMLButtonElement | null;
        if (rollBtn) {
            rollBtn.title = this.buildSaveRollTitle(diceCount, targetValue);
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
        const userId = game?.user?.id;
        const ownerLevel = (globalThis as any)?.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
        const tempData = {
            _id: typeof idFactory === "function" ? idFactory() : `tmp-${Math.random().toString(36).slice(2, 10)}`,
            ownership: userId ? { [userId]: ownerLevel } : undefined,
            ...data,
        };
        const tempItem = ItemClass ? new ItemClass(tempData, { temporary: true }) : null;
        if (!tempItem) {
            ui?.notifications?.error?.(t("EZD6.Notifications.FailedToOpenEditor", "Failed to open editor."));
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
        const resourceLabel = t("EZD6.ItemLabels.Resource", "Resource");
        this.character.addResource({
            title: resourceLabel,
            value: 1,
            defaultValue: 1,
            maxValue: 0,
            description: "",
            numberOfDice: 0,
            rollKeyword: "default",
            publicDisplay: false,
        });
        await this.persistResources();
    }

    private async createSaveEntry() {
        const saveLabel = t("EZD6.ItemLabels.Save", "Save");
        this.character.addSave({
            title: saveLabel,
            targetValue: 6,
            numberOfDice: 1,
            description: "",
        });
        await this.persistSaves();
    }

    private renderDescriptionHtml(value: string | null | undefined): string {
        return renderMarkdown(typeof value === "string" ? value : "");
    }
}
