// src/character.ts
import { buildRollMeta, EZD6_META_FLAG } from "./chat/chat-meta";
import { localize } from "./ui/i18n";
import { renderMarkdown } from "./ui/markdown";
import { getSystemPath } from "./system-path";

export type DiceChangeBehavior = "none" | "karma" | "stress";

export interface Ability {
    id: string;
    title: string;
    description: string;
    category: string;
    numberOfDice: number;
    rollKeyword?: string;
}

export interface Resource {
    id: string;
    title: string;
    description?: string;
    localizationId?: string;
    icon?: string;
    iconAvailable?: string;
    iconSpent?: string;
    rollKeyword?: string;
    numberOfDice?: number;
    usedForDiceBurn?: boolean;
    diceChangeBehavior?: DiceChangeBehavior;
    replenishLogic?: "disabled" | "reset" | "restore";
    replenishTag?: string;
    replenishCost?: number;
    value: number;
    defaultValue: number;
    maxValue?: number;
    defaultMaxValue?: number;
    locked?: boolean;
}

export interface Save {
    id: string;
    title: string;
    description?: string;
    localizationId?: string;
    icon?: string;
    targetValue: number;
    numberOfDice: number;
}

const t = (key: string, fallback: string) => localize(key, fallback);

const DEFAULT_ABILITY_CATEGORIES = [
    t("EZD6.Categories.Inclinations", "Inclinations"),
    t("EZD6.Categories.Aspects", "Aspects"),
    t("EZD6.Categories.Equipment", "Equipment"),
] as const;
export const DEFAULT_RESOURCE_ICON = "icons/svg/d20-black.svg";
export const DEFAULT_AVATAR = getSystemPath("assets/avatars/ezd6-avatar.png");
export const LEGACY_AVATAR_PLACEHOLDER = getSystemPath("assets/avatars/placeholder.png");
function createId(prefix: string): string {
    const random = Math.random().toString(36).slice(2, 8);
    return `${prefix}-${random}`;
}

function ensureKeyword(keyword?: string): string {
    if (!keyword) return "default";
    return keyword.trim() === "" ? "default" : keyword.trim();
}

export function isLockedResource(resource: Resource): boolean {
    return resource.locked === true;
}

/**
 * Character data container. This class does not attempt to mirror Foundry's Actor API
 * but provides a convenient place for the character sheet and rollers to read/write
 * values in a predictable way.
 */
export class Character {
    avatarUrl: string | null = null;
    name = "";
    description = "";
    abilities: Ability[] = [];
    resources: Resource[] = [];
    saves: Save[] = [];

    private readonly categoryOrder = new Map<string, number>();
    private static _health = 3;

    constructor() {
        DEFAULT_ABILITY_CATEGORIES.forEach((cat, idx) => this.categoryOrder.set(cat, idx));
    }

    setAvatar(url: string, token?: any) {
        this.avatarUrl = url;
        const target = token?.document ?? token;
        target?.update?.({ img: url }).catch(() => {
            // ignore token update failures; users can retry later
        });
    }

    setName(value: string, token?: any) {
        this.name = value;
        const target = token?.document ?? token;
        target?.update?.({ name: value }).catch(() => undefined);
    }

    setDescription(value: string) {
        this.description = value;
    }

    addAbility(partial: Partial<Ability>): Ability {
        const abilityLabel = t("EZD6.ItemLabels.Ability", "Ability");
        const ability: Ability = {
            id: partial.id ?? createId("abl"),
            title: partial.title ?? abilityLabel,
            description: partial.description ?? "",
            category: partial.category ?? DEFAULT_ABILITY_CATEGORIES[0],
            numberOfDice: partial.numberOfDice ?? 0,
            rollKeyword: partial.rollKeyword ?? "default",
        };
        this.abilities.push(ability);
        if (!this.categoryOrder.has(ability.category)) {
            this.categoryOrder.set(ability.category, this.categoryOrder.size);
        }
        return ability;
    }

    addResource(partial: Partial<Resource>): Resource {
        const resourceLabel = t("EZD6.ItemLabels.Resource", "Resource");
        const fallbackIcon = partial.iconAvailable
            ?? partial.iconSpent
            ?? DEFAULT_RESOURCE_ICON;
        const resource: Resource = {
            id: partial.id ?? createId("res"),
            title: partial.title ?? resourceLabel,
            description: partial.description ?? "",
            localizationId: partial.localizationId ?? "",
            icon: partial.icon ?? fallbackIcon,
            iconAvailable: partial.iconAvailable,
            iconSpent: partial.iconSpent,
            rollKeyword: partial.rollKeyword ?? "default",
            numberOfDice: partial.numberOfDice ?? 0,
            usedForDiceBurn: partial.usedForDiceBurn ?? false,
            diceChangeBehavior: partial.diceChangeBehavior ?? "none",
            replenishLogic: partial.replenishLogic ?? "disabled",
            replenishTag: partial.replenishTag ?? "",
            replenishCost: partial.replenishCost ?? 1,
            value: partial.value ?? partial.defaultValue ?? 0,
            defaultValue: partial.defaultValue ?? 0,
            maxValue: partial.maxValue,
            defaultMaxValue: partial.defaultMaxValue,
            locked: partial.locked ?? false,
        };
        this.resources.push(resource);
        return resource;
    }

