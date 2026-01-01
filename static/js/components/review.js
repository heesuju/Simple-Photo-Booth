window.eventBus.on('app:init', (appState) => {
    const reviewScreenContainer = document.getElementById('review-screen-container');
    const finalizeBtn = document.getElementById('finalize-btn');
    const retakeBtn = document.getElementById('retake-btn');
    const filterControls = document.getElementById('filter-controls');
    const stickerUploadInput = document.getElementById('sticker-upload-input');
    const reviewToolbar = document.getElementById('review-toolbar');

    const reviewThumbnails = document.getElementById('review-thumbnails');
    let draggedItem = null;
    let dragStartIndex = -1;

    // mousedown listener is now in renderReviewThumbnails

    window.addEventListener('mousemove', (e) => {
        if (!draggedItem) return;
        // Prevent reordering while stylization is in progress
        if (appState.loadingPhotos && appState.loadingPhotos.size > 0) return;

        const thumbnailsContainer = reviewThumbnails;
        const items = [...thumbnailsContainer.querySelectorAll('.strip-item:not(.dragging)')];

        const nextItem = items.find(item => {
            const rect = item.getBoundingClientRect();
            const isHorizontal = window.innerWidth <= 900;
            if (isHorizontal) {
                return e.clientX < rect.left + rect.width / 2;
            } else {
                return e.clientY < rect.top + rect.height / 2;
            }
        });

        if (nextItem) {
            thumbnailsContainer.insertBefore(draggedItem, nextItem);
        } else {
            thumbnailsContainer.appendChild(draggedItem);
        }
    });

    window.addEventListener('mouseup', (e) => {
        if (!draggedItem) return;
        // Prevent reordering while stylization is in progress
        if (appState.loadingPhotos && appState.loadingPhotos.size > 0) {
            draggedItem.classList.remove('dragging');
            draggedItem = null;
            dragStartIndex = -1;
            renderReviewThumbnails(); // Reset visual state
            return;
        }

        const dragEndIndex = [...reviewThumbnails.children].indexOf(draggedItem);
        draggedItem.classList.remove('dragging');
        draggedItem = null;

        if (dragEndIndex !== dragStartIndex) {
            const [reorderedPhoto] = appState.capturedPhotos.splice(dragStartIndex, 1);
            appState.capturedPhotos.splice(dragEndIndex, 0, reorderedPhoto);

            const [reorderedVideo] = appState.capturedVideos.splice(dragStartIndex, 1);
            appState.capturedVideos.splice(dragEndIndex, 0, reorderedVideo);

            const [reorderedOriginalPhoto] = appState.originalPhotos.splice(dragStartIndex, 1);
            appState.originalPhotos.splice(dragEndIndex, 0, reorderedOriginalPhoto);

            appState.photoAssignments = [...appState.capturedPhotos];
            appState.videoAssignments = [...appState.capturedVideos];

            renderReviewThumbnails();
            renderPreview();
        }
    });

    const stripContainer = document.getElementById('strip-container');
    const stripBackBtn = document.getElementById('strip-back-btn');
    let panelHistory = [];
    const removeBgCheckbox = document.getElementById('remove-bg-checkbox');
    const genericAddBtn = document.getElementById('generic-add-btn');
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
    const transformableHandler = window.initTransformable({
        appState,
        getPreviewScaling: window.getPreviewScaling,
        updateSnapLine,
        updateVerticalSnapLine,
        renderTexts: renderPlacedTexts,
        renderStickers: renderPlacedStickers,
    });

    const reviewStyles = window.initReviewStyles(appState, {
        renderPreview,
        renderReviewThumbnails,
        updatePreviewHighlights,
        updateAddFinalizeButtons,
        panelHistory,
        stripContainer,
        stripBackBtn,
        genericAddBtn,
        finalizeBtn,
        reviewToolbar,
        clearSelections,
        renderPhotoAssignments
    });

    // Add ResizeObserver to handle layout changes (especially in mobile view)
    const previewObserver = new ResizeObserver(entries => {
        window.requestAnimationFrame(() => {
            renderPreview();
        });
    });

    // Zoom Controls Logic
    const zoomSlider = document.getElementById('zoom-slider');
    const zoomOutBtn = document.getElementById('zoom-out-btn');
    const zoomInBtn = document.getElementById('zoom-in-btn');
    const zoomLevelIndicator = document.getElementById('zoom-level-indicator');

    function updateZoom(value) {
        value = Math.max(100, Math.min(300, parseInt(value)));
        if (zoomSlider) zoomSlider.value = value;
        if (zoomLevelIndicator) zoomLevelIndicator.textContent = `${value}%`;

        const wrapper = document.getElementById('review-preview-wrapper');
        const previewEl = document.getElementById('review-preview');
        const img = document.getElementById('review-template-overlay');

        if (wrapper && previewEl && img && img.naturalWidth) {
            const zoomFactor = value / 100;
            // Use client dimensions to exclude scrollbars for fit calculation
            const wrapperWidth = wrapper.clientWidth;
            const wrapperHeight = wrapper.clientHeight;

            if (wrapperWidth === 0 || wrapperHeight === 0) return;

            const imageRatio = img.naturalWidth / img.naturalHeight;
            const wrapperRatio = wrapperWidth / wrapperHeight;

            let fitWidth, fitHeight;
            if (imageRatio > wrapperRatio) {
                fitWidth = wrapperWidth;
                fitHeight = wrapperWidth / imageRatio;
            } else {
                fitHeight = wrapperHeight;
                fitWidth = wrapperHeight * imageRatio;
            }

            // Apply Zoom. Ensure we use at least 1px to avoid errors
            previewEl.style.width = `${Math.max(1, fitWidth * zoomFactor)}px`;
            previewEl.style.height = `${Math.max(1, fitHeight * zoomFactor)}px`;

            // Trigger re-render of stickers/texts/photos to match new coordinate system
            renderPhotoAssignments();
            renderPlacedStickers();
            renderPlacedTexts();
        }
    }

    if (zoomSlider) {
        zoomSlider.addEventListener('input', (e) => updateZoom(e.target.value));
        zoomOutBtn.addEventListener('click', () => updateZoom(parseInt(zoomSlider.value) - 10));
        zoomInBtn.addEventListener('click', () => updateZoom(parseInt(zoomSlider.value) + 10));
    }

    // Ctrl + Scroll Zoom Logic
    const reviewPreviewWrapper = document.getElementById('review-preview-wrapper'); // Change to wrapper
    if (reviewPreviewWrapper) {
        previewObserver.observe(reviewPreviewWrapper);

        reviewPreviewWrapper.addEventListener('wheel', (e) => {
            if (e.ctrlKey) {
                e.preventDefault(); // Prevent browser zoom
                const currentZoom = parseInt(zoomSlider.value);
                const delta = e.deltaY > 0 ? -10 : 10;
                updateZoom(currentZoom + delta);
            }
        });
    }


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
        finalizeBtn.style.display = 'block';
    });



    genericAddBtn.addEventListener('click', () => {
        const currentOpenPanel = Array.from(stripContainer.querySelectorAll('.strip-panel')).find(p => p.classList.contains('show'));
        if (!currentOpenPanel) return;

        const panelId = currentOpenPanel.id;
        const panelType = currentOpenPanel.dataset.panel;

        if (panelId === 'style-strip-panel') { // Styles
            // Toggle logic for styles if needed, or open modal
            const addStyleModal = document.getElementById('add-style-modal');
            if (addStyleModal) addStyleModal.className = 'modal-visible';
        } else if (panelType === 'filters') { // Filters
            const addPresetModal = document.getElementById('add-filter-preset-modal');
            // Pre-populate logic from old addPresetBtn click handler
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

        } else if (panelType === 'stickers') { // Stickers
            const categoryGallery = document.getElementById('sticker-category-gallery');
            if (categoryGallery.style.display !== 'none') {
                document.getElementById('add-sticker-category-modal').className = 'modal-visible';
            } else {
                stickerUploadInput.click();
            }
        } else if (panelId === 'color-palette-panel') { // Template Colors
            colorPicker.show().then(result => {
                if (result) {
                    // We need the template object here... 
                    // showColorPalettePanel saves context? No. 
                    // We need to know which template we are editing. 
                    // Let's store currentTemplate in appState or closure? 
                    // showColorPalettePanel is called with template.
                    if (appState.currentEditingTemplate) {
                        if (result.saved) {
                            showColorPalettePanel(appState.currentEditingTemplate);
                        }
                        recolorTemplateAndApply(appState.currentEditingTemplate, result.color);
                        // User might want to try multiple colors.
                        // But if we want to follow 'swatch click' behavior:
                        // stripBackBtn.click();
                    }
                }
            });
        } else if (panelType === 'add-text') { // Fonts
            fontUploadInput.click();
        }
    });

    fontUploadInput.addEventListener('change', (e) => window.handleFileUpload(e, '/upload_font', loadFontGallery));



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

                        const tempSpan = document.createElement('span');
                        tempSpan.style.fontFamily = result.font;
                        tempSpan.style.fontSize = '40px';
                        tempSpan.style.whiteSpace = 'pre';
                        tempSpan.innerHTML = result.text.replace(/\n/g, '<br>');
                        document.body.appendChild(tempSpan);
                        const textNaturalWidth = tempSpan.offsetWidth;
                        const textNaturalHeight = tempSpan.offsetHeight;
                        document.body.removeChild(tempSpan);

                        const template = document.querySelector('#review-preview .preview-template-img');
                        const imageNaturalWidth = template.naturalWidth;
                        const imageNaturalHeight = template.naturalHeight;
                        const imageX = (imageNaturalWidth - textNaturalWidth) / 2;
                        const imageY = (imageNaturalHeight - textNaturalHeight) / 2;

                        appState.placedTexts.push({
                            id: Date.now(),
                            text: result.text,
                            font: result.font,
                            color: result.color,
                            x: Math.round(imageX),
                            y: Math.round(imageY),
                            width: Math.round(textNaturalWidth),
                            height: Math.round(textNaturalHeight),
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
                stripContainer.querySelectorAll('.strip-panel').forEach(p => p.classList.remove('show'));
                sidebar.classList.remove('strip-active');
                clearSelections();
                stripBackBtn.style.display = 'none';
                panelHistory = [];
                updateAddFinalizeButtons();
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
            stripContainer.querySelectorAll('.strip-panel').forEach(p => p.classList.remove('show'));
            sidebar.classList.remove('strip-active');

            // Activate the new button and its corresponding panel
            e.target.classList.add('active');

            const targetStrip = stripContainer.querySelector(`.strip-panel[data-panel="${panelType}"]`);
            if (targetStrip) {
                targetStrip.classList.add('show');
                sidebar.classList.add('strip-active');
                stripBackBtn.style.display = 'block';
            }

            if (panelType === 'filters') {
                loadFilterPresets();
            }

            updateAddFinalizeButtons();
        }
    });

    stripBackBtn.addEventListener('click', () => {
        const stickerGallery = document.getElementById('sticker-gallery');
        const categoryGallery = document.getElementById('sticker-category-gallery');

        if (stickerGallery.style.display === 'flex') {
            loadStickerGallery();
            return;
        }

        const currentOpenPanel = Array.from(stripContainer.querySelectorAll('.strip-panel')).find(p => p.classList.contains('show'));
        if (currentOpenPanel) {
            // If we are leaving the style panel, clear the specific selection for it
            if (currentOpenPanel.id === 'style-strip-panel') {
                appState.selectedForStylizing = [];
                updatePreviewHighlights();
            }
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
            updateAddFinalizeButtons();
        } else {
            stripBackBtn.style.display = 'none';
            document.getElementById('review-sidebar').classList.remove('strip-active');
            const currentActiveBtn = reviewToolbar.querySelector('.active');
            if (currentActiveBtn) {
                currentActiveBtn.classList.remove('active');
            }

            updateAddFinalizeButtons();

            // Clear stylizing selection when fully closing panels
            appState.selectedForStylizing = [];
            updatePreviewHighlights();
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

            const nonePresetContainer = document.createElement('div');
            nonePresetContainer.className = 'filter-preset-container';

            const nonePresetItem = document.createElement('div');
            nonePresetItem.className = 'style-strip-item';

            const noneThumbnail = document.createElement('img');
            noneThumbnail.className = 'filter-preset-thumbnail';
            noneThumbnail.src = firstPhotoUrl;

            const noneName = document.createElement('div');
            noneName.className = 'filter-preset-label';
            noneName.textContent = 'None';

            nonePresetItem.appendChild(noneThumbnail);
            nonePresetContainer.appendChild(nonePresetItem);
            nonePresetContainer.appendChild(noneName);

            nonePresetContainer.addEventListener('click', () => {
                appState.filters = { brightness: 100, contrast: 100, saturate: 100, warmth: 100, sharpness: 0, blur: 0, grain: 0 };
                for (const filter in appState.filters) {
                    const slider = document.querySelector(`#filter-controls input[data-filter="${filter}"]`);
                    if (slider) {
                        slider.value = appState.filters[filter];
                    }
                }
                applyPhotoFilters();
            });
            presetStrip.appendChild(nonePresetContainer);

            presets.forEach(preset => {
                const presetContainer = document.createElement('div');
                presetContainer.className = 'filter-preset-container';

                const presetItem = document.createElement('div');
                presetItem.className = 'style-strip-item';

                const thumbnail = document.createElement('img');
                thumbnail.className = 'filter-preset-thumbnail';
                thumbnail.src = firstPhotoUrl;
                const values = preset.values;
                thumbnail.style.filter = `brightness(${values.brightness}%) contrast(${values.contrast}%) saturate(${values.saturate}%) blur(${values.blur}px)`;

                const name = document.createElement('div');
                name.className = 'filter-preset-label';
                name.textContent = preset.name;

                presetItem.appendChild(thumbnail);
                presetContainer.appendChild(presetItem);
                presetContainer.appendChild(name);

                presetContainer.addEventListener('click', () => applyFilterPreset(preset.values));
                presetStrip.appendChild(presetContainer);
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
        const sidebar = document.getElementById('review-sidebar');
        if (sidebar.classList.contains('strip-active')) {
            if (!sidebar.contains(e.target) && !e.target.closest('.modal-content') && !e.target.closest('.modal-dialog')) {
                stripContainer.querySelectorAll('.strip-panel').forEach(p => p.classList.remove('show'));
                sidebar.classList.remove('strip-active');
                const currentActiveBtn = reviewToolbar.querySelector('.active');
                if (currentActiveBtn) {
                    currentActiveBtn.classList.remove('active');
                }
                stripBackBtn.style.display = 'none';
                panelHistory = [];
                // Clear stylizing selections
                appState.selectedForStylizing = [];
                updatePreviewHighlights();
                updateAddFinalizeButtons();
            }
        }
    });

    function clearSelections() {
        // Clear selected hole in preview
        if (appState.selectedHole.element) {
            appState.selectedHole.element.classList.remove('selected');
        }
        appState.selectedHole = { element: null, index: -1 };

        // Clear stylizing selections
        appState.selectedForStylizing = [];
        updatePreviewHighlights();

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
            document.getElementById('finalize-btn').style.display = 'block';
        }
    }



    stickerUploadInput.addEventListener('change', (e) => {
        const currentCategory = document.getElementById('sticker-category-gallery').dataset.category;
        window.handleFileUpload(e, '/upload_sticker', loadStickerGallery, currentCategory);
    });

    window.addEventListener('resize', renderPreview);

    document.addEventListener('click', (e) => {
        if (appState.activeTransformable && appState.activeTransformable.element && !appState.activeTransformable.element.contains(e.target)) {
            // Check if the click was on another transformable. If so, the mousedown handler has already taken care of it.
            if (e.target.closest('.placed-sticker-wrapper, .placed-text-wrapper')) {
                return;
            }

            if (appState.activeTransformable.type === 'text') {
                const textBox = appState.activeTransformable.element.querySelector('.editable-text');
                textBox.contentEditable = false;
            }
            appState.activeTransformable = null;
            renderPlacedTexts();
            renderPlacedStickers();
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

    window.eventBus.on('review:home', () => {
        document.getElementById('finalize-btn').disabled = false;
        window.eventBus.dispatch('screen:show', 'photo-hanging-gallery');
    });

    function showReviewScreen(isContinuingEditing = false) {
        if (!isContinuingEditing) {
            appState.photoAssignments = [...appState.capturedPhotos];
            appState.videoAssignments = [...appState.capturedVideos];
            appState.selectedForRetake = [];
            appState.disabledThumbnailIndex = -1;
            appState.placedStickers = [];
            appState.placedTexts = [];
            appState.activeTransformable = null;
            appState.removeBackground = false;
            appState.stylizedImagesCache = {};
            appState.stylizedCropData = {};
            appState.isStylized = new Array(appState.capturedPhotos.length).fill(false);
            appState.loadingPhotos = new Set();
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
            // Reset Zoom
            updateZoom(100);
        }
        renderReviewThumbnails();
        renderPreview();
        loadStickerGallery();
        loadSimilarTemplates();
    }

    async function loadStickerGallery(selectedCategory = null) {
        try {
            const [stickersResponse, categoriesResponse] = await Promise.all([
                fetch('/stickers'),
                fetch('/sticker_categories')
            ]);
            const stickers = await stickersResponse.json();
            const fetchedCategories = await categoriesResponse.json();

            const stickerGallery = document.getElementById('sticker-gallery');
            const categoryGallery = document.getElementById('sticker-category-gallery');
            const stickerUploadInput = document.getElementById('sticker-upload-input');

            stickerGallery.innerHTML = '';
            categoryGallery.innerHTML = '';

            if (selectedCategory) {
                categoryGallery.style.display = 'none';
                stickerGallery.style.display = 'flex';
                categoryGallery.dataset.category = selectedCategory;

                stickers.filter(s => s.category === selectedCategory).forEach(s => {
                    const i = document.createElement('div');
                    i.className = 'sticker-item';
                    const m = document.createElement('img');
                    m.src = s.sticker_path;
                    m.draggable = false;
                    i.addEventListener('click', () => addStickerToCenter(s));
                    i.appendChild(m);
                    stickerGallery.appendChild(i);
                });

            } else {
                categoryGallery.style.display = 'flex';
                stickerGallery.style.display = 'none';
                delete categoryGallery.dataset.category;

                // Combine categories from stickers (in case of DB/Filesystem mismatch) and explicit folders
                const stickerCategories = stickers.map(s => s.category).filter(Boolean);
                const allCategories = [...new Set([...fetchedCategories, ...stickerCategories])];

                allCategories.forEach(category => {
                    const categoryButton = document.createElement('button');
                    categoryButton.className = 'style-strip-item';
                    categoryButton.textContent = category;
                    categoryButton.onclick = () => loadStickerGallery(category);
                    categoryGallery.appendChild(categoryButton);
                });

                stickers.filter(s => !s.category).forEach(s => {
                    const i = document.createElement('div');
                    i.className = 'sticker-item';
                    const m = document.createElement('img');
                    m.src = s.sticker_path;
                    m.draggable = false;
                    i.addEventListener('click', () => addStickerToCenter(s));
                    i.appendChild(m);
                    categoryGallery.appendChild(i);
                });
            }
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
            if (appState.activeTransformable && appState.activeTransformable.data.id === d.id) {
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
            i.style.whiteSpace = 'pre'; // Apply justification
            i.style.textAlign = d.justify; // Apply justification

            w.style.height = 'auto';
            d.height = i.offsetHeight / scale;

            i.addEventListener('input', (e) => {
                d.text = e.target.innerText;
            });

            w.addEventListener('mousedown', (e) => transformableHandler.handleMouseDown(e, d, w, 'text'), false);
            w.addEventListener('dblclick', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const result = await textEdit.show({
                    text: d.text,
                    font: d.font,
                    color: d.color,
                    justify: d.justify
                });
                if (result) {
                    d.text = result.text;
                    d.font = result.font;
                    d.color = result.color;
                    d.justify = result.justify;
                    renderPlacedTexts();
                }
            });
            w.appendChild(i);

            if (appState.activeTransformable && appState.activeTransformable.data.id === d.id) {
                const selectionBox = document.createElement('div');
                selectionBox.className = 'selection-box';
                w.appendChild(selectionBox);

                const resizeRotateHandle = document.createElement('div');
                resizeRotateHandle.className = 'sticker-handle resize-rotate';
                resizeRotateHandle.addEventListener('mousedown', (e) => transformableHandler.handleResizeRotateMouseDown(e, d, w, 'text'));
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
                    appState.activeTransformable = null;
                    renderPlacedTexts();
                });
                w.appendChild(closeHandle);
            }

            previewContainer.appendChild(w);
        });
    }



    function renderReviewThumbnails() {
        const c = document.getElementById('review-thumbnails');
        c.innerHTML = '';

        appState.capturedPhotos.forEach((b, i) => {
            const itemContainer = document.createElement('div');
            itemContainer.className = 'strip-item';
            itemContainer.dataset.index = i;

            const handle = document.createElement('div');
            handle.className = 'drag-handle';
            // Disable drag handle visually when stylization is in progress
            if (appState.loadingPhotos && appState.loadingPhotos.size > 0) {
                handle.style.opacity = '0.3';
                handle.style.cursor = 'not-allowed';
            }
            handle.innerHTML = '&#9776;'; // Hamburger icon
            handle.addEventListener('mousedown', (e) => {
                // Prevent dragging while stylization is in progress
                if (appState.loadingPhotos && appState.loadingPhotos.size > 0) {
                    e.preventDefault();
                    return;
                }
                draggedItem = itemContainer;
                dragStartIndex = i;
                draggedItem.classList.add('dragging');
                e.preventDefault();
            });
            itemContainer.appendChild(handle);

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
                reviewStyles.handleStylizeButtonClick(i);
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
        const genericAddBtn = document.getElementById('generic-add-btn');
        const finalizeBtn = document.getElementById('finalize-btn');

        // Store current template for Generic Add Button context
        appState.currentEditingTemplate = template;

        templatePanel.classList.remove('show');
        colorPanel.innerHTML = ''; // Clear previous content

        panelHistory.push('templates');
        stripBackBtn.style.display = 'block';
        genericAddBtn.style.display = 'block';
        finalizeBtn.style.display = 'none';


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
                    // stripBackBtn.click(); // Keep panel open
                });
                colorPanel.appendChild(swatch);
            });
        } catch (e) {
            console.error("Failed to load colors:", e);
        }




        colorPanel.classList.add('show');
    }



    async function openTextColorPicker() {
        if (!appState.activeTransformable || appState.activeTransformable.type !== 'text') return;
        const result = await colorPicker.show(appState.activeTransformable.data.color);
        if (result) {
            appState.activeTransformable.data.color = result.color;
            renderPlacedTexts();
        }
    }

    function renderPreview() {
        const p = document.getElementById('review-preview');
        // Check if templateInfo exists before proceeding. Resizing might trigger this early.
        if (!appState.templateInfo) return;

        document.getElementById('review-photos-container').innerHTML = '';
        const t = document.getElementById('review-template-overlay');
        t.src = appState.templateInfo.colored_template_path || appState.templateInfo.template_path;
        t.className = 'preview-template-img';
        t.onload = () => {
            // Apply current zoom to set correct container size before rendering children
            const slider = document.getElementById('zoom-slider');
            if (slider) updateZoom(slider.value);

            if (!slider || slider.value === '100') {
                renderPhotoAssignments();
                renderPlacedStickers();
                renderPlacedTexts();
            }
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



    function renderPhotoAssignments() {
        const { scale, offsetX, offsetY } = getPreviewScaling();
        if (scale === 1) return; // Preview not ready

        document.querySelectorAll('.preview-photo-wrapper').forEach(w => w.remove()); // Remove old wrappers
        appState.photoAssignments.forEach((b, hIdx) => {
            const h = appState.templateInfo.holes[hIdx];
            const wrapper = document.createElement('div');
            wrapper.className = 'preview-photo-wrapper';

            // Find which photo index is assigned to this hole
            const photoInHole = appState.photoAssignments[hIdx];
            const pIdx = appState.capturedPhotos.indexOf(photoInHole);

            // Apply loading class if this photo is being stylized
            if (pIdx !== -1 && appState.loadingPhotos.has(pIdx)) {
                wrapper.classList.add('loading');
            }

            wrapper.style.left = `${offsetX + h.x * scale}px`;
            wrapper.style.top = `${offsetY + h.y * scale}px`;
            wrapper.style.width = `${h.w * scale}px`;
            wrapper.style.height = `${h.h * scale}px`;
            const transform = appState.templateInfo.transformations[hIdx];
            if (transform && transform.rotation !== undefined) {
                wrapper.style.transform = `rotate(${transform.rotation}deg)`;
            }

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
        updatePreviewHighlights();
    }



    function renderPlacedStickers() {
        document.querySelectorAll('.placed-sticker-wrapper').forEach(w => w.remove());
        const { scale, offsetX, offsetY } = getPreviewScaling();
        if (scale === 1) return; // Preview not ready
        const previewContainer = document.getElementById('review-preview');

        appState.placedStickers.forEach(d => {
            const w = document.createElement('div');
            w.className = 'placed-sticker-wrapper';
            if (appState.activeTransformable && appState.activeTransformable.data.id === d.id) {
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
            w.addEventListener('mousedown', (e) => transformableHandler.handleMouseDown(e, d, w, 'sticker'), false);
            w.appendChild(i);

            if (appState.activeTransformable && appState.activeTransformable.data.id === d.id) {
                const selectionBox = document.createElement('div');
                selectionBox.className = 'selection-box';
                w.appendChild(selectionBox);

                // Combined Resize/Rotate Handle
                const resizeRotateHandle = document.createElement('div');
                resizeRotateHandle.className = 'sticker-handle resize-rotate';
                resizeRotateHandle.addEventListener('mousedown', (e) => transformableHandler.handleResizeRotateMouseDown(e, d, w, 'sticker'));
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
                    appState.activeTransformable = null;
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
            document.getElementById('finalize-btn').style.display = 'block';
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


        updateAddFinalizeButtons();
        updatePreviewHighlights();
    }

    function updateAddFinalizeButtons() {
        // Priority 1: Retake Selection
        const hasSelection = appState.selectedForRetake.length > 0;
        if (hasSelection) {
            retakeBtn.style.display = 'block';
            finalizeBtn.style.display = 'none';
            genericAddBtn.style.display = 'none';
            return;
        }

        retakeBtn.style.display = 'none';

        // Priority 2: Open Panel Context
        const currentOpenPanel = Array.from(stripContainer.querySelectorAll('.strip-panel')).find(p => p.classList.contains('show'));

        if (!currentOpenPanel) {
            genericAddBtn.style.display = 'none';
            finalizeBtn.style.display = 'block';
            return;
        }

        // If panel is open, check if it needs the "Add" button
        const type = currentOpenPanel.dataset.panel;
        const showAdd = ['styles', 'filters', 'stickers', 'add-text', 'colors'].includes(type);

        if (showAdd) {
            genericAddBtn.style.display = 'block';
            finalizeBtn.style.display = 'none';
        } else {
            genericAddBtn.style.display = 'none';
            finalizeBtn.style.display = 'block';
        }
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

    function updatePreviewHighlights() {
        // Clear all highlights first
        document.querySelectorAll('.preview-photo-wrapper').forEach(w => w.classList.remove('highlighted'));

        // Helper to highlight a photo by index
        const highlightPhoto = (pIdx) => {
            const selectedPhotoBlob = appState.capturedPhotos[pIdx];
            // Assignment index search
            const assignmentIndex = appState.photoAssignments.indexOf(selectedPhotoBlob);
            if (assignmentIndex !== -1) {
                const wrappers = document.querySelectorAll('.preview-photo-wrapper');
                if (wrappers[assignmentIndex]) {
                    wrappers[assignmentIndex].classList.add('highlighted');
                }
            }
        };

        // Apply highlights based on selected photos
        appState.selectedForRetake.forEach(highlightPhoto);

        // Apply highlights for stylizing selection
        if (appState.selectedForStylizing) {
            appState.selectedForStylizing.forEach(highlightPhoto);
        }
    }

    function updateSnapLine(isSnapping, yPosition) {
        const previewContainer = document.getElementById('review-preview');
        let snapLine = document.getElementById('snap-line');
        if (isSnapping) {
            if (!snapLine) {
                snapLine = document.createElement('div');
                snapLine.id = 'snap-line';
                snapLine.style.position = 'absolute';
                snapLine.style.width = '100%';
                snapLine.style.height = '2px';
                snapLine.style.backgroundColor = '#4CAF50';
                snapLine.style.left = '0';
                snapLine.style.zIndex = '10000';
                previewContainer.appendChild(snapLine);
            }
            const previewRect = previewContainer.getBoundingClientRect();
            snapLine.style.top = `${yPosition - previewRect.top}px`;
            snapLine.style.display = 'block';
        } else {
            if (snapLine) {
                snapLine.style.display = 'none';
            }
        }
    }



    function updateVerticalSnapLine(isSnapping, xPosition) {
        const previewContainer = document.getElementById('review-preview');
        let snapLine = document.getElementById('vertical-snap-line');
        if (isSnapping) {
            if (!snapLine) {
                snapLine = document.createElement('div');
                snapLine.id = 'vertical-snap-line';
                snapLine.style.position = 'absolute';
                snapLine.style.width = '2px';
                snapLine.style.height = '100%';
                snapLine.style.backgroundColor = '#4CAF50';
                snapLine.style.top = '0';
                snapLine.style.zIndex = '10000';
                previewContainer.appendChild(snapLine);
            }
            const previewRect = previewContainer.getBoundingClientRect();
            snapLine.style.left = `${xPosition - previewRect.left}px`;
            snapLine.style.display = 'block';
        } else {
            if (snapLine) {
                snapLine.style.display = 'none';
            }
        }
    }



    // --- Sticker Category Modal ---
    const addStickerCategoryModal = document.getElementById('add-sticker-category-modal');
    const newCategoryNameInput = document.getElementById('new-category-name');
    const addCategoryConfirmBtn = document.getElementById('add-category-confirm-btn');
    const addCategoryCancelBtn = document.getElementById('add-category-cancel-btn');

    if (addCategoryConfirmBtn && addCategoryCancelBtn) {
        addCategoryConfirmBtn.addEventListener('click', async () => {
            const name = newCategoryNameInput.value.trim();
            if (!name) {
                alert('Please enter a category name.');
                return;
            }

            try {
                const response = await fetch('/create_sticker_category', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: name })
                });

                if (response.ok) {
                    addStickerCategoryModal.className = 'modal-hidden';
                    newCategoryNameInput.value = '';
                    loadStickerGallery(); // Reload gallery
                } else {
                    const data = await response.json();
                    alert(data.detail || 'Failed to create category.');
                }
            } catch (e) {
                console.error(e);
                alert('Error creating category.');
            }
        });

        addCategoryCancelBtn.addEventListener('click', () => {
            addStickerCategoryModal.className = 'modal-hidden';
            newCategoryNameInput.value = '';
        });
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
