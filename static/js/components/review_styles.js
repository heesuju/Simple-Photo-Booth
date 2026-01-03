window.initReviewStyles = (appState, callbacks) => {
    const {
        renderPreview,
        renderReviewThumbnails,
        updatePreviewHighlights,
        updateAddFinalizeButtons,
        panelHistory,
        showToast,
        clearSelections,
        renderPhotoAssignments
    } = callbacks;

    // DOM Elements (fetched here to ensure they exist when init is called)
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

            const noneStyleContainer = document.createElement('div');
            noneStyleContainer.className = 'style-item-container';
            const noneStyleItem = document.createElement('button');
            noneStyleItem.className = 'style-strip-item';
            noneStyleItem.textContent = 'None';
            noneStyleItem.addEventListener('click', async () => {
                if (appState.selectedForStylizing.length === 0) {
                    alert('Please select a photo to apply the style to.');
                    return;
                }
                for (const pIdx of appState.selectedForStylizing) {
                    let imageToAssign = appState.originalPhotos[pIdx];
                    const currentCropData = appState.cropData[pIdx];

                    if (currentCropData) {
                        const templateHole = appState.templateInfo.holes[pIdx];
                        const targetAspectRatio = templateHole.w / templateHole.h;
                        const result = await appState.cropper.crop(imageToAssign, targetAspectRatio, currentCropData);
                        if (result) {
                            imageToAssign = result.croppedBlob;
                        }
                    }

                    const assignmentIndex = appState.photoAssignments.findIndex(p => p === appState.capturedPhotos[pIdx]);

                    appState.capturedPhotos[pIdx] = imageToAssign;

                    if (assignmentIndex !== -1) {
                        appState.photoAssignments[assignmentIndex] = imageToAssign;
                    }

                    appState.isStylized[pIdx] = false;

                    const thumbContainer = document.getElementById('review-thumbnails').children[pIdx];
                    if (thumbContainer) {
                        const thumb = thumbContainer.querySelector('.photostrip-item');
                        if (thumb) {
                            thumb.src = URL.createObjectURL(imageToAssign);
                        }
                    }
                }
                renderPreview();
            });
            noneStyleContainer.appendChild(noneStyleItem);
            styleStripPanel.appendChild(noneStyleContainer);

            styles.forEach(style => {
                const container = document.createElement('div');
                container.className = 'strip-item';

                const content = document.createElement('div');
                content.className = 'strip-item-content';

                const styleItem = document.createElement('button');
                styleItem.className = 'style-strip-item';
                styleItem.textContent = style.name;
                styleItem.addEventListener('click', () => applyStyle(style.prompt));
                content.appendChild(styleItem);

                const actions = document.createElement('div');
                actions.className = 'strip-item-actions';

                const editButton = document.createElement('button');
                editButton.textContent = '✏️';
                editButton.title = 'Edit';
                editButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openEditStyleModal(style);
                });

                const removeButton = document.createElement('button');
                removeButton.textContent = '🗑️';
                removeButton.title = 'Remove';
                removeButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    removeStyle(style.id);
                });

                const retryButton = document.createElement('button');
                retryButton.textContent = '🔄';
                retryButton.title = 'Retry';
                retryButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    retryStyle(style.prompt);
                });

                actions.appendChild(editButton);
                actions.appendChild(removeButton);
                actions.appendChild(retryButton);

                container.appendChild(content);
                container.appendChild(actions);
                styleStripPanel.appendChild(container);
            });


        } catch (e) {
            console.error("Failed to load styles:", e);
        }
    }

    async function processAndAssignImage(pIdx, imageBlob, prompt, cacheKey, assignmentIndex) {
        let imageToAssign = imageBlob;

        try {
            // Track loading state by photo index
            appState.loadingPhotos.add(pIdx);
            renderPhotoAssignments(); // Re-render to show loading state (Needs renderPhotoAssignments to be available? No, renderPreview covers it? No, assignments are separate)
            // Wait, review.js has renderPhotoAssignments. renderPreview calls it. 
            // I should use renderPreview if renderPhotoAssignments is not exposed, but renderPreview checks loading.
            // Actually, renderPhotoAssignments is what I need. renderPreview calls it.
            // If I call renderPreview, it should work.

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
            appState.stylizedImagesCache[cacheKey] = newImageBlob;
            imageToAssign = newImageBlob;

            let currentStylizedCropData = appState.stylizedCropData[pIdx];
            const templateHole = appState.templateInfo.holes[pIdx];
            const targetAspectRatio = templateHole.w / templateHole.h;

            if (!currentStylizedCropData) {
                // Calculate default crop data if none exists
                currentStylizedCropData = await appState.cropper.getDefaultCropData(newImageBlob, targetAspectRatio);
                appState.stylizedCropData[pIdx] = currentStylizedCropData; // Save the newly calculated default crop data
            }

            if (currentStylizedCropData) {
                const result = await appState.cropper.crop(imageToAssign, targetAspectRatio, currentStylizedCropData);
                if (result) {
                    imageToAssign = result.croppedBlob;
                }
            }

            appState.capturedPhotos[pIdx] = imageToAssign;

            if (assignmentIndex !== -1) {
                appState.photoAssignments[assignmentIndex] = imageToAssign;
            }

            appState.isStylized[pIdx] = true;
            appState.selectedStylePrompt = prompt;

            const thumbContainer = document.getElementById('review-thumbnails').children[pIdx];
            if (thumbContainer) {
                const thumb = thumbContainer.querySelector('.photostrip-item');
                if (thumb) {
                    thumb.src = URL.createObjectURL(imageToAssign);
                }
            }
        } catch (error) {
            console.error('Error during stylization:', error);
            // showToast is a global or callback? I put it in callbacks.
            if (callbacks.showToast) {
                callbacks.showToast('스타일 적용 실패했습니다. 잠시 후에 다시 시도해주세요.', 'error', 4000);
            } else {
                console.warn('showToast callback not provided');
                alert('스타일 적용 실패했습니다. 잠시 후에 다시 시도해주세요.');
            }
        } finally {
            // Remove loading state by photo index
            appState.loadingPhotos.delete(pIdx);
            renderPreview(); // Re-render to remove loading state
        }
    }

    async function retryStyle(prompt) {
        if (appState.selectedForStylizing.length === 0) {
            alert('Please select a photo to apply the style to.');
            return;
        }

        for (const pIdx of appState.selectedForStylizing) {
            const cacheKey = `${pIdx}-${prompt}`;
            delete appState.stylizedImagesCache[cacheKey];

            const assignmentIndex = appState.photoAssignments.findIndex(p => p === appState.capturedPhotos[pIdx]);
            const imageBlob = appState.originalPhotos[pIdx];

            await processAndAssignImage(pIdx, imageBlob, prompt, cacheKey, assignmentIndex);
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

    async function applyStyle(prompt) {
        if (appState.selectedForStylizing.length === 0) {
            alert('Please select a photo to apply the style to.');
            return;
        }

        for (const pIdx of appState.selectedForStylizing) {
            const cacheKey = `${pIdx}-${prompt}`;
            if (appState.stylizedImagesCache[cacheKey]) {
                let imageToAssign = appState.stylizedImagesCache[cacheKey];
                const currentStylizedCropData = appState.stylizedCropData[pIdx];

                if (currentStylizedCropData) {
                    const templateHole = appState.templateInfo.holes[pIdx];
                    const targetAspectRatio = templateHole.w / templateHole.h;
                    const result = await appState.cropper.crop(imageToAssign, targetAspectRatio, currentStylizedCropData);
                    if (result) {
                        imageToAssign = result.croppedBlob;
                    }
                }

                const assignmentIndex = appState.photoAssignments.findIndex(p => p === appState.capturedPhotos[pIdx]);
                appState.capturedPhotos[pIdx] = imageToAssign;
                if (assignmentIndex !== -1) {
                    appState.photoAssignments[assignmentIndex] = imageToAssign;
                }
                appState.isStylized[pIdx] = true;
                appState.selectedStylePrompt = prompt;
                const thumbContainer = document.getElementById('review-thumbnails').children[pIdx];
                if (thumbContainer) {
                    const thumb = thumbContainer.querySelector('.photostrip-item');
                    if (thumb) {
                        thumb.src = URL.createObjectURL(imageToAssign);
                    }
                }
                continue;
            }

            const assignmentIndex = appState.photoAssignments.findIndex(p => p === appState.capturedPhotos[pIdx]);
            const imageBlob = appState.originalPhotos[pIdx];

            await processAndAssignImage(pIdx, imageBlob, prompt, cacheKey, assignmentIndex);
        }

        renderPreview();
    }

    function showStylizePanel() {
        const stripContainer = document.getElementById('strip-container');
        const stripBackBtn = document.getElementById('strip-back-btn');
        const isVisible = styleStripPanel.classList.contains('show');


        // Close any currently open strip panel
        const currentOpenPanel = Array.from(stripContainer.querySelectorAll('.strip-panel'))
            .find(p => p.classList.contains('show'));
        if (currentOpenPanel) {
            if (panelHistory) panelHistory.push(currentOpenPanel.dataset.panel); // Use callback reference if possible, but panelHistory is passed by reference
            currentOpenPanel.classList.remove('show');
        }

        // Hide all panels before toggling
        document.querySelectorAll('.strip-panel').forEach(p => p.classList.remove('show'));

        if (!isVisible) {
            styleStripPanel.classList.add('show');
            loadStylesStrip(); // Load available styles
            stripBackBtn.style.display = 'block';
        } else {
            stripBackBtn.style.display = 'none';
            // panelHistory = []; // Resetting panel history? In review.js it did.
            // We can't reassign separate arrayRef. We can clear it.
            if (panelHistory) panelHistory.length = 0;

            updateAddFinalizeButtons();
            // Clear selection when closing
            appState.selectedForStylizing = [];
            updatePreviewHighlights();
        }
    }

    // Public API
    return {
        loadStylesStrip,
        showStylizePanel,
        handleStylizeButtonClick: (photoIndex) => {
            if (clearSelections) clearSelections();

            appState.selectedForStylizing = [];
            appState.selectedForStylizing.push(photoIndex);
            showStylizePanel();
            updatePreviewHighlights();
        }
    };
};
