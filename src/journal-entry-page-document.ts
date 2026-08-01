import {
    cloneSource,
    getEmbeddedSources,
    replaceEmbeddedDocuments,
} from "./migrations/embedded-document-utils";

const BaseJournalEntryPage = (foundry as any).documents.JournalEntryPage;

const MIGRATION_FLAG_SCOPE = "ezd6-reforged";
const MIGRATION_FLAG = "legacyJournalPageType";
const LEGACY_MAP_TYPE = "map";

function getLegacyPageType(source: any): string | null {
    const value = source?.flags?.[MIGRATION_FLAG_SCOPE]?.[MIGRATION_FLAG];
    return value === LEGACY_MAP_TYPE ? value : null;
}

function convertLegacyMapPage(source: any, markForPersistence = false) {
    if (source?.type !== LEGACY_MAP_TYPE) return source;

    source.type = "text";
    if (markForPersistence) {
        source.flags ??= {};
        source.flags[MIGRATION_FLAG_SCOPE] ??= {};
        source.flags[MIGRATION_FLAG_SCOPE][MIGRATION_FLAG] = LEGACY_MAP_TYPE;
    }
    return source;
}

function clearMigrationFlag(source: any) {
    const scope = source?.flags?.[MIGRATION_FLAG_SCOPE];
    if (!scope) return source;
    delete scope[MIGRATION_FLAG];
    if (!Object.keys(scope).length) delete source.flags[MIGRATION_FLAG_SCOPE];
    return source;
}

/**
 * Converts Foundry's removed `map` journal-page type before v14 validates it.
 * In the migrated v13 world these are adventure text pages: their actual
 * content lives in `text.content`, while `src` is null. Retain the entire
 * source and only replace the removed discriminator with Foundry's core text
 * type.
 */
export class EZD6JournalEntryPage extends BaseJournalEntryPage {
    _initializeSource(data: any, options: any) {
        convertLegacyMapPage(data, true);
        return super._initializeSource(data, options);
    }

    static migrateData(source: any, options: any) {
        source = super.migrateData(source, options);
        return convertLegacyMapPage(source, true);
    }
}

export function registerJournalEntryPageDocumentClass() {
    CONFIG.JournalEntryPage.documentClass = EZD6JournalEntryPage;
}

async function persistLegacyMapPages(journal: any): Promise<number> {
    const rawPages = getEmbeddedSources(journal, "pages");
    const replacements = rawPages
        .filter((page: any) => page?.type === LEGACY_MAP_TYPE || getLegacyPageType(page) != null)
        .map((page: any) => {
            const replacement = cloneSource(page);
            convertLegacyMapPage(replacement);
            return clearMigrationFlag(replacement);
        });

    return replaceEmbeddedDocuments({
        parent: journal,
        documentName: "JournalEntryPage",
        documentClass: CONFIG.JournalEntryPage.documentClass,
        replacements,
    });
}

export function registerLegacyJournalPageMigration() {
    Hooks.once("ready", async () => {
        if (!game?.user?.isGM) return;
        let migrated = 0;
        for (const journal of game.journal ?? []) {
            try {
                migrated += await persistLegacyMapPages(journal);
            } catch (error) {
                console.error(`EZD6 | Legacy map-page migration failed for JournalEntry [${journal.id}] ${journal.name}`, error);
            }
        }
        if (migrated) console.info(`EZD6 | Migrated ${migrated} legacy map journal pages to text pages.`);
    });
}
