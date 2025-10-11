window.eventBus.on('app:init', (appState) => {
    const reviewScreen = document.getElementById('review-screen');
    const finalizeBtn = document.getElementById('finalize-btn');
    const filterControls = document.getElementById('filter-controls');
    const stickerUploadInput = document.getElementById('sticker-upload-input');

    finalizeBtn.addEventListener('click', () => window.eventBus.dispatch('review:finalize'));
    filterControls.addEventListener('input', (e) => {
        if (e.target.type === 'range') {
            appState.filters[e.target.dataset.filter] = parseInt(e.target.value, 10);
            applyPhotoFilters();
        }
    });
    document.getElementById('review-right-col').addEventListener('click', (e) => {
        if (e.target.classList.contains('accordion-header')) {
            e.target.classList.toggle('active');
            const content = e.target.nextElementSibling;
            content.classList.toggle('active');
            if (content.style.maxHeight) {
                content.style.maxHeight = null;
            }
            else {
                content.style.maxHeight = content.scrollHeight + "px";
            }
        }
    });
    stickerUploadInput.addEventListener('change', (e) => window.handleFileUpload(e, '/upload_sticker', loadStickerGallery));
    window.addEventListener('mousemove', handleStickerMove);
    window.addEventListener('mouseup', handleStickerMouseUp);
    document.getElementById('review-preview').addEventListener('click', (e) => {
        if (e.target.id === 'review-preview') {
            if (appState.activeSticker.data) {
                appState.activeSticker = { element: null, data: null, action: null };
                renderPlacedStickers();
            }
        }
    });

    window.eventBus.on('photo-taking:complete', () => {
        window.eventBus.dispatch('screen:show', 'review-screen');
        showReviewScreen();
    });

    function showReviewScreen() { 
        appState.photoAssignments = [...appState.capturedPhotos]; 
        appState.placedStickers = []; 
        appState.filters = { brightness: 100, contrast: 100, saturate: 100, warmth: 100, sharpness: 0, blur: 0, grain: 0 };
        document.querySelectorAll('#filter-controls input[type="range"]').forEach(slider => {
            if (slider.dataset.filter === 'sharpness' || slider.dataset.filter === 'blur' || slider.dataset.filter === 'grain') {
                slider.value = 0;
            } else {
                slider.value = 100;
            }
        });
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

    function renderReviewThumbnails() { 
        const c = document.getElementById('review-thumbnails'); 
        c.innerHTML = ''; 
        appState.capturedPhotos.forEach((b, i) => { 
            const t = document.createElement('img'); 
            t.src = URL.createObjectURL(b); 
            t.className = 'thumbnail'; 
            t.draggable = false; 
            t.addEventListener('click', () => handlePhotoSelection(i)); 
            c.appendChild(t); 
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
                const i = document.createElement('div'); 
                i.className = 'template-item'; 
                const m = document.createElement('img'); 
                m.src = t.template_path; 
                i.appendChild(m); 
                i.addEventListener('click', () => handleTemplateChange(t)); 
                c.appendChild(i); 
            }); 
        } catch (e) { 
            console.error(e); 
        } 
    }

    function renderPreview() { 
        const p = document.getElementById('review-preview'); 
        p.innerHTML = ''; 
        const t = document.createElement('img'); 
        t.src = appState.templateInfo.template_path; 
        t.className = 'preview-template-img'; 
        t.onload = () => { 
            renderPhotoAssignments(); 
            renderPlacedStickers(); 
        }; 
        p.appendChild(t); 
    }

    function getPreviewScaling(previewId = 'review-preview') {
        const p = document.getElementById(previewId), t = p.querySelector('.preview-template-img');
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
            i.addEventListener('click', () => handleHoleSelection(i, hIdx)); 
            wrapper.appendChild(i);
            document.getElementById('review-preview').appendChild(wrapper); 
        }); 
        applyPhotoFilters(); 
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
        if (appState.selectedHole.element) { 
            appState.selectedHole.element.classList.remove('selected'); 
        } 
        appState.selectedHole = { element: el, index: hIdx }; 
        el.classList.add('selected'); 
    }

    function handlePhotoSelection(pIdx) { 
        if (appState.selectedHole.index === -1) return; 
        handleSwap(appState.selectedHole.index, pIdx); 
    }

    function handleSwap(hIdx, pIdx) { 
        const ptm = appState.capturedPhotos[pIdx], 
              ptr = appState.photoAssignments[hIdx], 
              opor = appState.photoAssignments.findIndex(p => p === ptm); 
        if (opor !== -1) { 
            appState.photoAssignments[opor] = ptr; 
        } 
        appState.photoAssignments[hIdx] = ptm; 
        if (appState.selectedHole.element) { 
            appState.selectedHole.element.classList.remove('selected'); 
        } 
        appState.selectedHole = { element: null, index: -1 }; 
        renderPreview(); 
    }

    function handleTemplateChange(newTemplate) { 
        appState.templateInfo = newTemplate; 
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

    function handleStickerMouseDown(e, data, el) {
        e.preventDefault();
        e.stopPropagation();
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

    function handleStickerMouseUp() {
        if (appState.activeSticker.action) {
            appState.activeSticker.action = null;
        }
    }
});