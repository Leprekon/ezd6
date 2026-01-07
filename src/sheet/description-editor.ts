type DescriptionEditorGetter = (wrap: HTMLElement | null) => any;

export class DescriptionEditorController {
    private descObserver: MutationObserver | null = null;
    private actor: any = null;

    constructor(private readonly getEditor: DescriptionEditorGetter) {}

    bind(html: any, actor: any) {
        this.actor = actor ?? null;
        this.syncDescriptionView(html, actor);
        this.wireEditControls(html);
        setTimeout(() => this.applyDescriptionEditorPadding(html), 0);
        this.observeDescriptionEditor(html);
    }

    disconnect() {
        if (this.descObserver) {
            this.descObserver.disconnect();
            this.descObserver = null;
        }
        this.actor = null;
    }

    syncDescriptionView(html: any, actor: any) {
        const view = html[0]?.querySelector?.(".ezd6-description-view") as HTMLElement | null;
        if (!view) return;
        const value = actor?.system?.description ?? "";
        view.innerHTML = this.trimTrailingEmptyDescription(value);
        view.classList.toggle("ezd6-description-view--empty", !value);
    }

    scheduleMarkDescriptionDirty(wrap: HTMLElement | null) {
        if (!wrap || wrap.dataset.ezd6DescDirty === "1") return;
        let attempts = 0;
        const tryMark = () => {
            attempts += 1;
            if (this.markDescriptionDirty(wrap) || attempts >= 40) return;
            setTimeout(tryMark, 100);
        };
        tryMark();
    }

    scheduleEnableDescriptionSave(wrap: HTMLElement | null) {
        if (!wrap) return;
        let attempts = 0;
        const tryEnable = () => {
            attempts += 1;
            if (this.enableDescriptionSave(wrap) || attempts >= 40) return;
            setTimeout(tryEnable, 100);
        };
        tryEnable();
    }

    ensureDescriptionEditorPadding(html: any) {
        const wrap = html[0]?.querySelector?.(".ezd6-description-wrap") as HTMLElement | null;
        if (wrap && !wrap.dataset.ezd6DescPadHook) {
            const editor = this.getEditor(wrap);
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

    private wireEditControls(html: any) {
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
                setTimeout(() => this.syncDescriptionView(html, this.actor), 0);
            });
        }
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
        const editor = this.getEditor(wrap);
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
