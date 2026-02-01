import { buildRollMeta, EZD6_META_FLAG } from "./chat-meta";
import { getDieImagePath } from "../ezd6-core";
import { localize } from "../ui/i18n";

const t = (key: string, fallback: string) => localize(key, fallback);

type DieKind = "grey" | "green" | "red";

const TASK_ROLLS = [
    {
        id: "double-bane",
        labelKey: "EZD6.Tasks.DoubleBane",
        labelFallback: "Double bane",
        formula: "3d6kl",
        dice: ["red", "red", "grey"] as const,
    },
    {
        id: "single-bane",
        labelKey: "EZD6.Tasks.SingleBane",
        labelFallback: "Single bane",
        formula: "2d6kl",
        dice: ["red", "grey"] as const,
    },
    {
        id: "normal",
        labelKey: "EZD6.Tasks.NormalRoll",
        labelFallback: "Normal roll",
        formula: "1d6",
        dice: ["grey"] as const,
    },
    {
        id: "single-boon",
        labelKey: "EZD6.Tasks.SingleBoon",
        labelFallback: "Single boon",
        formula: "2d6kh",
        dice: ["grey", "green"] as const,
    },
    {
        id: "double-boon",
        labelKey: "EZD6.Tasks.DoubleBoon",
        labelFallback: "Double boon",
        formula: "3d6kh",
        dice: ["grey", "green", "green"] as const,
    },
    {
        id: "triple-bane",
        labelKey: "EZD6.Tasks.TripleBane",
        labelFallback: "Triple bane",
        formula: "4d6kl",
        dice: ["red", "red", "red", "grey"] as const,
    },
    {
        id: "triple-boon",
        labelKey: "EZD6.Tasks.TripleBoon",
        labelFallback: "Triple boon",
        formula: "4d6kh",
        dice: ["grey", "green", "green", "green"] as const,
    },
] as const;

const TASK_GRID: Array<{
    id: (typeof TASK_ROLLS)[number]["id"];
    position: "left-top" | "left-bottom" | "center" | "right-top" | "right-bottom";
}> = [
    { id: "single-bane", position: "left-top" },
    { id: "normal", position: "center" },
    { id: "single-boon", position: "right-top" },
    { id: "double-bane", position: "left-bottom" },
    { id: "double-boon", position: "right-bottom" },
];

const taskMap = TASK_ROLLS.reduce((acc, task) => {
    acc[task.id] = task;
    return acc;
}, {} as Record<(typeof TASK_ROLLS)[number]["id"], (typeof TASK_ROLLS)[number]>);

const createDiceStack = (doc: Document, kinds: DieKind[], className = "ezd6-dice-stack") => {
    const diceRow = doc.createElement("span");
    diceRow.className = className;
    kinds.forEach((kind) => {
        const dieImg = doc.createElement("img");
        dieImg.className = "ezd6-die-icon";
        dieImg.alt = `${kind} d6`;
        dieImg.src = getDieImagePath(6, kind);
        dieImg.draggable = false;
        diceRow.appendChild(dieImg);
    });
    return diceRow;
};

const createRollButton = (
    doc: Document,
    options: {
        className: string;
        title: string;
        kinds: DieKind[];
        onClick: (event: MouseEvent) => void | Promise<void>;
    }
) => {
    const btn = doc.createElement("button");
    btn.type = "button";
    btn.className = options.className;
    btn.title = options.title;
    btn.dataset.ezd6IntentDisabled = "0";
    btn.append(createDiceStack(doc, options.kinds));
    btn.addEventListener("click", (event) => options.onClick(event));
    return btn;
};

function buildChatRoller(doc: Document): HTMLElement {
    const wrap = doc.createElement("div");
    wrap.className = "ezd6-chat-roller";
    TASK_GRID.forEach(({ id, position }) => {
        const task = taskMap[id];
        const label = t(task.labelKey, task.labelFallback);
        const btn = createRollButton(doc, {
            className: `ezd6-task-btn ezd6-chat-task-btn ezd6-chat-task-btn--${position}`,
            title: `${label} (${task.formula})`,
            kinds: [...task.dice],
            onClick: async (event) => {
                event.preventDefault();
                try {
                    const roll = new Roll(task.formula, {});
                    await roll.evaluate();
                    await roll.toMessage({
                        flavor: `${label} #task`,
                        speaker: ChatMessage.getSpeaker?.(),
                        flags: {
                            [EZD6_META_FLAG]: buildRollMeta({
                                title: label,
                                description: "",
                                tag: "#task",
                            }),
                        },
                    });
                } catch (err) {
                    console.error("EZD6 chat roll failed", err);
                }
            },
        });
        wrap.appendChild(btn);
    });
    return wrap;
}

function injectChatRoller(root: HTMLElement | null) {
    if (!root) return;
    const chatForm = root.querySelector("#chat-form") as HTMLFormElement | null;
    if (!chatForm) return;
    if (chatForm.querySelector(".ezd6-chat-roller")) return;
    chatForm.appendChild(buildChatRoller(root.ownerDocument ?? document));
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
