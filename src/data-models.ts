const foundryApi = foundry as any;
const fields = foundryApi.data.fields;
const TypeDataModel = foundryApi.abstract.TypeDataModel;

const stringField = (initial = "") => new fields.StringField({ required: true, nullable: false, initial });
const htmlField = () => new fields.HTMLField({ required: true, nullable: false, initial: "" });
const numberField = (initial = 0, options: Record<string, any> = {}) => new fields.NumberField({
    required: true,
    nullable: false,
    initial,
    ...options,
});
const booleanField = (initial = false) => new fields.BooleanField({ required: true, nullable: false, initial });
const objectArrayField = () => new fields.ArrayField(
    new fields.ObjectField({ required: true, nullable: false }),
    { required: true, nullable: false, initial: [] },
);

export class CharacterDataModel extends TypeDataModel {
    static defineSchema() {
        return {
            avatarUrl: stringField(),
            description: htmlField(),
            abilities: objectArrayField(),
            resources: objectArrayField(),
            saves: objectArrayField(),
        };
    }
}

abstract class LocalizedItemDataModel extends TypeDataModel {
    static defineSchema() {
        return { localizationId: stringField() };
    }
}

abstract class AbilityLikeDataModel extends LocalizedItemDataModel {
    static defineSchema() {
        return {
            ...super.defineSchema(),
            description: htmlField(),
            numberOfDice: numberField(0, { min: 0, max: 5, integer: true }),
            tag: stringField("#task"),
            category: stringField(),
        };
    }
}

export class AbilityDataModel extends AbilityLikeDataModel {}
export class AspectDataModel extends AbilityLikeDataModel {}

export class EquipmentDataModel extends AbilityLikeDataModel {
    static defineSchema() {
        return {
            ...super.defineSchema(),
            quantifiable: booleanField(),
            quantity: numberField(1, { min: 0, integer: true }),
        };
    }
}

export class ResourceDataModel extends LocalizedItemDataModel {
    static defineSchema() {
        return {
            ...super.defineSchema(),
            value: numberField(1, { min: 0, max: 100, integer: true }),
            maxValue: numberField(0, { min: 0, max: 100, integer: true }),
            numberOfDice: numberField(0, { min: 0, max: 3, integer: true }),
            description: htmlField(),
            tag: stringField("#default"),
            replenishLogic: stringField("disabled"),
            replenishTag: stringField(),
            replenishCost: numberField(1, { min: 1, max: 100, integer: true }),
            publicDisplay: booleanField(),
        };
    }
}

export class SaveDataModel extends LocalizedItemDataModel {
    static defineSchema() {
        return {
            ...super.defineSchema(),
            targetValue: numberField(6, { min: 1, max: 7, integer: true }),
            numberOfDice: numberField(1, { min: 1, max: 6, integer: true }),
            description: htmlField(),
        };
    }
}

export class ArchetypeDataModel extends LocalizedItemDataModel {
    static defineSchema() {
        return {
            ...super.defineSchema(),
            avatarUrl: stringField(),
            description: htmlField(),
            abilities: objectArrayField(),
            aspects: objectArrayField(),
            equipment: objectArrayField(),
            resources: objectArrayField(),
            saves: objectArrayField(),
        };
    }
}

export function registerDataModels() {
    Object.assign(CONFIG.Actor.dataModels, { character: CharacterDataModel });
    Object.assign(CONFIG.Item.dataModels, {
        ability: AbilityDataModel,
        aspect: AspectDataModel,
        equipment: EquipmentDataModel,
        resource: ResourceDataModel,
        save: SaveDataModel,
        archetype: ArchetypeDataModel,
    });
}
