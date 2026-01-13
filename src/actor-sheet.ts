// src/actor-sheet.ts
import { Character, DEFAULT_AVATAR, LEGACY_AVATAR_PLACEHOLDER } from "./character";
import { CharacterSheetView } from "./character-sheet-view";
import { clampDimension, getTagOptions, normalizeTag } from "./ui/sheet-utils";
import { DescriptionEditorController } from "./sheet/description-editor";
import { getDescriptionEditor } from "./sheet/description-editor-utils";
import { captureScrollState, restoreScrollState, ScrollState } from "./sheet/scroll-state";
import { localize, resolveLocalizedField } from "./ui/i18n";
import { readDragEventData, resolveDroppedDocument } from "./ui/drag-drop";
import { buildResourceFromItem, buildSaveFromItem } from "./ui/item-converters";
import { getSystemPath } from "./system-path";

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
        return getSystemPath("templates/character-sheet.hbs");
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
        const canEdit = this.isEditable;
        this.view = new CharacterSheetView(this.character, {
            onAvatarPick: canEdit
                ? (path) => {
                    this.actor?.update?.({ img: path, "system.avatarUrl": path });
                }
                : undefined,
            onNameCommit: canEdit
                ? (name) => {
                    const fallback = this.actor?.name ?? localize("EZD6.Defaults.Unnamed", "Unnamed");
                    const nextName = name?.trim() ? name.trim() : fallback;
                    this.actor?.update?.({ name: nextName });
                }
                : undefined,
            actor: this.actor,
            editable: canEdit,
            mode: "character",
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
        const rawAvatar = system.avatarUrl ?? actorAny?.img ?? null;
        this.character.avatarUrl = rawAvatar && rawAvatar !== LEGACY_AVATAR_PLACEHOLDER && rawAvatar !== DEFAULT_AVATAR
            ? rawAvatar
            : null;
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

    protected async _onDrop(event: DragEvent) {
        const data = readDragEventData(event);
        if (data) {
            if (data?.type === "Actor" || data?.type === "ActorProxy") {
                const doc = await resolveDroppedDocument(data);
                if (doc?.type === "archetype" && this.actor?.type === "character") {
                    await this.applyArchetype(doc);
                    return;
                }
            }
            if (data?.type === "Item" || data?.type === "Compendium" || data?.type === "CompendiumEntry") {
                if (
                    (data?.data?.type === "resource" || data?.data?.type === "save")
                    && data?.sourceActorId
                    && this.actor?.id
                    && data.sourceActorId === this.actor.id
                ) {
                    return;
                }
                const item = await resolveDroppedDocument(data);
                if (item?.type === "archetype" && this.actor?.type === "character") {
                    await this.applyArchetype(item);
                    return;
                }
                if (item?.type === "resource") {
                    if (!this.character) this.character = new Character();
                    this.character.addResource(buildResourceFromItem(item));
                    await this.actor?.update?.({ "system.resources": this.character.resources });
                    return;
                }
                if (item?.type === "save") {
                    if (!this.character) this.character = new Character();
                    this.character.addSave(buildSaveFromItem(item));
                    await this.actor?.update?.({ "system.saves": this.character.saves });
                    return;
                }
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
            if (type !== "ability" && type !== "aspect" && type !== "equipment") return;
            this.syncFromActor();
            const root = this.getSheetRoot();
            if (!root) return;
            if (type === "ability") {
                this.view?.refreshAbilityList(root);
            } else if (type === "aspect") {
                this.view?.refreshAspectList(root);
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

    private async applyArchetype(archetype: any) {
        if (!this.actor || this.actor.type !== "character") return;
        if (!archetype) return;
        if (!this.character) this.character = new Character();
        this.syncFromActor();

        const defaultActor = "icons/svg/mystery-man.svg";
        const actorAny = this.actor as any;
        const rawAvatar = actorAny?.system?.avatarUrl ?? actorAny?.img ?? "";
        const currentAvatar = typeof rawAvatar === "string" ? rawAvatar : "";
        const isDefaultAvatar = !currentAvatar
            || currentAvatar === DEFAULT_AVATAR
            || currentAvatar === LEGACY_AVATAR_PLACEHOLDER
            || currentAvatar === defaultActor;
        const archetypeAvatar = typeof archetype?.system?.avatarUrl === "string" && archetype.system.avatarUrl.trim()
            ? archetype.system.avatarUrl.trim()
            : typeof archetype?.img === "string"
                ? archetype.img
                : "";
        if (isDefaultAvatar && archetypeAvatar) {
            const updates: Record<string, any> = {
                img: archetypeAvatar,
                "system.avatarUrl": archetypeAvatar,
            };
            const tokenSrc = actorAny?.prototypeToken?.texture?.src ?? "";
            if (!tokenSrc || tokenSrc === DEFAULT_AVATAR || tokenSrc === defaultActor) {
                updates["prototypeToken.texture.src"] = archetypeAvatar;
            }
            await this.actor.update(updates);
        }

        const archetypeDescription = typeof archetype?.system?.description === "string"
            ? archetype.system.description
            : "";
        const archetypeLocalizationId = typeof archetype?.system?.localizationId === "string"
            ? archetype.system.localizationId.trim()
            : "";
        const resolvedDesc = resolveLocalizedField(archetypeLocalizationId, "Desc", archetypeDescription);
        const resolvedDescription = typeof resolvedDesc.value === "string" ? resolvedDesc.value : "";
        const resolvedTrimmed = resolvedDescription.trim();
        if (resolvedTrimmed) {
            const currentDescription = typeof actorAny?.system?.description === "string"
                ? actorAny.system.description.trim()
                : "";
            if (!currentDescription) {
                await this.actor.update({ "system.description": resolvedDescription });
            }
        }

        const options = getTagOptions();
        const normalizeRollTag = (raw: unknown) => {
            const trimmed = typeof raw === "string" ? raw.trim() : "";
            return trimmed ? normalizeTag(trimmed, options) : "#default";
        };
        const normalizeReplenishTag = (raw: unknown) => {
            const trimmed = typeof raw === "string" ? raw.trim() : "";
            return trimmed ? normalizeTag(trimmed, options) : "";
        };
        const clampInt = (value: unknown, min: number, max: number) => {
            const numeric = Math.floor(Number(value));
            if (!Number.isFinite(numeric)) return min;
            return Math.max(min, Math.min(max, numeric));
        };

        const collectPayload = (entry: any, typeFallback?: string) => {
            if (!entry) return null;
            const data = typeof entry?.toObject === "function" ? entry.toObject() : entry;
            const type = data?.type ?? entry?.type ?? typeFallback;
            if (!type) return null;
            const fallbackLabel = type === "ability"
                ? localize("EZD6.ItemLabels.Ability", "Ability")
                : type === "aspect"
                    ? localize("EZD6.ItemLabels.Aspect", "Aspect")
                    : localize("EZD6.ItemLabels.Equipment", "Equipment");
            return {
                name: data?.name ?? entry?.name ?? entry?.title ?? fallbackLabel,
                type,
                img: data?.img ?? entry?.img,
                system: data?.system ?? entry?.system ?? {},
            };
        };

        const itemPayload: Array<{ name?: string; type: string; img?: string; system: any }> = [];
        const embeddedItems = Array.isArray(archetype?.items)
            ? archetype.items
            : Array.isArray(archetype?.items?.contents)
                ? archetype.items.contents
                : Array.from(archetype?.items ?? []);
        embeddedItems
            .filter((item: any) => item?.type === "ability" || item?.type === "aspect" || item?.type === "equipment")
            .forEach((item: any) => {
                const payload = collectPayload(item);
                if (payload?.type) itemPayload.push(payload as any);
            });

        const systemItems = archetype?.system ?? {};
        const appendEntries = (entries: any, type: string) => {
            if (!Array.isArray(entries)) return;
            entries.forEach((entry: any) => {
                const payload = collectPayload(entry, type);
                if (payload?.type) itemPayload.push(payload as any);
            });
        };
        appendEntries(systemItems.abilities, "ability");
        appendEntries(systemItems.aspects, "aspect");
        appendEntries(systemItems.equipment, "equipment");

        if (itemPayload.length) {
            const existingItems = Array.isArray(this.actor.items)
                ? this.actor.items
                : Array.from(this.actor.items ?? []);
            const normalizeName = (value: unknown) => String(value ?? "").trim().toLowerCase();
            const updates: Record<string, any>[] = [];
            const creates: Record<string, any>[] = [];
            itemPayload.forEach((payload) => {
                const payloadId = typeof payload?.system?.localizationId === "string"
                    ? payload.system.localizationId.trim()
                    : "";
                const payloadName = normalizeName(payload.name);
                const match = existingItems.find((item: any) => {
                    if (item?.type !== payload.type) return false;
                    const itemLocId = typeof item?.system?.localizationId === "string"
                        ? item.system.localizationId.trim()
                        : "";
                    if (payloadId && itemLocId && payloadId === itemLocId) return true;
                    if (payloadName) return normalizeName(item?.name) === payloadName;
                    return false;
                });
                if (match?.id) {
                    updates.push({
                        _id: match.id,
                        name: payload.name,
                        img: payload.img,
                        system: payload.system,
                    });
                } else {
                    creates.push(payload);
                }
            });
            if (updates.length) {
                await this.actor.updateEmbeddedDocuments("Item", updates);
            }
            if (creates.length) {
                await this.actor.createEmbeddedDocuments("Item", creates);
            }
        }

        const system = archetype?.system ?? {};
        const resources = Array.isArray(system.resources) ? system.resources : [];
        const normalizeTitle = (value: unknown) => String(value ?? "").trim().toLowerCase();
        resources.forEach((resource: any) => {
            const title = typeof resource?.title === "string"
                ? resource.title
                : localize("EZD6.ItemLabels.Resource", "Resource");
            const resourceLocId = typeof resource?.localizationId === "string" ? resource.localizationId.trim() : "";
            const target = this.character?.resources.find(
                (entry) => {
                    const entryLocId = typeof entry?.localizationId === "string" ? entry.localizationId.trim() : "";
                    if (resourceLocId && entryLocId && resourceLocId === entryLocId) return true;
                    return normalizeTitle(entry?.title) === normalizeTitle(title);
                }
            );
            const next = {
                title,
                description: typeof resource?.description === "string" ? resource.description : "",
                localizationId: resourceLocId,
                icon: typeof resource?.icon === "string" ? resource.icon : undefined,
                iconAvailable: typeof resource?.iconAvailable === "string" ? resource.iconAvailable : undefined,
                iconSpent: typeof resource?.iconSpent === "string" ? resource.iconSpent : undefined,
                rollKeyword: normalizeRollTag(resource?.rollKeyword ?? resource?.tag),
                numberOfDice: clampInt(resource?.numberOfDice ?? 0, 0, 3),
                usedForDiceBurn: Boolean(resource?.usedForDiceBurn),
                diceChangeBehavior: resource?.diceChangeBehavior ?? "none",
                replenishLogic: resource?.replenishLogic ?? "disabled",
                replenishTag: normalizeReplenishTag(resource?.replenishTag),
                replenishCost: clampInt(resource?.replenishCost ?? 1, 1, 100),
                value: clampInt(resource?.value ?? resource?.defaultValue ?? 0, 0, 100),
                defaultValue: clampInt(resource?.defaultValue ?? resource?.value ?? 0, 0, 100),
                maxValue: Number.isFinite(Number(resource?.maxValue)) ? clampInt(resource.maxValue, 0, 100) : undefined,
                defaultMaxValue: Number.isFinite(Number(resource?.defaultMaxValue)) ? clampInt(resource.defaultMaxValue, 0, 100) : undefined,
                locked: Boolean(resource?.locked),
            };
            if (target) {
                Object.assign(target, next);
            } else {
                this.character?.addResource(next);
            }
        });

        const saves = Array.isArray(system.saves) ? system.saves : [];
        saves.forEach((save: any) => {
            const title = typeof save?.title === "string" ? save.title : localize("EZD6.ItemLabels.Save", "Save");
            const saveLocId = typeof save?.localizationId === "string" ? save.localizationId.trim() : "";
            const target = this.character?.saves.find(
                (entry) => {
                    const entryLocId = typeof entry?.localizationId === "string" ? entry.localizationId.trim() : "";
                    if (saveLocId && entryLocId && saveLocId === entryLocId) return true;
                    return normalizeTitle(entry?.title) === normalizeTitle(title);
                }
            );
            const next = {
                title,
                description: typeof save?.description === "string" ? save.description : "",
                localizationId: saveLocId,
                icon: typeof save?.icon === "string" ? save.icon : undefined,
                targetValue: clampInt(save?.targetValue ?? 6, 2, 6),
                numberOfDice: clampInt(save?.numberOfDice ?? 1, 1, 6),
            };
            if (target) {
                Object.assign(target, next);
            } else {
                this.character?.addSave(next);
            }
        });

        await this.actor.update({
            "system.resources": this.character.resources,
            "system.saves": this.character.saves,
        });

        const root = this.getSheetRoot();
        if (root) {
            this.view?.refreshAbilityList(root);
            this.view?.refreshAspectList(root);
            this.view?.refreshEquipmentList(root);
            this.view?.refreshResourceList(root);
            this.view?.refreshSaveList(root);
        }
    }

    private getSheetRoot() {
        return this.element?.[0]?.querySelector?.(".ezd6-sheet-root") as HTMLElement | null;
    }
}
