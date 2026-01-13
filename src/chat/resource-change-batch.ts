import { canCurrentUserModifyMessage, safeUpdateChatMessage } from "./chat-message-helpers";
import { renderResourceChangeHtml } from "./resource-change-render";
import {
    PendingBatch,
    ResourceChangeFlag,
    ResourceChangePayload,
    ResourceChangeRow,
} from "./resource-change-types";

export const RESOURCE_CHANGE_FLAG = "ezd6ResourceChange";
const pendingBatches = new Map<string, PendingBatch>();

function buildFlagFromBatch(batch: PendingBatch): ResourceChangeFlag {
    const rows: Record<string, ResourceChangeRow> = {};
    batch.order.forEach((key) => {
        const row = batch.changes.get(key);
        if (!row) return;
        rows[key] = { ...row };
    });
    return {
        actorId: batch.actorId,
        rows,
        order: [...batch.order],
    };
}

function getLastRowKeyForResource(rows: Record<string, ResourceChangeRow>, order: string[], resourceKey: string): string | null {
    for (let i = order.length - 1; i >= 0; i -= 1) {
        const key = order[i];
        const row = rows[key];
        if (row?.resourceKey === resourceKey) return key;
    }
    return null;
}

function getUniqueRowKey(rows: Record<string, ResourceChangeRow>, resourceKey: string): string {
    if (!rows[resourceKey]) return resourceKey;
    let idx = 1;
    let key = `${resourceKey}::${idx}`;
    while (rows[key]) {
        idx += 1;
        key = `${resourceKey}::${idx}`;
    }
    return key;
}

async function applyChangesToLastMessage(batch: PendingBatch): Promise<boolean> {
    const messages = game.messages?.contents ?? [];
    const lastMessage = messages.length ? messages[messages.length - 1] : null;
    const lastFlag = lastMessage?.flags?.[RESOURCE_CHANGE_FLAG] as ResourceChangeFlag | undefined;
    if (!lastMessage || !lastFlag || lastFlag.actorId !== batch.actorId) return false;

    if (!canCurrentUserModifyMessage(lastMessage)) return false;
    const rows = { ...(lastFlag.rows ?? {}) };
    const order = Array.isArray(lastFlag.order) ? [...lastFlag.order] : [];

    batch.order.forEach((key) => {
        const change = batch.changes.get(key);
        if (!change) return;
        const incomingDelta = change.newValue - change.oldValue;
        const lastKey = getLastRowKeyForResource(rows, order, change.resourceKey);
        const existing = lastKey ? rows[lastKey] : null;
        const existingDelta = existing ? existing.newValue - existing.oldValue : 0;
        const sameDirection = existing && Math.sign(existingDelta) === Math.sign(incomingDelta);

        if (existing && sameDirection) {
            rows[lastKey!] = {
                ...existing,
                resourceName: change.resourceName || existing.resourceName,
                resourceIcon: change.resourceIcon || existing.resourceIcon,
                newValue: change.newValue,
                maxValue: change.maxValue || existing.maxValue,
            };
            return;
        }

        const nextKey = getUniqueRowKey(rows, change.resourceKey);
        rows[nextKey] = { ...change };
        order.push(nextKey);
    });

    const nextFlag: ResourceChangeFlag = {
        actorId: batch.actorId,
        rows,
        order,
    };
    const content = renderResourceChangeHtml(nextFlag);
    const flags = {
        ...(lastMessage.flags ?? {}),
        [RESOURCE_CHANGE_FLAG]: nextFlag,
    };
    await safeUpdateChatMessage(lastMessage, { content, flags });
    return true;
}

async function flushResourceChanges(actorId: string) {
    const batch = pendingBatches.get(actorId);
    if (!batch) return;
    if (batch.timer !== null) {
        clearTimeout(batch.timer);
        batch.timer = null;
    }
    pendingBatches.delete(actorId);

    const merged = await applyChangesToLastMessage(batch);
    if (merged) return;

    const speaker = ChatMessage.getSpeaker?.({ actor: batch.actor }) ?? ChatMessage.getSpeaker?.();
    const flag = buildFlagFromBatch(batch);
    const content = renderResourceChangeHtml(flag);
    await ChatMessage.create({
        content,
        speaker,
        flags: {
            [RESOURCE_CHANGE_FLAG]: flag,
        },
    });
}

export function queueResourceChange(payload: ResourceChangePayload) {
    let batch = pendingBatches.get(payload.actorId);
    if (!batch) {
        batch = {
            actor: payload.actor,
            actorId: payload.actorId,
            changes: new Map<string, ResourceChangeRow>(),
            order: [],
            timer: null,
        };
        pendingBatches.set(payload.actorId, batch);
    }

    const existing = batch.changes.get(payload.resourceKey);
    if (existing) {
        existing.newValue = payload.currentValue;
        existing.resourceName = payload.resourceName || existing.resourceName;
        existing.resourceIcon = payload.resourceIcon || existing.resourceIcon;
        existing.maxValue = payload.maxValue || existing.maxValue;
    } else {
        batch.changes.set(payload.resourceKey, {
            resourceKey: payload.resourceKey,
            resourceId: payload.resourceId,
            resourceName: payload.resourceName,
            resourceIcon: payload.resourceIcon,
            oldValue: payload.previousValue,
            newValue: payload.currentValue,
            maxValue: payload.maxValue,
        });
        batch.order.push(payload.resourceKey);
    }

    if (batch.timer !== null) return;
    batch.timer = window.setTimeout(() => {
        void flushResourceChanges(payload.actorId);
    }, 50);
}
