window.initReviewDecorations = (appState, callbacks) => {
    const {
        getPreviewScaling,
        renderPreview,
        showToast
    } = callbacks;

    // Helper to measure text precisely using Canvas API
    function measureTextPrecise(text, font, fontSize) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        context.font = `${fontSize}px "${font}"`;
        const lines = text.split('\n');
        let maxWidth = 0;
        let totalHeight = 0;

        // Standard line height calculation to match backend/CSS
        // 1.3 is the hardcoded line-height in the app
        const lineHeight = fontSize * 1.3;

        lines.forEach((line, index) => {
            const metrics = context.measureText(line);

            // Calculate width: usage of actualBoundingBox for tight fit
            const currentWidth = Math.abs(metrics.actualBoundingBoxLeft) + Math.abs(metrics.actualBoundingBoxRight) + 4;
            if (currentWidth > maxWidth) {
                maxWidth = currentWidth;
            }
        });

        if (lines.length === 1) {
            const metrics = context.measureText(lines[0]);
            const actualHeight = Math.abs(metrics.actualBoundingBoxAscent) + Math.abs(metrics.actualBoundingBoxDescent) + 4;
            // Use the larger of the two to ensure container is big enough
            totalHeight = Math.max(actualHeight, lineHeight);
        } else {
            totalHeight = lines.length * lineHeight;
        }

        return {
            width: Math.ceil(maxWidth),
            height: Math.ceil(totalHeight)
        };
    }


    function updateSnapLine(isSnapping, yPosition) {
        const wrapper = document.getElementById('review-preview-wrapper');
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
                wrapper.appendChild(snapLine);
            }
            const wrapperRect = wrapper.getBoundingClientRect();
            snapLine.style.top = `${(yPosition - wrapperRect.top) + wrapper.scrollTop}px`;
            snapLine.style.display = 'block';
        } else {
            if (snapLine) {
                snapLine.style.display = 'none';
            }
        }
    }

    function updateVerticalSnapLine(isSnapping, xPosition) {
        const wrapper = document.getElementById('review-preview-wrapper');
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
                wrapper.appendChild(snapLine);
            }
            const wrapperRect = wrapper.getBoundingClientRect();
            snapLine.style.left = `${(xPosition - wrapperRect.left) + wrapper.scrollLeft}px`;
            snapLine.style.display = 'block';
        } else {
            if (snapLine) {
                snapLine.style.display = 'none';
            }
        }
    }


    const colorPicker = window.initColorPicker(appState);
    const textEdit = window.initTextEdit(appState, colorPicker);


    let transformableHandler;

    function renderDecorations() {
        const { scale, offsetX, offsetY } = getPreviewScaling();
        if (scale === 1) return;
        const previewContainer = document.getElementById('review-preview');

        // 1. Index existing elements by data reference
        const existingElements = new Map();
        document.querySelectorAll('.placed-text-wrapper, .placed-sticker-wrapper').forEach(w => {
            if (w._dataReference) {
                existingElements.set(w._dataReference, w);
            } else {
                w.remove();
            }
        });

        // 2. Combine and sort
        const allDecorations = [
            ...appState.placedTexts.map(t => ({ ...t, type: 'text', originalObj: t })),
            ...appState.placedStickers.map(s => ({ ...s, type: 'sticker', originalObj: s }))
        ].sort((a, b) => a.id - b.id);

        // 3. Render/Update
        allDecorations.forEach((d, index) => {
            const realObj = d.originalObj;
            let el = existingElements.get(realObj);

            if (el) {
                existingElements.delete(realObj);

                // Set z-index for layering (no DOM manipulation needed!)
                el.style.zIndex = index;

                // Update visuals
                updateItemVisuals(el, realObj, d.type, scale, offsetX, offsetY);
            } else {
                // Create New
                if (d.type === 'text') {
                    renderTextItem(realObj, scale, offsetX, offsetY, previewContainer, index);
                } else {
                    renderStickerItem(realObj, scale, offsetX, offsetY, previewContainer, index);
                }
            }
        });

        // 4. Remove leftovers
        existingElements.forEach(w => w.remove());
    }

    function updateItemVisuals(w, d, type, scale, offsetX, offsetY) {
        // Update Position & Transform
        w.style.left = `${offsetX + d.x * scale}px`;
        w.style.top = `${offsetY + d.y * scale}px`;
        w.style.width = `${d.width * scale}px`;
        if (type === 'sticker') {
            w.style.height = `${d.height * scale}px`;
        } else {
            // For text, height is auto or calculated
            // w.style.height = 'auto'; // Already set in creation
        }
        w.style.transform = `rotate(${d.rotation}deg)`;

        // Update Active State
        const isActive = appState.activeTransformable && appState.activeTransformable.data.id === d.id;
        if (isActive) {
            w.classList.add('active');
            // Ensure handles exist
            if (!w.querySelector('.selection-box')) {
                addHandles(w, d, type);
            }
        } else {
            w.classList.remove('active');
            // Remove handles
            const handles = w.querySelectorAll('.selection-box, .sticker-handle');
            handles.forEach(h => h.remove());
        }

        // Type specific updates
        if (type === 'text') {
            const i = w.querySelector('.editable-text');
            if (i) {
                i.style.fontFamily = `'${d.font}'`;
                i.style.fontSize = `${d.fontSize * scale}px`;
                i.style.color = d.color || '#000000';
                i.innerHTML = d.text.replace(/\n/g, '<br>');
                i.style.textAlign = d.justify;
            }
        }
    }

    function addHandles(w, d, type) {
        const selectionBox = document.createElement('div');
        selectionBox.className = 'selection-box';
        w.appendChild(selectionBox);

        const resizeRotateHandle = document.createElement('div');
        resizeRotateHandle.className = 'sticker-handle resize-rotate';
        if (transformableHandler) {
            resizeRotateHandle.addEventListener('mousedown', (e) => transformableHandler.handleResizeRotateMouseDown(e, d, w, type));
        }
        w.appendChild(resizeRotateHandle);

        const closeHandle = document.createElement('div');
        closeHandle.className = 'sticker-handle close';
        closeHandle.textContent = 'X';
        closeHandle.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const list = type === 'text' ? appState.placedTexts : appState.placedStickers;
            const index = list.findIndex(item => item.id === d.id);
            if (index > -1) {
                list.splice(index, 1);
            }
            appState.activeTransformable = null;
            renderDecorations();
        });
        w.appendChild(closeHandle);
    }

    function renderTextItem(d, scale, offsetX, offsetY, previewContainer, zIndex) {
        const w = document.createElement('div');
        w.className = 'placed-text-wrapper';
        w._dataReference = d; // Store reference

        w.style.position = 'absolute';
        w.style.zIndex = zIndex;
        w.style.display = 'flex';
        w.style.alignItems = 'center';
        w.style.height = 'auto';

        const i = document.createElement('div');
        i.contentEditable = false;
        i.className = 'editable-text';
        i.style.whiteSpace = 'pre';
        i.style.lineHeight = '1.3';

        // Input listener
        i.addEventListener('input', (e) => {
            d.text = e.target.innerText;
            if (scale > 0) {
                const metrics = measureTextPrecise(d.text, d.font, d.fontSize);
                d.width = metrics.width;
                d.height = metrics.height;
            }
        });

        if (transformableHandler) {
            w.addEventListener('mousedown', (e) => transformableHandler.handleMouseDown(e, d, w, 'text'), false);
        }

        w.addEventListener('dblclick', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            d.id = Date.now();

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
                renderDecorations();
            }
        });
        w.appendChild(i);
        previewContainer.appendChild(w);

        // Initial visual update
        updateItemVisuals(w, d, 'text', scale, offsetX, offsetY);

        requestAnimationFrame(() => {
            if (scale > 0) {
                const metrics = measureTextPrecise(d.text, d.font, d.fontSize);
                if (Math.abs(metrics.height - d.height) > 2) d.height = metrics.height;
                if (Math.abs(metrics.width - d.width) > 2) d.width = metrics.width;
            }
        });
    }

    function renderStickerItem(d, scale, offsetX, offsetY, previewContainer, zIndex) {
        const w = document.createElement('div');
        w.className = 'placed-sticker-wrapper';
        w._dataReference = d; // Store reference

        w.style.position = 'absolute';
        w.style.zIndex = zIndex;

        const i = document.createElement('img');
        i.src = d.path;
        i.style.width = '100%';
        i.style.height = '100%';
        if (transformableHandler) {
            w.addEventListener('mousedown', (e) => transformableHandler.handleMouseDown(e, d, w, 'sticker'), false);
        }
        w.appendChild(i);
        previewContainer.appendChild(w);

        // Initial visual update
        updateItemVisuals(w, d, 'sticker', scale, offsetX, offsetY);
    }

    transformableHandler = window.initTransformable({
        appState,
        getPreviewScaling,
        updateSnapLine,
        updateVerticalSnapLine,
        renderDecorations: renderDecorations
    });

    // Helper to extract first frame from animated WebP
    function extractFirstFrame(imagePath) {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                resolve(canvas.toDataURL('image/png'));
            };
            img.onerror = () => {
                // Fallback to original if extraction fails
                resolve(imagePath);
            };
            img.src = imagePath;
        });
    }

    async function loadStickerGallery(selectedCategory = null, shouldUpdateHeader = true) {
        try {
            const [stickersResponse, categoriesResponse] = await Promise.all([
                fetch('/stickers'),
                fetch('/sticker_categories')
            ]);
            const stickers = await stickersResponse.json();
            const fetchedCategories = await categoriesResponse.json();

            const stickerGallery = document.getElementById('sticker-gallery');
            const categoryGallery = document.getElementById('sticker-category-gallery');

            stickerGallery.innerHTML = '';
            categoryGallery.innerHTML = '';

            if (selectedCategory) {
                categoryGallery.style.display = 'none';
                stickerGallery.style.display = 'flex';
                categoryGallery.dataset.category = selectedCategory;

                stickers.filter(s => s.category === selectedCategory).forEach(async (s) => {
                    const i = document.createElement('div');
                    i.className = 'sticker-item';
                    const m = document.createElement('img');
                    m.draggable = false;

                    // Extract first frame for static display
                    const firstFrame = await extractFirstFrame(s.sticker_path);
                    m.src = firstFrame;
                    m.dataset.animatedSrc = s.sticker_path;
                    m.dataset.staticSrc = firstFrame;

                    // Hover to animate
                    i.addEventListener('mouseenter', () => {
                        m.src = m.dataset.animatedSrc;
                    });
                    i.addEventListener('mouseleave', () => {
                        m.src = m.dataset.staticSrc;
                    });

                    i.addEventListener('click', () => addStickerToCenter(s));
                    i.appendChild(m);
                    stickerGallery.appendChild(i);
                });

                // Update panel header with category name and back button
                if (shouldUpdateHeader && callbacks.updatePanelHeader) {
                    callbacks.updatePanelHeader('stickers', {
                        customLabel: selectedCategory,
                        showBack: true
                    });
                }

            } else {
                categoryGallery.style.display = 'flex';
                stickerGallery.style.display = 'none';
                delete categoryGallery.dataset.category;

                const stickerCategories = stickers.map(s => s.category).filter(Boolean);
                const allCategories = [...new Set([...fetchedCategories, ...stickerCategories])];

                const pastelColors = [
                    'rgba(255, 204, 204, 1)',  // Light Pink
                    'rgba(204, 229, 255, 1)',  // Light Blue
                    'rgba(204, 255, 204, 1)',  // Light Green
                    'rgba(255, 229, 204, 1)',  // Light Orange
                    'rgba(229, 204, 255, 1)',  // Light Purple
                    'rgba(255, 255, 204, 1)'   // Light Yellow
                ];

                allCategories.forEach((category, index) => {
                    const categoryItem = document.createElement('div');
                    categoryItem.className = 'sticker-category-item';

                    // Apply pastel background color (rotational)
                    categoryItem.style.backgroundColor = pastelColors[index % pastelColors.length];

                    // Find first sticker in this category for the icon
                    const firstSticker = stickers.find(s => s.category === category);
                    if (firstSticker) {
                        const icon = document.createElement('img');
                        icon.src = firstSticker.sticker_path;
                        categoryItem.appendChild(icon);
                    }

                    const label = document.createElement('span');
                    label.textContent = category;
                    categoryItem.appendChild(label);

                    categoryItem.onclick = () => loadStickerGallery(category);
                    categoryGallery.appendChild(categoryItem);
                });

                stickers.filter(s => !s.category).forEach(async (s) => {
                    const i = document.createElement('div');
                    i.className = 'sticker-item';
                    const m = document.createElement('img');
                    m.draggable = false;

                    // Extract first frame for static display
                    const firstFrame = await extractFirstFrame(s.sticker_path);
                    m.src = firstFrame;
                    m.dataset.animatedSrc = s.sticker_path;
                    m.dataset.staticSrc = firstFrame;

                    // Hover to animate
                    i.addEventListener('mouseenter', () => {
                        m.src = m.dataset.animatedSrc;
                    });
                    i.addEventListener('mouseleave', () => {
                        m.src = m.dataset.staticSrc;
                    });

                    i.addEventListener('click', () => addStickerToCenter(s));
                    i.appendChild(m);
                    categoryGallery.appendChild(i);
                });

                // Update panel header to show "Stickers" (no back button)
                if (shouldUpdateHeader && callbacks.updatePanelHeader) {
                    callbacks.updatePanelHeader('stickers');
                }
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
                fontPreview.style.fontFamily = `'${f.font_name}'`;
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
            const previewContainer = document.getElementById('review-preview');
            const wrapper = document.getElementById('review-preview-wrapper');

            let imageX, imageY;

            if (wrapper && previewContainer) {
                const wrapperRect = wrapper.getBoundingClientRect();
                const previewRect = previewContainer.getBoundingClientRect();

                const screenCenterX = wrapperRect.left + (wrapper.clientWidth / 2);
                const screenCenterY = wrapperRect.top + (wrapper.clientHeight / 2);

                const offsetX = screenCenterX - previewRect.left;
                const offsetY = screenCenterY - previewRect.top;

                const naturalCenterX = offsetX / scale;
                const naturalCenterY = offsetY / scale;

                imageX = naturalCenterX - (stickerNaturalW / 2);
                imageY = naturalCenterY - (stickerNaturalH / 2);
            } else {
                // Fallback to image center if something fails
                const imageNaturalWidth = template.naturalWidth;
                const imageNaturalHeight = template.naturalHeight;
                imageX = (imageNaturalWidth - stickerNaturalW) / 2;
                imageY = (imageNaturalHeight - stickerNaturalH) / 2;
            }

            appState.placedStickers.push({
                id: Date.now(),
                path: stickerData.sticker_path,
                x: Math.round(imageX),
                y: Math.round(imageY),
                width: Math.round(stickerNaturalW),
                height: Math.round(stickerNaturalH),
                rotation: 0
            });
            renderDecorations();
        };
        stickerImg.src = stickerData.sticker_path;
    }

    async function handleAddText() {
        return textEdit.show(null).then(result => {
            if (result) {
                const { scale, renderedWidth } = getPreviewScaling();
                if (scale === 1) return;

                const tempSpan = document.createElement('span');
                tempSpan.style.fontFamily = `'${result.font}'`;
                tempSpan.style.fontSize = '40px';
                tempSpan.style.whiteSpace = 'pre';
                tempSpan.style.lineHeight = '1.3'; // Standardize line height
                tempSpan.innerHTML = result.text.replace(/\n/g, '<br>');

                // Use precise measurement
                const metrics = measureTextPrecise(result.text, result.font, 40);
                const textNaturalWidth = metrics.width;
                const textNaturalHeight = metrics.height;

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
                renderDecorations();
            }
        });
    }


    const addStickerCategoryModal = document.getElementById('add-sticker-category-modal');
    if (addStickerCategoryModal) {
        const newCategoryNameInput = document.getElementById('new-category-name');
        const addCategoryConfirmBtn = document.getElementById('add-category-confirm-btn');
        const addCategoryCancelBtn = document.getElementById('add-category-cancel-btn');

        if (addCategoryConfirmBtn) {
            addCategoryConfirmBtn.onclick = async () => {
                const name = newCategoryNameInput.value.trim();
                if (!name) return alert('Please enter a category name.');
                try {
                    const response = await fetch('/create_sticker_category', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: name })
                    });
                    if (response.ok) {
                        addStickerCategoryModal.className = 'modal-hidden';
                        newCategoryNameInput.value = '';
                        loadStickerGallery();
                    } else {
                        const data = await response.json();
                        alert(data.detail || 'Failed to create category.');
                    }
                } catch (e) {
                    console.error(e);
                    alert('Error creating category.');
                }
            };
        }
        if (addCategoryCancelBtn) {
            addCategoryCancelBtn.onclick = () => {
                addStickerCategoryModal.className = 'modal-hidden';
                newCategoryNameInput.value = '';
            };
        }
    }

    function checkActiveTransformableClick(e) {
        if (appState.activeTransformable && appState.activeTransformable.element && !appState.activeTransformable.element.contains(e.target)) {
            if (e.target.closest('.placed-sticker-wrapper, .placed-text-wrapper')) {
                return;
            }
            if (appState.activeTransformable.type === 'text') {
                const textBox = appState.activeTransformable.element.querySelector('.editable-text');
                if (textBox) textBox.contentEditable = false;
            }
            appState.activeTransformable = null;
            renderDecorations();
        }
    }

    return {
        loadStickerGallery,
        loadFontGallery,
        renderDecorations,
        addStickerToCenter,
        handleAddText,
        checkActiveTransformableClick
    };
};
