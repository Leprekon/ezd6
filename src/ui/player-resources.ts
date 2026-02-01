import { DEFAULT_RESOURCE_ICON } from "../character";
import { resolveLocalizedField, localize } from "./i18n";
import { resolveEntryName } from "./localization-utils";
import { getTagOptions, normalizeTag } from "./sheet-utils";
import { renderResourceCounter } from "./resource-counter";

type ResourceDisplay = {
    title: string;
    iconPath: string;
    currentValue: number;
    maxValue: number;
};

const MAX_PLAYER_ICONS = 5;

const resolveLocalizedText = (localizationId: string | null | undefined, suffix: string, fallback: string) =>
    resolveLocalizedField(localizationId, suffix, fallback).value;

const getResourceTitle = (resource: any): string => {
    const resourceLabel = localize("EZD6.ItemLabels.Resource", "Resource");
    const fallbackTitle = typeof resource?.title === "string" ? resource.title.trim() || resourceLabel : resourceLabel;
    return resolveEntryName(resource?.localizationId, fallbackTitle, resolveLocalizedText);
};

const getResourceIcon = (resource: any): string => {
    const icon = typeof resource?.icon === "string" ? resource.icon : "";
    const iconAvailable = typeof resource?.iconAvailable === "string" ? resource.iconAvailable : "";
    const iconSpent = typeof resource?.iconSpent === "string" ? resource.iconSpent : "";
    return icon || iconAvailable || iconSpent || DEFAULT_RESOURCE_ICON;
};

const getResourceValue = (resource: any): number => {
    const rawCurrent = Number(resource?.value);
    const rawFallback = Number(resource?.defaultValue ?? resource?.defaultMaxValue ?? resource?.maxValue ?? 0);
    const current = Number.isFinite(rawCurrent)
        ? rawCurrent
        : Number.isFinite(rawFallback)
            ? rawFallback
            : 0;
    return Math.max(0, Math.floor(current));
};

const getResourceMaxValue = (resource: any): number => {
    const raw = Number(resource?.maxValue ?? resource?.defaultMaxValue ?? 0);
    return Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
};

const getResourceKey = (resource: any, title: string): string => {
    const localizationId = typeof resource?.localizationId === "string" ? resource.localizationId.trim() : "";
    if (localizationId) return `loc:${localizationId}`;
    const rawTag = resource?.rollKeyword ?? resource?.tag;
    const tag = typeof rawTag === "string" ? rawTag.trim() : "";
    if (tag) return `tag:${normalizeTag(tag, getTagOptions())}`;
    return `title:${title.toLowerCase()}`;
};

const getPlayerListRoot = (root: HTMLElement): HTMLElement | null => {
    if (!root) return null;
    if (root.matches?.("ol#players, ol.players, .players-list, #players")) return root;
    return root.querySelector("ol#players, ol.players, .players-list, #players") as HTMLElement | null;
};

const updatePlayersPanelWidth = (list: HTMLElement) => {
    const panel = list.closest("#players") as HTMLElement | null;
    if (!panel) return;
    const width = panel.offsetWidth || list.scrollWidth;
    document.documentElement.style.setProperty("--ezd6-players-width", `${width}px`);
};

const getUserIdFromPlayer = (node: HTMLElement): string => {
    return node.dataset.userId
        ?? node.dataset.user
        ?? node.getAttribute("data-user-id")
        ?? node.getAttribute("data-user")
        ?? "";
};

const getPlayerListHeader = (list: HTMLElement): HTMLElement | null => {
    const panel = list.closest("#players") as HTMLElement | null;
    if (!panel) return null;
    return (panel.querySelector(".directory-header")
        ?? panel.querySelector(".header")
        ?? panel.querySelector("header")
        ?? panel) as HTMLElement | null;
};

let playerStreamMode = false;

const getPlayersPanelRoot = (root: HTMLElement): HTMLElement | null => {
    if (!root) return null;
    if (root.matches?.("#players")) return root;
    return root.querySelector("#players") as HTMLElement | null;
};

const setPlayersStreamMode = (panel: HTMLElement | null, enabled: boolean) => {
    playerStreamMode = enabled;
    if (panel) panel.classList.toggle("ezd6-players-stream-mode", enabled);
};

const ensurePlayerStreamToggle = (list: HTMLElement) => {
    const header = getPlayerListHeader(list);
    if (!header) return;
    const titleRow = header.querySelector("h3") as HTMLElement | null;
    if (!titleRow) return;
    const existingBtn = titleRow.querySelector(".ezd6-player-resources-btn") as HTMLButtonElement | null;
    if (existingBtn) existingBtn.remove();
    let toggle = titleRow.querySelector(".ezd6-player-stream-toggle") as HTMLLabelElement | null;
    if (!toggle) {
        toggle = document.createElement("label");
        toggle.className = "ezd6-player-stream-toggle";
        toggle.addEventListener("mousedown", (event) => event.stopPropagation());
        toggle.addEventListener("click", (event) => event.stopPropagation());
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "ezd6-player-stream-checkbox";
        checkbox.addEventListener("mousedown", (event) => event.stopPropagation());
        checkbox.addEventListener("click", (event) => event.stopPropagation());
        const text = document.createElement("span");
        text.textContent = localize("EZD6.Actions.StreamMode", "Stream mode");
        checkbox.checked = playerStreamMode;
        checkbox.addEventListener("change", () => {
            const panel = list.closest("#players") as HTMLElement | null;
            setPlayersStreamMode(panel, checkbox.checked);
        });
        toggle.append(checkbox, text);
        titleRow.appendChild(toggle);
    } else {
        const checkbox = toggle.querySelector("input") as HTMLInputElement | null;
        if (checkbox) checkbox.checked = playerStreamMode;
    }
};

