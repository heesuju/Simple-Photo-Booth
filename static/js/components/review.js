window.eventBus.on('app:init', (appState) => {
    const reviewScreenContainer = document.getElementById('review-screen-container');
    const finalizeBtn = document.getElementById('finalize-btn');
    const retakeBtn = document.getElementById('retake-btn');
    const filterControls = document.getElementById('filter-controls');
    const stickerUploadInput = document.getElementById('sticker-upload-input');
    const reviewToolbar = document.getElementById('review-navigation');

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

    const reviewDecorations = window.initReviewDecorations(appState, {
        getPreviewScaling: window.getPreviewScaling,
        renderPreview,
        showToast: window.showToast
    });

    const reviewStyles = window.initReviewStyles(appState, {
        renderPreview,
        renderReviewThumbnails,
        updatePreviewHighlights,
        updateAddFinalizeButtons,
        panelHistory,
        showToast: window.showToast,
        stripContainer,
        stripBackBtn,
        genericAddBtn,
        finalizeBtn,
        reviewToolbar,
        clearSelections,
        renderPhotoAssignments
    });

    // --- Sidebar Resize Logic ---
    (function initResizeHandles() {
        // PC Handle
        const pcHandle = document.getElementById('resize-handle-pc');
        const sidebar = document.getElementById('review-sidebar');

        if (pcHandle && sidebar) {
            let isResizing = false;

            const startResize = (e) => {
                isResizing = true;
                pcHandle.classList.add('active');
                e.preventDefault(); // Prevent selection
            };

            const stopResize = () => {
                if (isResizing) {
                    isResizing = false;
                    pcHandle.classList.remove('active');
                    renderPreview(); // Re-center/scale preview
                }
            };

            const resize = (e) => {
                if (!isResizing) return;
                // Calculate new width: Sidebar is on right. Width = Window Width - Mouse X
                // But handle is on Left of sidebar. So Mouse X is strictly the left edge.
                // Width = window.innerWidth - e.clientX
                // Constraint: Min width 300px, Max width 600px?
                const newWidth = window.innerWidth - e.clientX;
                if (newWidth >= 300 && newWidth <= 800) {
                    sidebar.style.width = `${newWidth}px`;
                    sidebar.style.minWidth = `${newWidth}px`;
                }
            };

            pcHandle.addEventListener('mousedown', startResize);
            window.addEventListener('mousemove', resize);
            window.addEventListener('mouseup', stopResize);
        }

        // Mobile Handle
        const mobileHandle = document.getElementById('resize-handle-mobile');
        const sidebarContent = document.getElementById('sidebar-content');

        if (mobileHandle && sidebarContent) {
            let isResizingMobile = false;

            const startResizeMobile = (e) => {
                isResizingMobile = true;
                e.preventDefault(); // Prevent scroll
            };

            const stopResizeMobile = () => {
                if (isResizingMobile) {
                    isResizingMobile = false;
                }
            };

            const resizeMobile = (e) => {
                if (!isResizingMobile) return;

                // For touch events
                const clientY = e.touches ? e.touches[0].clientY : e.clientY;

                // Height = Window Height - Touch Y - Nav Height (60)
                // Wait, sidebar-content bottom is at 60px.
                // So Top of content = Touch Y.
                // Height = (Window Height - 60) - Touch Y?
                // Actually simpler: Height = Window Height - clientY - 60 (nav height)

                const navHeight = 60;
                const availableHeight = window.innerHeight - navHeight;
                let newHeight = availableHeight - clientY;

                // Constraints:
                // Min height: 100px? (Actions area)
                // Max height: availableHeight (Full screen minus nav)

                // Actually constraint is relative to sidebar-content position.
                // We want to control the HEIGHT of 'sidebar-content'.
                // Since it is 'bottom: 60px', setting height grows it upwards.

                if (newHeight < 100) newHeight = 100;
                if (newHeight > availableHeight) newHeight = availableHeight;

                sidebarContent.style.height = `${newHeight}px`;
                sidebarContent.style.maxHeight = 'none'; // Override CSS limit if dragging
            };

            mobileHandle.addEventListener('mousedown', startResizeMobile);
            mobileHandle.addEventListener('touchstart', startResizeMobile, { passive: false });

            window.addEventListener('mousemove', resizeMobile);
            window.addEventListener('touchmove', resizeMobile, { passive: false });

            window.addEventListener('mouseup', stopResizeMobile);
            window.addEventListener('touchend', stopResizeMobile);
        }
    })();

    const reviewFilters = window.initReviewFilters(appState, {
        renderPreview,
        showToast: window.showToast
    });

    const reviewBackgrounds = window.initReviewBackgrounds(appState, {
        renderPreview,
        renderReviewThumbnails,
        stripContainer,
        stripBackBtn,
        genericAddBtn,
        finalizeBtn,
        showToast: window.showToast,
        reviewToolbar,
        updatePreviewHighlights
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
            reviewDecorations.renderPlacedStickers();
            reviewDecorations.renderPlacedTexts();
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

    fontUploadInput.addEventListener('change', (e) => window.handleFileUpload(e, '/upload_font', reviewDecorations.loadFontGallery));










    reviewToolbar.addEventListener('click', (e) => {
        if (e.target.classList.contains('toolbar-btn')) {
            const panelType = e.target.dataset.panel;
            if (panelType === 'add-text') {
                reviewDecorations.handleAddText();
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
                reviewFilters.loadFilterPresets();
            }

            updateAddFinalizeButtons();
        }
    });

    stripBackBtn.addEventListener('click', () => {
        const stickerGallery = document.getElementById('sticker-gallery');
        const categoryGallery = document.getElementById('sticker-category-gallery');

        if (stickerGallery.style.display === 'flex') {
            reviewDecorations.loadStickerGallery();
            return;
        }

        const currentOpenPanel = Array.from(stripContainer.querySelectorAll('.strip-panel')).find(p => p.classList.contains('show'));
        if (currentOpenPanel) {
            // If we are leaving the style panel or background panel, clear the specific selection for it
            if (currentOpenPanel.id === 'style-strip-panel' || currentOpenPanel.id === 'background-color-panel') {
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

            // Clear stylizing selection when fully closing panels, BUT keep processing ones
            appState.selectedForStylizing = appState.selectedForStylizing.filter(pIdx => appState.loadingPhotos.has(pIdx));
            updatePreviewHighlights();
        }
    });




    reviewScreenContainer.addEventListener('click', (e) => {
        const sidebar = document.getElementById('review-sidebar');
        if (sidebar.classList.contains('strip-active')) {
            if (!sidebar.contains(e.target) &&
                !e.target.closest('.modal-content') &&
                !e.target.closest('.modal-dialog') &&
                !e.target.classList.contains('preview-photo-button')) {
                stripContainer.querySelectorAll('.strip-panel').forEach(p => p.classList.remove('show'));
                sidebar.classList.remove('strip-active');
                const currentActiveBtn = reviewToolbar.querySelector('.active');
                if (currentActiveBtn) {
                    currentActiveBtn.classList.remove('active');
                }
                stripBackBtn.style.display = 'none';
                panelHistory = [];
                clearSelections();
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

        // Clear stylizing selections, preserving processing ones
        appState.selectedForStylizing = appState.selectedForStylizing.filter(pIdx => appState.loadingPhotos.has(pIdx));
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
                const thumbContainer = document.getElementById('review-thumbnails').children[pIdx];
                if (thumbContainer) {
                    const img = thumbContainer.querySelector('.photostrip-item');
                    if (img) img.classList.remove('selected');
                }
            });
            // Also clear all preview button highlights
            document.querySelectorAll('.preview-photo-button.selected').forEach(btn => btn.classList.remove('selected'));

            appState.selectedForRetake = [];
            retakeBtn.style.display = 'none';
            updatePreviewHighlights();
        }
    }



    stickerUploadInput.addEventListener('change', (e) => {
        const currentCategory = document.getElementById('sticker-category-gallery').dataset.category;
        window.handleFileUpload(e, '/upload_sticker', reviewDecorations.loadStickerGallery, currentCategory);
    });

    window.addEventListener('resize', renderPreview);

    document.addEventListener('click', (e) => {
        reviewDecorations.checkActiveTransformableClick(e);
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
            appState.backgroundColors = new Array(appState.capturedPhotos.length).fill(null);
            appState.rawBgRemovedBlobs = {};
            appState.bgRemovalThresholds = new Array(appState.capturedPhotos.length).fill(240);
            appState.bgRemovalBgThresholds = new Array(appState.capturedPhotos.length).fill(10);
            appState.bgRemovalErodeSizes = new Array(appState.capturedPhotos.length).fill(10);
            appState.isBgReplaced = new Array(appState.capturedPhotos.length).fill(false);
            appState.bgRemovalEnabled = new Array(appState.capturedPhotos.length).fill(false);
            appState.currentBgRemovedBlobKey = [];

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
        reviewDecorations.loadStickerGallery();
        loadSimilarTemplates();
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

                // Invalidate background removal cache since image content (potentially) changes
                // Although crop technically runs on original, if we recrop, the displayed blob changes.
                if (appState.rawBgRemovedBlobs && appState.rawBgRemovedBlobs[i]) {
                    delete appState.rawBgRemovedBlobs[i];
                    // Also clear color assignment? Maybe safe to keep color but re-apply removal on next render
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

            const removeBgButton = document.createElement('button');
            removeBgButton.textContent = '🪄';
            removeBgButton.title = 'Remove/Color Background';
            removeBgButton.style.fontSize = '1.2rem'; // Match look
            if (appState.backgroundColors && appState.backgroundColors[i]) {
                removeBgButton.style.border = '2px solid ' + (appState.backgroundColors[i] || 'transparent');
            }
            removeBgButton.addEventListener('click', (e) => {
                e.stopPropagation();
                reviewBackgrounds.showBackgroundPanel(i);
            });
            actions.appendChild(removeBgButton);

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
                reviewDecorations.renderPlacedStickers();
                reviewDecorations.renderPlacedTexts();
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
        reviewFilters.applyPhotoFilters();
        // Background removal preview application
        if (typeof reviewBackgrounds !== 'undefined') {
            reviewBackgrounds.applyBackgroundsToPreview();
        }
        updatePreviewHighlights();
    }





    function handleHoleSelection(el, hIdx) {
        // UX: Auto-open 'Photos' panel so user can see list
        const photoBtn = reviewToolbar.querySelector('[data-panel="photos"]');
        if (photoBtn && !photoBtn.classList.contains('active')) {
            photoBtn.click();
        }

        // Identify the photo assigned to this hole
        const photoInHole = appState.photoAssignments[hIdx];
        const pIdx = appState.capturedPhotos.indexOf(photoInHole);

        if (pIdx === -1) return;

        // Sync logic: Select this photo for retake
        // If we want to mimic "clicking the strip item":
        const thumbnailsContainer = document.getElementById('review-thumbnails');
        const thumb = thumbnailsContainer.children[pIdx];
        if (thumb) {
            const thumbImg = thumb.querySelector('.photostrip-item');
            if (thumbImg) {
                handlePhotoSelection(pIdx, thumbImg);
            }
        }
    }

    function handlePhotoSelection(pIdx, el) {
        // Toggle selection for retake
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
            genericAddBtn.style.display = 'none';
            return;
        }

        retakeBtn.style.display = 'none';

        // Priority 2: Open Panel Context
        const currentOpenPanel = Array.from(stripContainer.querySelectorAll('.strip-panel')).find(p => p.classList.contains('show'));

        if (!currentOpenPanel) {
            genericAddBtn.style.display = 'none';
            return;
        }

        // If panel is open, check if it needs the "Add" button
        const type = currentOpenPanel.dataset.panel;
        const showAdd = ['styles', 'filters', 'stickers', 'add-text', 'colors'].includes(type);

        if (showAdd) {
            genericAddBtn.style.display = 'block';
        } else {
            genericAddBtn.style.display = 'none';
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








});
