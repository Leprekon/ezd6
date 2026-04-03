import { DEFAULT_RESOURCE_ICON } from "../character";
import { resolveLocalizedField, localize } from "./i18n";
import { resolveEntryName } from "./localization-utils";
import { getTagOptions, normalizeTag } from "./sheet-utils";
import { renderResourceCounter } from "./resource-counter";

type ResourceDisplay = {
    title: string;
    availableIconPath: string;
    spentIconPath: string;
    currentValue: number;
    maxValue: number;
};

const MAX_PLAYER_ICONS = 5;
const PLAYER_ACTIVE_ROOT_SELECTOR = "#players-active";
const PLAYER_INACTIVE_ROOT_SELECTOR = "#players-inactive";
const PLAYER_LIST_SELECTOR = ".players-list";
const PLAYER_ENTRY_SELECTOR = "li.player, li[data-user-id], li[data-user]";
const PLAYER_STATS_SELECTOR = "#players-active #performance-stats";
const HOTBAR_SELECTOR = "#hotbar";
const ACTION_BAR_SELECTOR = "#action-bar";
const BOTTOM_BAR_SELECTORS = "#ui-bottom .action-bar, #ui-bottom .hotbar";

const resolveLocalizedText = (localizationId: string | null | undefined, suffix: string, fallback: string) =>
    resolveLocalizedField(localizationId, suffix, fallback).value;

const getResourceTitle = (resource: any): string => {
    const resourceLabel = localize("EZD6.ItemLabels.Resource", "Resource");
    const fallbackTitle = typeof resource?.title === "string" ? resource.title.trim() || resourceLabel : resourceLabel;
    return resolveEntryName(resource?.localizationId, fallbackTitle, resolveLocalizedText);
};

