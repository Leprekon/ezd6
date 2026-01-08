// src/actor-sheet.ts
import { Character } from "./character";
import { CharacterSheetView } from "./character-sheet-view";
import { clampDimension, getTagOptions, normalizeTag } from "./ui/sheet-utils";
import { DescriptionEditorController } from "./sheet/description-editor";
import { getDescriptionEditor } from "./sheet/description-editor-utils";
import { captureScrollState, restoreScrollState, ScrollState } from "./sheet/scroll-state";

export class EZD6CharacterSheet extends ActorSheet {
    private character: Character | null = null;
    private view: CharacterSheetView | null = null;
    private descriptionController: DescriptionEditorController | null = null;
    private pendingScrollRestore: ScrollState = [];
    private itemUpdateHookId: number | null = null;
    private actorUpdateHookId: number | null = null;

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["ezd6-sheet-wrapper"],
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
        return "systems/ezd6-new/templates/character-sheet.hbs";
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

    getData(options?: any) {
        return super.getData(options);
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

        this.syncFromActor();
        if (this.normalizeResourceTags()) {
            void this.actor?.update?.({ "system.resources": this.character.resources });
        }
        if (this.character.ensureDefaultResources()) {
            void this.actor?.update?.({ "system.resources": this.character.resources });
        }
        this.view = new CharacterSheetView(this.character, {
            onAvatarPick: (path) => {
                this.actor?.update?.({ img: path, "system.avatarUrl": path });
            },
            onNameCommit: (name) => {
                const fallback = this.actor?.name ?? "Unnamed";
                const nextName = name?.trim() ? name.trim() : fallback;
                this.actor?.update?.({ name: nextName });
            },
            actor: this.actor,
            editable: this.isEditable,
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
        this.descriptionController.bind(html, this.actor);
        this.registerItemUpdateHook();
        this.registerActorUpdateHook();

    }

    protected async _updateObject(_event: Event, formData: Record<string, any>) {
        if (!this.actor) return;
        await this.actor.update(formData);
    }

    private syncFromActor() {
        if (!this.character) return;
        const system = (this.actor as any)?.system ?? {};

        const actorAny = this.actor as any;
        this.character.avatarUrl = system.avatarUrl ?? actorAny?.img ?? null;
        this.character.name = actorAny?.name ?? "";
        this.character.description = system.description ?? "";
        this.character.abilities = Array.isArray(system.abilities) ? system.abilities : [];
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

    private async resolveDroppedItem(data: any): Promise<any | null> {
        const uuid = data?.uuid;
        if (uuid && typeof (globalThis as any).fromUuid === "function") {
            const doc = await (globalThis as any).fromUuid(uuid);
            return doc ?? null;
        }
        const doc = data?.data;
        return doc ?? null;
    }

    protected async _onDrop(event: DragEvent) {
        const raw = (event as any)?.dataTransfer?.getData?.("text/plain");
        if (raw) {
            try {
                const data = JSON.parse(raw);
                if (data?.type === "Item") {
                    const item = await this.resolveDroppedItem(data);
                    if (item?.type === "resource") {
                        if (!this.character) this.character = new Character();
                        const system = (item as any)?.system ?? {};
                        const rawValue = Number(system.value ?? system.defaultValue ?? 1);
                        const value = Number.isFinite(rawValue) ? Math.max(0, Math.floor(rawValue)) : 1;
                        const rawMax = Number(system.maxValue ?? system.defaultMaxValue ?? 0);
                        const maxValue = Number.isFinite(rawMax) ? Math.max(0, Math.floor(rawMax)) : 0;
                        const description = typeof system.description === "string" ? system.description : "";
                        const rawDice = Number(system.numberOfDice ?? 0);
                        const numberOfDice = Number.isFinite(rawDice) ? Math.max(0, Math.min(3, Math.floor(rawDice))) : 0;
                        const rollKeyword = typeof system.tag === "string" ? system.tag : "default";
                        const replenishLogic = system.replenishLogic === "reset" || system.replenishLogic === "restore"
                            ? system.replenishLogic
                            : "disabled";
                        const rawReplenishTag = typeof system.replenishTag === "string" ? system.replenishTag : "";
                        const replenishTag = rawReplenishTag.trim()
                            ? normalizeTag(rawReplenishTag, getTagOptions())
                            : "";
                        const rawCost = Number(system.replenishCost ?? 1);
                        const replenishCost = Number.isFinite(rawCost) ? Math.max(1, Math.min(100, Math.floor(rawCost))) : 1;
                        this.character.addResource({
                            title: item.name ?? "Resource",
                            icon: item.img ?? undefined,
                            value,
                            defaultValue: value,
                            maxValue,
                            description,
                            numberOfDice,
                            rollKeyword,
                            replenishLogic: replenishLogic === "reset" || replenishLogic === "restore" ? replenishLogic : "disabled",
                            replenishTag,
                            replenishCost,
                        });
                        await this.actor?.update?.({ "system.resources": this.character.resources });
                        return;
                    }
                    if (item?.type === "save") {
                        if (!this.character) this.character = new Character();
                        const system = (item as any)?.system ?? {};
                        const targetValue = Number(system.targetValue ?? 6);
                        const numberOfDice = Number(system.numberOfDice ?? 3);
                        const description = typeof system.description === "string" ? system.description : "";
                        this.character.addSave({
                            title: item.name ?? "Save",
                            icon: item.img ?? undefined,
                            targetValue: Number.isFinite(targetValue) ? Math.max(2, Math.floor(targetValue)) : 6,
                            numberOfDice: Number.isFinite(numberOfDice) ? Math.max(1, Math.floor(numberOfDice)) : 3,
                            description,
                        });
                        await this.actor?.update?.({ "system.saves": this.character.saves });
                        return;
                    }
                }
            } catch {
                // fall through to default drop handling
            }
        }

        return super._onDrop(event);
    }

    async close(options?: any) {
        this.descriptionController?.disconnect();
        this.descriptionController = null;
        if (this.itemUpdateHookId !== null) {
            Hooks.off("updateItem", this.itemUpdateHookId);
            this.itemUpdateHookId = null;
        }
        if (this.actorUpdateHookId !== null) {
            Hooks.off("updateActor", this.actorUpdateHookId);
            this.actorUpdateHookId = null;
        }
        return super.close(options);
    }

    private registerItemUpdateHook() {
        if (this.itemUpdateHookId !== null) return;
        const actorId = this.actor?.id;
        this.itemUpdateHookId = Hooks.on("updateItem", (item: any) => {
            if (!actorId || item?.parent?.id !== actorId) return;
            const type = item?.type;
            if (type !== "ability" && type !== "equipment") return;
            this.syncFromActor();
            const root = this.getSheetRoot();
            if (!root) return;
            if (type === "ability") {
                this.view?.refreshAbilityList(root);
            } else {
                this.view?.refreshEquipmentList(root);
            }
        });
    }

    private registerActorUpdateHook() {
        if (this.actorUpdateHookId !== null) return;
        const actorId = this.actor?.id;
        this.actorUpdateHookId = Hooks.on("updateActor", (actor: any, diff: any) => {
            if (!actorId || actor?.id !== actorId) return;
            if (!diff?.system?.resources) return;
            this.syncFromActor();
            const root = this.getSheetRoot();
            if (!root) return;
            this.view?.refreshResourceList(root);
        });
    }

    private getSheetRoot() {
        return this.element?.[0]?.querySelector?.(".ezd6-sheet-root") as HTMLElement | null;
    }
}
