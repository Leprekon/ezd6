const ESCAPE_MAP: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch] || ch);

const applyInline = (value: string) => {
    let next = value;
    next = next.replace(/__([^_]+)__/g, "<u>$1</u>");
    next = next.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    next = next.replace(/_([^_]+)_/g, "<em>$1</em>");
    next = next.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    return next;
};

export const renderMarkdown = (value: string | null | undefined): string => {
    const raw = typeof value === "string" ? value : "";
    const normalized = raw.replace(/\r\n/g, "\n");
    if (!normalized.trim()) return "";

    const lines = normalized.split("\n");
    const listItems: string[] = [];
    let output = "";

    const flushList = () => {
        if (!listItems.length) return;
        if (output) output += "<br>";
        output += `<ul>${listItems.map((item) => `<li>${item}</li>`).join("")}</ul>`;
        listItems.length = 0;
    };

    lines.forEach((line) => {
        const match = line.match(/^\s*[-*+]\s+(.+)$/);
        if (match) {
            listItems.push(applyInline(escapeHtml(match[1])));
            return;
        }

        flushList();
        const trimmed = line.trim();
        if (!trimmed) {
            if (output && !output.endsWith("<br>")) output += "<br>";
            return;
        }
        const formatted = applyInline(escapeHtml(line));
        if (output) output += "<br>";
        output += formatted;
    });

    flushList();
    return output;
};
