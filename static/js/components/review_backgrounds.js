window.initReviewBackgrounds = (appState, callbacks) => {
    const {
        renderPreview,
        renderReviewThumbnails,
        stripContainer,
        stripBackBtn,
        showToast = window.showToast,
        reviewToolbar,
        updatePreviewHighlights,
        renderPhotoAssignments,
        updateAddFinalizeButtons,
        reviewPalette // Get valid palette instance
    } = callbacks;


    const backgroundPanel = document.createElement('div');
    backgroundPanel.id = 'background-color-panel';
    backgroundPanel.className = 'strip-panel';
    backgroundPanel.dataset.panel = 'backgrounds';
    stripContainer.appendChild(backgroundPanel);

    let currentPhotoIndex = -1;
    let thresholdDebounceTimer = null;

    function resetBackground(photoIndex) {
        if (!appState.transformManager) return;
        appState.transformManager.setBackgroundRemoval(photoIndex, false);
        updateComposedImage(photoIndex);
        stripBackBtn.click();
    }

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
        /*
        backgroundPanel.appendChild(createSlider('오브젝트 감지 민감도 (FG)', 0, 250, fgVal, (val) => {
            updateBgSettings(photoIndex, { threshold: val });
        }));
        */

        // BG Threshold
        /*
        backgroundPanel.appendChild(createSlider('배경 노이즈 제거 (BG)', 0, 250, bgVal, (val) => {
            updateBgSettings(photoIndex, { bg_threshold: val });
        }));
        */

        // Erode Size
        /*
        backgroundPanel.appendChild(createSlider('가장자리 다듬기 (Erode)', 0, 50, erodeVal, (val) => {
            updateBgSettings(photoIndex, { erode_size: val });
        }));
        */

        // 2. Palette
        const paletteContainer = document.createElement('div');
        paletteContainer.id = 'bg-palette-container';

        // Render Shared Palette
        if (reviewPalette) {
            await reviewPalette.render(paletteContainer, async (hexColor) => {
                appState.transformManager.setBgReplacement(photoIndex, true, hexColor);
                await updateComposedImage(photoIndex);
            });
        } else {
            console.error("reviewPalette not passed to initReviewBackgrounds");
        }

        // Ensure enabled when interacting
        if (!transform.background.enabled) {
            // Check cache or fetch
            appState.transformManager.setBackgroundRemoval(photoIndex, true, {
                threshold: fgVal, bg_threshold: bgVal, erode_size: erodeVal
            });

            // Enforce White Background Default if not set
            if (!transform.background.replacementColor) {
                appState.transformManager.setBgReplacement(photoIndex, true, '#ffffff');
            }

            fetchAndApplyBackgroundRemoval(photoIndex); // Fetch initial if needed
        }

        // Palette Swatches
        backgroundPanel.appendChild(paletteContainer);
        backgroundPanel.classList.add('show');
        stripBackBtn.style.display = 'block';

        // Trigger button update to show Reset button
        if (callbacks.updateAddFinalizeButtons) {
            callbacks.updateAddFinalizeButtons();
        }

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

    function applyBackgroundsToPreview() { }

    return {
        showBackgroundPanel,
        resetBackground,
        applyBackgroundsToPreview // Keep for compatibility
    };
};
