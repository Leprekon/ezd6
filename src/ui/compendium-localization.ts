export function registerCompendiumLocalization() {
    Hooks.on("renderCompendium", (app: any, html: any) => {
        try {
            const pack = app?.collection ?? app?.compendium ?? app?.pack;
            if (!pack || pack.documentName !== "Item" || typeof pack.getIndex !== "function") return;
            void pack.getIndex({ fields: ["system.localizationId"] }).then((index: any[]) => {
                const byId = new Map(index.map((entry) => [entry._id ?? entry.id, entry]));
                const root = html?.[0] as HTMLElement | undefined;
                if (!root) return;
                root.querySelectorAll(".directory-item").forEach((node) => {
                    const el = node as HTMLElement;
                    const id = el.dataset.documentId ?? el.dataset.entryId ?? "";
                    if (!id) return;
                    const entry = byId.get(id);
                    const localizationId = typeof entry?.system?.localizationId === "string"
                        ? entry.system.localizationId.trim()
                        : "";
                    if (!localizationId) return;
                    const key = `${localizationId}.Name`;
                    const localized = (game as any)?.i18n?.localize?.(key);
                    if (!localized || localized === key) return;
                    const nameEl = el.querySelector(".entry-name, .document-name, .name") as HTMLElement | null;
                    if (nameEl) nameEl.textContent = localized;
                });
            });
        } catch {
            // ignore compendium localization failures
        }
    });
}