    addSave(partial: Partial<Save>): Save {
        const saveLabel = t("EZD6.ItemLabels.Save", "Save");
        const save: Save = {
            id: partial.id ?? createId("sav"),
            title: partial.title ?? saveLabel,
            description: partial.description ?? "",
            localizationId: partial.localizationId ?? "",
            icon: partial.icon,
            targetValue: partial.targetValue ?? 6,
            numberOfDice: partial.numberOfDice ?? 1,
        };
        this.saves.push(save);
        return save;
    }

    /** Check if Burn 1 is allowed */
    static canBurnOne(): boolean {
        return Character._health > 0;
    }

    /** Consume one health (Burn 1) */
    static consumeHealth(): boolean {
        if (Character._health <= 0) return false;
        Character._health -= 1;
        return true;
    }

    /** For debugging / UI: get current health */
    static getHealth(): number {
        return Character._health;
    }

    /** Reset health for testing */
    static resetHealth(value: number = 3) {
        Character._health = value;
    }

    getAbilitiesByCategory(): [string, Ability[]][] {
        const grouped = new Map<string, Ability[]>();
        DEFAULT_ABILITY_CATEGORIES.forEach((cat) => grouped.set(cat, []));

        for (const ability of this.abilities) {
            const bucket = grouped.get(ability.category) ?? [];
            bucket.push(ability);
            grouped.set(ability.category, bucket);
        }

        const entries = Array.from(grouped.entries());
        return entries.sort((a, b) => (this.categoryOrder.get(a[0]) ?? 999) - (this.categoryOrder.get(b[0]) ?? 999));
    }

    adjustResource(resourceId: string, delta: number) {
        const res = this.resources.find((r) => r.id === resourceId);
        if (!res) return;
        const rawCurrent = Number(res.value);
        const rawFallback = Number(res.defaultValue ?? res.defaultMaxValue ?? res.maxValue ?? 0);
        const current = Number.isFinite(rawCurrent)
            ? rawCurrent
            : Number.isFinite(rawFallback)
                ? rawFallback
                : 0;
        res.value = Math.max(0, Math.floor(current + delta));
    }

    async rollAbility(abilityId: string, speaker?: any) {
        const ability = this.abilities.find((a) => a.id === abilityId);
        if (!ability) return;

        if (ability.numberOfDice > 0) {
            const keyword = ensureKeyword(ability.rollKeyword ?? "default");
            const normalizedKeyword = keyword.startsWith("#") ? keyword.slice(1) : keyword;
            const tag = `#${normalizedKeyword}`;
            const formula = `${ability.numberOfDice}d6`;
            const flavor = `${ability.title} #${keyword}`;
            const descHtml = renderMarkdown(ability.description ?? "");
            const roll = new Roll(formula, {});
            await roll.evaluate();
            await roll.toMessage({
                flavor,
                speaker: speaker ?? ChatMessage.getSpeaker?.(),
                flags: {
                    [EZD6_META_FLAG]: buildRollMeta({
                        title: ability.title,
                        description: descHtml,
                        tag,
                    }),
                },
            });
        } else {
            const descHtml = renderMarkdown(ability.description ?? "");
            const contentPieces = [
                `<strong>${ability.title}</strong>`,
                descHtml ? `<div>${descHtml}</div>` : "",
            ];
            await ChatMessage.create({ content: contentPieces.join(""), speaker: speaker ?? ChatMessage.getSpeaker?.() });
        }
    }

    async rollSave(saveId: string, speaker?: any) {
        const save = this.saves.find((s) => s.id === saveId);
        if (!save) return;
        const diceCount = Number.isFinite(save.numberOfDice) ? Math.max(0, Math.floor(save.numberOfDice)) : 0;
        const roll = new Roll(`${diceCount}d6`, {});
        await roll.evaluate();
        const rawTarget = Number(save.targetValue);
        const target = Number.isFinite(rawTarget) && rawTarget > 0 ? Math.floor(rawTarget) : 6;
        const saveLabel = t("EZD6.ItemLabels.Save", "Save");
        const saveTitle = typeof save.title === "string" ? save.title.trim() || saveLabel : saveLabel;
        const flavor = `${saveTitle} #target${target}`;
        const descHtml = renderMarkdown(save.description ?? "");
        await roll.toMessage({
            flavor,
            speaker: speaker ?? ChatMessage.getSpeaker?.(),
            flags: {
                [EZD6_META_FLAG]: buildRollMeta({
                    title: saveTitle,
                    description: descHtml,
                    tag: `#target${target}`,
                    kind: "save",
                    saveTarget: target,
                }),
            },
        });
    }

    async rollTask(label: string, formula: string, speaker?: any) {
        const roll = new Roll(formula, {});
        await roll.evaluate();
        const flavor = `${label} #task`;
        await roll.toMessage({
            flavor,
            speaker: speaker ?? ChatMessage.getSpeaker?.(),
            flags: {
                [EZD6_META_FLAG]: buildRollMeta({
                    title: label,
                    description: "",
                    tag: "#task",
                }),
            },
        });
    }

    async rollMagick(diceCount: number, speaker?: any) {
        const roll = new Roll(`${diceCount}d6`, {});
        await roll.evaluate();
        const magickLabel = t("EZD6.Magic.Magick", "Magick");
        const flavor = `${magickLabel} ${diceCount}d6 #magick`;
        await roll.toMessage({
            flavor,
            speaker: speaker ?? ChatMessage.getSpeaker?.(),
            flags: {
                [EZD6_META_FLAG]: buildRollMeta({
                    title: magickLabel,
                    description: "",
                    tag: "#magick",
                }),
            },
        });
    }

}

