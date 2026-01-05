window.initReviewPalette = (appState) => {
    let cachedColors = null;

    async function loadColors() {
        if (cachedColors) return cachedColors;
        try {
            const r = await fetch('/colors');
            cachedColors = await r.json();
            return cachedColors;
        } catch (e) {
            console.error("Failed to load colors:", e);
            return [];
        }
    }

    async function render(container, onColorSelected) {
        container.innerHTML = '';

        // Ensure Grid Layout (applied via CSS class or inline if needed, 
        // but review_screen.css already has #bg-palette-container styles/classes if we reuse them.
        // Let's ensure consistency by adding a common class if possible, or just setting style here to be safe)
        // Ensure Flow Layout (Wrapping)
        container.style.display = 'flex';
        container.style.flexWrap = 'wrap';
        container.style.alignContent = 'flex-start'; // Align rows to top
        container.style.gap = '10px';
        container.style.overflowY = 'auto'; // Vertical scroll
        container.style.overflowX = 'hidden';
        container.style.height = '100%';
        // Add padding to container to avoid clipping
        container.style.padding = '10px';

        // 1. Add "+" Button
        const addColorBtn = document.createElement('div');
        addColorBtn.className = 'palette-add-btn';
        addColorBtn.textContent = '+';
        addColorBtn.addEventListener('click', () => {
            if (!window._reviewColorPicker) {
                window._reviewColorPicker = window.initColorPicker(appState);
            }
            window._reviewColorPicker.show().then(async result => {
                if (result) {
                    // Immediate update logic:
                    // If the color was saved (result.saved), we should re-fetch or append it.
                    // For now, let's just trigger selection.
                    // If we want to show it in the list immediately, we can fake-append it or re-render.

                    if (result.saved) {
                        // clear cache so next render fetches new colors
                        cachedColors = null;
                        // Re-render to show new color
                        await render(container, onColorSelected);
                    }

                    if (onColorSelected) {
                        onColorSelected(result.color);
                    }
                }
            });
        });
        container.appendChild(addColorBtn);

        // 2. Load and Render Swatches
        const colors = await loadColors();
        colors.forEach(colorObj => {
            const swatch = document.createElement('div');
            swatch.className = 'palette-swatch';
            swatch.style.backgroundColor = colorObj.hex_code;
            swatch.addEventListener('click', () => {
                if (onColorSelected) {
                    onColorSelected(colorObj.hex_code);
                }
            });
            container.appendChild(swatch);
        });

        // 3. Mouse Wheel Scroll (for desktop/horizontal) - REMOVED for Flow Layout
        // container.addEventListener('wheel', (e) => { ... });
    }

    return {
        render
    };
};
