import { getDieImagePath } from "../ezd6-core";

const TAG_OPTIONS = [
    "#default",
    "#magick",
    "#target5",
    "#target4",
    "#target3",
    "#anythingBut1",
] as const;

const DEFAULT_TAG = "#default";
const ROLL_HEAD_PATTERN = /^\s*\/r(?:oll)?\s+(.+?)\s*$/i;
const DICE_TOKEN_PATTERN = /^(\d+)d6(?:(kh|kl))?$/i;
const MODE_TOKEN_PATTERN = /^(kh|kl)$/i;
const TAG_TOKEN_PATTERN = /^#[a-z0-9_-]+$/i;

type RollMode = "kh" | "kl";
type InputEl = HTMLElement & { value: string };
type ThemeMode = "light" | "dark";

type ParsedRoll = {
    dice: number;
    mode: RollMode | null;
    tag: string | null;
};

function normalizeTag(tag: string | null | undefined): string {
    if (!tag) return DEFAULT_TAG;
    const normalized = tag.trim().toLowerCase();
    const match = TAG_OPTIONS.find((entry) => entry.toLowerCase() === normalized);
    return match ?? DEFAULT_TAG;
}

function parseRollMessage(raw: string): ParsedRoll | null {
    const head = raw.match(ROLL_HEAD_PATTERN);
    if (!head) return null;
    const tokens = head[1].trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) return null;

    const first = tokens[0].match(DICE_TOKEN_PATTERN);
    if (!first) return null;

    const dice = Number.parseInt(first[1], 10);
    if (!Number.isFinite(dice) || dice < 1) return null;

    let mode: RollMode | null = first[2]?.toLowerCase() === "kl"
        ? "kl"
        : first[2]?.toLowerCase() === "kh"
            ? "kh"
            : null;
    let tag: string | null = null;

    for (let i = 1; i < tokens.length; i += 1) {
        const token = tokens[i];
        if (!mode && MODE_TOKEN_PATTERN.test(token)) {
            mode = token.toLowerCase() as RollMode;
            continue;
        }
        if (!tag && TAG_TOKEN_PATTERN.test(token)) {
            tag = normalizeTag(token);
            continue;
        }
        return null;
    }

    return { dice, mode, tag };
}

function buildRollMessage(dice: number, tag: string, mode?: RollMode | null): string {
    const safeDice = Math.max(1, Math.floor(dice));
    const suffix = mode ?? "";
    return `/r ${safeDice}d6${suffix} ${normalizeTag(tag)}`;
}

function getMessageInputs(scope: ParentNode): InputEl[] {
    const selectors = ["#chat-message", 'textarea[name="content"]', 'input[name="content"]'];
    const unique = new Set<InputEl>();
    selectors.forEach((selector) => {
        const nodes = scope.querySelectorAll(selector);
        nodes.forEach((node) => unique.add(node as InputEl));
    });
    return Array.from(unique);
}

function getInputText(input: InputEl): string {
    const editable = input.querySelector?.('[contenteditable="true"]') as HTMLElement | null;
    if (editable) return (editable.textContent ?? "").trim();
    const raw = String(input.value ?? "");
    if (!raw.includes("<")) return raw.trim();
    const container = input.ownerDocument.createElement("div");
    container.innerHTML = raw;
    return (container.textContent ?? "").trim();
}

function setInputText(input: InputEl, value: string) {
    const editable = input.querySelector?.('[contenteditable="true"]') as HTMLElement | null;
    if (editable) {
        editable.focus();
        const selection = input.ownerDocument.defaultView?.getSelection();
        const range = input.ownerDocument.createRange();
        range.selectNodeContents(editable);
        selection?.removeAllRanges();
        selection?.addRange(range);
        if (input.ownerDocument.execCommand("insertText", false, value)) return;
    }

    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
}

async function processChatCommand(command: string): Promise<boolean> {
    const chat = (ui as any)?.chat;
    if (!chat?.processMessage) return false;
    try {
        await chat.processMessage(command);
        return true;
    } catch (err) {
        console.error("EZD6 chat roll failed", err);
        return false;
    }
}

function parseRgb(value: string): { r: number; g: number; b: number } | null {
    const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!match) return null;
    return {
        r: Number.parseInt(match[1], 10),
        g: Number.parseInt(match[2], 10),
        b: Number.parseInt(match[3], 10),
    };
}

