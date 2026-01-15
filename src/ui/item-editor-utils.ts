type NativeItemFields = {
    nameValue: string;
    descriptionValue: string;
    categoryValue?: string;
};

export function applyNativeItemFields(data: any, fields: NativeItemFields) {
    data.itemNameValue = fields.nameValue;
    data.itemNameLocked = false;
    data.itemDescriptionValue = fields.descriptionValue;
    data.itemDescriptionLocked = false;
    if (fields.categoryValue !== undefined) {
        data.itemCategoryValue = fields.categoryValue;
        data.itemCategoryLocked = false;
    }
}
