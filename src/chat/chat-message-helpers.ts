import { DEFAULT_AVATAR } from "../character";

export const SOCKET_NAMESPACE = "system.ezd6-new";

export function resolveChatMessage(msg: any): any | null {
    if (!msg) return null;
    if (typeof msg.update === "function" && msg.id) return msg;

    const resolved = game.messages?.get?.(msg.id ?? msg._id ?? msg._source?._id ?? msg._source?.id);
    if (resolved && typeof resolved.update === "function") return resolved;

    return null;
}

export function getChatMessageActor(msg: any): any | null {
    const speaker = msg?.speaker ?? msg?.data?.speaker;
    const actorId = speaker?.actor;
    if (actorId && game.actors?.get) {
        const actor = game.actors.get(actorId);
        if (actor) return actor;
    }

    const tokenId = speaker?.token;
    const sceneId = speaker?.scene ?? canvas?.scene?.id;
    const scene = sceneId && game.scenes?.get ? game.scenes.get(sceneId) : null;
    const token = tokenId ? scene?.tokens?.get(tokenId) : null;
    if (token?.actor) return token.actor;

    const userId = msg?.author?.id ?? msg?.data?.author ?? msg?.data?.user ?? speaker?.user;
    const user = userId && game.users?.get ? game.users.get(userId) : msg?.user ?? null;
    return user?.character ?? null;
}

export function safeUpdateChatMessage(msg: any, data: any) {
    return (async () => {
        try {
            const target = resolveChatMessage(msg);
            if (!target) return;

            if (target?.isOwner || target?.isAuthor || game.user?.isGM) {
                await target.update(data);
                return;
            }

            const gmOnline = (game.users ?? []).some((u: any) => u.isGM && u.active);
            if (!gmOnline) {
                ui?.notifications?.warn("EZD6: Unable to update the chat message because no GM is currently online.");
                console.warn("EZD6: Unable to update the chat message because no GM is currently online.", { msgId: msg?.id });
                return;
            }

            game.socket?.emit(SOCKET_NAMESPACE, {
                action: "updateMessage",
                msgId: target.id,
                data,
            });
        } catch (err) {
            console.error("EZD6 safeUpdateChatMessage failed", err);
        }
    })();
}

export function canCurrentUserModifyMessage(msg: any): boolean {
    try {
        if (!msg || !game.user) return false;

        let allowed: boolean | null = null;

        if (typeof msg.canUserModify === "function") {
            allowed = !!msg.canUserModify(game.user, "update");
        }

        if (allowed === null && typeof msg.testUserPermission === "function") {
            allowed = !!msg.testUserPermission(game.user, "update");
        }

        if (allowed === null) {
            allowed = !!(msg.isOwner || msg.isAuthor || game.user.isGM);
        }

        return allowed;
    } catch (err) {
        console.error("EZD6 canCurrentUserModifyMessage failed", err);
        return false;
    }
}

export function getChatAvatarUrl(actor: any | null): string {
    const raw = actor?.system?.avatarUrl ?? actor?.img ?? "";
    if (typeof raw === "string" && raw.trim()) return raw;
    return DEFAULT_AVATAR;
}

export function getChatSpeakerName(options: { actor?: any | null; speaker?: any | null; userName?: string | null }): string {
    const actorName = options.actor?.name;
    const userName = options.userName;
    const speakerName = options.speaker?.alias ?? options.speaker?.name;
    const name = actorName ?? userName ?? speakerName ?? "Unknown";
    return String(name).trim() || "Unknown";
}

export function applyChatHeaderEnhancements(
    root: HTMLElement | null,
    options: { actor?: any | null; speaker?: any | null; userName?: string | null; moveMeta?: boolean }
) {
    if (!root) return;
    const header = root.querySelector(".message-header") as HTMLElement | null;
    const sender = header?.querySelector(".message-sender") as HTMLElement | null;
    if (!header || !sender) return;

    const name = getChatSpeakerName(options);
    const avatar = getChatAvatarUrl(options.actor ?? null);

    root.classList.add("ezd6-chat-message");
    header.classList.add("ezd6-chat-header");
    sender.classList.add("ezd6-chat-sender");
    sender.textContent = name;

    if (!header.querySelector(".ezd6-chat-avatar")) {
        const img = document.createElement("img");
        img.className = "ezd6-chat-avatar";
        img.src = avatar;
        img.alt = name;
        header.insertBefore(img, sender);
    }

    if (options.moveMeta === false) {
        root.classList.add("ezd6-chat-no-meta");
        return;
    }
    const content = root.querySelector(".message-content") as HTMLElement | null;
    if (!content) return;
    let subhead = content.querySelector(".ezd6-chat-subhead") as HTMLElement | null;
    if (!subhead) {
        subhead = document.createElement("div");
        subhead.className = "ezd6-chat-subhead";
        subhead.innerHTML = `<div class="ezd6-chat-subhead__left"></div><div class="ezd6-chat-subhead__right"></div>`;
        content.insertBefore(subhead, content.firstChild);
    }

    const right = subhead.querySelector(".ezd6-chat-subhead__right") as HTMLElement | null;
    if (!right) return;
    let metaRow = right.querySelector(".ezd6-chat-subhead__meta") as HTMLElement | null;
    if (!metaRow) {
        metaRow = document.createElement("div");
        metaRow.className = "ezd6-chat-subhead__meta";
        right.insertBefore(metaRow, right.firstChild);
    }
    const metadata = header.querySelector(".message-metadata") as HTMLElement | null;
    const deleteButton = header.querySelector(".message-delete") as HTMLElement | null;
    if (metadata && metadata.parentElement !== right) {
        metaRow.appendChild(metadata);
    }
    if (deleteButton && deleteButton.parentElement !== right) {
        metaRow.appendChild(deleteButton);
    }
}

export function stripChatMessageFlavor(root: HTMLElement | null) {
    if (!root) return;
    const selectors = [".message-flavor", ".dice-flavor", ".flavor-text"];
    selectors.forEach((selector) => {
        const node = root.querySelector(selector) as HTMLElement | null;
        if (node) node.remove();
    });
}
