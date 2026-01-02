window.initReviewDecorations = (appState, callbacks) => {
    const {
        getPreviewScaling,
        renderPreview,
        showToast
    } = callbacks;


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


    const colorPicker = window.initColorPicker(appState);
    const textEdit = window.initTextEdit(appState, colorPicker);


    let transformableHandler;

    function renderPlacedTexts() {
        document.querySelectorAll('.placed-text-wrapper').forEach(w => w.remove());
        const { scale, offsetX, offsetY } = getPreviewScaling();
        if (scale === 1) return;
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
            i.style.whiteSpace = 'pre';
            i.style.textAlign = d.justify;

            w.style.height = 'auto';
            d.height = i.offsetHeight / scale;

            i.addEventListener('input', (e) => {
                d.text = e.target.innerText;
            });

            if (transformableHandler) {
                w.addEventListener('mousedown', (e) => transformableHandler.handleMouseDown(e, d, w, 'text'), false);
            }

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
                if (transformableHandler) {
                    resizeRotateHandle.addEventListener('mousedown', (e) => transformableHandler.handleResizeRotateMouseDown(e, d, w, 'text'));
                }
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

    function renderPlacedStickers() {
        document.querySelectorAll('.placed-sticker-wrapper').forEach(w => w.remove());
        const { scale, offsetX, offsetY } = getPreviewScaling();
        if (scale === 1) return;
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
            if (transformableHandler) {
                w.addEventListener('mousedown', (e) => transformableHandler.handleMouseDown(e, d, w, 'sticker'), false);
            }
            w.appendChild(i);

            if (appState.activeTransformable && appState.activeTransformable.data.id === d.id) {
                const selectionBox = document.createElement('div');
                selectionBox.className = 'selection-box';
                w.appendChild(selectionBox);

                const resizeRotateHandle = document.createElement('div');
                resizeRotateHandle.className = 'sticker-handle resize-rotate';
                if (transformableHandler) {
                    resizeRotateHandle.addEventListener('mousedown', (e) => transformableHandler.handleResizeRotateMouseDown(e, d, w, 'sticker'));
                }
                w.appendChild(resizeRotateHandle);

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

    transformableHandler = window.initTransformable({
        appState,
        getPreviewScaling,
        updateSnapLine,
        updateVerticalSnapLine,
        renderTexts: renderPlacedTexts,
        renderStickers: renderPlacedStickers,
    });

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

    async function handleAddText() {
        return textEdit.show(null).then(result => {
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
            renderPlacedTexts();
            renderPlacedStickers();
        }
    }

    return {
        loadStickerGallery,
        loadFontGallery,
        renderPlacedTexts,
        renderPlacedStickers,
        addStickerToCenter,
        handleAddText,
        checkActiveTransformableClick
    };
};
