// src/chat-message.ts
import {
    EZD6,
    ParsedRoll,
    KeywordRules,
    chooseDieKindForValue,
    evaluateDice,
    extractKeyword,
    getDieImagePath,
} from "./ezd6-core";
import { Character } from "./character";

const SOCKET_NAMESPACE = "system.ezd6-new";
const processedMessages = new Set<string>();

function hasProcessedMessage(msgId: string): boolean {
    return processedMessages.has(msgId);
}

function trackProcessedMessage(msgId: string) {
    processedMessages.add(msgId);
}

function releaseProcessedMessage(msgId: string) {
    processedMessages.delete(msgId);
}

function resolveChatMessage(msg: any): any | null {
    if (!msg) return null;
    if (typeof msg.update === "function" && msg.id) return msg;

    const resolved = game.messages?.get?.(msg.id ?? msg._id ?? msg._source?._id ?? msg._source?.id);
    if (resolved && typeof resolved.update === "function") return resolved;

    return null;
}

interface EZD6State {
    originalDice: number[];
    deltaDice: number[];
    burnedOnes: boolean[];
    confirmations: { value: number; delta: number }[];
    lockedResultIndex: number | null;
    mode: "kh" | "kl";
    keyword: string;
    initialAllCrit: boolean;
}

function safeUpdateChatMessage(msg: any, data: any) {
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
                ui?.notifications?.warn("EZD6: Unable to update the roll because no GM is currently online.");
                console.warn("EZD6: Unable to update the roll because no GM is currently online.", { msgId: msg?.id });
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

function canCurrentUserModifyMessage(msg: any): boolean {
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

function findChatMessageElement(msgId: string): HTMLElement | null {
    return document.querySelector(`[data-message-id="${msgId}"]`) as HTMLElement | null;
}

function waitForMessageElement(msgId: string, timeout = 3000): Promise<HTMLElement> {
    return new Promise((resolve, reject) => {
        const existing = findChatMessageElement(msgId);
        if (existing) return resolve(existing);
        const chatLog = document.querySelector('#chat-log');
        if (!chatLog) return reject(new Error('No #chat-log element'));
        const obs = new MutationObserver(() => {
            const el = findChatMessageElement(msgId);
            if (el) {
                obs.disconnect();
                resolve(el);
            }
        });
        obs.observe(chatLog, { childList: true, subtree: true });
        setTimeout(() => {
            obs.disconnect();
            const el = findChatMessageElement(msgId);
            if (el) return resolve(el);
            reject(new Error('Timed out waiting for message element'));
        }, timeout);
    });
}

function removeDuplicateMessageElements(msgId: string, preferred?: HTMLElement | null) {
    const nodes = Array.from(document.querySelectorAll(`[data-message-id="${msgId}"]`));
    if (nodes.length <= 1) return;

    const keep = preferred ?? nodes[0];

    for (const node of nodes) {
        if (node === keep) continue;
        node.remove();
    }
}

function removeAllDuplicateMessageElements() {
    const seen = new Set<string>();
    const chatLog = document.querySelector('#chat-log');
    if (!chatLog) return;

    const nodes = Array.from(chatLog.querySelectorAll('[data-message-id]')) as HTMLElement[];
    for (const node of nodes) {
        const id = node.getAttribute('data-message-id');
        if (!id) continue;

        if (seen.has(id)) {
            node.remove();
            continue;
        }

        seen.add(id);
    }
}

function scrollChatToBottomSoon() {
    setTimeout(() => {
        try {
            const chat = ui?.chat?.element?.get(0);
            if (chat) chat.scrollTop = chat.scrollHeight;
        } catch (e) {
            // ignore
        }
    }, 60);
}

function buildInitialStateFromMessage(msg: any): EZD6State | null {
    const resolved = resolveChatMessage(msg);
    if (!resolved) return null;

    const rolls = Array.isArray(resolved?.rolls)
        ? resolved.rolls
        : resolved?.roll
            ? [resolved.roll]
            : [];
    const roll = rolls[0];
    const diceTerms = roll?.terms?.filter((t: any) => t instanceof foundry.dice.terms.Die && t.faces === 6) ?? [];
    const flagsState = resolved.flags?.ezd6State as Partial<EZD6State> | undefined;

    if (!diceTerms.length && !flagsState) {
        return null;
    }

    const fromRoll = diceTerms.flatMap((t: any) => t.results.map((r: any) => r.result));

    const content = resolved.content ?? "";
    const flavor = resolved.flavor ?? "";
    const rollFlavor = roll?.options?.flavor ?? "";
    const keywordSources = [flagsState?.keyword, rollFlavor, flavor, content];
    const keyword = keywordSources.reduce<string | null>((acc, src) => acc ?? extractKeyword(src ?? ""), null) ?? "default";

    const formula = roll?.formula ?? "";
    const formulaModeMatch = formula.match(/d6(k[hl])/i);
    const contentModeMatch = content.match(/(\d+)d6(kl|kh)?/i);
    const mode = (flagsState?.mode ?? (formulaModeMatch && formulaModeMatch[1])?.toLowerCase() ?? (contentModeMatch && contentModeMatch[2])?.toLowerCase()) as "kh" | "kl" | undefined;

    const rule = KeywordRules[keyword] ?? KeywordRules.default;
    const initialAllCrit = typeof flagsState?.initialAllCrit === "boolean"
        ? flagsState.initialAllCrit
        : (fromRoll.length > 0 ? fromRoll.every((v: number) => v >= rule.critValue) : false);

    return {
        originalDice: [...(flagsState?.originalDice ?? fromRoll)],
        deltaDice: [...(flagsState?.deltaDice ?? fromRoll.map(() => 0))],
        burnedOnes: [...(flagsState?.burnedOnes ?? fromRoll.map(() => false))],
        confirmations: [...(flagsState?.confirmations ?? [])],
        lockedResultIndex: typeof flagsState?.lockedResultIndex === "number" || flagsState?.lockedResultIndex === null
            ? flagsState.lockedResultIndex
            : null,
        mode: mode === "kl" ? "kl" : "kh",
        keyword,
        initialAllCrit,
    };
}

function buildController(msg: any) {
    const baseState = buildInitialStateFromMessage(msg);
    if (!baseState) return null;

    let originalDice = baseState.originalDice;
    let deltaDice = baseState.deltaDice;
    let burnedOnes = baseState.burnedOnes;
    let confirmations = baseState.confirmations;
    let lockedResultIndex = baseState.lockedResultIndex;
    const mode = baseState.mode;
    const keyword = baseState.keyword;
    let initialAllCrit = baseState.initialAllCrit;

    let parsedState: ParsedRoll = evaluateDice(originalDice, keyword, mode, burnedOnes, undefined, initialAllCrit);

    function hydrateStateFromFlags() {
        const persisted = msg.flags?.ezd6State as any;
        if (!persisted) return;

        if (Array.isArray(persisted.originalDice)) originalDice = [...persisted.originalDice];
        if (Array.isArray(persisted.deltaDice)) deltaDice = [...persisted.deltaDice];
        if (Array.isArray(persisted.burnedOnes)) burnedOnes = [...persisted.burnedOnes];
        if (Array.isArray(persisted.confirmations)) confirmations = [...persisted.confirmations];
        if (typeof persisted.lockedResultIndex === "number" || persisted.lockedResultIndex === null) {
            lockedResultIndex = persisted.lockedResultIndex;
        }
        if (typeof persisted.initialAllCrit === "boolean") initialAllCrit = persisted.initialAllCrit;
    }

    function resolvedLock(): number | null {
        if (lockedResultIndex === null) return null;
        return burnedOnes[lockedResultIndex] ? null : lockedResultIndex;
    }

    function refreshParsedState() {
        parsedState = evaluateDice(originalDice, keyword, mode, burnedOnes, resolvedLock() ?? undefined, initialAllCrit);
        if (lockedResultIndex === null && parsedState.resultIndex !== null) {
            lockedResultIndex = parsedState.resultIndex;
        }

    }

    hydrateStateFromFlags();
    refreshParsedState();

    function activeIsFromConfirmations(): boolean { return confirmations.length > 0; }
    function getActiveIndex(): number { return parsedState.resultIndex ?? 0; }
    function getActiveValue(): number { return activeIsFromConfirmations() ? confirmations[confirmations.length - 1].value : originalDice[getActiveIndex()]; }
    function getActiveDelta(): number { return activeIsFromConfirmations() ? confirmations[confirmations.length - 1].delta : deltaDice[getActiveIndex()]; }
    function setActiveValue(v: number) {
        if (activeIsFromConfirmations()) {
            confirmations[confirmations.length - 1].value = v;
        } else {
            originalDice[getActiveIndex()] = v;
        }
    }
    function incrementActiveDelta() {
        if (activeIsFromConfirmations()) {
            confirmations[confirmations.length - 1].delta += 1;
        } else {
            deltaDice[getActiveIndex()] += 1;
        }
    }
    function pushNewConfirmedValue(v: number) { confirmations.push({ value: v, delta: 0 }); }

    function allOnesOnly(): boolean {
        const available = originalDice.filter((_, idx) => !burnedOnes[idx]);
        return available.length > 0 && available.every(v => v === 1);
    }

    function renderDieOriginalFromParsed(idx: number): string {
        const die = parsedState.dice[idx];
        const value = die.value;
        const kind = die.highlight ? chooseDieKindForValue(value, parsedState.rule.critValue) : "grey";
        const classes = ["ezd6-die", die.transparent ? "ezd6-die--faded" : ""].filter(Boolean).join(" ");
        const overlayVal = deltaDice[idx];
        const overlay = overlayVal > 0 ? `<div class=\"ezd6-die-overlay\">+${overlayVal}</div>` : "";

        return `<div class=\"${classes}\"><img src=\"${getDieImagePath(value, kind)}\" width=\"32\" height=\"32\" alt=\"${value}\">${overlay}</div>`;
    }

    function renderDieCrit(value: number, delta: number): string {
        const kind = chooseDieKindForValue(value, parsedState.rule.critValue);
        const overlay = delta > 0 ? `<div class=\"ezd6-die-overlay\">+${delta}</div>` : "";
        return `<div class=\"ezd6-die\"><img src=\"${getDieImagePath(value, kind)}\" width=\"32\" height=\"32\" alt=\"${value}\">${overlay}</div>`;
    }

    function renderOriginalRow(): string {
        return `<div class=\"ezd6-row-original\">${originalDice.map((_, i) => renderDieOriginalFromParsed(i)).join("")}</div>`;
    }

    function renderCrits(): string {
        if (confirmations.length === 0) return "";
        const diceHtml = confirmations.map((c) => renderDieCrit(c.value, c.delta)).join("");
        return `
        <div class=\"ezd6-crit-header\">
          <div class=\"ezd6-crit-sep\"></div>
          <div class=\"ezd6-crit-label\">CRIT</div>
          <div class=\"ezd6-crit-sep\"></div>
        </div>
        <div class=\"ezd6-crit-row\">
          ${diceHtml}
        </div>
      `;
    }

    function renderButtons(): string {
        const buttons: string[] = [];

        const canBurn = !!parsedState.rule.allowBurnOnes && parsedState.hasOnes;
        const onlyOnes = allOnesOnly();
        const dieIcon1 = `<img src=\"${getDieImagePath(1, "red")}\" alt=\"1\" class=\"ezd6-die-icon\">`;
        const critIcon = `<img src=\"${getDieImagePath(parsedState.rule.critValue, "green")}\" alt=\"${parsedState.rule.critValue}\" class=\"ezd6-die-icon\">`;

        if (canBurn) buttons.push(`<button class=\"ezd6-button ezd6-burn1-btn\">Burn ${dieIcon1}</button>`);
        else if (onlyOnes) return "";

        if (activeIsFromConfirmations()) {
            const activeV = getActiveValue();
            const onesBlock = parsedState.rule.oneAlwaysFail && parsedState.hasOnes;

            if (parsedState.rule.allowKarma && !onesBlock && activeV >= 2 && activeV < parsedState.rule.critValue) {
                buttons.push(`<button class=\"ezd6-button ezd6-buff-btn\">+1</button>`);
            }
            if (parsedState.rule.allowConfirm && !onesBlock && activeV >= parsedState.rule.critValue) {
                buttons.push(`<button class=\"ezd6-button ezd6-confirm-btn\">Confirm ${critIcon}</button>`);
            }
        } else {
            if (parsedState.canKarma) buttons.push(`<button class=\"ezd6-button ezd6-buff-btn\">+1</button>`);
            if (parsedState.canConfirm) buttons.push(`<button class=\"ezd6-button ezd6-confirm-btn\">Confirm ${critIcon}</button>`);
        }

        if (buttons.length === 0) {
            return "";
        }
        return `<div class=\"ezd6-buttons\">${buttons.join("")}</div>`;
    }

    function renderContainerHtml(canModify: boolean): string {
        const buttons = canModify ? renderButtons() : "";
        return `<div class=\"ezd6-container\">${renderOriginalRow()}${renderCrits()}${buttons}</div>`;
    }

    function stripButtonsForViewOnly(root: HTMLElement | null) {
        if (!root) return;
        const controls = root.querySelector('.ezd6-buttons');
        if (controls) controls.remove();
    }

    async function persistAndRender(options: { forceDomOnly?: boolean; canModify: boolean; targetRoot?: HTMLElement | null }) {
        const { forceDomOnly = false, canModify, targetRoot = null } = options;
        const html = renderContainerHtml(canModify);

        if (forceDomOnly) {
            const root = targetRoot ?? findChatMessageElement(msg.id);
            const contentEl = root?.querySelector('.message-content');
            if (contentEl) contentEl.innerHTML = html;
            if (!canModify) stripButtonsForViewOnly(root ?? null);
            return;
        }

        const flags = {
            ...(msg.flags ?? {}),
            ezd6Processed: true,
            ezd6State: {
                originalDice,
                deltaDice,
                burnedOnes,
                confirmations,
                lockedResultIndex,
                mode,
                keyword,
                initialAllCrit,
            },
        };

        await safeUpdateChatMessage(msg, { content: html, flags });
    }

    function bindHandlers(root: HTMLElement | null, canModify: boolean): boolean {
        if (!root) return false;
        const container = root.querySelector('.ezd6-container') as HTMLElement | null;
        if (!container) return false;
        const $root = jQuery(container);

        hydrateStateFromFlags();
        refreshParsedState();

        if (!canModify) {
            stripButtonsForViewOnly(root);
            return true;
        }

        $root.find('.ezd6-buff-btn').off('click').on('click', async (ev: any) => {
            ev.preventDefault();
            try {
                const current = getActiveValue();
                const res = await EZD6.RollAPI.modifyResult(null, current, 1, keyword);
                setActiveValue(res.value);
                incrementActiveDelta();

                refreshParsedState();

                await persistAndRender({ canModify });
                scrollChatToBottomSoon();
            } catch (e) {
                console.error('EZD6 +1 failed', e);
            }
        });

        $root.find('.ezd6-confirm-btn').off('click').on('click', async (ev: any) => {
            ev.preventDefault();
            try {
                const confRoll = await (new Roll('1d6')).evaluate();
                const v = confRoll.total;
                pushNewConfirmedValue(v);

                refreshParsedState();

                await persistAndRender({ canModify });
                scrollChatToBottomSoon();
            } catch (e) {
                console.error('EZD6 confirm failed', e);
            }
        });

        $root.find('.ezd6-burn1-btn').off('click').on('click', async (ev: any) => {
            ev.preventDefault();
            try {
                const idx = parsedState.dice.findIndex((d, i) => d.value === 1 && !burnedOnes[i]);
                if (idx >= 0) {
                    const ok = Character.consumeHealth();
                    if (!ok) return;

                    burnedOnes[idx] = true;
                    deltaDice[idx] = 0;

                    if (lockedResultIndex === idx) lockedResultIndex = null;

                    refreshParsedState();

                    await persistAndRender({ canModify });
                    scrollChatToBottomSoon();
                }
            } catch (e) {
                console.error('EZD6 burn1 failed', e);
            }
        });

        return true;
    }

    return {
        persistAndRender,
        bindHandlers,
    };
}

export function registerChatMessageHooks() {
    Hooks.once("ready", () => {
        const chatLog = document.querySelector('#chat-log');
        if (chatLog) {
            removeAllDuplicateMessageElements();

            const obs = new MutationObserver(() => removeAllDuplicateMessageElements());
            obs.observe(chatLog, { childList: true, subtree: true });
        }

        game.socket?.on(SOCKET_NAMESPACE, async (payload: any) => {
            if (!payload || payload.action !== "updateMessage") return;
            if (!game.user?.isGM) return;
            const target = game.messages?.get(payload.msgId);
            if (!target) return;
            try {
                await target.update(payload.data);
            } catch (err) {
                console.error("EZD6 GM relay update failed", err);
            }
        });
    });

    Hooks.on("createChatMessage", async (msg: any) => {
        try {
            const resolved = resolveChatMessage(msg);
            if (!resolved) return;

            const msgId = resolved.id;
            if (!msgId) return;

            // Guard against "create" firing more than once for the same message (which can occur
            // on some clients right after login) so we don't process or render the message twice.
            if (hasProcessedMessage(msgId)) return;
            trackProcessedMessage(msgId);

            // Always prune any duplicate DOM nodes that may already exist for this message.
            setTimeout(() => removeDuplicateMessageElements(msgId), 0);

            const isAuthor = resolved?.author?.id === game.user?.id;
            if (!isAuthor) {
                return;
            }

            const controller = buildController(resolved);
            if (!controller) return;

            const canModify = canCurrentUserModifyMessage(resolved);
            const alreadyProcessed = !!resolved.flags?.ezd6Processed;

            try { await waitForMessageElement(resolved.id); } catch (_) { /* ignore */ }

            removeDuplicateMessageElements(resolved.id);

            const forceDomOnly = !isAuthor || (alreadyProcessed && !canModify);

            await controller.persistAndRender({ canModify, forceDomOnly });
            scrollChatToBottomSoon();

            function bindHandlersIfReady(): boolean {
                const root = findChatMessageElement(resolved.id);
                if (!root) return false;
                return controller!.bindHandlers(root, canModify);
            }

            bindHandlersIfReady();

            const chatLog = document.querySelector('#chat-log');
            if (chatLog) {
                const observer = new MutationObserver(() => { bindHandlersIfReady(); });
                observer.observe(chatLog, { childList: true, subtree: true });
            }

        } catch (err) {
            console.error('EZD6 createChatMessage failed:', err);
        }
    });

    Hooks.on("renderChatMessage", (_message: any, html: JQuery<HTMLElement> | HTMLElement, msgData: any) => {
        try {
            const msg = resolveChatMessage(msgData?.message ?? _message);
            if (!msg) return;

            // Ensure only one DOM node exists for the chat message regardless of processing state,
            // preferring the element just rendered by Foundry.
            const renderedRoot = (html as any)[0] ?? html;
            removeDuplicateMessageElements(msg.id, renderedRoot as HTMLElement | null);

            if (!msg.flags?.ezd6Processed) return;

            const canModify = canCurrentUserModifyMessage(msg);
            const controller = buildController(msg);
            if (!controller) return;

            const root = (html as any)[0] ?? html;
            controller.persistAndRender({ forceDomOnly: true, canModify, targetRoot: root });
            controller.bindHandlers(root, canModify);
        } catch (err) {
            console.error('EZD6 renderChatMessage failed:', err);
        }
    });

    Hooks.on("deleteChatMessage", (msg: any) => {
        const resolved = resolveChatMessage(msg);
        if (!resolved?.id) return;

        releaseProcessedMessage(resolved.id);
    });
}
