import { DEFAULT_RESOURCE_ICON } from "../character";
import { applyChatHeaderEnhancements, getChatMessageActor, resolveChatMessage } from "./chat-message-helpers";
import { RESOURCE_CHANGE_FLAG, queueResourceChange } from "./resource-change-batch";
import { applyResourceChangeCounters } from "./resource-change-render";
import { ResourceChangePayload } from "./resource-change-types";

const resourceValueCache = new Map<string, Map<string, number>>();

function getActorCache(actorId: string): Map<string, number> {
    let cache = resourceValueCache.get(actorId);
    if (!cache) {
        cache = new Map<string, number>();
        resourceValueCache.set(actorId, cache);
    }
    return cache;
}

function getResourceKey(source: "system" | "item", id: string): string {
    return `${source}:${id}`;
}

function getResourceValue(resource: any): number {
    const rawCurrent = Number(resource?.value);
    const rawFallback = Number(resource?.defaultValue ?? resource?.defaultMaxValue ?? resource?.maxValue ?? 0);
    if (Number.isFinite(rawCurrent)) return rawCurrent;
    if (Number.isFinite(rawFallback)) return rawFallback;
    return 0;
}

function getResourceMaxValue(resource: any): number {
    const raw = Number(resource?.maxValue ?? resource?.defaultMaxValue ?? 0);
    if (!Number.isFinite(raw)) return 0;
    return Math.max(0, Math.floor(raw));
}

function getResourceTitle(resource: any): string {
    const title = typeof resource?.title === "string" ? resource.title.trim() : "";
    return title || "Resource";
}

function getResourceIcon(resource: any): string {
    const candidates = [resource?.icon, resource?.iconAvailable, resource?.iconSpent];
    const match = candidates.find((entry) => typeof entry === "string" && entry.trim() !== "");
    return match ?? DEFAULT_RESOURCE_ICON;
}

function getItemResourceValue(item: any): number {
    const raw = Number(item?.system?.value);
    return Number.isFinite(raw) ? raw : 0;
}

function getItemResourceMaxValue(item: any): number {
    const raw = Number(item?.system?.maxValue ?? item?.system?.defaultMaxValue ?? 0);
    if (!Number.isFinite(raw)) return 0;
    return Math.max(0, Math.floor(raw));
}

function getItemResourceTitle(item: any): string {
    const title = typeof item?.name === "string" ? item.name.trim() : "";
    return title || "Resource";
}

function getItemResourceIcon(item: any): string {
    const img = item?.img;
    return typeof img === "string" && img.trim() ? img : DEFAULT_RESOURCE_ICON;
}

async function postResourceChangeMessage(payload: ResourceChangePayload) {
    if (!payload.actorId || !payload.resourceKey || payload.delta === 0) return;
    queueResourceChange(payload);
}

function recordSystemResourceSnapshot(actor: any) {
    const actorId = actor?.id;
    if (!actorId) return;
    const resources = Array.isArray(actor?.system?.resources) ? actor.system.resources : [];
    const cache = getActorCache(actorId);
    resources.forEach((resource: any) => {
        const id = resource?.id;
        if (!id) return;
        const key = getResourceKey("system", id);
        cache.set(key, getResourceValue(resource));
    });
}

function recordItemResourceSnapshot(actor: any) {
    const actorId = actor?.id;
    if (!actorId) return;
    const cache = getActorCache(actorId);
    const items = Array.isArray(actor?.items)
        ? actor.items.filter((item: any) => item?.type === "resource")
        : [];
    items.forEach((item: any) => {
        if (!item?.id) return;
        const key = getResourceKey("item", item.id);
        cache.set(key, getItemResourceValue(item));
    });
}

function handleSystemResourceChange(actor: any) {
    const actorId = actor?.id;
    if (!actorId) return;
    const resources = Array.isArray(actor?.system?.resources) ? actor.system.resources : [];
    const cache = getActorCache(actorId);
    resources.forEach((resource: any) => {
        const id = resource?.id;
        if (!id) return;
        const key = getResourceKey("system", id);
        const current = getResourceValue(resource);
        const previous = cache.get(key);
        cache.set(key, current);
        if (previous == null || current === previous) return;
        const payload: ResourceChangePayload = {
            actor,
            actorId,
            resourceKey: key,
            resourceId: id,
            resourceName: getResourceTitle(resource),
            resourceIcon: getResourceIcon(resource),
            delta: current - previous,
            previousValue: previous,
            currentValue: current,
            maxValue: getResourceMaxValue(resource),
        };
        void postResourceChangeMessage(payload);
    });
}

function handleItemResourceChange(item: any) {
    const actor = item?.parent;
    const actorId = actor?.id;
    if (!actorId || !item?.id) return;
    const cache = getActorCache(actorId);
    const key = getResourceKey("item", item.id);
    const current = getItemResourceValue(item);
    const previous = cache.get(key);
    cache.set(key, current);
    if (previous == null || current === previous) return;
    const payload: ResourceChangePayload = {
        actor,
        actorId,
        resourceKey: key,
        resourceId: item.id,
        resourceName: getItemResourceTitle(item),
        resourceIcon: getItemResourceIcon(item),
        delta: current - previous,
        previousValue: previous,
        currentValue: current,
        maxValue: getItemResourceMaxValue(item),
    };
    void postResourceChangeMessage(payload);
}

export function registerResourceChangeChatHooks() {
    Hooks.once("ready", () => {
        (game.actors ?? []).forEach((actor: any) => {
            recordSystemResourceSnapshot(actor);
            recordItemResourceSnapshot(actor);
        });
    });

    Hooks.on("createActor", (actor: any) => {
        recordSystemResourceSnapshot(actor);
        recordItemResourceSnapshot(actor);
    });

    Hooks.on("renderChatMessage", (_message: any, html: JQuery<HTMLElement> | HTMLElement, msgData: any) => {
        const msg = resolveChatMessage(msgData?.message ?? _message);
        if (!msg?.flags?.[RESOURCE_CHANGE_FLAG]) return;
        const root = (html as any)[0] ?? html;
        applyChatHeaderEnhancements(root as HTMLElement, {
            actor: getChatMessageActor(msg),
            speaker: msg?.speaker ?? msg?.data?.speaker,
            userName: msg?.author?.name ?? null,
            moveMeta: false,
        });
        requestAnimationFrame(() => applyResourceChangeCounters(root as HTMLElement));
    });

    Hooks.on("updateActor", (actor: any, diff: any) => {
        if (!diff?.system?.resources) return;
        handleSystemResourceChange(actor);
    });

    Hooks.on("updateItem", (item: any, diff: any) => {
        if (item?.type !== "resource") return;
        if (!diff?.system || !Object.prototype.hasOwnProperty.call(diff.system, "value")) return;
        handleItemResourceChange(item);
    });
}