const getResourceIcons = (resource: any): { available: string; spent: string } => {
    const icon = typeof resource?.icon === "string" ? resource.icon.trim() : "";
    const iconAvailable = typeof resource?.iconAvailable === "string" ? resource.iconAvailable.trim() : "";
    const iconSpent = typeof resource?.iconSpent === "string" ? resource.iconSpent.trim() : "";
    const available = icon || iconAvailable || iconSpent || DEFAULT_RESOURCE_ICON;
    const spent = iconSpent || icon || iconAvailable || DEFAULT_RESOURCE_ICON;
    return { available, spent };
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

const getPlayerLists = (): HTMLElement[] => {
    const scoped = Array.from(document.querySelectorAll(
        `${PLAYER_ACTIVE_ROOT_SELECTOR} ${PLAYER_LIST_SELECTOR}, ${PLAYER_INACTIVE_ROOT_SELECTOR} ${PLAYER_LIST_SELECTOR}`
    )) as HTMLElement[];
    if (scoped.length) return scoped;
    return Array.from(document.querySelectorAll(PLAYER_LIST_SELECTOR)) as HTMLElement[];
};

const parseTranslateX = (value: string): number => {
    const match = value.match(/translateX\((-?\d+(?:\.\d+)?)px\)/);
    if (!match) return 0;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : 0;
};

const applyBottomBarOffset = (rightMost: number) => {
    const offset = Math.max(30, rightMost + 12);
    const hotbar = document.querySelector(HOTBAR_SELECTOR) as HTMLElement | null;
    const actionBar = document.querySelector(ACTION_BAR_SELECTOR) as HTMLElement | null;
    const standaloneBars = Array.from(document.querySelectorAll(BOTTOM_BAR_SELECTORS)) as HTMLElement[];

    const bars = new Set<HTMLElement>();
    if (hotbar) bars.add(hotbar);
    if (actionBar && (!hotbar || !hotbar.contains(actionBar))) bars.add(actionBar);
    standaloneBars.forEach((bar) => {
        if (!hotbar || !hotbar.contains(bar)) bars.add(bar);
    });

    const rightSidebar = (document.querySelector("#sidebar") ?? document.querySelector("#ui-right")) as HTMLElement | null;
    const rightSidebarRect = rightSidebar?.getBoundingClientRect();
    const rightLimit = rightSidebarRect && rightSidebarRect.width > 0 ? Math.floor(rightSidebarRect.left) - 12 : null;

    bars.forEach((bar) => {
        const rect = bar.getBoundingClientRect();
        const currentTranslate = parseTranslateX(bar.style.transform || "");
        const baseLeft = rect.left - currentTranslate;
        const maxLeft = rightLimit == null ? Infinity : Math.max(0, rightLimit - Math.ceil(rect.width));
        const targetLeft = Math.min(offset, maxLeft);
        const delta = Math.max(0, Math.ceil(targetLeft - baseLeft));
        const targetTransform = delta > 0 ? `translateX(${delta}px)` : "none";
        bar.style.setProperty("left", "auto", "important");
        bar.style.setProperty("right", "auto", "important");
        if (bar.style.transform !== targetTransform) {
            bar.style.setProperty("transform", targetTransform, "important");
        }
    });

    if (hotbar && actionBar && hotbar.contains(actionBar)) {
        actionBar.style.setProperty("left", "auto", "important");
        actionBar.style.setProperty("right", "auto", "important");
        actionBar.style.setProperty("transform", "none", "important");
    }
};

const updatePlayersUiMetrics = () => {
    const panels = Array.from(document.querySelectorAll(
        `${PLAYER_ACTIVE_ROOT_SELECTOR}, ${PLAYER_INACTIVE_ROOT_SELECTOR}`
    )) as HTMLElement[];
    if (!panels.length) {
        document.documentElement.style.removeProperty("--ezd6-players-right");
        applyBottomBarOffset(0);
        return;
    }
    const { rightMost } = panels.reduce((metrics, panel) => {
        const rect = panel.getBoundingClientRect();
        return {
            rightMost: Math.max(metrics.rightMost, Math.ceil(rect.right)),
        };
    }, { rightMost: 0 });
    document.documentElement.style.setProperty("--ezd6-players-right", `${rightMost}px`);
    applyBottomBarOffset(rightMost);
};

const getUserIdFromPlayer = (node: HTMLElement): string => {
    return node.dataset.userId
        ?? node.dataset.user
        ?? node.getAttribute("data-user-id")
        ?? node.getAttribute("data-user")
        ?? "";
};

const getPlayerStatsBar = (): HTMLElement | null =>
    document.querySelector(PLAYER_STATS_SELECTOR) as HTMLElement | null;

let playerStreamMode = false;

const setPlayersStreamMode = (enabled: boolean) => {
    playerStreamMode = enabled;
    const active = document.querySelector(PLAYER_ACTIVE_ROOT_SELECTOR) as HTMLElement | null;
    if (active) active.classList.toggle("ezd6-players-stream-mode", enabled);
    const inactive = document.querySelector(PLAYER_INACTIVE_ROOT_SELECTOR) as HTMLElement | null;
    if (inactive) inactive.classList.toggle("ezd6-players-stream-mode", enabled);
    document.documentElement.classList.toggle("ezd6-players-stream-mode", enabled);
    document.body?.classList?.toggle("ezd6-players-stream-mode", enabled);
    const toggle = document.querySelector(`${PLAYER_ACTIVE_ROOT_SELECTOR} .ezd6-player-stream-toggle`) as HTMLButtonElement | null;
    if (toggle) {
        toggle.classList.toggle("is-enabled", enabled);
        toggle.setAttribute("aria-pressed", enabled ? "true" : "false");
    }
};

const ensurePlayerStreamToggle = () => {
    const stats = getPlayerStatsBar();
    if (!stats) return;
    let toggle = stats.querySelector(".ezd6-player-stream-toggle") as HTMLButtonElement | null;
    if (!toggle) {
        toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "ezd6-player-stream-toggle";
        toggle.addEventListener("mousedown", (event) => event.stopPropagation());
        toggle.addEventListener("click", (event) => event.stopPropagation());
        toggle.textContent = localize("EZD6.Actions.StreamMode", "Stream mode");
        toggle.classList.toggle("is-enabled", playerStreamMode);
        toggle.setAttribute("aria-pressed", playerStreamMode ? "true" : "false");
        toggle.addEventListener("click", () => {
            setPlayersStreamMode(!playerStreamMode);
        });
        const expandButton = stats.querySelector("#players-expand");
        if (expandButton?.parentElement === stats) {
            stats.insertBefore(toggle, expandButton);
        } else {
            stats.appendChild(toggle);
        }
    } else {
        toggle.classList.toggle("is-enabled", playerStreamMode);
        toggle.setAttribute("aria-pressed", playerStreamMode ? "true" : "false");
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

const buildResourceDisplay = (resource: any): ResourceDisplay => {
    const icons = getResourceIcons(resource);
    return {
        title: getResourceTitle(resource),
        availableIconPath: icons.available,
        spentIconPath: icons.spent,
        currentValue: getResourceValue(resource),
        maxValue: getResourceMaxValue(resource),
    };
};

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
                iconPath: data.availableIconPath,
                availableIconPath: data.availableIconPath,
                spentIconPath: data.spentIconPath,
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
    setPlayersStreamMode(playerStreamMode);
    const lists = getPlayerLists();
    ensurePlayerStreamToggle();

    lists.forEach((list) => {
        list.querySelectorAll(".ezd6-player-resources").forEach((node) => node.remove());
        list.style.removeProperty("--ezd6-player-res-columns");
        list.classList.add("ezd6-player-resources-list");

        const players = Array.from(list.querySelectorAll(PLAYER_ENTRY_SELECTOR)) as HTMLElement[];
        const maxNameWidth = players.reduce((maxWidth, player) => {
            const name = player.querySelector(".player-name") as HTMLElement | null;
            if (!name) return maxWidth;
            return Math.max(maxWidth, Math.ceil(name.getBoundingClientRect().width));
        }, 0);
        if (maxNameWidth > 0) {
            list.style.setProperty("--ezd6-player-name-width", `${maxNameWidth}px`);
        } else {
            list.style.removeProperty("--ezd6-player-name-width");
        }
        const columnKeys: string[] = [];
        const columnSet = new Set<string>();
        const playerEntries: Array<{ node: HTMLElement; resources: Map<string, ResourceDisplay> }> = [];

        players.forEach((player) => {
            const userId = getUserIdFromPlayer(player);
            const user = userId ? game?.users?.get?.(userId) : null;
            const actor = getActorForUser(user);
            if (!actor) return;
            const resourceMap = buildPlayerResourceMap(actor, columnKeys, columnSet);
            playerEntries.push({ node: player, resources: resourceMap });
        });

        if (!columnKeys.length) return;
        list.style.setProperty("--ezd6-player-res-columns", String(columnKeys.length));

        playerEntries.forEach(({ node, resources }) => {
            renderPlayerResourcesRow(node, columnKeys, resources);
        });
    });
    updatePlayersUiMetrics();
};

export const registerPlayerResourceDisplay = () => {
    const debounce = (foundry as any)?.utils?.debounce;
    const scheduleRender = typeof debounce === "function"
        ? debounce(() => ui?.players?.render?.(false), 100)
        : () => ui?.players?.render?.(false);
    const scheduleDomRender = typeof debounce === "function"
        ? debounce(() => {
            const list = document.querySelector(`${PLAYER_ACTIVE_ROOT_SELECTOR} ${PLAYER_LIST_SELECTOR}`) as HTMLElement | null;
            if (list) renderPlayerResources(list);
            else updatePlayersUiMetrics();
        }, 100)
        : () => {
            const list = document.querySelector(`${PLAYER_ACTIVE_ROOT_SELECTOR} ${PLAYER_LIST_SELECTOR}`) as HTMLElement | null;
            if (list) renderPlayerResources(list);
            else updatePlayersUiMetrics();
        };
    let observersInitialized = false;

    const initLayoutObservers = () => {
        if (observersInitialized) return;
        observersInitialized = true;
        if (typeof ResizeObserver === "function") {
            const resizeObserver = new ResizeObserver(() => scheduleDomRender());
            const watchNodes = Array.from(document.querySelectorAll(
                `${PLAYER_ACTIVE_ROOT_SELECTOR}, ${PLAYER_INACTIVE_ROOT_SELECTOR}, ${HOTBAR_SELECTOR}, ${ACTION_BAR_SELECTOR}, #ui-bottom, #sidebar`
            )) as HTMLElement[];
            watchNodes.forEach((node) => resizeObserver.observe(node));
        }
        if (typeof MutationObserver === "function") {
            const mutationObserver = new MutationObserver(() => scheduleDomRender());
            const root = document.querySelector("#ui-right, #sidebar, body") as HTMLElement | null;
            if (root) {
                mutationObserver.observe(root, {
                    attributes: true,
                    childList: true,
                    subtree: true,
                    attributeFilter: ["class", "style"],
                });
            }
        }
    };

    const onRenderPlayers = (_app: any, html: JQuery<HTMLElement> | HTMLElement) => {
        renderPlayerResources(html);
    };

    Hooks.on("renderPlayerList", onRenderPlayers);
    Hooks.on("renderPlayers", onRenderPlayers);
    Hooks.on("renderSidebarTab", (app: any, html: JQuery<HTMLElement> | HTMLElement) => {
        const tabName = app?.tabName ?? app?.id ?? app?.options?.id ?? "";
        if (tabName !== "players") return;
        renderPlayerResources(html);
    });
    Hooks.on("ready", () => {
        scheduleRender();
        scheduleDomRender();
        initLayoutObservers();
        window.addEventListener("resize", scheduleDomRender);
    });

    Hooks.on("updateActor", (actor: any, diff: any) => {
        if (!diff?.system?.resources) return;
        if (!isActorLinkedToUser(actor)) return;
        scheduleRender();
        scheduleDomRender();
    });

    Hooks.on("updateUser", (_user: any, diff: any) => {
        if (diff?.character != null || diff?.characterId != null) {
            scheduleRender();
            scheduleDomRender();
        }
    });
};

