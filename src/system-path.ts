// src/system-path.ts
const DEFAULT_SYSTEM_ID = "ezd6-reforged";

export const getSystemId = () =>
    (globalThis as any)?.game?.system?.id ?? DEFAULT_SYSTEM_ID;

export const getSystemPath = (relativePath: string) => {
    const cleaned = relativePath.replace(/^\/+/, "");
    return `systems/${getSystemId()}/${cleaned}`;
};

export { DEFAULT_SYSTEM_ID };
