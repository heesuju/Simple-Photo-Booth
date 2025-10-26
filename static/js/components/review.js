window.eventBus.on('app:init', (appState) => {
    const reviewScreenContainer = document.getElementById('review-screen-container');
    const finalizeBtn = document.getElementById('finalize-btn');
    const retakeBtn = document.getElementById('retake-btn');
    const filterControls = document.getElementById('filter-controls');
    const stickerUploadInput = document.getElementById('sticker-upload-input');
    const reviewToolbar = document.getElementById('review-toolbar');
    const reviewPanel = document.getElementById('review-panel');
    const panelSelector = document.getElementById('panel-selector');
    const panelHandle = document.getElementById('panel-handle');
    const panelContent = document.getElementById('review-panel-content');
    const stripContainer = document.getElementById('strip-container');
    const stripBackBtn = document.getElementById('strip-back-btn');
    let panelHistory = [];
    const removeBgCheckbox = document.getElementById('remove-bg-checkbox');
    const addFontBtn = document.getElementById('add-font-btn');
    const addPresetBtn = document.getElementById('add-preset-btn');
    const fontGallery = document.getElementById('font-gallery');
    const fontUploadInput = document.createElement('input');
    fontUploadInput.type = 'file';
    fontUploadInput.accept = '.ttf,.otf,.woff,.woff2';
    fontUploadInput.style.display = 'none';
    reviewScreenContainer.appendChild(fontUploadInput);
    const addStyleModal = document.getElementById('add-style-modal');
    const addStyleConfirmBtn = document.getElementById('add-style-confirm-btn');
    const addStyleCancelBtn = document.getElementById('add-style-cancel-btn');
    const newStyleNameInput = document.getElementById('new-style-name');
    const newStylePromptInput = document.getElementById('new-style-prompt');
    const styleStripPanel = document.getElementById('style-strip-panel');
    
    

    let isAddingNewStyle = false;
    let selectedStylePrompt = '';

    let isPanelDragging = false;
    let startY, startHeight;

    const colorPicker = window.initColorPicker(appState);
    const textEdit = window.initTextEdit(appState, colorPicker);
    
    appState.selectedForStylizing = [];

    removeBgCheckbox.addEventListener('change', (e) => {
        appState.removeBackground = e.target.checked;
        applyBackgroundRemovalPreview();
    });

    finalizeBtn.addEventListener('click', () => window.eventBus.dispatch('review:finalize', { videos: appState.videoAssignments }));
    retakeBtn.addEventListener('click', () => {
        window.eventBus.dispatch('review:retake', { indices: appState.selectedForRetake });

        // Clear the selection and hide the button immediately
        appState.selectedForRetake.forEach(pIdx => {
            const thumb = document.getElementById('review-thumbnails').children[pIdx];
            if (thumb) thumb.classList.remove('selected');
        });
        appState.selectedForRetake = [];
        retakeBtn.style.display = 'none';
    });

    panelSelector.addEventListener('click', async (e) => {
        if (e.target.classList.contains('panel-selector-btn')) {
            const panelType = e.target.dataset.panel;
            const currentActiveBtn = panelSelector.querySelector('.active');

            if (currentActiveBtn) {
                currentActiveBtn.classList.remove('active');
            }
            e.target.classList.add('active');

            panelContent.querySelectorAll('.panel-section').forEach(p => p.classList.remove('active'));
            const targetPanel = panelContent.querySelector(`.panel-section[data-panel="${panelType}"]`);
            if (targetPanel) {
                targetPanel.classList.add('active');
            }

            addFontBtn.style.display = panelType === 'text' ? 'block' : 'none';

            if (panelType === 'text') {
                textEdit.show(null).then(result => {
                    if (result) {
                        const { scale, renderedWidth } = getPreviewScaling();
                        if (scale === 1) return;

                        const templateNaturalWidth = renderedWidth / scale;
                        const textNaturalWidth = templateNaturalWidth * 0.6;
                        const template = document.querySelector('#review-preview .preview-template-img');
                        const imageNaturalWidth = template.naturalWidth;
                        const imageNaturalHeight = template.naturalHeight;
                        const imageX = (imageNaturalWidth - textNaturalWidth) / 2;
                        const imageY = (imageNaturalHeight - 50) / 2;

                        appState.placedTexts.push({
                            id: Date.now(),
                            text: result.text,
                            font: result.font,
                            color: result.color,
                            x: Math.round(imageX),
                            y: Math.round(imageY),
                            width: Math.round(textNaturalWidth),
                            height: 50,
                            rotation: 0,
                            fontSize: 40,
                            justify: result.justify
                        });
                        renderPlacedTexts();
                    }
                });
            }
        }
    });

    addFontBtn.addEventListener('click', () => {
        fontUploadInput.click();
    });

    fontUploadInput.addEventListener('change', (e) => window.handleFileUpload(e, '/upload_font', loadFontGallery));

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

    document.getElementById('edit-style-confirm-btn').addEventListener('click', () => {
        const styleId = document.getElementById('edit-style-id').value;
        const name = document.getElementById('edit-style-name').value;
        const prompt = document.getElementById('edit-style-prompt').value;
        updateStyle(styleId, name, prompt);
    });

    document.getElementById('edit-style-cancel-btn').addEventListener('click', () => {
        document.getElementById('edit-style-modal').className = 'modal-hidden';
    });

    document.getElementById('add-preset-btn').addEventListener('click', () => {
        const addPresetModal = document.getElementById('add-filter-preset-modal');
        const presetFilterControls = document.getElementById('preset-filter-controls');
        const filterControls = document.getElementById('filter-controls');
        presetFilterControls.innerHTML = filterControls.innerHTML;

        const presetPreview = document.getElementById('preset-preview');
        const firstPhoto = appState.capturedPhotos[0];
        if (firstPhoto) {
            const imageUrl = URL.createObjectURL(firstPhoto);
            presetPreview.style.backgroundImage = `url(${imageUrl})`;

            const updatePreviewFilters = () => {
                const values = {};
                presetFilterControls.querySelectorAll('input[type="range"]').forEach(slider => {
                    values[slider.dataset.filter] = parseInt(slider.value, 10);
                });
                const filterString = `brightness(${values.brightness}%) contrast(${values.contrast}%) saturate(${values.saturate}%) blur(${values.blur}px)`;
                presetPreview.style.filter = filterString;
            };

            presetFilterControls.addEventListener('input', updatePreviewFilters);
            updatePreviewFilters();
        }

        addPresetModal.className = 'modal-visible';
    });

    async function updateStyle(styleId, name, prompt) {
        try {
            await fetch(`/styles/${styleId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, prompt })
            });
            document.getElementById('edit-style-modal').className = 'modal-hidden';
            loadStylesStrip();
        } catch (e) {
            console.error("Failed to update style:", e);
        }
    }

    document.getElementById('add-preset-confirm-btn').addEventListener('click', () => {
        const name = document.getElementById('new-preset-name').value;
        if (!name) {
            alert('Please enter a name for the preset.');
            return;
        }

        const presetFilterControls = document.getElementById('preset-filter-controls');
        const values = {};
        presetFilterControls.querySelectorAll('input[type="range"]').forEach(slider => {
            values[slider.dataset.filter] = parseInt(slider.value, 10);
        });

        addFilterPreset(name, values);
    });

    document.getElementById('add-preset-cancel-btn').addEventListener('click', () => {
        document.getElementById('add-filter-preset-modal').className = 'modal-hidden';
    });

    async function addFilterPreset(name, values) {
        try {
            await fetch('/filter_presets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, filter_values: values })
            });
            document.getElementById('add-filter-preset-modal').className = 'modal-hidden';
            loadFilterPresets();
        } catch (e) {
            console.error("Failed to add filter preset:", e);
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
                editButton.textContent = 'E';
                editButton.title = 'Edit';
                editButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openEditStyleModal(style);
                });

                const removeButton = document.createElement('button');
                removeButton.textContent = 'R';
                removeButton.title = 'Remove';
                removeButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    removeStyle(style.id);
                });

                const retryButton = document.createElement('button');
                retryButton.textContent = 'R';
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

            const addStyleContainer = document.createElement('div');
            addStyleContainer.className = 'style-item-container';
            const addStyleButton = document.createElement('button');
            addStyleButton.className = 'palette-add-btn';
            addStyleButton.textContent = '+';
            addStyleButton.addEventListener('click', () => {
                addStyleModal.className = 'modal-visible';
            });
            addStyleContainer.appendChild(addStyleButton);
            styleStripPanel.appendChild(addStyleContainer);
        } catch (e) {
            console.error("Failed to load styles:", e);
        }
    }

    async function processAndAssignImage(pIdx, imageBlob, prompt, cacheKey, assignmentIndex) {
        const photoWrappers = document.querySelectorAll('.preview-photo-wrapper');
        const wrapper = photoWrappers[assignmentIndex];
        let imageToAssign = imageBlob;

        try {
            if (wrapper) {
                wrapper.classList.add('loading');
            }

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
            showToast('스타일 적용 실패했습니다. 잠시 후에 다시 시도해주세요.', 'error', 4000);
        } finally {
            if (wrapper) {
                wrapper.classList.remove('loading');
            }
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
        const editStyleModal = document.getElementById('edit-style-modal');
        const editStyleId = document.getElementById('edit-style-id');
        const editStyleName = document.getElementById('edit-style-name');
        const editStylePrompt = document.getElementById('edit-style-prompt');

        editStyleId.value = style.id;
        editStyleName.value = style.name;
        editStylePrompt.value = style.prompt;

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

    filterControls.addEventListener('input', (e) => {
        if (e.target.type === 'range') {
            appState.filters[e.target.dataset.filter] = parseInt(e.target.value, 10);
            applyPhotoFilters();
        }
    });


    reviewToolbar.addEventListener('click', (e) => {
        if (e.target.classList.contains('toolbar-btn')) {
            const panelType = e.target.dataset.panel;
            if (panelType === 'add-text') {
                textEdit.show(null).then(result => {
                    if (result) {
                        const { scale, renderedWidth } = getPreviewScaling();
                        if (scale === 1) return;

                        const templateNaturalWidth = renderedWidth / scale;
                        const textNaturalWidth = templateNaturalWidth * 0.6;
                        const template = document.querySelector('#review-preview .preview-template-img');
                        const imageNaturalWidth = template.naturalWidth;
                        const imageNaturalHeight = template.naturalHeight;
                        const imageX = (imageNaturalWidth - textNaturalWidth) / 2;
                        const imageY = (imageNaturalHeight - 50) / 2;

                        appState.placedTexts.push({
                            id: Date.now(),
                            text: result.text,
                            font: result.font,
                            color: result.color,
                            x: Math.round(imageX),
                            y: Math.round(imageY),
                            width: Math.round(textNaturalWidth),
                            height: 50,
                            rotation: 0,
                            fontSize: 40,
                            justify: result.justify
                        });
                        renderPlacedTexts();
                    }
                });
                return;
            }
            const currentActiveBtn = reviewToolbar.querySelector('.active');
            const sidebar = document.getElementById('review-sidebar');

            // If clicking the same button, close its panel and clear selections
            if (currentActiveBtn === e.target) {
                e.target.classList.remove('active');
                reviewPanel.classList.remove('show');
                stripContainer.querySelectorAll('.strip-panel').forEach(p => p.classList.remove('show'));
                sidebar.classList.remove('strip-active');
                reviewPanel.style.height = '50vh'; // Reset height
                clearSelections();
                stripBackBtn.style.display = 'none';
                panelHistory = [];
                return;
            }

            // If switching to a new panel, clear selections first
            clearSelections();

            const currentOpenPanel = Array.from(stripContainer.querySelectorAll('.strip-panel')).find(p => p.classList.contains('show'));
            if (currentOpenPanel) {
                panelHistory.push(currentOpenPanel.dataset.panel);
            }


            // Deactivate current active button and all panels
            if (currentActiveBtn) {
                currentActiveBtn.classList.remove('active');
            }
            reviewPanel.classList.remove('show');
            stripContainer.querySelectorAll('.strip-panel').forEach(p => p.classList.remove('show'));
            sidebar.classList.remove('strip-active');

            // Activate the new button and its corresponding panel
            e.target.classList.add('active');

            if (panelType === 'photos' || panelType === 'templates' || panelType === 'filters' || panelType === 'colors' || panelType === 'styles') {
                const targetStrip = stripContainer.querySelector(`.strip-panel[data-panel="${panelType}"]`);
                if (targetStrip) {
                    targetStrip.classList.add('show');
                    sidebar.classList.add('strip-active');
                    stripBackBtn.style.display = 'block';
                }
                if (panelType === 'filters') {
                    loadFilterPresets();
                    addPresetBtn.style.display = 'block';
                } else {
                    addPresetBtn.style.display = 'none';
                }
            } else {
                const targetPanel = panelContent.querySelector(`.panel-section[data-panel="${panelType}"]`);
                panelContent.querySelectorAll('.panel-section').forEach(p => p.classList.remove('active'));
                if (targetPanel) {
                    targetPanel.classList.add('active');
                }
                reviewPanel.classList.add('show');
                addPresetBtn.style.display = 'none';
                stripBackBtn.style.display = 'none';
                panelHistory = [];
            }
        }
    });

    stripBackBtn.addEventListener('click', () => {
        const currentOpenPanel = Array.from(stripContainer.querySelectorAll('.strip-panel')).find(p => p.classList.contains('show'));
        if (currentOpenPanel) {
            currentOpenPanel.classList.remove('show');
        }

        const lastPanelType = panelHistory.pop();
        if (lastPanelType) {
            const targetStrip = stripContainer.querySelector(`.strip-panel[data-panel="${lastPanelType}"]`);
            if (targetStrip) {
                targetStrip.classList.add('show');
                const correspondingButton = reviewToolbar.querySelector(`[data-panel=${lastPanelType}]`);
                if (correspondingButton) {
                    reviewToolbar.querySelector('.active').classList.remove('active');
                    correspondingButton.classList.add('active');
                }
            }
        } else {
            stripBackBtn.style.display = 'none';
            document.getElementById('review-sidebar').classList.remove('strip-active');
            const currentActiveBtn = reviewToolbar.querySelector('.active');
            if(currentActiveBtn) {
                currentActiveBtn.classList.remove('active');
            }
        }
    });


    async function loadFilterPresets() {
        try {
            const response = await fetch('/filter_presets');
            const presets = await response.json();
            const presetStrip = document.getElementById('filter-preset-strip');
            presetStrip.innerHTML = '';

            const firstPhoto = appState.capturedPhotos[0];
            const firstPhotoUrl = firstPhoto ? URL.createObjectURL(firstPhoto) : '';

            const nonePresetItem = document.createElement('button');
            nonePresetItem.className = 'style-strip-item';
            nonePresetItem.textContent = 'None';
            nonePresetItem.addEventListener('click', () => {
                appState.filters = { brightness: 100, contrast: 100, saturate: 100, warmth: 100, sharpness: 0, blur: 0, grain: 0 };
                for (const filter in appState.filters) {
                    const slider = document.querySelector(`#filter-controls input[data-filter="${filter}"]`);
                    if (slider) {
                        slider.value = appState.filters[filter];
                    }
                }
                applyPhotoFilters();
            });
            presetStrip.appendChild(nonePresetItem);

            presets.forEach(preset => {
                const presetItem = document.createElement('div');
                presetItem.className = 'style-strip-item';

                const thumbnail = document.createElement('img');
                thumbnail.className = 'filter-preset-thumbnail';
                thumbnail.src = firstPhotoUrl;
                const values = preset.values;
                thumbnail.style.filter = `brightness(${values.brightness}%) contrast(${values.contrast}%) saturate(${values.saturate}%) blur(${values.blur}px)`;

                const name = document.createElement('div');
                name.className = 'filter-preset-name';
                name.textContent = preset.name;

                presetItem.appendChild(thumbnail);
                presetItem.appendChild(name);

                presetItem.addEventListener('click', () => applyFilterPreset(preset.values));
                presetStrip.appendChild(presetItem);
            });
        } catch (e) {
            console.error("Failed to load filter presets:", e);
        }
    }

    async function applyFilterPreset(values) {
        appState.filters = { ...values };
        for (const filter in values) {
            const slider = document.querySelector(`#filter-controls input[data-filter="${filter}"]`);
            if (slider) {
                slider.value = values[filter];
            }
        }
        applyPhotoFilters(); // Apply CSS filters for instant preview

        for (const pIdx of appState.selectedForRetake) {
            const imageBlob = appState.originalPhotos[pIdx];
            const formData = new FormData();
            formData.append('file', imageBlob, 'photo.png');
            formData.append('filters', JSON.stringify(values));

            try {
                const response = await fetch('/apply_filters_to_image', {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Failed to apply filters: ${errorText}`);
                }

                const newImageBlob = await response.blob();
                const newImageUrl = URL.createObjectURL(newImageBlob);

                const assignmentIndex = appState.photoAssignments.findIndex(p => p === appState.capturedPhotos[pIdx]);
                appState.capturedPhotos[pIdx] = newImageBlob;
                if (assignmentIndex !== -1) {
                    appState.photoAssignments[assignmentIndex] = newImageBlob;
                }

                const thumb = document.getElementById('review-thumbnails').children[pIdx];
                if (thumb) {
                    thumb.src = newImageUrl;
                }
            } catch (error) {
                console.error('Error applying filters:', error);
                alert('An error occurred while applying filters. Please check the console for details.');
            }
        }
        renderPreview();
    }

    reviewScreenContainer.addEventListener('click', (e) => {
        if (reviewPanel.classList.contains('show')) {
            if (!reviewPanel.contains(e.target) && !reviewToolbar.contains(e.target)) {
                reviewPanel.classList.remove('show');
                const currentActiveBtn = reviewToolbar.querySelector('.active');
                if (currentActiveBtn) {
                    currentActiveBtn.classList.remove('active');
                }
                reviewPanel.style.height = '50vh'; // Reset height
            }
        }
    });

    function clearSelections() {
        // Clear selected hole in preview
        if (appState.selectedHole.element) {
            appState.selectedHole.element.classList.remove('selected');
        }
        appState.selectedHole = { element: null, index: -1 };

        // Clear disabled thumbnail
        if (appState.disabledThumbnailIndex !== -1) {
            const oldThumb = document.getElementById('review-thumbnails').children[appState.disabledThumbnailIndex];
            if (oldThumb) oldThumb.classList.remove('disabled');
            appState.disabledThumbnailIndex = -1;
        }

        // Clear photos selected for retake
        if (appState.selectedForRetake.length > 0) {
            appState.selectedForRetake.forEach(pIdx => {
                const thumb = document.getElementById('review-thumbnails').children[pIdx];
                if (thumb) thumb.classList.remove('selected');
            });
            appState.selectedForRetake = [];
            retakeBtn.style.display = 'none';
        }
    }

    panelHandle.addEventListener('mousedown', (e) => {
        isPanelDragging = true;
        startY = e.clientY;
        startHeight = reviewPanel.offsetHeight;
        reviewPanel.style.transition = 'none'; // Disable transition during drag
    });

    panelHandle.addEventListener('click', (e) => {
        if (isPanelDragging) return; // Don't fire click during drag

        if (reviewPanel.classList.contains('show')) {
            if (reviewPanel.offsetHeight > window.innerHeight * 0.7) {
                reviewPanel.style.height = '50vh';
            } else {
                reviewPanel.style.height = '80vh';
            }
        }
    });

    stickerUploadInput.addEventListener('change', (e) => window.handleFileUpload(e, '/upload_sticker', loadStickerGallery));

    window.addEventListener('mousemove', (e) => {
        if (isPanelDragging) {
            const deltaY = startY - e.clientY;
            let newHeight = startHeight + deltaY;
            const maxHeight = window.innerHeight * 0.9;
            const closeThreshold = window.innerHeight * 0.2;

            if (newHeight < closeThreshold) {
                reviewPanel.classList.remove('show');
                const currentActiveBtn = reviewToolbar.querySelector('.active');
                if (currentActiveBtn) {
                    currentActiveBtn.classList.remove('active');
                }
                isPanelDragging = false;
                reviewPanel.style.height = '50vh'; // Reset to default height
                return;
            }

            if (newHeight > maxHeight) newHeight = maxHeight;
            reviewPanel.style.height = `${newHeight}px`;
        } else {
            handleStickerMove(e);
            handleTextMove(e);
        }
    });

    window.addEventListener('mouseup', (e) => {
        if (isPanelDragging) {
            isPanelDragging = false;
            reviewPanel.style.transition = 'bottom 0.3s ease-in-out, height 0.3s ease-in-out'; // Re-enable transition
        }
        handleStickerMouseUp(e);
        handleTextMouseUp(e);
    });

    window.addEventListener('resize', renderPreview);

    document.addEventListener('click', (e) => {
        if (appState.activeText.element && !appState.activeText.element.contains(e.target)) {
            const textBox = appState.activeText.element.querySelector('.editable-text');
            textBox.contentEditable = false;
            appState.activeText = { element: null, data: null, action: null };
            renderPlacedTexts();
        }
    });

    window.eventBus.on('photo-taking:complete', (data) => {
        appState.capturedPhotos = data.photos;
        appState.originalPhotos = data.originalPhotos;
        appState.cropData = data.cropData;
        appState.capturedVideos = data.videos;
        window.eventBus.dispatch('screen:show', 'review-screen');
        showReviewScreen(false); // false = this is the first time, so reset edits
    });

    window.eventBus.on('review:edit-existing', () => {
        document.getElementById('finalize-btn').disabled = false;
        window.eventBus.dispatch('screen:show', 'review-screen');
        showReviewScreen(true); // true = keep existing edits
    });



    function showReviewScreen(isContinuingEditing = false) { 
        if (!isContinuingEditing) {
            appState.photoAssignments = [...appState.capturedPhotos]; 
            appState.videoAssignments = [...appState.capturedVideos];
            appState.selectedForRetake = []; 
            appState.disabledThumbnailIndex = -1;
            appState.placedStickers = [];
            appState.placedTexts = [];
            appState.activeText = { element: null, data: null, action: null }; 
            appState.removeBackground = false;
            appState.stylizedImagesCache = {};
            appState.stylizedCropData = {};
            appState.isStylized = new Array(appState.capturedPhotos.length).fill(false);
            appState.bgRemovedPhotos = {};
            document.getElementById('remove-bg-checkbox').checked = false;
            appState.filters = { brightness: 100, contrast: 100, saturate: 100, warmth: 100, sharpness: 0, blur: 0, grain: 0 };
            document.querySelectorAll('#filter-controls input[type="range"]').forEach(slider => {
                if (slider.dataset.filter === 'sharpness' || slider.dataset.filter === 'blur' || slider.dataset.filter === 'grain') {
                    slider.value = 0;
                } else {
                    slider.value = 100;
                }
            });
        }
        renderReviewThumbnails(); 
        renderPreview(); 
        loadStickerGallery(); 
        loadSimilarTemplates();
    }

    async function loadStickerGallery() { 
        try { 
            const r = await fetch('/stickers'); 
            const d = await r.json(); 
            const c = document.getElementById('sticker-gallery'); 
            c.innerHTML = ''; 
            d.forEach(s => { 
                const i = document.createElement('div'); 
                i.className = 'sticker-item'; 
                const m = document.createElement('img'); 
                m.src = s.sticker_path; 
                m.draggable = false;
                i.addEventListener('click', () => addStickerToCenter(s));
                i.appendChild(m); 
                c.appendChild(i); 
            }); 
        } catch (e) { 
            console.error(e); 
        } 
    }

    async function loadFontGallery() {
        try {
            const r = await fetch('/fonts');
            const d = await r.json();
            const c = document.getElementById('font-gallery');
            c.innerHTML = '';

            const styleSheet = document.createElement('style');
            document.head.appendChild(styleSheet);

            d.forEach(f => {
                const fontFace = `@font-face {
                    font-family: '${f.font_name}';
                    src: url('${encodeURI(f.font_path.substring(1))}');
                }`;
                styleSheet.sheet.insertRule(fontFace, styleSheet.sheet.cssRules.length);

                const i = document.createElement('div');
                i.className = 'font-item';
                const fontPreview = document.createElement('div');
                fontPreview.className = 'font-item-font';
                fontPreview.style.fontFamily = f.font_name;
                fontPreview.textContent = 'Abc';
                const fontName = document.createElement('div');
                fontName.textContent = f.font_name;
                i.appendChild(fontPreview);
                i.appendChild(fontName);
                c.appendChild(i);
            });
        } catch (e) {
            console.error(e);
        }
    }

    

    function renderPlacedTexts() {
        document.querySelectorAll('.placed-text-wrapper').forEach(w => w.remove());
        const { scale, offsetX, offsetY } = getPreviewScaling();
        if (scale === 1) return; // Preview not ready
        const previewContainer = document.getElementById('review-preview');

        appState.placedTexts.forEach(d => {
            const w = document.createElement('div');
            w.className = 'placed-text-wrapper';
            if (appState.activeText.data && appState.activeText.data.id === d.id) {
                w.classList.add('active');
            }
            w.style.position = 'absolute';
            w.style.left = `${offsetX + d.x * scale}px`;
            w.style.top = `${offsetY + d.y * scale}px`;
            w.style.width = `${d.width * scale}px`;
            w.style.transform = `rotate(${d.rotation}deg)`;
            w.style.display = 'flex';
            w.style.alignItems = 'center';

            const i = document.createElement('div');
            i.contentEditable = false;
            i.className = 'editable-text';
            i.style.fontFamily = d.font;
            i.style.fontSize = `${d.fontSize * scale}px`;
            i.style.color = d.color || '#000000';
            i.innerHTML = d.text.replace(/\n/g, '<br>');
            i.style.whiteSpace = 'pre-wrap';
            i.style.textAlign = d.justify; // Apply justification

            w.style.height = 'auto';
            d.height = i.offsetHeight / scale;

            i.addEventListener('input', (e) => {
                d.text = e.target.innerText;
            });

            w.addEventListener('mousedown', (e) => handleTextMouseDown(e, d, w), false);
            w.appendChild(i);

            if (appState.activeText.data && appState.activeText.data.id === d.id) {
                const selectionBox = document.createElement('div');
                selectionBox.className = 'selection-box';
                w.appendChild(selectionBox);

                const resizeRotateHandle = document.createElement('div');
                resizeRotateHandle.className = 'sticker-handle resize-rotate';
                resizeRotateHandle.addEventListener('mousedown', (e) => {
                    e.stopPropagation();
                    appState.activeText.action = 'resize-rotate';
                    
                    const { scale, offsetX, offsetY } = getPreviewScaling();
                    const previewRect = document.getElementById('review-preview').getBoundingClientRect();
                    const centerX = previewRect.left + offsetX + (d.x + d.width / 2) * scale;
                    const centerY = previewRect.top + offsetY + (d.y + w.offsetHeight / 2) * scale;

                    appState.dragStart = { 
                        x: e.clientX, 
                        y: e.clientY, 
                        centerX, 
                        centerY, 
                        initialWidth: d.width,
                        initialHeight: w.offsetHeight / scale,
                        initialRotation: d.rotation,
                        initialFontSize: d.fontSize,
                        initialDistance: Math.hypot(e.clientX - centerX, e.clientY - centerY),
                        initialAngle: Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI)
                    };
                });
                w.appendChild(resizeRotateHandle);

                const closeHandle = document.createElement('div');
                closeHandle.className = 'sticker-handle close';
                closeHandle.textContent = 'X';
                closeHandle.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const index = appState.placedTexts.findIndex(t => t.id === d.id);
                    if (index > -1) {
                        appState.placedTexts.splice(index, 1);
                    }
                    appState.activeText = { element: null, data: null, action: null };
                    renderPlacedTexts();
                });
                w.appendChild(closeHandle);
            }

            previewContainer.appendChild(w);
        });
    }

    function handleTextMouseDown(e, data, el) {
        if (el.querySelector('.editable-text').isContentEditable) return;
        e.preventDefault();
        e.stopPropagation();
        if (appState.activeText.action) return;
        if (!appState.activeText.data || appState.activeText.data.id !== data.id) {
            appState.activeText = { element: el, data: data, action: 'move' };
            renderPlacedTexts();
        } else {
            appState.activeText.action = 'move';
        }
        appState.dragStart = { x: e.clientX, y: e.clientY, initialX: data.x, initialY: data.y };
    }

    function handleTextMove(e) {
        if (!appState.activeText.action) return;
        e.preventDefault();
        
        const { scale } = getPreviewScaling();
        if (scale === 1) return;

        const dX_natural = (e.clientX - appState.dragStart.x) / scale;
        const dY_natural = (e.clientY - appState.dragStart.y) / scale;

        const text = appState.activeText.data;

        if (appState.activeText.action === 'move') {
            text.x = Math.round(appState.dragStart.initialX + dX_natural);
            text.y = Math.round(appState.dragStart.initialY + dY_natural);
        } else if (appState.activeText.action === 'resize-rotate') {
            const { scale, offsetX, offsetY } = getPreviewScaling();
            const centerX = appState.dragStart.centerX;
            const centerY = appState.dragStart.centerY;

            const mouseVecX = e.clientX - centerX;
            const mouseVecY = e.clientY - centerY;

            const localAngleRad = Math.atan2(appState.dragStart.initialHeight / 2, appState.dragStart.initialWidth / 2);
            const newRotationRad = Math.atan2(mouseVecY, mouseVecX);
            text.rotation = (newRotationRad - localAngleRad) * (180 / Math.PI);

            const newDiagScreen = Math.hypot(mouseVecX, mouseVecY);
            const localDiag = Math.hypot(appState.dragStart.initialWidth / 2, appState.dragStart.initialHeight / 2);
            const scaleFactor = newDiagScreen / (localDiag * scale);

            const minSizeNatural = 20 / scale;
            text.width = Math.max(minSizeNatural, appState.dragStart.initialWidth * scaleFactor);
            text.height = Math.max(minSizeNatural, appState.dragStart.initialHeight * scaleFactor);
            text.fontSize = Math.max(10, appState.dragStart.initialFontSize * scaleFactor);

            const previewRect = document.getElementById('review-preview').getBoundingClientRect();
            const new_center_natural_x = (centerX - (previewRect.left + offsetX)) / scale;
            const new_center_natural_y = (centerY - (previewRect.top + offsetY)) / scale;

            text.x = new_center_natural_x - text.width / 2;
            text.y = new_center_natural_y - text.height / 2;
        } 

        renderPlacedTexts();
    }

    function handleTextMouseUp(e) {
        if (appState.activeText.action) {
            appState.activeText.action = null;
        }
    }

    function renderReviewThumbnails() { 
        const c = document.getElementById('review-thumbnails'); 
        c.innerHTML = ''; 

        appState.capturedPhotos.forEach((b, i) => { 
            // Create a container for the image and button
            const itemContainer = document.createElement('div');
            itemContainer.className = 'strip-item';

            const content = document.createElement('div');
            content.className = 'strip-item-content';

            const t = document.createElement('img');
            t.src = URL.createObjectURL(b);
            t.className = 'photostrip-item';
            t.draggable = false;
            t.addEventListener('click', (e) => handlePhotoSelection(i, e.currentTarget));
            content.appendChild(t);

            const actions = document.createElement('div');
            actions.className = 'strip-item-actions';

            const stylizeButton = document.createElement('button');
            stylizeButton.textContent = '🪄';
            stylizeButton.title = 'Stylize Photo';
            stylizeButton.addEventListener('click', (e) => {
                e.stopPropagation();
                handleStylizeButtonClick(i, t);
            });

            const cropButton = document.createElement('button');
            cropButton.textContent = '✂️';
            cropButton.title = 'Crop Photo';
            cropButton.addEventListener('click', (e) => {
                e.stopPropagation();
                const templateHole = appState.templateInfo.holes[i];
                const targetAspectRatio = templateHole.w / templateHole.h;

                let imageToCrop;
                let currentCropData;
                let cacheKey;

                if (appState.isStylized[i]) {
                    // If stylized, use the uncropped stylized image from cache
                    cacheKey = `${i}-${appState.selectedStylePrompt || ''}`;
                    imageToCrop = appState.stylizedImagesCache[cacheKey] || appState.originalPhotos[i];
                    currentCropData = appState.stylizedCropData[i];
                } else {
                    // If original, use the original photo
                    imageToCrop = appState.originalPhotos[i];
                    currentCropData = appState.cropData[i];
                }

                appState.cropper.show(imageToCrop, targetAspectRatio, currentCropData).then(result => {
                    if (result) {
                        const oldBlob = appState.capturedPhotos[i];
                        appState.capturedPhotos[i] = result.croppedBlob;

                        if (appState.isStylized[i]) {
                            appState.stylizedCropData[i] = result.cropData;
                        } else {
                            appState.cropData[i] = result.cropData;
                        }

                        const assignmentIndex = appState.photoAssignments.indexOf(oldBlob);
                        if (assignmentIndex !== -1) {
                            appState.photoAssignments[assignmentIndex] = result.croppedBlob;
                        }

                        renderReviewThumbnails();
                        renderPreview();
                    }
                });
            });

            actions.appendChild(stylizeButton);
            actions.appendChild(cropButton);

            itemContainer.appendChild(content);
            itemContainer.appendChild(actions);

            c.appendChild(itemContainer); 
        }); 
    }


    async function loadSimilarTemplates() { 
        const { aspect_ratio, cell_layout } = appState.templateInfo; 
        try { 
            const r = await fetch(`/templates_by_layout?aspect_ratio=${aspect_ratio}&cell_layout=${cell_layout}`); 
            const d = await r.json(); 
            const c = document.getElementById('template-gallery-review'); 
            c.innerHTML = ''; 
            d.forEach(t => { 
                const itemContainer = document.createElement('div');
                itemContainer.className = 'strip-item';

                const content = document.createElement('div');
                content.className = 'strip-item-content';

                const i = document.createElement('div'); 
                i.className = 'template-item'; 
                const m = document.createElement('img'); 
                m.src = t.template_path; 
                i.appendChild(m); 
                i.addEventListener('click', () => handleTemplateChange(t));

                const currentBasePath = appState.templateInfo.original_path || appState.templateInfo.template_path;
                if (t.template_path === currentBasePath) {
                    i.classList.add('selected');
                }
                content.appendChild(i);

                const actions = document.createElement('div');
                actions.className = 'strip-item-actions';

                if (t.is_default) {
                    const colorButton = document.createElement('button');
                    colorButton.textContent = '🎨';
                    colorButton.addEventListener('click', (e) => {
                        e.stopPropagation();
                        showColorPalettePanel(t);
                    });
                    actions.appendChild(colorButton);
                }

                itemContainer.appendChild(content);
                itemContainer.appendChild(actions);

                c.appendChild(itemContainer); 
            }); 
        } catch (e) { 
            console.error(e); 
        } 
    }

    // --- This function now only handles showing the panel and populating it ---
    async function showColorPalettePanel(template) {
        const templatePanel = document.getElementById('template-gallery-review');
        const colorPanel = document.getElementById('color-palette-panel');

        templatePanel.classList.remove('show');
        colorPanel.innerHTML = ''; // Clear previous content

        panelHistory.push('templates');
        stripBackBtn.style.display = 'block';


        // --- Color Swatches ---
        try {
            const r = await fetch('/colors');
            const colors = await r.json();
            colors.forEach(colorObj => {
                const swatch = document.createElement('div');
                swatch.className = 'palette-swatch';
                swatch.style.backgroundColor = colorObj.hex_code;
                swatch.addEventListener('click', () => {
                    recolorTemplateAndApply(template, colorObj.hex_code);
                    stripBackBtn.click();
                });
                colorPanel.appendChild(swatch);
            });
        } catch (e) {
            console.error("Failed to load colors:", e);
        }

        // --- Add Custom Color Button ---
        const addButton = document.createElement('button');
        addButton.className = 'palette-add-btn';
        addButton.textContent = '+';
        addButton.addEventListener('click', async () => {
            const result = await colorPicker.show();
            if (result) {
                recolorTemplateAndApply(template, result.color);
                stripBackBtn.click();
            }
        });
        colorPanel.appendChild(addButton);

        colorPanel.classList.add('show');
    }

    

    async function openTextColorPicker() {
        if (!appState.activeText.data) return;
        const result = await colorPicker.show(appState.activeText.data.color);
        if (result) {
            appState.activeText.data.color = result.color;
            renderPlacedTexts();
        }
    }

    function renderPreview() { 
        const p = document.getElementById('review-preview'); 
        document.getElementById('review-photos-container').innerHTML = ''; 
        const t = document.getElementById('review-template-overlay');
        t.src = appState.templateInfo.colored_template_path || appState.templateInfo.template_path; 
        t.className = 'preview-template-img'; 
        t.onload = () => { 
            renderPhotoAssignments(); 
            renderPlacedStickers(); 
            renderPlacedTexts();
        }; 
    }

    function handleTemplateChange(newTemplate) { 
        if (!newTemplate.original_path) {
            delete newTemplate.colored_template_path;
            delete newTemplate.original_path;
        }
        appState.templateInfo = newTemplate; 
        renderPreview(); 
        loadSimilarTemplates(); // Re-render the strip to update the highlight
    }

    function recolorTemplateAndApply(template, color) {
        const img = new Image();
        img.crossOrigin = "Anonymous"; // Required for canvas with cross-origin images
        img.src = template.original_path || template.template_path;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');

            // Draw the original template image
            ctx.drawImage(img, 0, 0);

            // If the color is white, we don't need to do anything else
            if (color.toLowerCase() !== '#ffffff') {
                 // Use 'source-in' to only draw on non-transparent parts of the existing image
                ctx.globalCompositeOperation = 'source-in';

                // Fill with the selected color
                ctx.fillStyle = color;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }

            const dataURL = canvas.toDataURL('image/png');
            
            // Create a new template info object to avoid mutating the original
            const coloredTemplate = { ...template };
            coloredTemplate.colored_template_path = dataURL;
            coloredTemplate.original_path = template.original_path || template.template_path;

            appState.templateInfo = coloredTemplate;
            renderPreview();
            handleTemplateChange(coloredTemplate);
        };
        img.onerror = () => {
            console.error("Failed to load image for recoloring.");
        };
    }

    function getPreviewScaling(previewId = 'review-preview') {
        const p = document.getElementById(previewId), t = p.querySelector('#review-template-overlay');
        if (!t || !t.naturalWidth) return { scale: 1, offsetX: 0, offsetY: 0, renderedWidth: 0, renderedHeight: 0 };

        const containerWidth = p.offsetWidth;
        const containerHeight = p.offsetHeight;
        const imageNaturalWidth = t.naturalWidth;
        const imageNaturalHeight = t.naturalHeight;

        const containerRatio = containerWidth / containerHeight;
        const imageRatio = imageNaturalWidth / imageNaturalHeight;

        let renderedWidth, renderedHeight, offsetX, offsetY;

        if (imageRatio > containerRatio) {
            renderedWidth = containerWidth;
            renderedHeight = containerWidth / imageRatio;
            offsetX = 0;
            offsetY = (containerHeight - renderedHeight) / 2;
        } else {
            renderedHeight = containerHeight;
            renderedWidth = containerHeight * imageRatio;
            offsetX = (containerWidth - renderedWidth) / 2;
            offsetY = 0;
        }

        return {
            scale: renderedWidth / imageNaturalWidth,
            offsetX,
            offsetY,
            renderedWidth,
            renderedHeight
        };
    }

    function renderPhotoAssignments() { 
        const { scale, offsetX, offsetY } = getPreviewScaling();
        if (scale === 1) return; // Preview not ready

        document.querySelectorAll('.preview-photo-wrapper').forEach(w => w.remove()); // Remove old wrappers
        appState.photoAssignments.forEach((b, hIdx) => { 
            const h = appState.templateInfo.holes[hIdx];
            const wrapper = document.createElement('div');
            wrapper.className = 'preview-photo-wrapper';
            wrapper.style.left = `${offsetX + h.x * scale}px`; 
            wrapper.style.top = `${offsetY + h.y * scale}px`; 
            wrapper.style.width = `${h.w * scale}px`; 
            wrapper.style.height = `${h.h * scale}px`;

            const i = document.createElement('img'); 
            i.src = URL.createObjectURL(b); 
            i.className = 'preview-photo-img'; 
            i.draggable = false; 
            
            const btn = document.createElement('button');
            btn.className = 'preview-photo-button';
            btn.addEventListener('click', () => handleHoleSelection(btn, hIdx));

            wrapper.appendChild(i);
            wrapper.appendChild(btn);
            document.getElementById('review-photos-container').appendChild(wrapper); 
        }); 
        applyPhotoFilters(); 
    }

    function handleStylizeButtonClick(photoIndex, photoEl) {
        appState.selectedForStylizing = [];
        appState.selectedForStylizing.push(photoIndex);
        showStylizePanel()
    }
    
    function showStylizePanel() {
        const styleStrip = document.getElementById('style-strip-panel');
        const stripContainer = document.getElementById('strip-container');
        const stripBackBtn = document.getElementById('strip-back-btn');
        const isVisible = styleStrip.classList.contains('show');

        // Close any currently open strip panel
        const currentOpenPanel = Array.from(stripContainer.querySelectorAll('.strip-panel'))
            .find(p => p.classList.contains('show'));
        if (currentOpenPanel) {
            panelHistory.push(currentOpenPanel.dataset.panel);
            currentOpenPanel.classList.remove('show');
        }

        // Hide all panels before toggling
        document.querySelectorAll('.strip-panel').forEach(p => p.classList.remove('show'));

        if (!isVisible) {
            styleStrip.classList.add('show');
            loadStylesStrip(); // Load available styles
            stripBackBtn.style.display = 'block';
        } else {
            stripBackBtn.style.display = 'none';
            panelHistory = [];
        }
    }

    function renderPlacedStickers() {
        document.querySelectorAll('.placed-sticker-wrapper').forEach(w => w.remove());
        const { scale, offsetX, offsetY } = getPreviewScaling();
        if (scale === 1) return; // Preview not ready
        const previewContainer = document.getElementById('review-preview');

        appState.placedStickers.forEach(d => {
            const w = document.createElement('div');
            w.className = 'placed-sticker-wrapper';
            if (appState.activeSticker.data && appState.activeSticker.data.id === d.id) {
                w.classList.add('active');
            }
            w.style.position = 'absolute';
            w.style.left = `${offsetX + d.x * scale}px`;
            w.style.top = `${offsetY + d.y * scale}px`;
            w.style.width = `${d.width * scale}px`;
            w.style.height = `${d.height * scale}px`;
            w.style.transform = `rotate(${d.rotation}deg)`;
            const i = document.createElement('img');
            i.src = d.path;
            i.style.width = '100%';
            i.style.height = '100%';
            w.addEventListener('mousedown', (e) => handleStickerMouseDown(e, d, w), false);
            w.appendChild(i);

            if (appState.activeSticker.data && appState.activeSticker.data.id === d.id) {
                const selectionBox = document.createElement('div');
                selectionBox.className = 'selection-box';
                w.appendChild(selectionBox);

                // Combined Resize/Rotate Handle
                const resizeRotateHandle = document.createElement('div');
                resizeRotateHandle.className = 'sticker-handle resize-rotate';
                resizeRotateHandle.addEventListener('mousedown', (e) => {
                    e.stopPropagation();
                    appState.activeSticker.action = 'resize-rotate';
                    
                    const { scale, offsetX, offsetY } = getPreviewScaling();
                    const previewRect = document.getElementById('review-preview').getBoundingClientRect();
                    const centerX = previewRect.left + offsetX + (d.x + d.width / 2) * scale;
                    const centerY = previewRect.top + offsetY + (d.y + d.height / 2) * scale;

                    appState.dragStart = { 
                        x: e.clientX, 
                        y: e.clientY, 
                        centerX, 
                        centerY, 
                        initialWidth: d.width,
                        initialHeight: d.height,
                        initialRotation: d.rotation,
                        initialDistance: Math.hypot(e.clientX - centerX, e.clientY - centerY),
                        initialAngle: Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI)
                    };
                });
                w.appendChild(resizeRotateHandle);

                // Close Handle
                const closeHandle = document.createElement('div');
                closeHandle.className = 'sticker-handle close';
                closeHandle.textContent = 'X';
                closeHandle.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const index = appState.placedStickers.findIndex(s => s.id === d.id);
                    if (index > -1) {
                        appState.placedStickers.splice(index, 1);
                    }
                    appState.activeSticker = { element: null, data: null, action: null };
                    renderPlacedStickers();
                });
                w.appendChild(closeHandle);
            }

            previewContainer.appendChild(w);
        });
    }

    function handleHoleSelection(el, hIdx) {
        const thumbnailsContainer = document.getElementById('review-thumbnails');

        // Clear previously disabled thumbnail
        if (appState.disabledThumbnailIndex !== -1) {
            const oldThumb = thumbnailsContainer.children[appState.disabledThumbnailIndex];
            if (oldThumb) oldThumb.classList.remove('disabled');
            appState.disabledThumbnailIndex = -1;
        }

        // Clear any photos selected for retake
        if (appState.selectedForRetake.length > 0) {
            appState.selectedForRetake.forEach(pIdx => {
                const thumb = thumbnailsContainer.children[pIdx];
                if (thumb) thumb.classList.remove('selected');
            });
            appState.selectedForRetake = [];
            retakeBtn.style.display = 'none';
        }

        // Handle hole selection
        if (appState.selectedHole.element) {
            appState.selectedHole.element.classList.remove('selected');
        }

        if (appState.selectedHole.index === hIdx) {
            appState.selectedHole = { element: null, index: -1 };
        } else {
            el.classList.add('selected');
            appState.selectedHole = { element: el, index: hIdx };

            // Disable the corresponding thumbnail
            const photoInHole = appState.photoAssignments[hIdx];
            const thumbIndex = appState.capturedPhotos.indexOf(photoInHole);
            if (thumbIndex !== -1) {
                const thumbToDisable = thumbnailsContainer.children[thumbIndex];
                if (thumbToDisable) thumbToDisable.classList.add('disabled');
                appState.disabledThumbnailIndex = thumbIndex;
            }
        }
    }

    function handlePhotoSelection(pIdx, el) {
        // If a hole is selected, perform the swap.
        if (appState.selectedHole.index !== -1) {
            handleSwap(appState.selectedHole.index, pIdx);
            return;
        }

        // If no hole is selected, handle multi-selection for retake.
        const selectedIndex = appState.selectedForRetake.indexOf(pIdx);
        if (selectedIndex > -1) {
            appState.selectedForRetake.splice(selectedIndex, 1);
            el.classList.remove('selected');
        } else {
            appState.selectedForRetake.push(pIdx);
            el.classList.add('selected');
        }

        retakeBtn.style.display = appState.selectedForRetake.length > 0 ? 'block' : 'none';
    }

    function handleSwap(hIdx, pIdx) { 
        const ptm = appState.capturedPhotos[pIdx], 
              ptr = appState.photoAssignments[hIdx], 
              opor = appState.photoAssignments.findIndex(p => p === ptm); 
        if (opor !== -1) { 
            appState.photoAssignments[opor] = ptr; 
        } 
        appState.photoAssignments[hIdx] = ptm; 

        const vtm = appState.capturedVideos[pIdx],
              vtr = appState.videoAssignments[hIdx],
              vpor = appState.videoAssignments.findIndex(v => v === vtm);
        if (vpor !== -1) {
            appState.videoAssignments[vpor] = vtr;
        }
        appState.videoAssignments[hIdx] = vtm;

        if (appState.selectedHole.element) { 
            appState.selectedHole.element.classList.remove('selected'); 
        } 
        appState.selectedHole = { element: null, index: -1 }; 

        // Clear disabled thumbnail
        if (appState.disabledThumbnailIndex !== -1) {
            const oldThumb = document.getElementById('review-thumbnails').children[appState.disabledThumbnailIndex];
            if (oldThumb) oldThumb.classList.remove('disabled');
            appState.disabledThumbnailIndex = -1;
        }

        renderPreview(); 
    }

    function addStickerToCenter(stickerData) {
        const { scale, renderedWidth } = getPreviewScaling();
        const templateNaturalWidth = renderedWidth / scale;
        if (scale === 1) return;

        const stickerImg = new Image();
        stickerImg.onload = () => {
            const desiredNaturalWidth = templateNaturalWidth * 0.3;
            const stickerNaturalW = desiredNaturalWidth;
            const stickerNaturalH = stickerImg.naturalHeight * (desiredNaturalWidth / stickerImg.naturalWidth);

            const template = document.querySelector('#review-preview .preview-template-img');
            const imageNaturalWidth = template.naturalWidth;
            const imageNaturalHeight = template.naturalHeight;

            const imageX = (imageNaturalWidth - stickerNaturalW) / 2;
            const imageY = (imageNaturalHeight - stickerNaturalH) / 2;

            appState.placedStickers.push({
                id: Date.now(),
                path: stickerData.sticker_path,
                x: Math.round(imageX),
                y: Math.round(imageY),
                width: Math.round(stickerNaturalW),
                height: Math.round(stickerNaturalH),
                rotation: 0
            });
            renderPlacedStickers();
        };
        stickerImg.src = stickerData.sticker_path;
    }

    function applyPhotoFilters() {
        const baseFilterString = `brightness(${appState.filters.brightness}%) contrast(${appState.filters.contrast}%) saturate(${appState.filters.saturate}%) blur(${appState.filters.blur}px)`;
        document.querySelectorAll('.preview-photo-img').forEach(img => {
            img.style.filter = baseFilterString;
        });

        let wrapperFilterString = '';

        if (appState.filters.sharpness > 0) {
            const amount = appState.filters.sharpness / 100.0;
            const kernel = [
                0, -amount, 0,
                -amount, 1 + 4 * amount, -amount,
                0, -amount, 0
            ].join(' ');
            document.getElementById('sharpen-matrix').setAttribute('kernelMatrix', kernel);
            wrapperFilterString += ` url(#sharpen-filter)`;
        } else {
            document.getElementById('sharpen-matrix').setAttribute('kernelMatrix', '0 0 0 0 1 0 0 0 0');
        }

        if (appState.filters.warmth !== 100) {
            const amount = (appState.filters.warmth - 100) / 510.0;
            const matrix = `1 0 0 0 ${amount} 0 1 0 0 0 0 0 1 0 ${-amount} 0 0 0 1 0`;
            document.getElementById('warmth-matrix').setAttribute('values', matrix);
            wrapperFilterString += ` url(#warmth-filter)`;
        } else {
            document.getElementById('warmth-matrix').setAttribute('values', '1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0');
        }

        document.querySelectorAll('.preview-photo-wrapper').forEach(wrapper => {
            wrapper.style.filter = wrapperFilterString.trim();
            const grainAmount = appState.filters.grain / 100;
            if (grainAmount > 0) {
                wrapper.style.setProperty('--grain-opacity', grainAmount);
                wrapper.classList.add('grain-effect');
            } else {
                wrapper.classList.remove('grain-effect');
            }
        });
    }

    function handleStickerMouseDown(e, data, el) {
        e.preventDefault();
        e.stopPropagation();
        if (appState.activeSticker.action) return; // Don't start a new sticker drag if one is already active
        if (!appState.activeSticker.data || appState.activeSticker.data.id !== data.id) {
            appState.activeSticker = { element: el, data: data, action: 'move' };
            renderPlacedStickers();
        } else {
            appState.activeSticker.action = 'move';
        }
        appState.dragStart = { x: e.clientX, y: e.clientY, initialX: data.x, initialY: data.y };
    }

    function handleStickerMove(e) {
        if (!appState.activeSticker.action) return;
        e.preventDefault();
        
        const { scale } = getPreviewScaling();
        if (scale === 1) return;

        const dX_natural = (e.clientX - appState.dragStart.x) / scale;
        const dY_natural = (e.clientY - appState.dragStart.y) / scale;

        const sticker = appState.activeSticker.data;

        if (appState.activeSticker.action === 'move') {
            sticker.x = Math.round(appState.dragStart.initialX + dX_natural);
            sticker.y = Math.round(appState.dragStart.initialY + dY_natural);
        } else if (appState.activeSticker.action === 'resize-rotate') {
            const { scale, offsetX, offsetY } = getPreviewScaling();
            const centerX = appState.dragStart.centerX;
            const centerY = appState.dragStart.centerY;

            const mouseVecX = e.clientX - centerX;
            const mouseVecY = e.clientY - centerY;

            const localAngleRad = Math.atan2(appState.dragStart.initialHeight / 2, appState.dragStart.initialWidth / 2);
            const newRotationRad = Math.atan2(mouseVecY, mouseVecX);
            sticker.rotation = (newRotationRad - localAngleRad) * (180 / Math.PI);

            const newDiagScreen = Math.hypot(mouseVecX, mouseVecY);
            const localDiag = Math.hypot(appState.dragStart.initialWidth / 2, appState.dragStart.initialHeight / 2);
            const scaleFactor = newDiagScreen / (localDiag * scale);

            const minSizeNatural = 20 / scale;
            sticker.width = Math.max(minSizeNatural, appState.dragStart.initialWidth * scaleFactor);
            sticker.height = Math.max(minSizeNatural, appState.dragStart.initialHeight * scaleFactor);

            const previewRect = document.getElementById('review-preview').getBoundingClientRect();
            const new_center_natural_x = (centerX - (previewRect.left + offsetX)) / scale;
            const new_center_natural_y = (centerY - (previewRect.top + offsetY)) / scale;

            sticker.x = new_center_natural_x - sticker.width / 2;
            sticker.y = new_center_natural_y - sticker.height / 2;
        } 

        renderPlacedStickers();
    }

    function handleStickerMouseUp(e) {
        if (appState.activeSticker.action) {
            appState.activeSticker.action = null;
        }
    }


    async function applyBackgroundRemovalPreview() {
        const photoWrappers = document.querySelectorAll('.preview-photo-wrapper');
        const updatePromises = Array.from(photoWrappers).map(async (wrapper, index) => {
            const imgElement = wrapper.querySelector('.preview-photo-img');
            const originalPhotoBlob = appState.photoAssignments[index];
            const originalPhotoIndex = appState.capturedPhotos.indexOf(originalPhotoBlob);

            if (appState.removeBackground) {
                imgElement.style.opacity = '0.5';
                if (appState.bgRemovedPhotos[originalPhotoIndex]) {
                    imgElement.src = appState.bgRemovedPhotos[originalPhotoIndex];
                } else {
                    const formData = new FormData();
                    formData.append('file', originalPhotoBlob);
                    try {
                        const response = await fetch('/remove_background', {
                            method: 'POST',
                            body: formData
                        });
                        if (!response.ok) throw new Error('Background removal failed');
                        const newBlob = await response.blob();
                        const newBlobUrl = URL.createObjectURL(newBlob);
                        appState.bgRemovedPhotos[originalPhotoIndex] = newBlobUrl;
                        imgElement.src = newBlobUrl;
                    } catch (error) {
                        console.error('Error removing background:', error);
                        imgElement.src = URL.createObjectURL(originalPhotoBlob);
                    }
                }
                imgElement.style.opacity = '1';
            } else {
                imgElement.src = URL.createObjectURL(originalPhotoBlob);
            }
        });
        await Promise.all(updatePromises);
    }
});
