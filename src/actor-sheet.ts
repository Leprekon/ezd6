// src/actor-sheet.ts
import { Character, CharacterSheetView } from "./character";

export class EZD6CharacterSheet extends ActorSheet {
    private character: Character | null = null;
    private view: CharacterSheetView | null = null;
    private descObserver: MutationObserver | null = null;

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["ezd6-sheet-wrapper"],
            width: 860,
            height: 780,
            resizable: true,
            submitOnChange: true,
            submitOnClose: true,
        });
    }

    get template() {
        return "systems/ezd6-new/templates/character-sheet.hbs";
    }

    getData(options?: any) {
        return super.getData(options);
    }

    activateListeners(html: any) {
        super.activateListeners(html);
        const root = html[0]?.querySelector?.(".ezd6-sheet-root") as HTMLElement | null;
        if (!root) return;

        if (!this.character) {
            this.character = new Character();
        }

        this.syncFromActor();
        this.view = new CharacterSheetView(this.character, {
            onAvatarPick: (path) => {
                this.actor?.update?.({ img: path, "system.avatarUrl": path });
            },
            onNameCommit: (name) => {
                const fallback = this.actor?.name ?? "Unnamed";
                const nextName = name?.trim() ? name.trim() : fallback;
                this.actor?.update?.({ name: nextName });
            },
            actor: this.actor,
        });
        this.view.render(root);
        const descSection = html[0]?.querySelector?.(".ezd6-section--description") as HTMLElement | null;
        const descBlock = descSection?.closest(".ezd6-section-block") as HTMLElement | null;
        const descNode = descBlock ?? descSection;
        if (descNode && !root.contains(descNode)) {
            root.appendChild(descNode);
        }

        this.syncDescriptionView(html);

        const descWrap = html[0]?.querySelector?.(".ezd6-description-wrap");
        const editBtn = html[0]?.querySelector?.(".editor-edit");
        if (editBtn) {
            editBtn.addEventListener("click", () => {
                if (descWrap) {
                    descWrap.style.setProperty("--desc-edit-height", "250px");
                }
                descWrap?.classList.add("is-editing");
                if (descWrap) {
                    delete descWrap.dataset.ezd6DescDirty;
                    delete descWrap.dataset.ezd6DescDirtyHook;
                }
                this.scheduleMarkDescriptionDirty(descWrap);
                this.scheduleEnableDescriptionSave(descWrap);
                this.ensureDescriptionEditorPadding(html);
            });
        }

        const saveBtn = html[0]?.querySelector?.(".editor-save");
        if (saveBtn) {
            saveBtn.addEventListener("click", () => {
                descWrap?.classList.remove("is-editing");
                setTimeout(() => this.syncDescriptionView(html), 0);
            });
        }
        setTimeout(() => this.applyDescriptionEditorPadding(html), 0);
        this.observeDescriptionEditor(html);

    }

    protected async _updateObject(_event: Event, formData: Record<string, any>) {
        if (!this.actor) return;
        await this.actor.update(formData);
    }

    private syncDescriptionView(html: any) {
        const view = html[0]?.querySelector?.(".ezd6-description-view") as HTMLElement | null;
        if (!view) return;
        const value = (this.actor as any)?.system?.description ?? "";
        view.innerHTML = this.trimTrailingEmptyDescription(value);
        view.classList.toggle("ezd6-description-view--empty", !value);
    }

    private applyDescriptionEditorPadding(html: any): boolean {
        const iframe = html[0]?.querySelector?.(".ezd6-section--description .tox-edit-area__iframe") as HTMLIFrameElement | null;
        if (!iframe) return false;

        const apply = () => {
            const wrap = html[0]?.querySelector?.(".ezd6-description-wrap") as HTMLElement | null;
            const wrapStyle = wrap ? getComputedStyle(wrap) : null;
            const padValue = wrapStyle?.getPropertyValue("--desc-pad").trim() || "8px";
            const padTop = wrapStyle?.paddingTop?.trim() || padValue;
            const padRight = wrapStyle?.paddingRight?.trim() || padValue;
            const padBottom = wrapStyle?.paddingBottom?.trim() || padValue;
            const padLeft = wrapStyle?.paddingLeft?.trim() || padValue;

            const doc = iframe.contentDocument;
            const body = doc?.body;
            if (!doc || !body) return false;

            const styleId = "ezd6-desc-pad";
            let style = doc.getElementById(styleId) as HTMLStyleElement | null;
            if (!style) {
                style = doc.createElement("style");
                style.id = styleId;
                doc.head.appendChild(style);
            }
            style.textContent = `html,body{margin:0;box-sizing:border-box;height:100%;} body{padding:${padTop} ${padRight} ${padBottom} ${padLeft} !important;overflow-wrap:break-word;min-height:100%;}`;

            body.style.paddingTop = padTop;
            body.style.paddingRight = padRight;
            body.style.paddingBottom = padBottom;
            body.style.paddingLeft = padLeft;
            body.style.margin = "0";
            body.style.boxSizing = "border-box";
            body.style.minHeight = "100%";

            return true;
        };

        if (apply()) return true;

        let attempts = 0;
        const timer = setInterval(() => {
            attempts += 1;
            if (apply() || attempts > 10) {
                clearInterval(timer);
            }
        }, 150);

        iframe.addEventListener("load", () => apply(), { once: true });
        return false;
    }

    private ensureDescriptionEditorPadding(html: any) {
        const wrap = html[0]?.querySelector?.(".ezd6-description-wrap") as HTMLElement | null;
        if (wrap && !wrap.dataset.ezd6DescPadHook) {
            const editor = this.getDescriptionEditor(wrap);
            if (editor) {
                const reapply = () => this.applyDescriptionEditorPadding(html);
                editor.on?.("focus", reapply);
                editor.on?.("SetContent", reapply);
                editor.on?.("init", reapply);
                wrap.dataset.ezd6DescPadHook = "1";
            }
        }

        let attempts = 0;
        const tryApply = () => {
            attempts += 1;
            if (this.applyDescriptionEditorPadding(html) || attempts >= 20) return;
            setTimeout(tryApply, 100);
        };
        tryApply();
    }

    private observeDescriptionEditor(html: any) {
        if (this.descObserver) return;
        const wrap = html[0]?.querySelector?.(".ezd6-description-wrap") as HTMLElement | null;
        if (!wrap) return;

        this.descObserver = new MutationObserver(() => {
            this.applyDescriptionEditorPadding(html);
        });

        this.descObserver.observe(wrap, {
            childList: true,
            subtree: true,
        });
    }

    async close(options?: any) {
        if (this.descObserver) {
            this.descObserver.disconnect();
            this.descObserver = null;
        }
        return super.close(options);
    }

    private scheduleMarkDescriptionDirty(wrap: HTMLElement | null) {
        if (!wrap || wrap.dataset.ezd6DescDirty === "1") return;
        let attempts = 0;
        const tryMark = () => {
            attempts += 1;
            if (this.markDescriptionDirty(wrap) || attempts >= 40) return;
            setTimeout(tryMark, 100);
        };
        tryMark();
    }

    private scheduleEnableDescriptionSave(wrap: HTMLElement | null) {
        if (!wrap) return;
        let attempts = 0;
        const tryEnable = () => {
            attempts += 1;
            if (this.enableDescriptionSave(wrap) || attempts >= 40) return;
            setTimeout(tryEnable, 100);
        };
        tryEnable();
    }

    private enableDescriptionSave(wrap: HTMLElement | null) {
        if (!wrap) return false;
        const toolbarSave = wrap.querySelector(
            ".tox-toolbar__group .tox-tbtn[aria-label='Save']"
        ) as HTMLButtonElement | null;
        if (!toolbarSave) return false;
        toolbarSave.disabled = false;
        toolbarSave.removeAttribute("disabled");
        toolbarSave.setAttribute("aria-disabled", "false");
        toolbarSave.classList.remove("tox-tbtn--disabled");
        return true;
    }

    private markDescriptionDirty(wrap: HTMLElement | null) {
        if (!wrap) return;
        const editor = this.getDescriptionEditor(wrap);
        if (editor) {
            if (!editor.getBody?.() || editor.initialized === false) {
                if (!wrap.dataset.ezd6DescDirtyHook) {
                    editor.once?.("init", () => this.markDescriptionDirty(wrap));
                    wrap.dataset.ezd6DescDirtyHook = "1";
                }
                return false;
            }
            if (!wrap.dataset.ezd6DescDirtyHook) {
                editor.once?.("SetContent", () => this.markDescriptionDirty(wrap));
                wrap.dataset.ezd6DescDirtyHook = "1";
            }
            editor.setDirty(true);
            try {
                editor.nodeChanged?.();
                editor.fire?.("change");
            } catch {
                return false;
            }
            wrap.dataset.ezd6DescDirty = "1";
            return true;
        }
        return false;
    }

    private getDescriptionEditor(wrap: HTMLElement | null) {
        if (!wrap) return null;
        const textarea = wrap.querySelector("textarea[name='system.description']") as HTMLTextAreaElement | null;
        const content = wrap.querySelector(".editor-content") as HTMLElement | null;
        const win = window as any;
        const tinymce = win?.tinymce;
        let editor = (this as any)?.editors?.["system.description"]?.editor ?? null;
        if (tinymce) {
            if (textarea?.id) {
                editor = tinymce.get(textarea.id);
            }
            if (!editor && content?.id) {
                editor = tinymce.get(content.id);
            }
            if (!editor) {
                const iframe = wrap.querySelector(".tox-edit-area__iframe") as HTMLIFrameElement | null;
                const iframeId = iframe?.id;
                if (iframeId && iframeId.endsWith("_ifr")) {
                    editor = tinymce.get(iframeId.replace(/_ifr$/, ""));
                }
            }
        }
        return editor ?? null;
    }

    private syncFromActor() {
        if (!this.character) return;
        const system = (this.actor as any)?.system ?? {};

        const actorAny = this.actor as any;
        this.character.avatarUrl = system.avatarUrl ?? actorAny?.img ?? null;
        this.character.name = actorAny?.name ?? "";
        this.character.description = system.description ?? "";
        this.character.abilities = Array.isArray(system.abilities) ? system.abilities : [];
        this.character.resources = Array.isArray(system.resources) ? system.resources : [];
        this.character.saves = Array.isArray(system.saves) ? system.saves : [];
    }

    private trimTrailingEmptyDescription(html: string) {
        if (!html) return "";
        const container = document.createElement("div");
        container.innerHTML = html;

        const isEmptyElement = (el: Element) => {
            const hasMedia = el.querySelector("img, video, iframe, object, embed");
            if (hasMedia) return false;
            const text = el.textContent?.replace(/\u00a0/g, " ").trim() ?? "";
            if (text) return false;
            const children = Array.from(el.childNodes);
            return children.every((child) => {
                if (child.nodeType === Node.TEXT_NODE) {
                    return (child.textContent ?? "").trim() === "";
                }
                if (child.nodeType === Node.ELEMENT_NODE) {
                    return (child as Element).tagName === "BR" || isEmptyElement(child as Element);
                }
                return true;
            });
        };

        while (container.lastChild) {
            const node = container.lastChild;
            if (node.nodeType === Node.TEXT_NODE) {
                if ((node.textContent ?? "").trim() === "") {
                    node.remove();
                    continue;
                }
                break;
            }
            if (node.nodeType === Node.ELEMENT_NODE) {
                if (isEmptyElement(node as Element)) {
                    node.remove();
                    continue;
                }
            }
            break;
        }

        return container.innerHTML;
    }
}
