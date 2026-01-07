export const getDescriptionEditor = (sheet: any, wrap: HTMLElement | null) => {
    if (!wrap) return null;
    const textarea = wrap.querySelector("textarea[name='system.description']") as HTMLTextAreaElement | null;
    const content = wrap.querySelector(".editor-content") as HTMLElement | null;
    const win = window as any;
    const tinymce = win?.tinymce;
    let editor = sheet?.editors?.["system.description"]?.editor ?? null;
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
};
