window.initReviewBackgrounds = (appState, callbacks) => {
    const {
        renderPreview,
        renderReviewThumbnails,
        stripContainer,
        stripBackBtn,
        showToast = window.showToast,
        reviewToolbar,
        updatePreviewHighlights,
        renderPhotoAssignments
    } = callbacks;

    // Use transformManager instead of local arrays

    // ... cache for rawBgRemovedBlobs is now inside transformManager ...

    const backgroundPanel = document.createElement('div');
    backgroundPanel.id = 'background-color-panel';
    backgroundPanel.className = 'strip-panel';
    backgroundPanel.dataset.panel = 'backgrounds';
    stripContainer.appendChild(backgroundPanel);

    let currentPhotoIndex = -1;
    let thresholdDebounceTimer = null;

    async function showBackgroundPanel(photoIndex) {
        currentPhotoIndex = photoIndex;
        backgroundPanel.innerHTML = '';

        stripContainer.querySelectorAll('.strip-panel').forEach(p => p.classList.remove('show'));

        if (!appState.transformManager) {
            console.error("Transform Manager not initialized");
            return;
        }

        const transform = appState.transformManager.getTransform(photoIndex) || { background: { settings: {} } };
        const bgSettings = transform.background.settings || {};

        // Defaults
        const fgVal = bgSettings.threshold !== undefined ? bgSettings.threshold : 240;
        const bgVal = bgSettings.bg_threshold !== undefined ? bgSettings.bg_threshold : 10;
        const erodeVal = bgSettings.erode_size !== undefined ? bgSettings.erode_size : 10;

        // 1. Threshold Controls
        function createSlider(label, min, max, value, onChange) {
            const container = document.createElement('div');
            container.className = 'filter-slider';
            const labelEl = document.createElement('label');
            labelEl.textContent = `${label}: ${value}`;
            const input = document.createElement('input');
            input.type = 'range';
            input.min = min;
            input.max = max;
            input.value = value;
            input.addEventListener('input', (e) => {
                const val = parseInt(e.target.value);
                labelEl.textContent = `${label}: ${val}`;
                onChange(val);
            });
            container.appendChild(labelEl);
            container.appendChild(input);
            return container;
        }

        // FG Threshold
        backgroundPanel.appendChild(createSlider('오브젝트 감지 민감도 (FG)', 0, 250, fgVal, (val) => {
            updateBgSettings(photoIndex, { threshold: val });
        }));

        // BG Threshold
        backgroundPanel.appendChild(createSlider('배경 노이즈 제거 (BG)', 0, 250, bgVal, (val) => {
            updateBgSettings(photoIndex, { bg_threshold: val });
        }));

        // Erode Size
        backgroundPanel.appendChild(createSlider('가장자리 다듬기 (Erode)', 0, 50, erodeVal, (val) => {
            updateBgSettings(photoIndex, { erode_size: val });
        }));

        // 2. Replace Background Toggle
        const toggleContainer = document.createElement('div');
        toggleContainer.style.display = 'flex';
        toggleContainer.style.alignItems = 'center';
        toggleContainer.style.marginTop = '15px';
        toggleContainer.style.marginBottom = '10px';
        toggleContainer.style.gap = '10px';

        const toggleInput = document.createElement('input');
        toggleInput.type = 'checkbox';
        toggleInput.id = 'bg-replace-toggle';
        toggleInput.checked = transform.background.replaced; // Use manager state

        const toggleLabel = document.createElement('label');
        toggleLabel.htmlFor = 'bg-replace-toggle';
        toggleLabel.textContent = '배경 색상 변경';

        toggleContainer.appendChild(toggleInput);
        toggleContainer.appendChild(toggleLabel);
        backgroundPanel.appendChild(toggleContainer);

        // 3. Collapsible Palette
        const paletteContainer = document.createElement('div');
        paletteContainer.id = 'bg-palette-container';
        paletteContainer.style.display = toggleInput.checked ? 'flex' : 'none';
        paletteContainer.style.flexWrap = 'wrap';
        paletteContainer.style.gap = '10px';
        paletteContainer.style.marginTop = '10px';
        paletteContainer.style.overflowY = 'auto';

        toggleInput.addEventListener('change', async (e) => {
            const replaced = e.target.checked;
            paletteContainer.style.display = replaced ? 'flex' : 'none';
            // Update manager
            appState.transformManager.setBgReplacement(photoIndex, replaced, transform.background.replacementColor);
            await updateComposedImage(photoIndex);
        });

        // "Restore Original" button
        const revertBtn = document.createElement('button');
        revertBtn.className = 'style-strip-item';
        revertBtn.style.width = '100%';
        revertBtn.style.textAlign = 'center';
        revertBtn.textContent = '원본 사진 사용 (배경 제거 취소)';
        revertBtn.onclick = async () => {
            // Disable BG removal logic
            appState.transformManager.setBackgroundRemoval(photoIndex, false);
            await updateComposedImage(photoIndex);
            stripBackBtn.click();
        };
        backgroundPanel.appendChild(revertBtn);

        // Ensure enabled when interacting
        if (!transform.background.enabled) {
            // Check cache or fetch
            // If we enable, we must ensure we have the blob.
            // If cache exists, set enabled=true. Else fetch.
            // Manager doesn't auto-fetch.
            appState.transformManager.setBackgroundRemoval(photoIndex, true, {
                threshold: fgVal, bg_threshold: bgVal, erode_size: erodeVal
            });
            fetchAndApplyBackgroundRemoval(photoIndex); // Fetch initial if needed
        }

        // Palette Swatches
        backgroundPanel.appendChild(paletteContainer);
        backgroundPanel.classList.add('show');
        stripBackBtn.style.display = 'block';

        // Ensure highlight
        appState.selectedForStylizing = [photoIndex];
        if (updatePreviewHighlights) updatePreviewHighlights();

        // Load Colors Asynchronously
        (async () => {
            try {
                const r = await fetch('/colors');
                const colors = await r.json();

                // Transparent Option
                const clearOption = document.createElement('div');
                clearOption.className = 'palette-swatch';
                clearOption.style.backgroundColor = '#ddd';
                clearOption.style.backgroundImage = 'radial-gradient(#aaa 1px, transparent 1px)';
                clearOption.style.backgroundSize = '5px 5px';
                clearOption.title = 'Transparent (No Fill)';
                clearOption.addEventListener('click', async () => {
                    appState.transformManager.setBgReplacement(photoIndex, true, null);
                    await updateComposedImage(photoIndex);
                });
                paletteContainer.appendChild(clearOption);

                colors.forEach(colorObj => {
                    const swatch = document.createElement('div');
                    swatch.className = 'palette-swatch';
                    swatch.style.backgroundColor = colorObj.hex_code;
                    swatch.addEventListener('click', async () => {
                        appState.transformManager.setBgReplacement(photoIndex, true, colorObj.hex_code);
                        await updateComposedImage(photoIndex);
                    });
                    paletteContainer.appendChild(swatch);
                });
            } catch (e) {
                console.error("Failed to load colors:", e);
            }
        })();

        // Ensure highlight
        appState.selectedForStylizing = [photoIndex];
        if (updatePreviewHighlights) updatePreviewHighlights();
    }

    function updateBgSettings(index, newSettings) {
        if (thresholdDebounceTimer) clearTimeout(thresholdDebounceTimer);

        // Merge settings
        const t = appState.transformManager.getTransform(index);
        const currentSettings = t.background.settings || {};
        const merged = { ...currentSettings, ...newSettings };

        // Update manager settings immediately
        appState.transformManager.setBackgroundRemoval(index, true, merged);

        thresholdDebounceTimer = setTimeout(() => {
            fetchAndApplyBackgroundRemoval(index);
        }, 300);
    }

    async function fetchAndApplyBackgroundRemoval(index) {
        const t = appState.transformManager.getTransform(index);
        if (!t.background.enabled) return;

        const settings = t.background.settings;
        const cacheKey = `${index}-${settings.threshold}-${settings.bg_threshold}-${settings.erode_size}`;

        // Check cache in manager? Manager handles cache internally by key?
        // No, manager has `bgRemovedBlob` in `caches[index]`.
        // But if settings change, we need a new blob.
        // Manager's cache is currently simplified: just `bgRemovedBlob`.
        // It doesn't track *which* settings produced it in the cache object itself,
        // but `review_backgrounds.js` previously used a cacheKey logic.
        // We really should check if the blob needs update.
        // For now, we always fetch if settings change (debounced).
        // If we want to use the old "rawBgRemovedBlobs" cache to avoid re-fetching same settings, 
        // we can implement a local cache here if desired, or rely on browser cache? 
        // Browser won't cache POST.

        // Let's implement a small local cache map for blobs to improve performance
        // or just let manager hold the current one.
        // Re-fetching on slider drag (debounced) is standard.

        try {
            if (showToast) showToast('Removing background...', 'info');
            appState.loadingPhotos.add(index);
            renderPreview();

            // Use CURRENTLY composed blob as input? NO, use BASE blob (Original or Stylized).
            // Manager.getBaseBlob(index)
            const baseBlob = appState.transformManager.getBaseBlob(index);

            const formData = new FormData();
            formData.append('file', baseBlob);
            formData.append('threshold', settings.threshold);
            formData.append('bg_threshold', settings.bg_threshold);
            formData.append('erode_size', settings.erode_size);

            const res = await fetch('/remove_background', { method: 'POST', body: formData });
            if (!res.ok) throw new Error('Failed to remove background');

            const blob = await res.blob();

            // Set into manager
            appState.transformManager.setBgRemovedBlob(index, blob);

            await updateComposedImage(index);

        } catch (e) {
            console.error(e);
            if (showToast) showToast('Failed to remove background', 'error');
        } finally {
            if (appState.loadingPhotos) appState.loadingPhotos.delete(index);
            renderPreview();
        }
    }

    async function updateComposedImage(index) {
        const composedBlob = await appState.transformManager.compose(index);

        const oldBlob = appState.capturedPhotos[index];
        appState.capturedPhotos[index] = composedBlob;

        // Update Assignments
        for (let k = 0; k < appState.photoAssignments.length; k++) {
            if (appState.photoAssignments[k] === oldBlob) {
                appState.photoAssignments[k] = composedBlob;
            }
        }

        renderPreview();
    }

    // applyBackgroundsToPreview is NO LONGER NEEDED because we update the blob directly with baked BG stuff.
    // We keep empty function to satisfy interface if any
    function applyBackgroundsToPreview() { }

    return {
        showBackgroundPanel,
        applyBackgroundsToPreview // Keep for compatibility
    };
};
