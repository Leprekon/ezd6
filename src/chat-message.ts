// src/chat-message.ts
import {
    EZD6,
    ParsedRoll,
    chooseDieKindForValue,
    evaluateDice,
    extractKeyword,
    getDieImagePath,
    resolveKeywordRule,
} from "./ezd6-core";
import { Character, DEFAULT_RESOURCE_ICON } from "./character";
import { getTagOptions, normalizeTag } from "./ui/sheet-utils";

const SOCKET_NAMESPACE = "system.ezd6-new";
const processedMessages = new Set<string>();
const actorUpdateHooks = new Map<string, { actor: number; item: number }>();
const KARMA_TAG = "#karma";
const STRESS_TAG = "#stress";
const HEALTH_TAG = "#health";

const ACTOR_UPDATE_OPTIONS = { render: false, diff: false };

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

type ResourceCandidate =
    | { source: "system"; data: any; index: number }
    | { source: "item"; item: any };

function normalizeResourceTag(raw: unknown): string {
    if (typeof raw === "number" && Number.isInteger(raw)) {
        return normalizeTag(String(raw), getTagOptions());
    }
    if (typeof raw !== "string") return "";
    const trimmed = raw.trim();
    if (!trimmed) return "";
    return normalizeTag(trimmed, getTagOptions());
}

function getResourceValue(resource: any): number {
    const rawCurrent = Number(resource?.value);
    const rawFallback = Number(resource?.defaultValue ?? resource?.defaultMaxValue ?? resource?.maxValue ?? 0);
    if (Number.isFinite(rawCurrent)) return rawCurrent;
    if (Number.isFinite(rawFallback)) return rawFallback;
    return 0;
}

function getCandidateValue(candidate: ResourceCandidate): number {
    if (candidate.source === "item") {
        const raw = Number(candidate.item?.system?.value);
        return Number.isFinite(raw) ? raw : 0;
    }
    return getResourceValue(candidate.data);
}

function getResourceIcon(resource: any): string {
    const candidates = [resource?.icon, resource?.iconAvailable, resource?.iconSpent];
    const match = candidates.find((entry) => typeof entry === "string" && entry.trim() !== "");
    return match ?? DEFAULT_RESOURCE_ICON;
}

function getCandidateIcon(candidate: ResourceCandidate): string {
    if (candidate.source === "item") {
        const img = candidate.item?.img;
        return typeof img === "string" && img.trim() ? img : DEFAULT_RESOURCE_ICON;
    }
    return getResourceIcon(candidate.data);
}

function getCandidateTag(candidate: ResourceCandidate): string {
    if (candidate.source === "item") {
        return normalizeResourceTag(candidate.item?.system?.tag ?? "");
    }
    return normalizeResourceTag(candidate.data?.rollKeyword ?? candidate.data?.tag ?? "");
}

function getChatMessageActor(msg: any): any | null {
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
    return token?.actor ?? null;
}

function getActorResourceCandidates(actor: any): ResourceCandidate[] {
    const system = actor?.system ?? actor?.data?.system ?? {};
    const systemResources = Array.isArray(system.resources)
        ? system.resources.map((data: any, index: number) => ({ source: "system", data, index } as ResourceCandidate))
        : [];
    const itemResources = Array.isArray(actor?.items)
        ? actor.items
            .filter((item: any) => item?.type === "resource")
            .map((item: any) => ({ source: "item", item } as ResourceCandidate))
        : [];
    return systemResources.concat(itemResources);
}

function findDiceChangeResource(
    actor: any
): { mode: "karma" | "stress"; resource: ResourceCandidate } | null {
    const resources = getActorResourceCandidates(actor);
    if (!resources.length) return null;

    for (const resource of resources) {
        const tag = getCandidateTag(resource);
        if (tag === KARMA_TAG) {
            return { mode: "karma", resource };
        }
        if (tag === STRESS_TAG) {
            return { mode: "stress", resource };
        }
    }

    return null;
}

function findHealthResource(actor: any): ResourceCandidate | null {
    const resources = getActorResourceCandidates(actor);
    if (!resources.length) return null;
    return resources.find((resource) => getCandidateTag(resource) === HEALTH_TAG) ?? null;
}

