// src/ezd6-core.ts
import { localize } from "./ui/i18n";
import { getSystemPath } from "./system-path";

export interface KeywordRule {
    allowKarma?: boolean;
    allowConfirm?: boolean;
    critValue?: number;
    oneAlwaysFail?: boolean;
    allowBurnOnes?: boolean;
    rollDialogue?: string;
    rollPower?: boolean;
}

export interface ResolvedKeywordRule {
    allowKarma: boolean;
    allowConfirm: boolean;
    critValue: number;
    oneAlwaysFail: boolean;
    allowBurnOnes: boolean;
    rollDialogue: string;
    rollPower: boolean;
}

const BASE_KEYWORD_RULE: ResolvedKeywordRule = {
    allowKarma: true,
    allowConfirm: true,
    critValue: 6,
    oneAlwaysFail: false,
    allowBurnOnes: false,
    rollDialogue: "",
    rollPower: false,
};

const t = (key: string, fallback: string) => localize(key, fallback);

export const KeywordRules: Record<string, KeywordRule> = {
    default:  { allowKarma: true,  allowConfirm: true,  critValue: 6 },
    magick:   { allowKarma: false, allowConfirm: false, critValue: 6, oneAlwaysFail: true, allowBurnOnes: true, rollPower: true, rollDialogue: t("EZD6.Dialogs.MagickPowerPrompt", "Choose power level") },
    miracle:  { allowKarma: false, allowConfirm: false, critValue: 6, oneAlwaysFail: true, rollPower: true, rollDialogue: t("EZD6.Dialogs.MiraclePowerPrompt", "Choose prayer urgency") },
    attack:   { allowKarma: true,  allowConfirm: true,  critValue: 6 },
    brutal:   { allowKarma: true,  allowConfirm: true,  critValue: 5 },
    fliptoffate: {allowKarma: false,  allowConfirm: false,  critValue: 4},
    anythingbut1: {allowKarma: false,  allowConfirm: false,  critValue: 2},
    target3: {allowKarma: true,  allowConfirm: false,  critValue: 3},
    target4: {allowKarma: true,  allowConfirm: false,  critValue: 4},
    target5: {allowKarma: true,  allowConfirm: false,  critValue: 5},
    target6: {allowKarma: true,  allowConfirm: false,  critValue: 6},
};

export function resolveKeywordRule(keyword: string): ResolvedKeywordRule {
    const fallback = KeywordRules.default ?? {};
    const override = KeywordRules[keyword] ?? {};
    return { ...BASE_KEYWORD_RULE, ...fallback, ...override };
}

export function extractKeyword(msgContent: string): string | null {
    if (!msgContent) return null;

    // 1) Direct "#keyword" match
    const m = msgContent.match(/#([A-Za-z0-9_-]+)/);
    if (m) return m[1].toLowerCase();

    // 2) Some roll flavors end up as plain words like "brutal" without the hash; scan for known keywords
    const lowered = msgContent.toLowerCase();
    for (const key of Object.keys(KeywordRules)) {
        if (key === "default") continue;
        if (new RegExp(`\\b${key}\\b`).test(lowered)) return key;
    }

    return null;
}

export function getDieImagePath(value: number, kind: "grey"|"green"|"red" = "grey") {
    return getSystemPath(`assets/dice/${kind}/d6-${value}.png`);
}

export function chooseDieKindForValue(value: number, critValue: number): "grey"|"green"|"red" {
    if (value >= critValue) return "green";
    if (value === 1) return "red";
    return "grey";
}

// Stubbed API
export const EZD6 = {
    RollAPI: {
        async modifyResult(actor: any|null, originalValue: number, increaseBy: number, keyword: string|null) {
            if (originalValue === 1 || originalValue === 6) return { value: originalValue, spent: 0, stress: 0 };
            const newVal = Math.min(6, originalValue + increaseBy);
            return { value: newVal, spent: increaseBy, stress: 0 };
        }
    }
};

// ParsedRoll type for index.ts rendering
export interface ParsedRoll {
    dice: { value: number; highlight: boolean; transparent: boolean }[];
    canKarma: boolean;
    canConfirm: boolean;
    hasOnes: boolean;
    rule: ResolvedKeywordRule;
    resultIndex: number | null;
}

// Simple evaluator for highlighting and rules
export function evaluateDice(
    originalDice: number[],
    keyword: string,
    mode: "kh" | "kl" = "kh",
    burnedOnes: boolean[] = [],
    lockedResultIndex?: number | null,
    initialAllCrit?: boolean
): ParsedRoll {
    const rule = resolveKeywordRule(keyword);
    const critValue = rule.critValue;
    const rolledAllCrit = initialAllCrit ?? false;

    const dice: ParsedRoll["dice"] = originalDice.map((v, idx) => ({
        value: v,
        highlight: false,
        transparent: burnedOnes[idx] ?? false
    }));

    const available = originalDice
        .map((value, index) => ({ value, index }))
        .filter(({ index }) => !burnedOnes[index]);

    let resultIndex: number | null = null;
    const lockedValid = (lockedResultIndex ?? null) !== null && !burnedOnes[lockedResultIndex!];

    if (lockedValid) {
        resultIndex = lockedResultIndex ?? null;
    } else if (available.length > 0) {
        if (mode === "kl") {
            const minVal = Math.min(...available.map(v => v.value));
            resultIndex = available.find(v => v.value === minVal)?.index ?? null;
        } else {
            const maxVal = Math.max(...available.map(v => v.value));
            resultIndex = available.find(v => v.value === maxVal)?.index ?? null;
        }
    }

    const activeVal = (resultIndex === null) ? 0 : originalDice[resultIndex];
    const hasOnes = available.some(v => v.value === 1);

    // Highlighting rules
    if (resultIndex !== null) {
        dice[resultIndex].highlight = true;
    }

    if (mode === "kl") {
        // For KL rolls, keep highlighting minimal unless the result is a 1 (multiple ones) or a crit
        if (activeVal === 1 && resultIndex !== null) {
            available.filter(v => v.value === 1).forEach(v => { dice[v.index].highlight = true; });
        } else if (activeVal >= critValue && resultIndex !== null && rolledAllCrit) {
            available.filter(v => v.value >= critValue).forEach(v => { dice[v.index].highlight = true; });
        }
    } else {
        if (rule.oneAlwaysFail && hasOnes) {
            available.filter(v => v.value === 1).forEach(v => { dice[v.index].highlight = true; });
        } else if (activeVal >= critValue && resultIndex !== null) {
            available.filter(v => v.value >= critValue).forEach(v => { dice[v.index].highlight = true; });
        } else if (activeVal === 1 && resultIndex !== null) {
            available.filter(v => v.value === 1).forEach(v => { dice[v.index].highlight = true; });
        }
    }

    dice.forEach((d, idx) => {
        d.transparent = (!!burnedOnes[idx]) || !d.highlight;
    });

    const onesBlock = rule.oneAlwaysFail && hasOnes;

    const canKarma = rule.allowKarma && !onesBlock && resultIndex !== null && activeVal >= 2 && activeVal < critValue;
    const canConfirm = rule.allowConfirm && !onesBlock && resultIndex !== null && activeVal >= critValue;

    return { dice, canKarma, canConfirm, hasOnes, rule, resultIndex };
}