function luminance(rgb: { r: number; g: number; b: number }): number {
    return (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
}

function getThemeFromDom(doc: Document): ThemeMode {
    const root = doc.documentElement;
    const body = doc.body;
    const classBlob = `${root?.className ?? ""} ${body?.className ?? ""}`.toLowerCase();
    if (classBlob.includes("theme-light") || classBlob.includes("light-theme")) return "light";
    if (classBlob.includes("theme-dark") || classBlob.includes("dark-theme")) return "dark";
    const dataTheme = `${root?.getAttribute("data-theme") ?? body?.getAttribute("data-theme") ?? ""}`.toLowerCase();
    if (dataTheme.includes("light")) return "light";
    if (dataTheme.includes("dark")) return "dark";
    return "dark";
}

function getThemeFromInput(input: InputEl, fallback: ThemeMode): ThemeMode {
    const styles = input.ownerDocument.defaultView?.getComputedStyle(input);
    if (!styles) return fallback;
    const bg = parseRgb(styles.backgroundColor || "");
    const fg = parseRgb(styles.color || "");
    if (bg) return luminance(bg) < 0.5 ? "dark" : "light";
    if (fg) return luminance(fg) > 0.6 ? "dark" : "light";
    return fallback;
}

function applySelectThemeVars(input: InputEl, ...hosts: HTMLElement[]) {
    const mode = getThemeFromInput(input, getThemeFromDom(input.ownerDocument));
    const palette = mode === "light"
        ? { bg: "#f8f6f3", fg: "#1f1f1f", border: "#b8b2aa" }
        : { bg: "#101010", fg: "#f4f4f4", border: "#3a3a3a" };
    hosts.forEach((host) => {
        host.style.setProperty("--ezd6-select-bg", palette.bg);
        host.style.setProperty("--ezd6-select-fg", palette.fg);
        host.style.setProperty("--ezd6-select-border", palette.border);
    });
}

function createIconButton(doc: Document, title: string, iconClass: string, className = ""): HTMLButtonElement {
    const button = doc.createElement("button");
    button.type = "button";
    button.className = `ui-control icon ezd6-chat-roller-btn ${className}`.trim();
    button.title = title;
    button.innerHTML = `<i class="${iconClass}" aria-hidden="true"></i>`;
    return button;
}

function createModeButton(doc: Document, title: string, className: string): { button: HTMLButtonElement; stack: HTMLElement } {
    const button = doc.createElement("button");
    button.type = "button";
    button.className = `ui-control ezd6-chat-roller-btn ${className}`;
    button.title = title;
    button.setAttribute("aria-label", title);

    const stack = doc.createElement("span");
    stack.className = "ezd6-chat-roller-mode-stack";
    button.appendChild(stack);
    return { button, stack };
}

function buildChatControls(doc: Document, input: InputEl): { top: HTMLElement; bottom: HTMLElement } {
    const topWrap = doc.createElement("div");
    topWrap.className = "ezd6-chat-roller ezd6-chat-roller-top";

    const rowTop = doc.createElement("div");
    rowTop.className = "ezd6-chat-roller-row";
    const adjustWrap = doc.createElement("div");
    adjustWrap.className = "ezd6-chat-roller-dice-adjust";

    const minusButton = createIconButton(doc, "Decrease d6 count", "fa-solid fa-minus");
    const plusButton = createIconButton(doc, "Increase d6 count", "fa-solid fa-plus");
    adjustWrap.append(minusButton, plusButton);

    const tagSelect = doc.createElement("select");
    tagSelect.className = "ezd6-chat-roller-select";
    TAG_OPTIONS.forEach((tag) => {
        const option = doc.createElement("option");
        option.value = tag;
        option.textContent = tag;
        tagSelect.appendChild(option);
    });
    tagSelect.value = DEFAULT_TAG;
    rowTop.append(adjustWrap, tagSelect);
    topWrap.append(rowTop);

    const bottomWrap = doc.createElement("div");
    bottomWrap.className = "ezd6-chat-roller ezd6-chat-roller-bottom";
    const rowBottom = doc.createElement("div");
    rowBottom.className = "ezd6-chat-roller-roll-row";

    const rollButton = createIconButton(doc, "Send Roll", "fa-solid fa-paper-plane", "ezd6-chat-roller-roll");
    rollButton.setAttribute("aria-label", "Send Roll");
    const bane = createModeButton(doc, "Bane", "ezd6-chat-roller-bane");
    const boon = createModeButton(doc, "Boon", "ezd6-chat-roller-boon");
    rowBottom.append(rollButton, bane.button, boon.button);
    bottomWrap.append(rowBottom);

    const renderModeDice = (container: HTMLElement, color: "red" | "green", count: number) => {
        container.replaceChildren();
        for (let i = 0; i < count; i += 1) {
            const icon = doc.createElement("img");
            icon.className = "ezd6-chat-roller-mode-icon";
            icon.src = getDieImagePath(6, color);
            icon.alt = color === "red" ? "Bane" : "Boon";
            icon.draggable = false;
            container.appendChild(icon);
        }
    };

    const updateUiState = () => {
        applySelectThemeVars(input, topWrap, bottomWrap);
        const parsed = parseRollMessage(getInputText(input));
        minusButton.disabled = !parsed;
        if (parsed?.tag) tagSelect.value = normalizeTag(parsed.tag);

        const showDual = !!parsed && parsed.dice > 1;
        rollButton.style.display = showDual ? "none" : "";
        bane.button.style.display = showDual ? "" : "none";
        boon.button.style.display = showDual ? "" : "none";

        const iconCount = Math.max(1, Math.min(6, parsed?.dice ?? 1));
        renderModeDice(bane.stack, "red", iconCount);
        renderModeDice(boon.stack, "green", iconCount);
    };

    const submitCurrentInput = async (mode?: RollMode) => {
        const raw = getInputText(input);
        if (!raw) return;
        const parsed = parseRollMessage(raw);
        const command = parsed
            ? buildRollMessage(parsed.dice, parsed.tag ?? tagSelect.value, mode ?? parsed.mode ?? null)
            : raw;

        const sent = await processChatCommand(command);
        if (!sent) return;
        setInputText(input, "");
        tagSelect.value = DEFAULT_TAG;
        updateUiState();
    };

    plusButton.addEventListener("click", () => {
        const parsed = parseRollMessage(getInputText(input));
        const next = parsed?.dice ? parsed.dice + 1 : 1;
        setInputText(input, buildRollMessage(next, parsed?.tag ?? tagSelect.value));
        updateUiState();
    });

    minusButton.addEventListener("click", () => {
        const parsed = parseRollMessage(getInputText(input));
        if (!parsed) return;
        setInputText(input, parsed.dice <= 1
            ? ""
            : buildRollMessage(parsed.dice - 1, parsed.tag ?? tagSelect.value));
        updateUiState();
    });

    tagSelect.addEventListener("change", () => {
        const parsed = parseRollMessage(getInputText(input));
        if (parsed) setInputText(input, buildRollMessage(parsed.dice, tagSelect.value, parsed.mode));
        updateUiState();
    });

    rollButton.addEventListener("click", () => void submitCurrentInput());
    bane.button.addEventListener("click", () => void submitCurrentInput("kl"));
    boon.button.addEventListener("click", () => void submitCurrentInput("kh"));
    input.addEventListener("input", () => {
        updateUiState();
    });

    updateUiState();
    return { top: topWrap, bottom: bottomWrap };
}

function ensureControlsForInput(input: InputEl, suppliedChatControls?: HTMLElement | null) {
    const container = input.parentElement;
    if (!container) return;
    const chatControls = suppliedChatControls
        ?? container.querySelector("#chat-controls") as HTMLElement | null
        ?? input.ownerDocument.querySelector("#chat-controls") as HTMLElement | null;
    if (!chatControls) return;

    const existingTop = input.ownerDocument.querySelector(".ezd6-chat-roller-top") as HTMLElement | null;
    const existingBottom = input.ownerDocument.querySelector(".ezd6-chat-roller-bottom") as HTMLElement | null;

    const placeControls = (top: HTMLElement, bottom: HTMLElement) => {
        if (input.closest(".chat-form")) {
            const editable = input.querySelector?.('[contenteditable="true"]') as HTMLElement | null;
            if (editable) {
                if (top.nextElementSibling !== editable) editable.insertAdjacentElement("beforebegin", top);
            } else if (top.nextElementSibling !== input) {
                input.insertAdjacentElement("beforebegin", top);
            }
            if (bottom.previousElementSibling !== input) input.insertAdjacentElement("afterend", bottom);
        } else {
            if (top.nextElementSibling !== input) input.insertAdjacentElement("beforebegin", top);
            if (bottom.previousElementSibling !== input) input.insertAdjacentElement("afterend", bottom);
        }
    };

    if (existingTop && existingBottom) {
        placeControls(existingTop, existingBottom);
        applySelectThemeVars(input, existingTop, existingBottom);
        return;
    }

    existingTop?.remove();
    existingBottom?.remove();

    const controls = buildChatControls(input.ownerDocument, input);
    placeControls(controls.top, controls.bottom);
}

function injectChatRollers(scope: ParentNode) {
    getMessageInputs(scope).forEach((input) => ensureControlsForInput(input));
}

let observer: MutationObserver | null = null;
let scheduled = false;

function scheduleInject() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
        scheduled = false;
        injectChatRollers(document);
    });
}

export function registerChatRollerHooks() {
    Hooks.on("renderChatInput", (_app: any, elements: Record<string, HTMLElement>) => {
        const input = elements["#chat-message"] as InputEl | undefined;
        if (input) ensureControlsForInput(input, elements["#chat-controls"]);
        scheduleInject();
    });

    Hooks.on("ready", () => {
        injectChatRollers(document);
        if (!observer && typeof MutationObserver !== "undefined") {
            observer = new MutationObserver(() => scheduleInject());
            observer.observe(document.body, {
                childList: true,
                subtree: true,
            });
        }
    });
}
