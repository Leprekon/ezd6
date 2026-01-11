export function renderResourceCounter(
    counter: HTMLElement,
    options: {
        title: string;
        iconPath: string;
        currentValue: number;
        maxValue: number;
        maxIcons?: number;
    }
) {
    const { title, iconPath } = options;
    const currentValue = Math.max(0, Math.floor(options.currentValue));
    const maxValue = Math.max(0, Math.floor(options.maxValue));
    const maxIcons = Math.max(1, Math.floor(options.maxIcons ?? 6));

    counter.innerHTML = "";
    counter.dataset.resourceName = title;

    const appendIcon = (faded: boolean) => {
        const img = document.createElement("img");
        img.className = faded ? "ezd6-resource-icon ezd6-resource-icon--faded" : "ezd6-resource-icon";
        img.src = iconPath;
        img.alt = `${title} icon`;
        img.draggable = false;
        counter.appendChild(img);
    };

    if (maxValue > 0) {
        const iconMode = !(currentValue > maxIcons || (currentValue === maxIcons && maxValue > maxIcons));
        if (!iconMode) {
            const count = document.createElement("span");
            count.className = "ezd6-resource-counter-number";
            count.textContent = `${currentValue} / ${maxValue}`;
            const img = document.createElement("img");
            img.className = "ezd6-resource-icon";
            img.src = iconPath;
            img.alt = `${title} icon`;
            img.draggable = false;
            counter.append(count, img);
            return;
        }

        const normalCount = Math.min(currentValue, maxIcons);
        for (let i = 0; i < normalCount; i++) appendIcon(false);
        const missing = Math.max(0, maxValue - currentValue);
        const fadedCount = Math.max(0, Math.min(maxIcons - normalCount, missing));
        for (let i = 0; i < fadedCount; i++) appendIcon(true);
        return;
    }

    if (currentValue <= 0) {
        appendIcon(true);
        return;
    }

    if (currentValue > maxIcons) {
        const count = document.createElement("span");
        count.className = "ezd6-resource-counter-number";
        count.textContent = String(currentValue);
        const img = document.createElement("img");
        img.className = "ezd6-resource-icon";
        img.src = iconPath;
        img.alt = `${title} icon`;
        img.draggable = false;
        counter.append(count, img);
        return;
    }

    for (let i = 0; i < Math.min(currentValue, maxIcons); i++) appendIcon(false);
}
