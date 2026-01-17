import { getDieImagePath } from "../ezd6-core";
import { getSystemId } from "../system-path";
import { localize } from "./i18n";

type DieKind = "grey" | "green" | "red";

const DEFAULT_TAG_OPTIONS = [
    "#task",
    "#default",
    "#attack",
    "#brutal",
    "#magick",
    "#miracle",
    "#scroll",
    "#karma",
    "#stress",
    "#health",
    "#heroDie",
    "#fliptOfFate",
    "#anythingBut1",
    "#magicksave",
    "#target3",
    "#target4",
    "#target5",
    "#target6",
];

export const clampDimension = (value: number, min?: number, max?: number) => {
    let next = value;
    if (Number.isFinite(min)) next = Math.max(min as number, next);
    if (Number.isFinite(max)) next = Math.min(max as number, next);
    return next;
};

export const createElement = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    textContent?: string
): HTMLElementTagNameMap[K] => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (textContent) el.textContent = textContent;
    return el;
};

export const getTagOptions = (): string[] => {
    let custom: string[] = [];
    try {
        const stored = game?.settings?.get?.(getSystemId(), "customTags");
        if (Array.isArray(stored)) custom = stored.filter((tag) => typeof tag === "string");
    } catch {
        custom = [];
    }
    return [...new Set([...DEFAULT_TAG_OPTIONS, ...custom])];
};

export const getTagOptionMap = (): Record<string, string> => {
    const options = getTagOptions();
    const map: Record<string, string> = {};
    options.forEach((tag) => {
        const normalized = normalizeTag(tag, options);
        map[normalized] = normalized;
    });
    return map;
};

export const normalizeTag = (tag: string, options: string[] = getTagOptions()): string => {
    const trimmed = (tag ?? "").trim();
    if (!trimmed) return "#task";

    const asNumber = Number(trimmed);
    if (!Number.isNaN(asNumber) && Number.isInteger(asNumber)) {
        const option = options[asNumber];
        if (option) return option.startsWith("#") ? option : `#${option}`;
    }

    return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
};

export const createDiceStack = (kinds: DieKind[], className = "ezd6-dice-stack") => {
    const diceRow = createElement("span", className);
    kinds.forEach((kind) => {
        const dieImg = createElement("img", "ezd6-die-icon") as HTMLImageElement;
        dieImg.alt = `${kind} d6`;
        dieImg.src = getDieImagePath(6, kind);
        dieImg.draggable = false;
        diceRow.appendChild(dieImg);
    });
    return diceRow;
};

export const createRollButton = (options: {
    className: string;
    title: string;
    kinds: DieKind[];
    onClick: (event: MouseEvent) => void | Promise<void>;
}) => {
    const btn = createElement("button", options.className) as HTMLButtonElement;
    btn.type = "button";
    btn.title = options.title;
    btn.dataset.ezd6IntentDisabled = "0";
    btn.append(createDiceStack(options.kinds));
    btn.addEventListener("click", (event) => options.onClick(event));
    return btn;
};

export const buildStandardRollKinds = (count: number): DieKind[] => {
    if (count <= 0) return [];
    return Array.from({ length: count }, (_, index) => (index === 0 ? "grey" : "green"));
};

export const wireExpandableRow = (options: {
    wrapper: HTMLElement;
    row: HTMLElement;
    detail: HTMLElement;
    listSelector: string;
    rowSelector: string;
    detailSelector: string;
    id: string | null;
    expandedId: string | null;
    setExpandedId: (id: string | null) => void;
    ignoreSelector?: string;
}) => {
    const {
        wrapper,
        row,
        detail,
        listSelector,
        rowSelector,
        detailSelector,
        id,
        expandedId,
        setExpandedId,
        ignoreSelector,
    } = options;

    if (expandedId && id && expandedId === id) {
        row.classList.add("is-open");
        detail.classList.add("is-open");
    }

    const toggleDetail = () => {
        const list = wrapper.closest(listSelector) as HTMLElement | null;
        if (list) {
            list.querySelectorAll(`${detailSelector}.is-open`).forEach((openDetail) => {
                if (openDetail !== detail) openDetail.classList.remove("is-open");
            });
            list.querySelectorAll(`${rowSelector}.is-open`).forEach((openRow) => {
                if (openRow !== row) openRow.classList.remove("is-open");
            });
        }
        const isOpen = detail.classList.contains("is-open");
        detail.classList.toggle("is-open", !isOpen);
        row.classList.toggle("is-open", !isOpen);
        setExpandedId(!isOpen ? id : null);
    };

    row.addEventListener("click", (event) => {
        const target = event.target as HTMLElement | null;
        if (ignoreSelector && target?.closest?.(ignoreSelector)) return;
        toggleDetail();
    });
    row.addEventListener("keydown", (event: KeyboardEvent) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        toggleDetail();
    });
};

export const buildDetailContent = (options: {
    prefix: string;
    title?: string;
    description?: string;
    metaItems?: HTMLElement[];
    messageButton?: HTMLButtonElement;
    actionButtons?: HTMLButtonElement[];
    actionsSingleClass?: string;
}) => {
    const {
        prefix,
        title,
        description,
        metaItems = [],
        messageButton,
        actionButtons = [],
        actionsSingleClass,
    } = options;

    const detailContent = createElement("div", `${prefix}-detail__content`);
    const detailMain = createElement("div", `${prefix}-detail__main`);

    const trimmedDescription = (description ?? "").trim();
    const hasDescription = Boolean(trimmedDescription);
    if (hasDescription) {
        const detailHeader = createElement("div", `${prefix}-detail__header`);
        detailHeader.appendChild(
            createElement("span", `${prefix}-detail__label`, localize("EZD6.Labels.Description", "Description"))
        );
        const detailText = createElement("div", `${prefix}-detail__text`);
        detailText.innerHTML = trimmedDescription;
        detailMain.append(detailHeader, detailText);
    }

    if (title) {
        detailMain.appendChild(createElement("div", `${prefix}-detail__title`, title));
    }

    if (metaItems.length) {
        const meta = createElement("div", `${prefix}-detail__meta`);
        metaItems.forEach((item) => meta.appendChild(item));
        detailMain.appendChild(meta);
    }

    const detailActions = createElement("div", `${prefix}-detail__actions`);
    actionButtons.forEach((btn) => detailActions.appendChild(btn));
    if (actionsSingleClass && actionButtons.length === 1) {
        detailActions.classList.add(actionsSingleClass);
    }

    const detailSide = createElement("div", `${prefix}-detail__side`);
    if (messageButton) {
        if (hasDescription) {
            detailSide.append(messageButton, detailActions);
        } else {
            detailActions.prepend(messageButton);
            detailSide.append(detailActions);
        }
    } else {
        detailSide.append(detailActions);
    }

    detailContent.append(detailMain, detailSide);
    return detailContent;
};
