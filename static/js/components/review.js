window.eventBus.on('app:init', (appState) => {
    // Set actual viewport height for mobile browsers
    // Mobile browsers' 100vh includes space behind address bars, causing bottom content to be hidden
    const setAppHeight = () => {
        const doc = document.documentElement;
        doc.style.setProperty('--app-height', `${window.innerHeight}px`);
    };

    // Set on load
    setAppHeight();

    // Update on resize and orientation change
    window.addEventListener('resize', setAppHeight);
    window.addEventListener('orientationchange', setAppHeight);

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
            reorderPhotoData(dragStartIndex, dragEndIndex);

            renderReviewThumbnails();
            renderPreview();
        }
    });

    const stripContainer = document.getElementById('strip-container');
    const stripBackBtn = document.getElementById('strip-back-btn');
    let panelHistory = [];
    const removeBgCheckbox = document.getElementById('remove-bg-checkbox');
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
        showToast: window.showToast,
        get updatePanelHeader() { return updatePanelHeader; } // Getter for late binding
    });

    // Forward declare updatePanelHeader so it can be passed to modules
    let updatePanelHeader;

    const reviewStyles = window.initReviewStyles(appState, {
        renderPreview,
        renderReviewThumbnails,
        updatePreviewHighlights,
        updateAddFinalizeButtons,
        panelHistory,
        showToast: window.showToast,
        stripContainer,
        stripBackBtn,
        reviewToolbar,
        clearSelections,
        renderPhotoAssignments,
        get updatePanelHeader() { return updatePanelHeader; } // Getter for late binding
    });

    // Global Action Buttons
    const actionStylizeBtn = document.getElementById('action-stylize-btn');
    const actionCropBtn = document.getElementById('action-crop-btn');
    const actionRemoveBgBtn = document.getElementById('action-remove-bg-btn');
    const actionTemplateColorBtn = document.getElementById('action-template-color-btn');

    actionStylizeBtn.addEventListener('click', () => {
        if (appState.selectedForRetake.length > 0) {
            const pIdx = appState.selectedForRetake[0];
            reviewStyles.handleStylizeButtonClick(pIdx);
        }
    });

    actionRemoveBgBtn.addEventListener('click', () => {
        if (appState.selectedForRetake.length > 0) {
            const pIdx = appState.selectedForRetake[0];
            reviewBackgrounds.showBackgroundPanel(pIdx);
        }
    });

    actionTemplateColorBtn.addEventListener('click', () => {
        if (appState.templateInfo && appState.templateInfo.is_default) {
            showColorPalettePanel(appState.templateInfo);
        }
    });

    const actionResetStyleBtn = document.getElementById('action-reset-style-btn');
    actionResetStyleBtn.addEventListener('click', () => {
        if (appState.selectedForStylizing && appState.selectedForStylizing.length > 0) {
            appState.selectedForStylizing.forEach(pIdx => {
                reviewStyles.resetPhotoStyle(pIdx);
            });
        }
    });

    const actionResetFilterBtn = document.getElementById('action-reset-filter-btn');
    actionResetFilterBtn.addEventListener('click', () => {
        reviewFilters.resetFilters();
    });

    actionCropBtn.addEventListener('click', async () => {
        if (appState.selectedForRetake.length > 0) {
            const i = appState.selectedForRetake[0];
            const templateHole = appState.templateInfo.holes[i];

            if (!templateHole) return;

            const targetAspectRatio = templateHole.w / templateHole.h;

            if (appState.transformManager) {
                try {
                    const imageToCrop = await appState.transformManager.getPreCropBlob(i);
                    const transform = appState.transformManager.getTransform(i);
                    const currentCropData = transform.crop.enabled ? transform.crop.data : null;

                    appState.cropper.show(imageToCrop, targetAspectRatio, currentCropData).then(async result => {
                        if (result) {
                            const oldBlob = appState.capturedPhotos[i];

                            appState.transformManager.setCrop(i, result.cropData);
                            const composedBlob = await appState.transformManager.compose(i);

                            appState.capturedPhotos[i] = composedBlob;

                            // Update photo assignments
                            for (let j = 0; j < appState.photoAssignments.length; j++) {
                                if (appState.photoAssignments[j] === oldBlob) {
                                    appState.photoAssignments[j] = composedBlob;
                                }
                            }

                            renderReviewThumbnails();
                            renderPreview();
                        }
                    });
                } catch (e) {
                    console.error("Error preparing crop:", e);
                }
            }
        }
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

            // Define three snap positions as percentages of available height
            const SNAP_POSITIONS = {
                COLLAPSED: 0,     // Completely hidden
                NORMAL: 0.35,     // 35% of available height
                BIG: 0.75         // 75% of available height
            };

            const startResizeMobile = (e) => {
                isResizingMobile = true;
                e.preventDefault(); // Prevent scroll
            };

            const stopResizeMobile = () => {
                if (isResizingMobile) {
                    isResizingMobile = false;

                    // Snap to nearest position
                    const navHeight = 60;
                    const availableHeight = window.innerHeight - navHeight;
                    const currentHeight = parseInt(sidebarContent.style.height) || 0;
                    const currentRatio = currentHeight / availableHeight;

                    // Find nearest snap position
                    let targetPosition = SNAP_POSITIONS.NORMAL;
                    let minDistance = Math.abs(currentRatio - SNAP_POSITIONS.NORMAL);

                    if (Math.abs(currentRatio - SNAP_POSITIONS.COLLAPSED) < minDistance) {
                        targetPosition = SNAP_POSITIONS.COLLAPSED;
                        minDistance = Math.abs(currentRatio - SNAP_POSITIONS.COLLAPSED);
                    }

                    if (Math.abs(currentRatio - SNAP_POSITIONS.BIG) < minDistance) {
                        targetPosition = SNAP_POSITIONS.BIG;
                    }

                    // Apply snap position
                    const targetHeight = targetPosition * availableHeight;
                    sidebarContent.style.height = `${targetHeight}px`;
                    sidebarContent.style.transition = 'height 0.3s ease';

                    // If collapsed, hide sidebar completely and clear active states
                    if (targetPosition === SNAP_POSITIONS.COLLAPSED) {
                        sidebarContent.style.display = 'none';

                        // Clear all active panels
                        const sidebar = document.getElementById('review-sidebar');
                        stripContainer.querySelectorAll('.strip-panel').forEach(p => p.classList.remove('show'));
                        sidebar.classList.remove('strip-active');
                        const currentActiveBtn = reviewToolbar.querySelector('.active');
                        if (currentActiveBtn) {
                            currentActiveBtn.classList.remove('active');
                        }
                        panelHistory = [];
                        clearSelections();
                        updateAddFinalizeButtons();
                    } else {
                        sidebarContent.style.display = 'flex';
                    }

                    // Remove transition after animation completes
                    setTimeout(() => {
                        sidebarContent.style.transition = '';
                    }, 300);
                }
            };

            const resizeMobile = (e) => {
                if (!isResizingMobile) return;

                // For touch events
                const clientY = e.touches ? e.touches[0].clientY : e.clientY;

                const navHeight = 60;
                const availableHeight = window.innerHeight - navHeight;
                let newHeight = availableHeight - clientY;

                // Allow resizing from 0 to full available height
                if (newHeight < 0) newHeight = 0;
                if (newHeight > availableHeight) newHeight = availableHeight;

                sidebarContent.style.height = `${newHeight}px`;
                sidebarContent.style.maxHeight = 'none'; // Override CSS limit if dragging
                sidebarContent.style.display = 'flex'; // Ensure visible while dragging
                sidebarContent.style.transition = ''; // Disable transition during drag
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
        showToast: window.showToast,
        updateAddFinalizeButtons
    });

    const reviewBackgrounds = window.initReviewBackgrounds(appState, {
        renderPreview,
        renderReviewThumbnails,
        stripContainer,
        stripBackBtn,
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



    finalizeBtn.addEventListener('click', async () => {
        if (!appState.photoAssignments || appState.photoAssignments.length === 0) {
            if (window.showToast) window.showToast('No photos to finalize!', 'error');
            return;
        }

        // Show loading popup
        if (window.showLoading) window.showLoading('Generating final image...');

        // Transition immediately to avoid lag perception
        window.eventBus.dispatch('result:reset');
        window.eventBus.dispatch('screen:show', 'result-screen');

        // Yield to allow UI to render the loading overlay and screen switch
        await new Promise(resolve => setTimeout(resolve, 100));

        try {
            let bakedAssignments = [];
            if (appState.transformManager) {
                // Bake filters for each assigned photo
                for (let i = 0; i < appState.photoAssignments.length; i++) {
                    const blob = appState.photoAssignments[i];
                    const pIdx = appState.capturedPhotos.indexOf(blob);
                    if (pIdx !== -1) {
                        const baked = await appState.transformManager.getFinalBlob(pIdx);
                        bakedAssignments.push(baked);
                    } else {
                        bakedAssignments.push(blob);
                    }
                }
            } else {
                bakedAssignments = appState.photoAssignments;
            }

            window.eventBus.dispatch('review:finalize', {
                videos: appState.videoAssignments,
                photoAssignments: bakedAssignments,
                filters: {} // Send empty filters to prevent double application by backend
            });

        } catch (e) {
            console.error("Finalize error:", e);
            if (window.hideLoading) window.hideLoading();
            if (window.showToast) window.showToast('Error generating final image', 'error');
        }
    });
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



    // genericAddBtn.addEventListener('click', () => {
    //     const currentOpenPanel = Array.from(stripContainer.querySelectorAll('.strip-panel')).find(p => p.classList.contains('show'));
    //     if (!currentOpenPanel) return;

    //     const panelId = currentOpenPanel.id;
    //     const panelType = currentOpenPanel.dataset.panel;

    //     if (panelId === 'style-strip-panel') { // Styles
    //         // Toggle logic for styles if needed, or open modal
    //         const addStyleModal = document.getElementById('add-style-modal');
    //         if (addStyleModal) addStyleModal.className = 'modal-visible';
    //     } else if (panelType === 'filters') { // Filters
    //         const addPresetModal = document.getElementById('add-filter-preset-modal');
    //         // Pre-populate logic from old addPresetBtn click handler
    //         const presetFilterControls = document.getElementById('preset-filter-controls');
    //         const filterControls = document.getElementById('filter-controls');
    //         presetFilterControls.innerHTML = filterControls.innerHTML;

    //         const presetPreview = document.getElementById('preset-preview');
    //         const firstPhoto = appState.capturedPhotos[0];
    //         if (firstPhoto) {
    //             const imageUrl = URL.createObjectURL(firstPhoto);
    //             presetPreview.style.backgroundImage = `url(${imageUrl})`;

    //             const updatePreviewFilters = () => {
    //                 const values = {};
    //                 presetFilterControls.querySelectorAll('input[type="range"]').forEach(slider => {
    //                     values[slider.dataset.filter] = parseInt(slider.value, 10);
    //                 });
    //                 const filterString = `brightness(${values.brightness}%) contrast(${values.contrast}%) saturate(${values.saturate}%) blur(${values.blur}px)`;
    //                 presetPreview.style.filter = filterString;
    //             };

    //             presetFilterControls.addEventListener('input', updatePreviewFilters);
    //             updatePreviewFilters();
    //         }
    //         addPresetModal.className = 'modal-visible';

    //     } else if (panelType === 'stickers') { // Stickers
    //         const categoryGallery = document.getElementById('sticker-category-gallery');
    //         if (categoryGallery.style.display !== 'none') {
    //             document.getElementById('add-sticker-category-modal').className = 'modal-visible';
    //         } else {
    //             stickerUploadInput.click();
    //         }
    //     } else if (panelId === 'color-palette-panel') { // Template Colors
    //         colorPicker.show().then(result => {
    //             if (result) {
    //                 // We need the template object here... 
    //                 // showColorPalettePanel saves context? No. 
    //                 // We need to know which template we are editing. 
    //                 // Let's store currentTemplate in appState or closure? 
    //                 // showColorPalettePanel is called with template.
    //                 if (appState.currentEditingTemplate) {
    //                     if (result.saved) {
    //                         showColorPalettePanel(appState.currentEditingTemplate);
    //                     }
    //                     recolorTemplateAndApply(appState.currentEditingTemplate, result.color);
    //                     // User might want to try multiple colors.
    //                     // But if we want to follow 'swatch click' behavior:
    //                     // stripBackBtn.click();
    //                 }
    //             }
    //         });
    //     } else if (panelType === 'add-text') { // Fonts
    //         fontUploadInput.click();
    //     }
    // });

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

            // If clicking the same button, close its panel and clear selections (mobile only)
            if (currentActiveBtn === e.target) {
                // In PC mode, keep one panel active at all times
                if (window.innerWidth > 900) {
                    // Reset stickers if clicking the active stickers button
                    if (panelType === 'stickers') {
                        reviewDecorations.loadStickerGallery();
                    }
                    return; // Do nothing - prevent closing
                }

                // Mobile: allow closing
                e.target.classList.remove('active');
                stripContainer.querySelectorAll('.strip-panel').forEach(p => p.classList.remove('show'));
                sidebar.classList.remove('strip-active');
                clearSelections();
                // stripBackBtn.style.display = 'none'; // Removed as button is hidden
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
                // stripBackBtn.style.display = 'block'; // Removed as button is hidden

                // In mobile view, expand sidebar to normal size if collapsed
                if (window.innerWidth <= 900) {
                    const sidebarContent = document.getElementById('sidebar-content');
                    const navHeight = 60;
                    const availableHeight = window.innerHeight - navHeight;
                    const normalHeight = availableHeight * 0.35; // 35% (normal size)

                    // Make sidebar visible and set to normal size
                    sidebarContent.style.display = 'flex';
                    sidebarContent.style.height = `${normalHeight}px`;
                    sidebarContent.style.transition = 'height 0.3s ease';

                    // Remove transition after animation
                    setTimeout(() => {
                        sidebarContent.style.transition = '';
                    }, 300);
                }
            }

            if (panelType === 'filter-presets' || panelType === 'filters') {
                reviewFilters.loadFilterPresets();
            } else if (panelType === 'stickers') {
                reviewDecorations.loadStickerGallery();
            }

            // Update panel header with label
            updatePanelHeader(panelType);
            updateAddFinalizeButtons();
        }
    });

    stripBackBtn.addEventListener('click', (e) => {
        e.stopPropagation();

        const currentPanel = stripContainer.querySelector('.strip-panel.show');
        if (!currentPanel) return;

        const currentPanelType = currentPanel.dataset.panel;
        const sidebar = document.getElementById('review-sidebar');

        const parentPanelMap = {
            'styles': 'photos',
            'colors': 'templates',
        };

        if (currentPanelType === 'stickers') {
            const categoryGallery = document.getElementById('sticker-category-gallery');
            if (categoryGallery.dataset.category) {
                reviewDecorations.loadStickerGallery(null);
                return;
            }
        }

        const parentPanelType = parentPanelMap[currentPanelType];
        if (parentPanelType) {
            currentPanel.classList.remove('show');

            const parentPanel = stripContainer.querySelector(`.strip-panel[data-panel="${parentPanelType}"]`);
            if (parentPanel) {
                parentPanel.classList.add('show');
                sidebar.classList.add('strip-active');

                const currentActiveBtn = reviewToolbar.querySelector('.active');
                if (currentActiveBtn) {
                    currentActiveBtn.classList.remove('active');
                }
                const parentBtn = reviewToolbar.querySelector(`[data-panel="${parentPanelType}"]`);
                if (parentBtn) {
                    parentBtn.classList.add('active');
                }

                updatePanelHeader(parentPanelType);
                updateAddFinalizeButtons();
            }
        }
    });





    reviewScreenContainer.addEventListener('click', (e) => {
        // Only close panels on outside click in mobile mode
        if (window.innerWidth > 900) {
            return; // PC mode: keep panels open
        }

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
                // stripBackBtn.style.display = 'none'; // Removed as button is hidden
                panelHistory = [];
                clearSelections();
                updateAddFinalizeButtons();
            }
        }
    });

    // Helper function to update panel header (label + back button)
    // Assign to the forward-declared variable so modules can access it
    updatePanelHeader = function (panelType, options = {}) {
        const panelLabel = document.getElementById('panel-label');
        const backBtn = document.getElementById('strip-back-btn');

        // Panel label mapping
        const labelMap = {
            'photos': 'Photos',
            'styles': 'Photo Styles',
            'templates': 'Templates',
            'colors': 'Template Colors',
            'stickers': 'Stickers',
            'filter-presets': 'Filter Presets',
            'filters': 'Filter Controls',
            'add-text': 'Text'
        };

        // Check if this is a 2nd level panel (should show back button)
        const secondLevelPanels = ['styles', 'colors'];
        const showBackBtn = secondLevelPanels.includes(panelType) || options.showBack;

        // Update label text
        const labelText = options.customLabel || labelMap[panelType] || '';
        panelLabel.textContent = labelText;

        // Show/hide back button
        if (showBackBtn && panelHistory.length > 0) {
            backBtn.style.display = 'flex';
        } else {
            backBtn.style.display = 'none';
        }
    };

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

    // Track previous viewport state to detect mobile/PC transitions
    let wasMobileView = window.innerWidth <= 900;

    window.addEventListener('resize', () => {
        const isMobileView = window.innerWidth <= 900;

        // If transitioning from mobile to PC view, clear inline styles
        if (wasMobileView && !isMobileView) {
            const sidebarContent = document.getElementById('sidebar-content');
            if (sidebarContent) {
                // Clear all mobile-specific inline styles
                sidebarContent.style.height = '';
                sidebarContent.style.maxHeight = '';
                sidebarContent.style.display = '';
                sidebarContent.style.transition = '';
            }
        }

        wasMobileView = isMobileView;
        renderPreview();
    });

    document.addEventListener('click', (e) => {
        reviewDecorations.checkActiveTransformableClick(e);
    });

    window.eventBus.on('photo-taking:complete', (data) => {
        appState.capturedPhotos = data.photos;
        appState.originalPhotos = data.originalPhotos;
        appState.cropData = data.cropData;
        appState.capturedVideos = data.videos;

        if (appState.transformManager) {
            appState.transformManager.init(data.photos.length);
            if (data.cropData) {
                data.cropData.forEach((cd, i) => {
                    appState.transformManager.setCrop(i, cd);
                });
            }
        }

        window.eventBus.dispatch('screen:show', 'review-screen');
        showReviewScreen(false); // false = this is the first time, so reset edits
    });

    window.eventBus.on('review:edit-existing', () => {
        window.eventBus.dispatch('screen:show', 'review-screen');
        showReviewScreen(true); // true = keep existing edits
    });

    window.eventBus.on('review:home', () => {
        window.eventBus.dispatch('screen:show', 'photo-hanging-gallery');
    });

    function showReviewScreen(isContinuingEditing = false) {
        if (finalizeBtn) finalizeBtn.disabled = false;
        if (!isContinuingEditing) {
            appState.photoAssignments = [...appState.capturedPhotos];
            appState.videoAssignments = [...appState.capturedVideos];
            appState.selectedForRetake = [];
            appState.disabledThumbnailIndex = -1;
            appState.placedStickers = [];
            appState.placedTexts = [];
            appState.activeTransformable = null;
            appState.removeBackground = false;
            appState.loadingPhotos = new Set();

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

        // PC mode: Show photos panel by default
        if (window.innerWidth > 900) {
            const photoBtn = reviewToolbar.querySelector('[data-panel="photos"]');
            const photoPanel = stripContainer.querySelector('[data-panel="photos"]');
            const sidebar = document.getElementById('review-sidebar');

            if (photoBtn && photoPanel) {
                photoBtn.classList.add('active');
                photoPanel.classList.add('show');
                sidebar.classList.add('strip-active');
                updatePanelHeader('photos');
                updateAddFinalizeButtons();
            }
        }
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

            const reorderBtns = document.createElement('div');
            reorderBtns.className = 'reorder-btns';

            const upBtn = document.createElement('button');
            upBtn.innerHTML = '&#9650;'; // Up Arrow
            upBtn.className = 'reorder-btn up';
            upBtn.title = 'Move Up/Left';
            if (i === 0) {
                upBtn.disabled = true;
            } else {
                upBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    movePhoto(i, -1);
                });
            }
            reorderBtns.appendChild(upBtn);

            const downBtn = document.createElement('button');
            downBtn.innerHTML = '&#9660;'; // Down Arrow
            downBtn.className = 'reorder-btn down';
            downBtn.title = 'Move Down/Right';
            if (i === appState.capturedPhotos.length - 1) {
                downBtn.disabled = true;
            } else {
                downBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    movePhoto(i, 1);
                });
            }
            reorderBtns.appendChild(downBtn);

            itemContainer.appendChild(content);
            itemContainer.appendChild(reorderBtns);

            c.appendChild(itemContainer);
        });
    }

    function movePhoto(index, direction) {
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= appState.capturedPhotos.length) return;

        reorderPhotoData(index, targetIndex);

        renderReviewThumbnails();
        renderPreview();
        updateAddFinalizeButtons();
        updatePreviewHighlights();
    }

    function reorderPhotoData(fromIndex, toIndex) {
        if (fromIndex === toIndex) return;

        if (appState.transformManager) {
            appState.transformManager.reorder(fromIndex, toIndex);
        }

        const moveInArray = (arr) => {
            if (!arr) return;
            const [item] = arr.splice(fromIndex, 1);
            arr.splice(toIndex, 0, item);
        };

        moveInArray(appState.capturedPhotos);
        moveInArray(appState.originalPhotos);
        moveInArray(appState.capturedVideos);
        moveInArray(appState.cropData);

        // Reset Assignments to sequential order
        appState.photoAssignments = [...appState.capturedPhotos];
        appState.videoAssignments = [...appState.capturedVideos];

        // Update Selection Indices
        const updateIndex = (idx) => {
            if (idx === fromIndex) return toIndex;
            if (fromIndex < toIndex) {
                // Moving Down (e.g. 0 -> 2): Items 1, 2 shift to 0, 1 (-1)
                if (idx > fromIndex && idx <= toIndex) return idx - 1;
            } else {
                // Moving Up (e.g. 2 -> 0): Items 0, 1 shift to 1, 2 (+1)
                if (idx >= toIndex && idx < fromIndex) return idx + 1;
            }
            return idx;
        };

        if (appState.selectedForRetake) {
            appState.selectedForRetake = appState.selectedForRetake.map(updateIndex);
        }
        if (appState.selectedForStylizing) {
            appState.selectedForStylizing = appState.selectedForStylizing.map(updateIndex);
        }

        // Handle selectedHole if needed? 
        // selectedHole tracks index of hole. Hole index order doesn't change implicitly, but assignment changes.
        // We reset assignments to sequential. So the hole at index X now has the new photo at index X.
        // If I was targeting a "Photo", that photo moved to Y.
        // Usually selectedHole highlights the hole, not the photo.
        // So selectedHole logic stays valid (it selects the slot).
    }




    async function loadSimilarTemplates() {
        const { aspect_ratio, cell_layout } = appState.templateInfo;
        try {
            const r = await fetch(`/templates_by_layout?aspect_ratio=${aspect_ratio}&cell_layout=${cell_layout}`);
            const d = await r.json();
            const c = document.getElementById('template-gallery-review');
            c.innerHTML = '';
            d.forEach(t => {
                const item = document.createElement('div');
                item.className = 'review-template-item';

                const img = document.createElement('img');
                img.src = t.template_path;
                item.appendChild(img);

                item.addEventListener('click', () => handleTemplateChange(t));

                const currentBasePath = appState.templateInfo.original_path || appState.templateInfo.template_path;
                if (t.template_path === currentBasePath) {
                    item.classList.add('selected');
                }
                c.appendChild(item);
            });
        } catch (e) {
            console.error(e);
        }
    }

    // --- This function now only handles showing the panel and populating it ---
    async function showColorPalettePanel(template) {
        const templatePanel = document.getElementById('template-gallery-review');
        const colorPanel = document.getElementById('color-palette-panel');

        // Store current template for Generic Add Button context
        appState.currentEditingTemplate = template;

        templatePanel.classList.remove('show');
        colorPanel.innerHTML = ''; // Clear previous content

        panelHistory.push('templates');
        stripBackBtn.style.display = 'block';

        // --- Add "+ button" as first item ---
        const addColorBtn = document.createElement('div');
        addColorBtn.className = 'palette-add-btn';
        addColorBtn.textContent = '+';
        addColorBtn.addEventListener('click', () => {
            if (!window._reviewColorPicker) {
                window._reviewColorPicker = window.initColorPicker(appState);
            }
            window._reviewColorPicker.show().then(result => {
                if (result) {
                    if (result.saved) {
                        showColorPalettePanel(template); // Reload to show new saved color
                    }
                    recolorTemplateAndApply(template, result.color);
                }
            });
        });
        colorPanel.appendChild(addColorBtn);

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

        // Enable horizontal scroll with mouse wheel (mobile only)
        colorPanel.addEventListener('wheel', (e) => {
            if (window.innerWidth <= 900 && e.deltaY !== 0) {
                e.preventDefault();
                colorPanel.scrollLeft += e.deltaY;
            }
        }, { passive: false });


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
        updateAddFinalizeButtons();
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
            if (pIdx !== -1) {
                wrapper.dataset.photoIndex = pIdx;
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
        const actionsContainer = document.getElementById('review-actions-container');

        // Priority 1: Retake Selection
        const count = appState.selectedForRetake.length;
        const hasSelection = count > 0;

        if (hasSelection) {
            retakeBtn.style.display = 'flex';

            actionStylizeBtn.style.display = 'block';
            actionCropBtn.style.display = 'block';
            actionRemoveBgBtn.style.display = 'block';
            actionTemplateColorBtn.style.display = 'none';
            actionResetStyleBtn.style.display = 'none';
            actionResetFilterBtn.style.display = 'none';

            // Show container when actions are visible
            actionsContainer.style.display = 'flex';
            return;
        }

        retakeBtn.style.display = 'none';
        actionStylizeBtn.style.display = 'none';
        actionCropBtn.style.display = 'none';
        actionRemoveBgBtn.style.display = 'none';
        actionTemplateColorBtn.style.display = 'none';
        actionResetStyleBtn.style.display = 'none';
        actionResetFilterBtn.style.display = 'none';

        // Priority 2: Open Panel Context
        const currentOpenPanel = Array.from(stripContainer.querySelectorAll('.strip-panel')).find(p => p.classList.contains('show'));

        const type = currentOpenPanel?.dataset.panel;

        if (type === 'templates' && appState.templateInfo && appState.templateInfo.is_default) {
            actionTemplateColorBtn.style.display = 'flex';
            actionsContainer.style.display = 'flex';
        } else if (type === 'styles' || type === 'backgrounds') {
            // Show reset button in styles and backgrounds panels if any selected photo has a style
            const hasStylizedPhoto = appState.selectedForStylizing && appState.selectedForStylizing.some(pIdx => {
                if (appState.transformManager) {
                    const t = appState.transformManager.getTransform(pIdx);
                    return t && t.base.type === 'stylized';
                }
                return false;
            });
            if (hasStylizedPhoto) {
                actionResetStyleBtn.style.display = 'block';
                actionsContainer.style.display = 'flex';
            } else {
                actionsContainer.style.display = 'none';
            }
        } else if (type === 'filter-presets' || type === 'filters') {
            // Show reset filter button if any non-default filters are applied
            const defaultFilters = { brightness: 100, contrast: 100, saturate: 100, warmth: 100, sharpness: 0, blur: 0, grain: 0 };
            const hasFiltersApplied = Object.keys(defaultFilters).some(key => appState.filters[key] !== defaultFilters[key]);
            if (hasFiltersApplied) {
                actionResetFilterBtn.style.display = 'block';
                actionsContainer.style.display = 'flex';
            } else {
                actionsContainer.style.display = 'none';
            }
        } else {
            // Hide container when no actions are visible
            actionsContainer.style.display = 'none';
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