const getActorForUser = (user: any): any | null => {
    if (!user) return null;
    const direct = user.character;
    if (direct) return direct;
    const id = user.characterId ?? user.character?.id;
    if (!id) return null;
    return game?.actors?.get?.(id) ?? null;
};

const isActorLinkedToUser = (actor: any): boolean => {
    if (!actor?.id) return false;
    const users = Array.from(game?.users ?? []);
    return users.some((user: any) => {
        const linked = user?.character ?? (user?.characterId ? game?.actors?.get?.(user.characterId) : null);
        return linked?.id === actor.id;
    });
};

const buildResourceDisplay = (resource: any): ResourceDisplay => ({
    title: getResourceTitle(resource),
    iconPath: getResourceIcon(resource),
    currentValue: getResourceValue(resource),
    maxValue: getResourceMaxValue(resource),
});

const buildPlayerResourceMap = (
    actor: any,
    columnKeys: string[],
    columnSet: Set<string>
): Map<string, ResourceDisplay> => {
    const resources = Array.isArray(actor?.system?.resources) ? actor.system.resources : [];
    const visibleResources = resources.filter((resource: any) => resource?.publicDisplay === true);
    const resourceMap = new Map<string, ResourceDisplay>();
    visibleResources.forEach((resource: any) => {
        const title = getResourceTitle(resource);
        const key = getResourceKey(resource, title);
        if (!resourceMap.has(key)) {
            resourceMap.set(key, buildResourceDisplay(resource));
        }
        if (!columnSet.has(key)) {
            columnSet.add(key);
            columnKeys.push(key);
        }
    });
    return resourceMap;
};

const renderPlayerResourcesRow = (
    container: HTMLElement,
    columnKeys: string[],
    resources: Map<string, ResourceDisplay>
) => {
    const row = document.createElement("div");
    row.className = "ezd6-player-resources";
    columnKeys.forEach((key) => {
        const cell = document.createElement("div");
        cell.className = "ezd6-player-resources__cell";
        const data = resources.get(key);
        if (data) {
            const counter = document.createElement("div");
            counter.className = "ezd6-resource-counter ezd6-player-resource-counter";
            renderResourceCounter(counter, {
                title: data.title,
                iconPath: data.iconPath,
                currentValue: data.currentValue,
                maxValue: data.maxValue,
                maxIcons: MAX_PLAYER_ICONS,
            });
            cell.appendChild(counter);
        } else {
            cell.classList.add("is-empty");
        }
        row.appendChild(cell);
    });
    container.appendChild(row);
};

const renderPlayerResources = (html: HTMLElement | JQuery<HTMLElement>) => {
    const root = (html as any)?.[0] ?? html;
    if (!root) return;
    const panel = getPlayersPanelRoot(root as HTMLElement);
    setPlayersStreamMode(panel, playerStreamMode);
    const list = getPlayerListRoot(root);
    if (!list) return;

    list.querySelectorAll(".ezd6-player-resources").forEach((node) => node.remove());
    list.style.removeProperty("--ezd6-player-res-columns");
    list.classList.add("ezd6-player-resources-list");

    const players = Array.from(list.querySelectorAll("li.player, li[data-user-id], li[data-user]")) as HTMLElement[];
    const columnKeys: string[] = [];
    const columnSet = new Set<string>();
    const playerEntries: Array<{ node: HTMLElement; resources: Map<string, ResourceDisplay> }> = [];
    ensurePlayerStreamToggle(list);

    players.forEach((player) => {
        const userId = getUserIdFromPlayer(player);
        const user = userId ? game?.users?.get?.(userId) : null;
        const actor = getActorForUser(user);
        if (!actor) return;
        const resourceMap = buildPlayerResourceMap(actor, columnKeys, columnSet);
        playerEntries.push({ node: player, resources: resourceMap });
    });

    if (!columnKeys.length) {
        updatePlayersPanelWidth(list);
        return;
    }
    list.style.setProperty("--ezd6-player-res-columns", String(columnKeys.length));

    playerEntries.forEach(({ node, resources }) => {
        renderPlayerResourcesRow(node, columnKeys, resources);
    });

    updatePlayersPanelWidth(list);
};

export const registerPlayerResourceDisplay = () => {
    const debounce = (foundry as any)?.utils?.debounce;
    const scheduleRender = typeof debounce === "function"
        ? debounce(() => ui?.players?.render?.(false), 100)
        : () => ui?.players?.render?.(false);

    Hooks.on("renderPlayerList", (_app: any, html: JQuery<HTMLElement> | HTMLElement) => {
        renderPlayerResources(html);
    });

    Hooks.on("updateActor", (actor: any, diff: any) => {
        if (!diff?.system?.resources) return;
        if (!isActorLinkedToUser(actor)) return;
        scheduleRender();
    });

    Hooks.on("updateUser", (_user: any, diff: any) => {
        if (diff?.character != null || diff?.characterId != null) {
            scheduleRender();
        }
    });
};

