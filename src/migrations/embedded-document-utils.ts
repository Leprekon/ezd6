export function getEmbeddedSources(parent: any, collectionName: string): any[] {
    const collection = parent?.[collectionName];
    const source = collection?._source ?? parent?._source?.[collectionName];
    return source ? Array.from(source as Iterable<any>) : [];
}

export function cloneSource<T>(source: T): T {
    return (foundry as any).utils.deepClone(source);
}

type ReplaceEmbeddedDocumentsOptions = {
    parent: any;
    documentName: string;
    documentClass: any;
    replacements: any[];
};

export async function replaceEmbeddedDocuments({
    parent,
    documentName,
    documentClass,
    replacements,
}: ReplaceEmbeddedDocumentsOptions): Promise<number> {
    if (!replacements.length) return 0;

    // Validate every replacement before deleting anything. Foundry cannot
    // change a Document's type in place, so retain IDs and recreate the set.
    for (const data of replacements) {
        new documentClass(cloneSource(data), {
            parent,
            creation: true,
            temporary: true,
        });
    }

    const ids = replacements.map((document) => document._id);
    await parent.deleteEmbeddedDocuments(documentName, ids, { noHook: true });
    const created = await parent.createEmbeddedDocuments(documentName, replacements, {
        keepId: true,
        noHook: true,
    });
    if (created.length !== replacements.length) {
        throw new Error(
            `Created ${created.length} of ${replacements.length} replacement ${documentName} Documents.`,
        );
    }
    return replacements.length;
}
