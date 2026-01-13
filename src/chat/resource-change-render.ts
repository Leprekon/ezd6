import { DEFAULT_RESOURCE_ICON } from "../character";
import { format, localize } from "../ui/i18n";
import { ResourceChangeFlag, ResourceChangeRow } from "./resource-change-types";

const escapeHtml = (foundry as any)?.utils?.escapeHTML ?? ((value: string) => value);
const t = (key: string, fallback: string) => localize(key, fallback);
const tf = (key: string, data: Record<string, any>, fallback: string) => format(key, data, fallback);

function renderResourceChangeRow(row: ResourceChangeRow): string {
    const delta = row.newValue - row.oldValue;
    const resultText = row.maxValue > 0 ? `${row.newValue} / ${row.maxValue}` : `${row.newValue}`;
    return `
        <div class="ezd6-resource-change-row" data-resource-key="${escapeHtml(row.resourceKey)}" title="${escapeHtml(row.resourceName)}">
            <div class="ezd6-resource-change__counter"
                data-delta="${delta}"
                data-icon="${escapeHtml(row.resourceIcon)}"
                data-title="${escapeHtml(row.resourceName)}"></div>
            <div class="ezd6-resource-change__result">
                <span class="ezd6-resource-change__result-arrow">➔</span>
                <span class="ezd6-resource-change__delta">
                    ${escapeHtml(resultText)}
                    <img class="ezd6-resource-change__result-icon" src="${escapeHtml(row.resourceIcon)}" alt="${escapeHtml(row.resourceName)}">
                </span>
            </div>
        </div>
    `;
}

export function renderResourceChangeHtml(flag: ResourceChangeFlag): string {
    const rows = flag.order
        .map((key) => flag.rows[key])
        .filter(Boolean)
        .map((row) => renderResourceChangeRow(row))
        .join("");
    return `<div class="ezd6-resource-change-list">${rows}</div>`;
}

function getCounterIconLimit(counter: HTMLElement): number {
    const width = counter.clientWidth;
    if (width <= 0) return 6;
    const style = getComputedStyle(counter);
    const gap = Number.parseFloat(style.gap || style.columnGap || "4") || 4;
    const iconSize = 26;
    const unit = iconSize + gap;
    const count = Math.floor((width + gap) / unit);
    return Math.max(1, count);
}

function renderDeltaCounter(counter: HTMLElement) {
    const delta = Number(counter.dataset.delta ?? 0);
    const iconPath = counter.dataset.icon ?? DEFAULT_RESOURCE_ICON;
    const title = counter.dataset.title ?? t("EZD6.ItemLabels.Resource", "Resource");
    const maxIcons = getCounterIconLimit(counter);
    const N = Math.max(1, Math.floor(maxIcons));
    const safeDelta = Number.isFinite(delta) ? Math.trunc(delta) : 0;
    const count = Math.abs(safeDelta);
    const isNegative = safeDelta < 0;

    counter.innerHTML = "";

    const createIcon = (className: string) => {
        const img = document.createElement("img");
        img.className = className;
        img.src = iconPath;
        img.alt = tf("EZD6.Alts.ItemIcon", { label: title }, `${title} icon`);
        img.draggable = false;
        return img;
    };

    const createCount = (text: string) => {
        const span = document.createElement("span");
        span.className = "ezd6-resource-counter-number";
        span.textContent = text;
        return span;
    };

    if (safeDelta === 0) {
        counter.append(createCount("0"));
        return;
    }

    const iconClass = "ezd6-resource-icon";
    const appendIcon = () => {
        const icon = createIcon(iconClass);
        if (!isNegative) {
            counter.appendChild(icon);
            return;
        }
        const wrap = document.createElement("span");
        wrap.className = "ezd6-icon-slash";
        wrap.appendChild(icon);
        counter.appendChild(wrap);
    };

    if (count > N) {
        counter.append(createCount(String(count)));
        appendIcon();
        return;
    }

    for (let i = 0; i < count; i += 1) {
        appendIcon();
    }
}

export function applyResourceChangeCounters(root: HTMLElement | null) {
    if (!root) return;
    const counters = root.querySelectorAll(".ezd6-resource-change__counter");
    counters.forEach((counter) => {
        renderDeltaCounter(counter as HTMLElement);
    });
}
