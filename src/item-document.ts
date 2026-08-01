import {
    convertLegacyItemSource,
    LEGACY_MIGRATION_FLAG,
    LEGACY_MIGRATION_FLAG_SCOPE,
    isLegacyItemSource,
} from "./migrations/legacy-item-types";

const BaseItem = (foundry as any).documents.Item;

function prepareLegacyItemSource(source: any) {
    if (!isLegacyItemSource(source)) return source;

    const legacyType = source.type;
    convertLegacyItemSource(source);
    source.flags ??= {};
    source.flags[LEGACY_MIGRATION_FLAG_SCOPE] ??= {};
    source.flags[LEGACY_MIGRATION_FLAG_SCOPE][LEGACY_MIGRATION_FLAG] = legacyType;
    return source;
}

/**
 * Migrates removed pre-v14 Item types before Foundry validates embedded Items.
 * The marker lets the ready hook persist the clean source for a GM afterwards.
 */
export class EZD6Item extends BaseItem {
    _initializeSource(data: any, options: any) {
        // ActorDelta constructs embedded Items through a cleaning path which
        // does not reliably dispatch the Document subclass' static migration
        // before validating `type`. Convert the discriminator first.
        prepareLegacyItemSource(data);
        return super._initializeSource(data, options);
    }

    static migrateData(source: any, options: any) {
        source = super.migrateData(source, options);
        return prepareLegacyItemSource(source);
    }
}

export function registerItemDocumentClass() {
    CONFIG.Item.documentClass = EZD6Item;
}
