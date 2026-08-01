const api = (foundry as any).applications.api;
const sheets = (foundry as any).applications.sheets;
const FilePicker = (foundry as any).applications.apps.FilePicker;

const ActorSheetBase = api.HandlebarsApplicationMixin(sheets.ActorSheetV2);
const ItemSheetBase = api.HandlebarsApplicationMixin(sheets.ItemSheetV2);

export class EZD6ActorSheetV2 extends ActorSheetBase {
    get title() {
        return this.actor?.name ?? super.title;
    }

    async _prepareContext(options: any) {
        const context = await super._prepareContext(options) as any;
        context.actor = this.actor;
        context.system = this.actor.system;
        context.owner = this.actor.isOwner;
        return context;
    }
}

export class EZD6ItemSheetV2 extends ItemSheetBase {
    get title() {
        return this.item?.name ?? super.title;
    }

    async _prepareContext(options: any) {
        const context = await super._prepareContext(options) as any;
        context.item = this.item;
        context.actor = this.actor;
        context.system = this.item.system;
        context.owner = this.item.isOwner;
        return context;
    }

    async _onRender(context: any, options: any) {
        await super._onRender(context, options);
        if (!this.isEditable) return;

        const image = this.element?.querySelector?.('img[data-edit="img"]') as HTMLImageElement | null;
        if (!image) return;
        image.addEventListener("click", (event: MouseEvent) => {
            event.preventDefault();
            event.stopPropagation();
            const picker = new FilePicker({
                type: "image",
                current: this.item?.img ?? "",
                callback: async (path: string) => {
                    await this.item.update({ img: path });
                    image.src = path;
                },
            });
            picker.render({ force: true });
        });
    }
}
