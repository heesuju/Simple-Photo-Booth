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
        toggleInput.checked = !!appState.isBgReplaced[photoIndex];


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
            applyBackgroundsToPreview();
        });

        // "Restore Original" button
        const revertBtn = document.createElement('button');
        revertBtn.className = 'style-strip-item'; // repurpose style
        revertBtn.style.width = '100%';
        revertBtn.style.textAlign = 'center';
        revertBtn.textContent = '원본 사진 사용 (배경 제거 취소)';
        revertBtn.onclick = () => {
            appState.bgRemovalEnabled = appState.bgRemovalEnabled || [];
            appState.bgRemovalEnabled[photoIndex] = false;
            applyBackgroundsToPreview();
            stripBackBtn.click(); // Close panel?
        };
        backgroundPanel.appendChild(revertBtn);

        // Ensure enabled when interacting
        if (!appState.bgRemovalEnabled) appState.bgRemovalEnabled = [];
        if (!appState.bgRemovalEnabled[photoIndex]) {
            appState.bgRemovalEnabled[photoIndex] = true;
            fetchAndApplyBackgroundRemoval(photoIndex);
        }

        // Palette Swatches
        try {
            const r = await fetch('/colors');
            const colors = await r.json();

            // "Transparent" option (Clear color)
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
                    // Fallback (e.g., if processing)
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
