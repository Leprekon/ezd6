// src/archetype-item-sheet.ts
import { Character, DEFAULT_AVATAR, LEGACY_AVATAR_PLACEHOLDER } from "./character";
import { CharacterSheetView } from "./character-sheet-view";
import { getTagOptions, normalizeTag } from "./ui/sheet-utils";
import { captureScrollState, restoreScrollState, ScrollState } from "./sheet/scroll-state";
import { localize } from "./ui/i18n";
import { applyNativeItemFields } from "./ui/item-editor-utils";
import { readDragEventData, resolveDroppedDocument } from "./ui/drag-drop";
import { buildArchetypeEntryFromItem, buildResourceFromItem, buildSaveFromItem } from "./ui/item-converters";
import { getSystemPath } from "./system-path";
import { EZD6ItemSheetV2 } from "./sheet/document-sheet-v2";

type ArchetypeItemEntry = {
    id: string;
    name?: string;
    type: "ability" | "aspect" | "equipment";
    img?: string;
    sort?: number;
    system?: Record<string, any>;
};

export class EZD6ArchetypeItemSheet extends EZD6ItemSheetV2 {
    private character: Character | null = null;
    private view: CharacterSheetView | null = null;
    private pendingScrollRestore: ScrollState = [];
    private localizationId = "";
    private nameOverride = "";
    private nameLocked = false;

    static DEFAULT_OPTIONS = {
        classes: ["ezd6-sheet-wrapper", "ezd6-archetype-item-sheet", "theme-light"],
        position: { width: 860, height: 780 },
        window: { resizable: true },
        form: { submitOnChange: true, closeOnSubmit: false },
    };

    static PARTS = {
        sheet: { template: getSystemPath("templates/archetype-item-sheet.hbs"), root: true },
    };

    async _prepareContext(options: any) {
        const data = await super._prepareContext(options) as any;
        const system = data?.item?.system ?? {};
        const localizationId = typeof system.localizationId === "string" ? system.localizationId.trim() : "";
        data.localizationId = localizationId;
        data.isGM = game?.user?.isGM ?? false;

        const nameFallback = typeof data?.item?.name === "string"
            ? data.item.name
            : localize("EZD6.Defaults.Unnamed", "Unnamed");
        const descFallback = typeof system.description === "string" ? system.description : "";
        applyNativeItemFields(data, {
            nameValue: nameFallback,
            descriptionValue: descFallback,
        });
        this.localizationId = localizationId;
        this.nameOverride = nameFallback;
        this.nameLocked = false;
        return data;
    }

    async _preRender(context: any, options: any) {
        this.pendingScrollRestore = this.rendered ? captureScrollState(this.element) : [];
        await super._preRender(context, options);
    }

    async _onRender(context: any, options: any) {
        await super._onRender(context, options);
        const root = this.element.querySelector(".ezd6-sheet-root") as HTMLElement | null;
        if (!root) return;

        if (!this.character) {
            this.character = new Character();
        }

        this.syncFromItem();
        if (this.normalizeResourceTags()) {
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

        const sheetRoot = this.element;
        if (sheetRoot) {
            sheetRoot.addEventListener("dragover", (event: DragEvent) => {
                event.preventDefault();
            });
            sheetRoot.addEventListener("drop", (event: DragEvent) => {
                event.preventDefault();
                event.stopPropagation();
                void this.handleDrop(event as DragEvent);
            });
        }
        restoreScrollState(this.pendingScrollRestore);
    }

    protected async _onDrop(event: DragEvent) {
        const handled = await this.handleDrop(event);
        if (handled) return;
        return super._onDrop(event);
    }

    private syncFromItem() {
        if (!this.character) return;
        const system = (this.item as any)?.system ?? {};
        const rawAvatar = system.avatarUrl ?? (this.item as any)?.img ?? null;
        this.character.avatarUrl = rawAvatar && rawAvatar !== LEGACY_AVATAR_PLACEHOLDER && rawAvatar !== DEFAULT_AVATAR
            ? rawAvatar
            : null;
        this.character.name = this.item?.name ?? "";
        this.character.resources = Array.isArray(system.resources) ? system.resources : [];
        this.character.saves = Array.isArray(system.saves) ? system.saves : [];
    }

    private normalizeResourceTags(): boolean {
        if (!this.character) return false;
        const options = getTagOptions();
        let changed = false;
        this.character.resources = this.character.resources.map((resource) => {
            const raw = resource?.rollKeyword ?? (resource as any)?.tag;
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
        const id = (foundry as any).utils.randomID();
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
        const expanded = (foundry as any).utils.expandObject(updates);
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
        const ItemClass = (globalThis as any).CONFIG.Item.documentClass;
        const userId = game?.user?.id;
        const ownerLevel = (globalThis as any)?.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
        const tempData = {
            _id: (foundry as any).utils.randomID(),
            ownership: userId ? { [userId]: ownerLevel } : undefined,
            ...data,
        };
        const tempItem = ItemClass ? new ItemClass(tempData, { temporary: true }) : null;
        if (!tempItem) {
            ui?.notifications?.error?.(localize("EZD6.Notifications.FailedToOpenEditor", "Failed to open editor."));
            return;
        }
        tempItem.update = async function update(this: any, updateData: Record<string, any>) {
            const expanded = (foundry as any).utils.expandObject(updateData);
            this.updateSource(expanded);
            this.prepareData?.();
            onUpdate(this);
            return this;
        };

        tempItem.sheet?.render?.({ force: true });
    }

    private getSheetRoot() {
        return this.rendered ? this.element.querySelector(".ezd6-sheet-root") as HTMLElement | null : null;
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
