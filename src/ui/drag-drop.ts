export type DragDropData = Record<string, any> | null;

export function readDragEventData(event: DragEvent): DragDropData {
    const dataTransfer = (event as any)?.dataTransfer;
    let data: any = null;
    let raw = dataTransfer?.getData?.("application/json");
    if (!raw) {
        raw = dataTransfer?.getData?.("text/plain");
    }
    if (raw) {
        try {
            data = JSON.parse(raw);
        } catch {
            data = null;
        }
    }
    if (!data && typeof (globalThis as any).TextEditor?.getDragEventData === "function") {
        try {
            data = (globalThis as any).TextEditor.getDragEventData(event);
        } catch {
            data = null;
        }
    }
    return data;
}

export async function resolveDroppedDocument(data: DragDropData): Promise<any | null> {
    if (!data) return null;
    const uuid = data.uuid;
    if (uuid && typeof (globalThis as any).fromUuid === "function") {
        const doc = await (globalThis as any).fromUuid(uuid);
        return doc ?? null;
    }
    const pack = data.pack;
    const packedId = data.id ?? data.documentId;
    if (pack && packedId && typeof (globalThis as any).fromUuid === "function") {
        const packedUuid = `Compendium.${pack}.${packedId}`;
        const doc = await (globalThis as any).fromUuid(packedUuid);
        return doc ?? null;
    }
    const id = data.id ?? data.actorId ?? data.documentId ?? data.itemId;
    if (id && (data.type === "Actor" || data.type === "ActorProxy")) {
        return game.actors?.get?.(id) ?? null;
    }
    if (id && data.type === "Item") {
        return game.items?.get?.(id) ?? null;
    }
    if (data.data) return data.data;
    return null;
}
