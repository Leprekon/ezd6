import { buildRollMeta, EZD6_META_FLAG } from "./chat-meta";
import { createDiceStack } from "../ui/sheet-utils";
import { localize } from "../ui/i18n";

const MIN_CHAT_DICE = -6;
const MAX_CHAT_DICE = 6;
const t = (key: string, fallback: string) => localize(key, fallback);

type DieKind = "grey" | "green" | "red";

const clampDice = (value: number) => Math.max(MIN_CHAT_DICE, Math.min(MAX_CHAT_DICE, value));

const stepDice = (current: number, delta: number) => {
    if (delta < 0) {
        if (current <= MIN_CHAT_DICE) return MIN_CHAT_DICE;
        if (current === 1) return -2;
        return clampDice(current - 1);
    }
    if (current >= MAX_CHAT_DICE) return MAX_CHAT_DICE;
    if (current === -2) return 1;
    return clampDice(current + 1);
};

const buildKinds = (count: number): DieKind[] => {
    if (count === 0) return [];
    const abs = Math.abs(count);
    const rest = Math.max(0, abs - 1);
    if (count > 0) return ["grey", ...Array.from({ length: rest }, () => "green")];
    return [...Array.from({ length: rest }, () => "red"), "grey"];
};

const buildRollTitle = (count: number) => {
    const abs = Math.abs(count);
    const mode = count < 0 ? "kl" : "kh";
    const tag = "#default";
    const label = t("EZD6.Labels.Roll", "Roll");
    return `${label} ${abs}d6${mode} ${tag}`.trim();
};

const buildRollFormula = (count: number) => {
    const abs = Math.abs(count);
    const mode = count < 0 ? "kl" : "kh";
    return `${abs}d6${mode}`;
};

function buildChatRoller(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "ezd6-chat-roller";

    const decBtn = document.createElement("button");
    decBtn.type = "button";
    decBtn.className = "ezd6-ability-dice-btn ezd6-chat-dice-adjust";
    decBtn.dataset.delta = "-1";
    decBtn.textContent = "-";

    const incBtn = document.createElement("button");
    incBtn.type = "button";
    incBtn.className = "ezd6-ability-dice-btn ezd6-chat-dice-adjust";
    incBtn.dataset.delta = "1";
    incBtn.textContent = "+";

    const display = document.createElement("span");
    display.className = "ezd6-chat-dice-display";

    let current = 1;

    const render = () => {
        display.innerHTML = "";
        decBtn.disabled = current <= MIN_CHAT_DICE;
        incBtn.disabled = current >= MAX_CHAT_DICE;

        if (current === 0) {
            const dash = document.createElement("span");
            dash.className = "ezd6-chat-dice-empty";
            dash.textContent = "-";
            display.appendChild(dash);
            return;
        }

        const diceBtn = document.createElement("button");
        diceBtn.type = "button";
        diceBtn.className = "ezd6-task-btn ezd6-chat-dice-btn";
        diceBtn.title = buildRollTitle(current);

        const stack = createDiceStack(buildKinds(current), "ezd6-dice-stack ezd6-chat-dice-stack");
        diceBtn.appendChild(stack);

        diceBtn.addEventListener("click", async (event) => {
            event.preventDefault();
            if (!current) return;
            try {
                const formula = buildRollFormula(current);
                const label = t("EZD6.Labels.Roll", "Roll");
                const tag = "#default";
                const roll = new Roll(formula, {});
                await roll.evaluate();
                await roll.toMessage({
                    flavor: `${label} ${formula} ${tag}`.trim(),
                    speaker: ChatMessage.getSpeaker?.(),
                    flags: {
                        [EZD6_META_FLAG]: buildRollMeta({
                            title: label,
                            description: "",
                            tag,
                        }),
                    },
                });
                current = 1;
                render();
            } catch (err) {
                console.error("EZD6 chat roll failed", err);
            }
        });

        display.appendChild(diceBtn);
    };

    wrap.addEventListener("click", (event) => {
        const target = event.target as HTMLElement | null;
        const btn = target?.closest?.(".ezd6-chat-dice-adjust") as HTMLButtonElement | null;
        if (!btn) return;
        event.preventDefault();
        const delta = Number(btn.dataset.delta ?? "0");
        if (!Number.isFinite(delta) || !delta) return;
        current = stepDice(current, delta);
        render();
    });

    render();
    wrap.append(decBtn, display, incBtn);
    return wrap;
}

function injectChatRoller(root: HTMLElement | null) {
    if (!root) return;
    const chatForm = root.querySelector("#chat-form") as HTMLFormElement | null;
    if (!chatForm) return;
    if (chatForm.querySelector(".ezd6-chat-roller")) return;
    chatForm.appendChild(buildChatRoller());
}

export function registerChatRollerHooks() {
    Hooks.on("renderChatLog", (_app: any, html: JQuery<HTMLElement> | HTMLElement) => {
        const root = (html as any)[0] ?? html;
        injectChatRoller(root as HTMLElement);
    });

    Hooks.on("renderChatPopout", (_app: any, html: JQuery<HTMLElement> | HTMLElement) => {
        const root = (html as any)[0] ?? html;
        injectChatRoller(root as HTMLElement);
    });
}