async function adjustActorResource(actor: any, candidate: ResourceCandidate, delta: number): Promise<number | null> {
    if (!actor?.update) return null;

    if (candidate.source === "item") {
        const raw = Number(candidate.item?.system?.value);
        const current = Number.isFinite(raw) ? raw : 0;
        const nextValue = Math.max(0, Math.floor(current + delta));
        try {
            await candidate.item.update({ "system.value": nextValue }, ACTOR_UPDATE_OPTIONS);
        } catch (err) {
            console.warn("EZD6 resource item update failed", err);
            return null;
        }
        return nextValue;
    }

    const systemResources = Array.isArray(actor?.system?.resources) ? actor.system.resources.slice() : [];
    if (candidate.index < 0 || candidate.index >= systemResources.length) return null;
    const current = getResourceValue(systemResources[candidate.index]);
    const nextValue = Math.max(0, Math.floor(current + delta));
    const nextResource = { ...systemResources[candidate.index], value: nextValue };
    systemResources[candidate.index] = nextResource;
    try {
        await actor.update({ "system.resources": systemResources }, ACTOR_UPDATE_OPTIONS);
    } catch (err) {
        console.warn("EZD6 resource update failed", err);
        return null;
    }

    return nextValue;
}

function getDiceChangeState(actor: any) {
    const match = actor ? findDiceChangeResource(actor) : null;
    if (!match) {
        return { match: null, iconSrc: "", iconAlt: "", disabled: false };
    }
    const disabled = match.mode === "karma" && getCandidateValue(match.resource) <= 0;
    const iconSrc = getCandidateIcon(match.resource);
    const iconAlt = getCandidateTag(match.resource) || match.mode;
    return { match, iconSrc, iconAlt, disabled };
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

    const rule = resolveKeywordRule(keyword);
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

    const actor = getChatMessageActor(msg);

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

        if (canBurn) {
            const healthResource = actor ? findHealthResource(actor) : null;
            const healthValue = healthResource ? getCandidateValue(healthResource) : null;
            const burnDisabled = healthResource ? healthValue <= 0 : false;
            const burnDisabledAttr = burnDisabled ? " disabled" : "";
            const spendHiddenClass = healthResource ? "" : " is-hidden";
            const burnDieClass = `ezd6-die-icon ezd6-burn1-die${burnDisabled ? " ezd6-die-icon--disabled" : ""}`;
            const burnIconClass = `ezd6-dice-change-icon ezd6-burn1-resource${burnDisabled ? " ezd6-dice-change-icon--disabled" : ""}`;
            const burnIconSrc = healthResource ? getCandidateIcon(healthResource) : DEFAULT_RESOURCE_ICON;
            const burnIconAlt = healthResource ? (getCandidateTag(healthResource) || "health") : "health";
            const burnLabel = `<span class="ezd6-burn1-label">Burn ` +
                `<img src="${getDieImagePath(1, "red")}" alt="1" class="${burnDieClass}">` +
                `</span>` +
                `<span class="ezd6-burn1-spend${spendHiddenClass}">` +
                `<span class="ezd6-icon-slash">` +
                `<img src="${burnIconSrc}" alt="${burnIconAlt}" class="${burnIconClass}">` +
                `</span></span>`;
            buttons.push(`<button class=\"ezd6-button ezd6-burn1-btn\"${burnDisabledAttr}>${burnLabel}</button>`);
        }
        else if (onlyOnes) return "";

        const diceChangeState = getDiceChangeState(actor);
        const diceChangeDisabledAttr = diceChangeState.disabled ? " disabled" : "";
        const iconHiddenClass = diceChangeState.match ? "" : " is-hidden";
        const slashClass = diceChangeState.match?.mode === "karma" ? " ezd6-icon-slash" : "";
        const iconClass = `ezd6-dice-change-icon ezd6-buff-icon${diceChangeState.disabled ? " ezd6-dice-change-icon--disabled" : ""}`;
        const iconHtml = diceChangeState.match
            ? `<img src="${diceChangeState.iconSrc}" alt="${diceChangeState.iconAlt}" class="${iconClass}">`
            : "";
        const renderBuffButton = () => `<button class="ezd6-button ezd6-buff-btn"${diceChangeDisabledAttr}>` +
            `<span class="ezd6-buff-label-wrap"><span class="ezd6-buff-label">+1</span></span>` +
            `<span class="ezd6-buff-icon-wrap${slashClass}${iconHiddenClass}">${iconHtml}</span>` +
            `</button>`;

        if (activeIsFromConfirmations()) {
            const activeV = getActiveValue();
            const onesBlock = parsedState.rule.oneAlwaysFail && parsedState.hasOnes;

            if (parsedState.rule.allowKarma && !onesBlock && activeV >= 2 && activeV < parsedState.rule.critValue) {
                buttons.push(renderBuffButton());
            }
            if (parsedState.rule.allowConfirm && !onesBlock && activeV >= parsedState.rule.critValue) {
                buttons.push(`<button class=\"ezd6-button ezd6-confirm-btn\">Confirm ${critIcon}</button>`);
            }
        } else {
            if (parsedState.canKarma) buttons.push(renderBuffButton());
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

    function updateBuffButtonState(root: HTMLElement | null) {
        if (!root) return;
        const button = root.querySelector('.ezd6-buff-btn') as HTMLButtonElement | null;
        const iconWrap = button?.querySelector('.ezd6-buff-icon-wrap') as HTMLElement | null;
        const icon = button?.querySelector('.ezd6-buff-icon') as HTMLImageElement | null;
        if (!button || !iconWrap || !actor) return;

        const diceChangeState = getDiceChangeState(actor);
        if (!diceChangeState.match || diceChangeState.match.mode !== "karma") {
            button.disabled = false;
            iconWrap.classList.remove("ezd6-icon-slash");
            iconWrap.classList.toggle("is-hidden", !diceChangeState.match);
            if (icon) {
                if (diceChangeState.match) {
                    icon.src = diceChangeState.iconSrc;
                    icon.alt = diceChangeState.iconAlt;
                }
                icon.classList.remove("ezd6-dice-change-icon--disabled");
            }
            return;
        }

        button.disabled = diceChangeState.disabled;
        iconWrap.classList.add("ezd6-icon-slash");
        iconWrap.classList.remove("is-hidden");
        if (icon) {
            icon.src = diceChangeState.iconSrc;
            icon.alt = diceChangeState.iconAlt;
            icon.classList.toggle("ezd6-dice-change-icon--disabled", diceChangeState.disabled);
        }
    }

    function updateBurnButtonState(root: HTMLElement | null) {
        if (!root || !actor) return;
        const burnBtn = root.querySelector('.ezd6-burn1-btn') as HTMLButtonElement | null;
        if (!burnBtn) return;
        const dieIcon = burnBtn.querySelector('.ezd6-burn1-die') as HTMLElement | null;
        const spendSpan = burnBtn.querySelector('.ezd6-burn1-spend') as HTMLElement | null;
        const resourceIcon = burnBtn.querySelector('.ezd6-burn1-resource') as HTMLImageElement | null;
        const healthResource = findHealthResource(actor);
        if (!healthResource) {
            burnBtn.disabled = false;
            dieIcon?.classList.remove("ezd6-die-icon--disabled");
            spendSpan?.classList.add("is-hidden");
            return;
        }
        const current = getCandidateValue(healthResource);
        const disabled = current <= 0;
        burnBtn.disabled = disabled;
        if (dieIcon) dieIcon.classList.toggle("ezd6-die-icon--disabled", disabled);
        if (spendSpan) spendSpan.classList.remove("is-hidden");
        if (resourceIcon) {
            resourceIcon.src = getCandidateIcon(healthResource);
            resourceIcon.alt = getCandidateTag(healthResource) || "health";
            resourceIcon.classList.toggle("ezd6-dice-change-icon--disabled", disabled);
        }
    }

    function registerActorResourceWatcher() {
        if (!actor?.id || !msg?.id) return;
        if (actorUpdateHooks.has(msg.id)) return;
        const hookId = Hooks.on("updateActor", (updated: any, diff: any) => {
            if (updated?.id !== actor.id) return;
            if (!diff?.system?.resources && !diff?.items) return;
            const root = findChatMessageElement(msg.id);
            updateBuffButtonState(root);
            updateBurnButtonState(root);
        });
        const itemHookId = Hooks.on("updateItem", (item: any, diff: any) => {
            if (item?.parent?.id !== actor.id) return;
            if (item?.type !== "resource") return;
            if (!diff?.system?.value && !diff?.system?.tag) return;
            const root = findChatMessageElement(msg.id);
            updateBuffButtonState(root);
            updateBurnButtonState(root);
        });
        actorUpdateHooks.set(msg.id, { actor: hookId, item: itemHookId });
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
                const diceChangeState = getDiceChangeState(actor);
                if (diceChangeState.match?.mode === "karma") {
                    const current = getCandidateValue(diceChangeState.match.resource);
                    if (current <= 0) return;
                    await adjustActorResource(actor, diceChangeState.match.resource, -1);
                } else if (diceChangeState.match?.mode === "stress") {
                    await adjustActorResource(actor, diceChangeState.match.resource, 1);
                }

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
                const healthResource = actor ? findHealthResource(actor) : null;
                if (healthResource) {
                    const current = getCandidateValue(healthResource);
                    if (current <= 0) return;
                    const next = await adjustActorResource(actor, healthResource, -1);
                    if (next === null) return;
                }

                const idx = parsedState.dice.findIndex((d, i) => d.value === 1 && !burnedOnes[i]);
                if (idx >= 0) {
                    if (!healthResource) {
                        const ok = Character.consumeHealth();
                        if (!ok) return;
                    }

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

        updateBuffButtonState(root);
        updateBurnButtonState(root);
        registerActorResourceWatcher();

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
        const hookIds = actorUpdateHooks.get(resolved.id);
        if (hookIds) {
            Hooks.off("updateActor", hookIds.actor);
            Hooks.off("updateItem", hookIds.item);
            actorUpdateHooks.delete(resolved.id);
        }
    });
}
