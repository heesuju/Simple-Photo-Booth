window.initReviewBackgrounds = (appState, callbacks) => {
    const {
        renderPreview,
        renderReviewThumbnails,
        stripContainer,
        stripBackBtn,
        genericAddBtn,
        finalizeBtn,
        showToast,
        reviewToolbar,
        updatePreviewHighlights
    } = callbacks;

    // State Initialization
    appState.backgroundColors = appState.backgroundColors || new Array(appState.capturedPhotos.length).fill(null);
    appState.bgRemovalThresholds = appState.bgRemovalThresholds || new Array(appState.capturedPhotos.length).fill(0);
    appState.isBgReplaced = appState.isBgReplaced || new Array(appState.capturedPhotos.length).fill(false);

    // Cache for raw BG removed blobs
    // Key: `${photoIndex}-${fg}-${bg}-${erode}` -> Blob
    appState.rawBgRemovedBlobs = appState.rawBgRemovedBlobs || {};

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
        backgroundPanel.appendChild(createSlider(
            '오브젝트 감지 민감도 (FG)', 0, 250,
            appState.bgRemovalThresholds[photoIndex] || 240,
            (val) => {
                appState.bgRemovalThresholds[photoIndex] = val;
                triggerDebouncedUpdate(photoIndex);
            }
        ));

        // BG Threshold
        backgroundPanel.appendChild(createSlider(
            '배경 노이즈 제거 (BG)', 0, 250,
            appState.bgRemovalBgThresholds[photoIndex] || 10,
            (val) => {
                appState.bgRemovalBgThresholds[photoIndex] = val;
                triggerDebouncedUpdate(photoIndex);
            }
        ));

        // Erode Size
        backgroundPanel.appendChild(createSlider(
            '가장자리 다듬기 (Erode)', 0, 50,
            appState.bgRemovalErodeSizes[photoIndex] || 10,
            (val) => {
                appState.bgRemovalErodeSizes[photoIndex] = val;
                triggerDebouncedUpdate(photoIndex);
            }
        ));

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
        toggleInput.checked = !!appState.isBgReplaced[photoIndex]; // Use state
        // If color is set, assume toggle is on? Or explicit state?
        // Let's rely on explicit state, but sync if color implies it.
        // Actually, "Toggle" might just mean "Show Colors". 
        // If toggle ON, we use selected color. If OFF, we use Transparent.

        const toggleLabel = document.createElement('label');
        toggleLabel.htmlFor = 'bg-replace-toggle';
        toggleLabel.textContent = '배경 색상 변경';

        toggleContainer.appendChild(toggleInput);
        toggleContainer.appendChild(toggleLabel);
        backgroundPanel.appendChild(toggleContainer);

        // 3. Collapsible Palette
        const paletteContainer = document.createElement('div');
        paletteContainer.id = 'bg-palette-container';
        paletteContainer.style.display = toggleInput.checked ? 'flex' : 'none'; // Flex for wrapping
        paletteContainer.style.flexWrap = 'wrap';
        paletteContainer.style.gap = '10px';
        paletteContainer.style.marginTop = '10px';
        paletteContainer.style.overflowY = 'auto'; // ensure scroll if needed

        toggleInput.addEventListener('change', (e) => {
            appState.isBgReplaced[photoIndex] = e.target.checked;
            paletteContainer.style.display = e.target.checked ? 'flex' : 'none';
            // Wait, if we toggle ON, we should probably select a default color if none is selected?
            // If OFF, we effectively treat color as "transparent" or null
            applyBackgroundsToPreview();
        });

        // Add "Transparent/Reset" (Original) option logic?
        // Actually, if we just want "Original Photo" (No BG removal at all), that's different.
        // But tool is "Remove Background".
        // Let's assume opening the tool enables BG removal (transparent).
        // If I want to revert to original photo logic, maybe a "Reset" button?
        // User asked for "Remove Background" option for a photo.
        // If they assume "None" restored original, we should keep that behavior.
        // But if palette is hidden, how do they select "None"?
        // Maybe "Toggle OFF" means "Use Transparent BG".
        // Where is "Don't Remove Background"?
        // Let's parse user request: "remove background option... slider... color palettes shown only when replace toggled"
        // This suggests: 
        // 1. Tool always removes background (using threshold). 
        // 2. Toggle controls *Replacement* (filling with color).
        // 3. What stops removal? Maybe a "Restore Original" button at the top?

        // Let's add "Restore Original" button separately.
        const restoreBtn = document.createElement('button');
        restoreBtn.textContent = '원본 복구';
        restoreBtn.style.padding = '5px 10px';
        restoreBtn.style.marginBottom = '10px';
        restoreBtn.onclick = () => {
            // Disable removal for this photo?
            // We can signal this by setting threshold to -1? Or just a separate state?
            // Or we just clear `rawBgRemovedBlobs` and set a flag.
            // But simpler: just set color to null and maybe we need an explicit "isBgRemoved" flag per photo.
            // We don't have that yet, relying on color presence or tool usage.
            // If we want "Original", we should probably clear the `appState.rawBgRemovedBlobs` cache usage for this index.
            // But `applyBackgroundsToPreview` checks `rawBgRemovedBlobs`.
            // We need a way to say "Do not apply".
            // Let's assume `appState.bgRemovalActive[i]`?
            // For now, let's keep it simple: Start removal on slider move or toggle?
            // Or manual "Remove" button?
            // User said "appear when clicking remove background option".
            // So entering this panel implies removal.
        };
        // backgroundPanel.appendChild(restoreBtn); 
        // Actually, let's assume if threshold is 0 and toggle is off, it's just removed transparently.
        // If they want original, maybe they click "Original" in palette if visible?
        // But palette is hidden.
        // Let's add a "None" swatch equivalent or "Original" button inside palette?
        // If toggle is "Replace Color", implies "Fill". 
        // Let's just enforce: Tool Open = Removed BG (Transparent). Toggle + Color = Colored.

        // How to revert to fully original? 
        // Maybe the "Threshold" slider could have an "Off" state?
        // Or we assume they use "Undo" or we provide a clear "Revert" button.
        // Let's add a "Restore Original" button at the very top.
        const revertBtn = document.createElement('button');
        revertBtn.className = 'style-strip-item'; // repurpose style
        revertBtn.style.width = '100%';
        revertBtn.style.textAlign = 'center';
        revertBtn.textContent = '원본 사진 사용 (배경 제거 취소)';
        revertBtn.onclick = () => {
            // We need to implement a way to "turn off" bg removal.
            // Currently `applyBackgroundsToPreview` uses `rawBgRemovedBlobs`.
            // If we delete the blob from cache, it tries to fetch it again?
            // We need an explicit `appState.bgRemovalEnabled` array.
            appState.bgRemovalEnabled = appState.bgRemovalEnabled || [];
            appState.bgRemovalEnabled[photoIndex] = false;
            applyBackgroundsToPreview();
            // Also update UI?
            stripBackBtn.click(); // Close panel?
        };
        backgroundPanel.appendChild(revertBtn);

        // Ensure enabled when interacting
        if (!appState.bgRemovalEnabled) appState.bgRemovalEnabled = [];
        // If we are showing the panel, maybe we shouldn't auto-enable until they touch something?
        // OR if they clicked the wand, they probably want to edit.
        // Let's auto-enable if not already enabled.
        if (!appState.bgRemovalEnabled[photoIndex]) {
            appState.bgRemovalEnabled[photoIndex] = true;
            fetchAndApplyBackgroundRemoval(photoIndex);
        }

        // Palette Swatches
        try {
            const r = await fetch('/colors');
            const colors = await r.json();

            // "Transparent" option (Clear color)?
            const clearOption = document.createElement('div');
            clearOption.className = 'palette-swatch';
            clearOption.style.backgroundColor = '#ddd';
            clearOption.style.backgroundImage = 'radial-gradient(#aaa 1px, transparent 1px)';
            clearOption.style.backgroundSize = '5px 5px';
            clearOption.title = 'Transparent (No Fill)';
            clearOption.addEventListener('click', () => {
                appState.backgroundColors[currentPhotoIndex] = null;
                applyBackgroundsToPreview();
            });
            paletteContainer.appendChild(clearOption);

            colors.forEach(colorObj => {
                const swatch = document.createElement('div');
                swatch.className = 'palette-swatch';
                swatch.style.backgroundColor = colorObj.hex_code;
                swatch.addEventListener('click', () => {
                    appState.backgroundColors[currentPhotoIndex] = colorObj.hex_code;
                    applyBackgroundsToPreview();
                });
                paletteContainer.appendChild(swatch);
            });
        } catch (e) {
            console.error("Failed to load colors:", e);
        }

        backgroundPanel.appendChild(paletteContainer);

        backgroundPanel.classList.add('show');
        stripBackBtn.style.display = 'block';
        genericAddBtn.style.display = 'none';
        finalizeBtn.style.display = 'none';
    }

    function triggerDebouncedUpdate(index) {
        if (thresholdDebounceTimer) clearTimeout(thresholdDebounceTimer);
        thresholdDebounceTimer = setTimeout(() => {
            fetchAndApplyBackgroundRemoval(index);
        }, 300);
    }

    async function fetchAndApplyBackgroundRemoval(index) {
        if (!appState.bgRemovalEnabled || !appState.bgRemovalEnabled[index]) return;

        const fg = appState.bgRemovalThresholds[index] || 240;
        const bg = appState.bgRemovalBgThresholds[index] || 10;
        const erode = appState.bgRemovalErodeSizes[index] || 10;

        const cacheKey = `${index}-${fg}-${bg}-${erode}`;

        // Check cache (using refined key)
        if (appState.rawBgRemovedBlobs[cacheKey]) {
            appState.currentBgRemovedBlobKey = appState.currentBgRemovedBlobKey || [];
            appState.currentBgRemovedBlobKey[index] = cacheKey;

            // Highlight selected photo even on cache hit for consistent UX
            appState.selectedForStylizing = [index];
            if (updatePreviewHighlights) updatePreviewHighlights();

            applyBackgroundsToPreview();
            return;
        }

        try {
            if (showToast) showToast('Removing background...', 'info');

            // Set loading state and highlight
            appState.loadingPhotos = appState.loadingPhotos || new Set();
            appState.loadingPhotos.add(index);
            appState.selectedForStylizing = [index];

            // Update UI to show loading spinner (via renderPreview -> renderPhotoAssignments)
            // and highlight (via updatePreviewHighlights)
            renderPreview();

            const currentBlob = appState.capturedPhotos[index];
            const formData = new FormData();
            formData.append('file', currentBlob);
            formData.append('threshold', fg);
            formData.append('bg_threshold', bg);
            formData.append('erode_size', erode);

            const res = await fetch('/remove_background', { method: 'POST', body: formData });
            if (!res.ok) throw new Error('Failed to remove background');

            const blob = await res.blob();
            appState.rawBgRemovedBlobs[cacheKey] = blob;
            appState.currentBgRemovedBlobKey = appState.currentBgRemovedBlobKey || [];
            appState.currentBgRemovedBlobKey[index] = cacheKey;

            applyBackgroundsToPreview();

        } catch (e) {
            console.error(e);
            if (showToast) showToast('Failed to remove background', 'error');
        } finally {
            // Clear loading state
            if (appState.loadingPhotos) {
                appState.loadingPhotos.delete(index);
            }
            renderPreview();
        }
    }

    function applyBackgroundsToPreview() {
        appState.photoAssignments.forEach((assignedBlob, hIdx) => {
            const pIdx = appState.capturedPhotos.indexOf(assignedBlob);
            if (pIdx === -1) return;

            const wrappers = document.querySelectorAll('.preview-photo-wrapper');
            const wrapper = wrappers[hIdx];
            if (!wrapper) return;

            const img = wrapper.querySelector('.preview-photo-img');

            // Logic:
            // 1. If bgRemovalEnabled[pIdx] is false (or undefined), use original.
            // 2. If enabled, use rawBgRemovedBlobs[currentKey].
            // 3. If isBgReplaced[pIdx] is true AND backgroundColors[pIdx] is set, use color.

            const isEnabled = appState.bgRemovalEnabled && appState.bgRemovalEnabled[pIdx];

            if (isEnabled) {
                const cacheKey = appState.currentBgRemovedBlobKey ? appState.currentBgRemovedBlobKey[pIdx] : null;
                const blob = cacheKey ? appState.rawBgRemovedBlobs[cacheKey] : null;

                if (blob) {
                    const url = URL.createObjectURL(blob);
                    if (img.src !== url) img.src = url;

                    // Color logic
                    if (appState.isBgReplaced && appState.isBgReplaced[pIdx] && appState.backgroundColors[pIdx]) {
                        wrapper.style.backgroundColor = appState.backgroundColors[pIdx];
                    } else {
                        wrapper.style.backgroundColor = 'transparent';
                    }
                } else {
                    // Fallback if processing or not ready? 
                    // Keep original or loading? (Ideally loading, but original for now)
                }
            } else {
                // Restore Original
                const originalUrl = URL.createObjectURL(appState.capturedPhotos[pIdx]);
                if (img.src !== originalUrl) img.src = originalUrl;
                wrapper.style.backgroundColor = 'transparent';
            }
        });
    }

    return {
        showBackgroundPanel,
        applyBackgroundsToPreview
    };
};
