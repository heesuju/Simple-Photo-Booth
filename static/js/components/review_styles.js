window.initReviewStyles = (appState, callbacks) => {
    const {
        renderPreview,
        renderReviewThumbnails,
        updatePreviewHighlights,
        updateAddFinalizeButtons,
        panelHistory,
        showToast = window.showToast,
        clearSelections,
        renderPhotoAssignments
    } = callbacks;

    // DOM Elements
    const styleStripPanel = document.getElementById('style-strip-panel');
    const addStyleModal = document.getElementById('add-style-modal');
    const addStyleConfirmBtn = document.getElementById('add-style-confirm-btn');
    const addStyleCancelBtn = document.getElementById('add-style-cancel-btn');
    const newStyleNameInput = document.getElementById('new-style-name');
    const newStylePromptInput = document.getElementById('new-style-prompt');
    const editStyleModal = document.getElementById('edit-style-modal');
    const editStyleConfirmBtn = document.getElementById('edit-style-confirm-btn');
    const editStyleCancelBtn = document.getElementById('edit-style-cancel-btn');
    const editStyleIdInput = document.getElementById('edit-style-id');
    const editStyleNameInput = document.getElementById('edit-style-name');
    const editStylePromptInput = document.getElementById('edit-style-prompt');

    // Attach Event Listeners
    addStyleCancelBtn.addEventListener('click', () => {
        addStyleModal.className = 'modal-hidden';
    });

    addStyleConfirmBtn.addEventListener('click', async () => {
        const newName = newStyleNameInput.value;
        const newPrompt = newStylePromptInput.value;
        if (!newName || !newPrompt) {
            alert('Please enter a style name and prompt.');
            return;
        }
        try {
            await fetch('/add_style', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName, prompt: newPrompt })
            });
            addStyleModal.className = 'modal-hidden';
            newStyleNameInput.value = '';
            newStylePromptInput.value = '';
            loadStylesStrip();
        } catch (e) {
            console.error("Failed to save style:", e);
        }
    });

    editStyleConfirmBtn.addEventListener('click', () => {
        const styleId = editStyleIdInput.value;
        const name = editStyleNameInput.value;
        const prompt = editStylePromptInput.value;
        updateStyle(styleId, name, prompt);
    });

    editStyleCancelBtn.addEventListener('click', () => {
        editStyleModal.className = 'modal-hidden';
    });


    async function updateStyle(styleId, name, prompt) {
        try {
            await fetch(`/styles/${styleId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, prompt })
            });
            editStyleModal.className = 'modal-hidden';
            loadStylesStrip();
        } catch (e) {
            console.error("Failed to update style:", e);
        }
    }

    async function loadStylesStrip() {
        try {
            const response = await fetch('/styles');
            const styles = await response.json();
            styleStripPanel.innerHTML = '';

            // Add button
            const addStyleContainer = document.createElement('div');
            addStyleContainer.className = 'style-item';
            const addStyleBtn = document.createElement('button');
            addStyleBtn.className = 'style-strip-item add-style-btn';
            addStyleBtn.textContent = '+';
            addStyleBtn.title = 'Add New Style';
            addStyleBtn.addEventListener('click', () => {
                addStyleModal.className = 'modal-visible';
            });
            addStyleContainer.appendChild(addStyleBtn);
            styleStripPanel.appendChild(addStyleContainer);

            styles.forEach(style => {
                const container = document.createElement('div');
                container.className = 'style-item';

                const styleItem = document.createElement('button');
                styleItem.className = 'style-strip-item';
                styleItem.textContent = style.name;

                // Check if this style is currently applied to any selected photos
                // Using TransformManager
                const isApplied = appState.selectedForStylizing && appState.selectedForStylizing.some(pIdx => {
                    if (appState.transformManager) {
                        const t = appState.transformManager.getTransform(pIdx);
                        return t && t.base.type === 'stylized' && t.base.stylePrompt === style.prompt;
                    }
                    return false;
                });

                if (isApplied) {
                    styleItem.classList.add('selected');
                }

                styleItem.addEventListener('click', () => applyStyle(style.prompt, style.id));

                const menuButton = document.createElement('button');
                menuButton.className = 'style-menu-button';
                menuButton.innerHTML = '⋮';
                menuButton.title = 'Options';

                const dropdown = document.createElement('div');
                dropdown.className = 'style-menu-dropdown';

                const editOption = document.createElement('button');
                editOption.className = 'style-menu-option';
                editOption.innerHTML = '<span>✏️</span><span>Edit</span>';
                editOption.addEventListener('click', (e) => {
                    e.stopPropagation();
                    dropdown.classList.remove('show');
                    openEditStyleModal(style);
                });

                const retryOption = document.createElement('button');
                retryOption.className = 'style-menu-option';
                retryOption.innerHTML = '<span>🔄</span><span>Retry</span>';
                retryOption.addEventListener('click', (e) => {
                    e.stopPropagation();
                    dropdown.classList.remove('show');
                    retryStyle(style.prompt, style.id);
                });

                const removeOption = document.createElement('button');
                removeOption.className = 'style-menu-option';
                removeOption.innerHTML = '<span>🗑️</span><span>Remove</span>';
                removeOption.addEventListener('click', (e) => {
                    e.stopPropagation();
                    dropdown.classList.remove('show');
                    removeStyle(style.id);
                });

                dropdown.appendChild(editOption);
                dropdown.appendChild(retryOption);
                dropdown.appendChild(removeOption);

                menuButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    document.querySelectorAll('.style-menu-dropdown.show').forEach(d => {
                        if (d !== dropdown) d.classList.remove('show');
                    });
                    dropdown.classList.toggle('show');
                });

                container.appendChild(styleItem);
                container.appendChild(menuButton);
                container.appendChild(dropdown);
                styleStripPanel.appendChild(container);
            });

            document.addEventListener('click', (e) => {
                if (!e.target.closest('.style-menu-button') && !e.target.closest('.style-menu-dropdown')) {
                    document.querySelectorAll('.style-menu-dropdown.show').forEach(d => d.classList.remove('show'));
                }
            });

        } catch (e) {
            console.error("Failed to load styles:", e);
        }
    }

    async function processAndAssignImage(pIdx, imageBlob, prompt, styleId, assignmentIndex) {
        try {
            appState.loadingPhotos.add(pIdx);
            // Updating UI done by check in renderPreview if needed, but we can force update
            renderPreview();

            const formData = new FormData();
            formData.append('prompt', prompt);
            formData.append('file', imageBlob, 'photo.png');

            const response = await fetch('/process_and_stylize_image', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Stylization failed: ${errorText}`);
            }

            const newImageBlob = await response.blob();

            // USE TRANSFORM MANAGER
            if (appState.transformManager) {
                appState.transformManager.setStylizedDecoration(pIdx, prompt, styleId, newImageBlob);

                // Compose final image (applies existing crop)
                const composedBlob = await appState.transformManager.compose(pIdx);

                appState.capturedPhotos[pIdx] = composedBlob;
                if (assignmentIndex !== -1) {
                    appState.photoAssignments[assignmentIndex] = composedBlob;
                }

                // Update Thumbnail
                const thumbContainer = document.getElementById('review-thumbnails').children[pIdx];
                if (thumbContainer) {
                    const thumb = thumbContainer.querySelector('.photostrip-item');
                    if (thumb) {
                        thumb.src = URL.createObjectURL(composedBlob);
                    }
                }
            } else {
                console.error("Transform Manager not initialized");
            }

            appState.selectedStylePrompt = prompt;

        } catch (error) {
            console.error('Error during stylization:', error);
            if (showToast) {
                showToast('스타일 적용 실패했습니다. 잠시 후에 다시 시도해주세요.', 'error', 4000);
            } else {
                alert('스타일 적용 실패했습니다. 잠시 후에 다시 시도해주세요.');
            }
        } finally {
            appState.loadingPhotos.delete(pIdx);
            renderPreview();
        }
    }

    async function retryStyle(prompt, styleId) {
        if (appState.selectedForStylizing.length === 0) {
            alert('Please select a photo to apply the style to.');
            return;
        }

        for (const pIdx of appState.selectedForStylizing) {
            // Force re-fetch by not using cache (manager doesn't invalidate automatically on 'retry', we arguably want to overwrite)
            // But processAndAssignImage always fetches new. 
            // We just need to pass the ORIGINAL base logic. 
            // The logic: processAndAssignImage takes imageBlob. Should be original.

            const imageBlob = appState.originalPhotos[pIdx];
            const assignmentIndex = appState.photoAssignments.findIndex(p => p === appState.capturedPhotos[pIdx]);

            await processAndAssignImage(pIdx, imageBlob, prompt, styleId, assignmentIndex);
        }

        renderPreview();
    }

    function openEditStyleModal(style) {
        editStyleIdInput.value = style.id;
        editStyleNameInput.value = style.name;
        editStylePromptInput.value = style.prompt;
        editStyleModal.className = 'modal-visible';
    }

    async function removeStyle(styleId) {
        if (!confirm('Are you sure you want to delete this style?')) {
            return;
        }

        try {
            await fetch(`/styles?style_id=${styleId}`, {
                method: 'DELETE'
            });
            loadStylesStrip();
        } catch (e) {
            console.error("Failed to remove style:", e);
        }
    }

    async function applyStyle(prompt, styleId) {
        if (appState.selectedForStylizing.length === 0) {
            alert('Please select a photo to apply the style to.');
            return;
        }

        for (const pIdx of appState.selectedForStylizing) {
            // Check if already has this style in manager?
            // If cached, just set it.
            // Manager cache is inside manager.
            // processAndAssignImage fetches.

            // To support "Apply existing cached style":
            // transformManager doesn't expose "check cache" easily outside, 
            // but setStylizedDecoration updates state.
            // BUT we don't hold MULTIPLE stylized versions in memory per photo in this design 
            // (only current stylized blob).
            // So if we switch style, we probably re-fetch or need to implement multi-cache in manager.
            // Phase 2 implementation only has ONE `stylizedBlob` per photo.
            // If user switches Style A -> Style B -> Style A, we likely re-fetch A.
            // That's acceptable for now.

            const assignmentIndex = appState.photoAssignments.findIndex(p => p === appState.capturedPhotos[pIdx]);
            const imageBlob = appState.originalPhotos[pIdx];

            await processAndAssignImage(pIdx, imageBlob, prompt, styleId, assignmentIndex);
        }

        renderPreview();
        loadStylesStrip();
    }

    function showStylizePanel() {
        const stripContainer = document.getElementById('strip-container');
        const isVisible = styleStripPanel.classList.contains('show');

        const currentOpenPanel = Array.from(stripContainer.querySelectorAll('.strip-panel'))
            .find(p => p.classList.contains('show'));
        if (currentOpenPanel) {
            if (panelHistory) panelHistory.push(currentOpenPanel.dataset.panel);
            currentOpenPanel.classList.remove('show');
        }

        document.querySelectorAll('.strip-panel').forEach(p => p.classList.remove('show'));

        if (!isVisible) {
            styleStripPanel.classList.add('show');
            loadStylesStrip();

            if (callbacks.updatePanelHeader) {
                callbacks.updatePanelHeader('styles');
            }
            updateAddFinalizeButtons();
        } else {
            if (panelHistory) panelHistory.length = 0;
            updateAddFinalizeButtons();
            appState.selectedForStylizing = [];
            updatePreviewHighlights();
        }
    }

    async function resetPhotoStyle(pIdx) {
        if (!appState.transformManager) return;

        // 1. Capture the currently displayed blob (Stylized) BEFORE we reset state
        const oldBlob = appState.capturedPhotos[pIdx];

        // 2. Reset state in Manager
        appState.transformManager.resetToOriginal(pIdx);

        // 3. Get new blob (Original + Original Crop if any)
        const newBlob = await appState.transformManager.compose(pIdx);

        // 4. Update Captured Photos Source
        appState.capturedPhotos[pIdx] = newBlob;

        // 5. Update Assignments (References)
        // Check both photoAssignments and videoAssignments (just in case they are linked? No, videos separate)
        let updatedCount = 0;
        for (let i = 0; i < appState.photoAssignments.length; i++) {
            if (appState.photoAssignments[i] === oldBlob) {
                appState.photoAssignments[i] = newBlob;
                updatedCount++;
            }
        }

        // Fallback: If no assignment found via equality (reference lost?), use pIdx mapping if possible?
        // But usually reference equality works if we didn't mutate capturedPhotos prematurely.
        // We captured oldBlob from capturedPhotos[pIdx] at start. So it should match.

        // 6. Update Thumbnail
        const thumbContainer = document.getElementById('review-thumbnails');
        if (thumbContainer && thumbContainer.children[pIdx]) {
            const thumb = thumbContainer.children[pIdx].querySelector('.photostrip-item');
            if (thumb) {
                thumb.src = URL.createObjectURL(newBlob);
            }
        }

        // 7. Force UI Update
        renderPreview();
        loadStylesStrip(); // To update selected state in strip
    }

    // Public API
    return {
        loadStylesStrip,
        showStylizePanel,
        resetPhotoStyle,
        handleStylizeButtonClick: (photoIndex) => {
            if (clearSelections) clearSelections();

            appState.selectedForStylizing = [];
            appState.selectedForStylizing.push(photoIndex);
            showStylizePanel();
            updatePreviewHighlights();
        }
    };
};
