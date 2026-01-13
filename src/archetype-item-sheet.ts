// src/archetype-item-sheet.ts
import { Character, DEFAULT_AVATAR, LEGACY_AVATAR_PLACEHOLDER } from "./character";
import { CharacterSheetView } from "./character-sheet-view";
import { clampDimension, getTagOptions, normalizeTag } from "./ui/sheet-utils";
import { DescriptionEditorController } from "./sheet/description-editor";
import { getDescriptionEditor } from "./sheet/description-editor-utils";
import { captureScrollState, restoreScrollState, ScrollState } from "./sheet/scroll-state";
import { localize, resolveLocalizedField } from "./ui/i18n";
import { readDragEventData, resolveDroppedDocument } from "./ui/drag-drop";
import { buildArchetypeEntryFromItem, buildResourceFromItem, buildSaveFromItem } from "./ui/item-converters";
import { getSystemPath } from "./system-path";

type ArchetypeItemEntry = {
    id: string;
    name?: string;
    type: "ability" | "aspect" | "equipment";
    img?: string;
    sort?: number;
    system?: Record<string, any>;
};

export class EZD6ArchetypeItemSheet extends ItemSheet {
    private character: Character | null = null;
    private view: CharacterSheetView | null = null;
    private descriptionController: DescriptionEditorController | null = null;
    private pendingScrollRestore: ScrollState = [];
    private localizationId = "";
    private nameOverride = "";
    private nameLocked = false;
    private descriptionLocked = false;

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["ezd6-sheet-wrapper", "ezd6-archetype-item-sheet"],
            width: 860,
            height: 780,
            minWidth: 820,
            maxWidth: 1060,
            minHeight: 640,
            maxHeight: 1024,
            resizable: true,
            submitOnChange: true,
            submitOnClose: true,
        });
    }

    get template() {
        return getSystemPath("templates/archetype-item-sheet.hbs");
    }

    getData(options?: any) {
        const data = super.getData(options) as any;
        const system = data?.item?.system ?? {};
        const localizationId = typeof system.localizationId === "string" ? system.localizationId.trim() : "";
        data.localizationId = localizationId;
        data.isGM = game?.user?.isGM ?? false;

        const nameFallback = typeof data?.item?.name === "string"
            ? data.item.name
            : localize("EZD6.Defaults.Unnamed", "Unnamed");
        const descFallback = typeof system.description === "string" ? system.description : "";
        const nameField = resolveLocalizedField(localizationId, "Name", nameFallback);
        const descField = resolveLocalizedField(localizationId, "Desc", descFallback);
        data.itemNameValue = nameField.value;
        data.itemNameLocked = nameField.locked;
        data.itemDescriptionValue = descField.value;
        data.itemDescriptionLocked = descField.locked;
        data.descriptionEditable = Boolean(data.editable) && !descField.locked;
        if (data.system) {
            data.system.description = descField.value;
        }

        this.localizationId = localizationId;
        this.nameOverride = nameField.value;
        this.nameLocked = nameField.locked;
        this.descriptionLocked = descField.locked;
        return data;
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

    protected async _render(force?: boolean, options?: any) {
        this.pendingScrollRestore = captureScrollState(this.element?.[0] as HTMLElement | null);
        await super._render(force, options);
        restoreScrollState(this.pendingScrollRestore);
    }

    activateListeners(html: any) {
        super.activateListeners(html);
        const root = html[0]?.querySelector?.(".ezd6-sheet-root") as HTMLElement | null;
        if (!root) return;

        if (!this.character) {
            this.character = new Character();
        }

        this.syncFromItem();
        if (this.normalizeResourceTags()) {
            void this.item?.update?.({ "system.resources": this.character.resources });
        }
        if (this.character.ensureDefaultResources()) {
            void this.item?.update?.({ "system.resources": this.character.resources });
        }

        const canEdit = this.isEditable;
        this.view = new CharacterSheetView(this.character, {
            onAvatarPick: canEdit
                ? (path) => {
                    this.item?.update?.({ img: path, "system.avatarUrl": path });
                }
                : undefined,
            onNameCommit: canEdit
                ? (name) => {
                    const fallback = this.item?.name ?? localize("EZD6.Defaults.Unnamed", "Unnamed");
                    const nextName = name?.trim() ? name.trim() : fallback;
                    this.item?.update?.({ name: nextName });
                }
                : undefined,
            editable: canEdit,
            mode: "archetype",
            itemSourceOwnerId: this.item?.id,
            itemSource: this.buildItemSource(),
            systemUpdater: (data) => this.item.update(data),
            nameOverride: this.nameOverride,
            nameLocked: this.nameLocked,
            showLocalizationId: game?.user?.isGM ?? false,
            localizationId: this.localizationId,
            onLocalizationIdCommit: canEdit
                ? (value) => {
                    const next = value?.trim() ?? "";
                    this.item?.update?.({ "system.localizationId": next });
                }
                : undefined,
        });
        this.view.render(root);

        const descSection = html[0]?.querySelector?.(".ezd6-section--description") as HTMLElement | null;
        const descBlock = descSection?.closest(".ezd6-section-block") as HTMLElement | null;
        const descNode = descBlock ?? descSection;
        if (descNode && !root.contains(descNode)) {
            root.appendChild(descNode);
        }

        if (!this.descriptionController) {
            this.descriptionController = new DescriptionEditorController((wrap) => getDescriptionEditor(this, wrap));
        }
        this.descriptionController.bind(html, this.item);

        const sheetRoot = html[0] as HTMLElement | undefined;
        if (sheetRoot) {
            sheetRoot.addEventListener("dragover", (event) => {
                event.preventDefault();
            });
            sheetRoot.addEventListener("drop", (event) => {
                event.preventDefault();
                event.stopPropagation();
                void this.handleDrop(event as DragEvent);
            });
        }
    }

    protected async _onDrop(event: DragEvent) {
        const handled = await this.handleDrop(event);
        if (handled) return;
        return super._onDrop(event);
    }

    async close(options?: any) {
        this.descriptionController?.disconnect();
        this.descriptionController = null;
        return super.close(options);
    }

    private syncFromItem() {
        if (!this.character) return;
        const system = (this.item as any)?.system ?? {};
        const rawAvatar = system.avatarUrl ?? (this.item as any)?.img ?? null;
        this.character.avatarUrl = rawAvatar && rawAvatar !== LEGACY_AVATAR_PLACEHOLDER && rawAvatar !== DEFAULT_AVATAR
            ? rawAvatar
            : null;
        this.character.name = this.item?.name ?? "";
        this.character.description = system.description ?? "";
        this.character.resources = Array.isArray(system.resources) ? system.resources : [];
        this.character.saves = Array.isArray(system.saves) ? system.saves : [];
    }

    private normalizeResourceTags(): boolean {
        if (!this.character) return false;
        const options = getTagOptions();
        let changed = false;
        this.character.resources = this.character.resources.map((resource) => {
            const raw = resource?.rollKeyword ?? resource?.tag;
            const normalized = raw == null ? null : normalizeTag(String(raw), options);
            const next: any = { ...resource };
            if (normalized != null && normalized !== resource.rollKeyword) {
                next.rollKeyword = normalized;
                changed = true;
            }
            if (resource?.replenishTag != null) {
                const rawReplenish = String(resource.replenishTag ?? "").trim();
                const normalizedReplenish = rawReplenish ? normalizeTag(rawReplenish, options) : "";
                if (normalizedReplenish !== resource.replenishTag) {
                    next.replenishTag = normalizedReplenish;
                    changed = true;
                }
            }
            return next as any;
        });
        return changed;
    }

    private buildItemSource() {
        return {
            getItems: (type: "ability" | "aspect" | "equipment") => this.getArchetypeItems(type),
            getItemById: (id: string) => this.getArchetypeItemById(id),
            createItem: (data: Record<string, any>) => this.createArchetypeItem(data),
            updateItem: (id: string, updates: Record<string, any>) => this.updateArchetypeItem(id, updates),
            deleteItem: (id: string) => this.deleteArchetypeItem(id),
            updateItemSort: (updates: Array<{ _id: string; sort: number; "system.category": string }>) =>
                this.updateArchetypeItemSort(updates),
            openItemEditor: (item: any, onUpdate: () => void) => {
                void this.openArchetypeItemEditor(item, onUpdate);
            },
        };
    }

    private getArchetypeItems(type: "ability" | "aspect" | "equipment"): ArchetypeItemEntry[] {
        const system = (this.item as any)?.system ?? {};
        const list = type === "ability"
            ? system.abilities
            : type === "aspect"
                ? system.aspects
                : system.equipment;
        const entries = Array.isArray(list) ? list : [];
        return entries.map((entry: any) => ({
            id: entry?.id ?? entry?._id,
            name: entry?.name,
            type,
            img: entry?.img,
            sort: Number.isFinite(Number(entry?.sort)) ? Number(entry.sort) : 0,
            system: entry?.system ?? {},
        })).filter((entry) => entry.id);
    }

    private getArchetypeItemById(id: string): ArchetypeItemEntry | null {
        const all = [
            ...this.getArchetypeItems("ability"),
            ...this.getArchetypeItems("aspect"),
            ...this.getArchetypeItems("equipment"),
        ];
        return all.find((entry) => entry.id === id) ?? null;
    }

    private async createArchetypeItem(data: Record<string, any>) {
        const type = data?.type as "ability" | "aspect" | "equipment";
        if (!type) return;
        const system = (this.item as any)?.system ?? {};
        const key = type === "ability" ? "abilities" : type === "aspect" ? "aspects" : "equipment";
        const list = Array.isArray(system[key]) ? system[key].slice() : [];
        const idFactory = (foundry as any)?.utils?.randomID ?? (globalThis as any).randomID;
        const id = typeof idFactory === "function" ? idFactory() : `tmp-${Math.random().toString(36).slice(2, 10)}`;
        const sort = list.reduce((max: number, entry: any) => Math.max(max, Number(entry?.sort) || 0), 0) + 10;
        list.push({
            id,
            name: data?.name ?? localize("EZD6.Defaults.Unnamed", "Unnamed"),
            type,
            img: data?.img ?? "",
            sort,
            system: data?.system ?? {},
        });
        await this.item.update({ [`system.${key}`]: list });
    }

    private async updateArchetypeItem(id: string, updates: Record<string, any>) {
        const entry = this.getArchetypeItemById(id);
        if (!entry) return;
        const type = entry.type;
        const key = type === "ability" ? "abilities" : type === "aspect" ? "aspects" : "equipment";
        const system = (this.item as any)?.system ?? {};
        const list = Array.isArray(system[key]) ? system[key].slice() : [];
        const index = list.findIndex((item: any) => (item?.id ?? item?._id) === id);
        if (index < 0) return;
        const expand = (foundry as any)?.utils?.expandObject;
        const expanded = typeof expand === "function" ? expand(updates) : updates;
        const next = { ...(list[index] ?? {}) };
        if (expanded?.name != null) next.name = expanded.name;
        if (expanded?.img != null) next.img = expanded.img;
        if (expanded?.system) {
            next.system = { ...(next.system ?? {}), ...(expanded.system ?? {}) };
        }
        if (next.system?.tag != null) {
            next.system.tag = normalizeTag(String(next.system.tag), getTagOptions());
        }
        list[index] = next;
        await this.item.update({ [`system.${key}`]: list });
    }

    private async deleteArchetypeItem(id: string) {
        const entry = this.getArchetypeItemById(id);
        if (!entry) return;
        const type = entry.type;
        const key = type === "ability" ? "abilities" : type === "aspect" ? "aspects" : "equipment";
        const system = (this.item as any)?.system ?? {};
        const list = Array.isArray(system[key]) ? system[key].slice() : [];
        const next = list.filter((item: any) => (item?.id ?? item?._id) !== id);
        await this.item.update({ [`system.${key}`]: next });
    }

    private async updateArchetypeItemSort(
        updates: Array<{ _id: string; sort: number; "system.category": string }>
    ) {
        const system = (this.item as any)?.system ?? {};
        const updateMap = new Map(updates.map((entry) => [entry._id, entry]));
        const applyUpdates = (list: any[]) => list.map((entry) => {
            const id = entry?.id ?? entry?._id;
            const update = id ? updateMap.get(id) : null;
            if (!update) return entry;
            const next = { ...entry };
            next.sort = update.sort;
            const category = update["system.category"];
            if (category != null) {
                next.system = { ...(next.system ?? {}), category };
            }
            return next;
        });
        const abilities = Array.isArray(system.abilities) ? applyUpdates(system.abilities) : [];
        const aspects = Array.isArray(system.aspects) ? applyUpdates(system.aspects) : [];
        const equipment = Array.isArray(system.equipment) ? applyUpdates(system.equipment) : [];
        await this.item.update({
            "system.abilities": abilities,
            "system.aspects": aspects,
            "system.equipment": equipment,
        });
    }

    private async openArchetypeItemEditor(item: ArchetypeItemEntry, onUpdate: () => void) {
        if (!item) return;
        await this.openTemporaryItemEditor(
            {
                name: item.name ?? localize("EZD6.Defaults.Unnamed", "Unnamed"),
                type: item.type,
                img: item.img ?? "",
                system: item.system ?? {},
            },
            (updated: any) => {
                void this.updateArchetypeItem(item.id, {
                    name: updated?.name,
                    img: updated?.img,
                    system: updated?.system ?? {},
                }).then(onUpdate);
            }
        );
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
            ui?.notifications?.error?.(localize("EZD6.Notifications.FailedToOpenEditor", "Failed to open editor."));
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

    private getSheetRoot() {
        return this.element?.[0]?.querySelector?.(".ezd6-sheet-root") as HTMLElement | null;
    }

    private async handleDrop(event: DragEvent): Promise<boolean> {
        const data = readDragEventData(event);
        if (!data) return false;
        if (data?.sourceOwnerId && this.item?.id && data.sourceOwnerId === this.item.id) {
            return true;
        }
        if (data?.type !== "Item" && data?.type !== "Compendium" && data?.type !== "CompendiumEntry") {
            return false;
        }
        const item = await resolveDroppedDocument(data);
        if (!item) return false;
        if (item?.type === "ability" || item?.type === "aspect" || item?.type === "equipment") {
            const payload = buildArchetypeEntryFromItem(item);
            if (!payload) return false;
            await this.createArchetypeItem(payload);
            const root = this.getSheetRoot();
            if (root) {
                if (item.type === "ability") {
                    this.view?.refreshAbilityList(root);
                } else if (item.type === "aspect") {
                    this.view?.refreshAspectList(root);
                } else {
                    this.view?.refreshEquipmentList(root);
                }
            }
            return true;
        }
        if (item?.type === "resource") {
            if (!this.character) this.character = new Character();
            this.character.addResource(buildResourceFromItem(item));
            await this.item?.update?.({ "system.resources": this.character.resources });
            const root = this.getSheetRoot();
            if (root) {
                this.view?.refreshResourceList(root);
            }
            return true;
        }
        if (item?.type === "save") {
            if (!this.character) this.character = new Character();
            this.character.addSave(buildSaveFromItem(item));
            await this.item?.update?.({ "system.saves": this.character.saves });
            const root = this.getSheetRoot();
            if (root) {
                this.view?.refreshSaveList(root);
            }
            return true;
        }
        return false;
    }
}
