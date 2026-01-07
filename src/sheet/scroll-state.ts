export type ScrollState = Array<{ el: HTMLElement; top: number }>;

export const captureScrollState = (root: HTMLElement | null): ScrollState => {
    if (!root) return [];
    const candidates = new Set<HTMLElement>();
    const selectors = [".window-content", ".sheet-body", ".ezd6-sheet-root", ".ezd6-sheet"];
    selectors.forEach((selector) => {
        root.querySelectorAll(selector).forEach((el) => candidates.add(el as HTMLElement));
    });
    root.querySelectorAll("*").forEach((el) => {
        const node = el as HTMLElement;
        if (node.scrollTop > 0) candidates.add(node);
    });
    return Array.from(candidates)
        .filter((el) => {
            const style = getComputedStyle(el);
            const overflowY = style.overflowY;
            return overflowY === "auto"
                || overflowY === "scroll"
                || el.scrollTop > 0
                || el.scrollHeight > el.clientHeight;
        })
        .map((el) => ({ el, top: el.scrollTop }));
};

export const restoreScrollState = (targets: ScrollState) => {
    if (!targets.length) return;
    const apply = () => {
        targets.forEach(({ el, top }) => {
            el.scrollTop = top;
        });
    };
    requestAnimationFrame(() => {
        apply();
        setTimeout(apply, 50);
    });
};
