
document.addEventListener('DOMContentLoaded', () => {
    // === STATE VARIABLES ===
    let templateInfo = null, selectedTemplate = { element: null, data: null };
    let capturedPhotos = [], photoAssignments = [];
    let selectedHole = { element: null, index: -1 };
    let placedStickers = [];
    let stream = null;
    let activeSticker = { element: null, data: null, action: null };
    let editingTemplate = null;
    let activeHole = { element: null, data: null, index: -1, action: null };
    let dragStart = { x: 0, y: 0, initialX: 0, initialY: 0 };
    let selectedTimer = 0; // 0 for manual, otherwise seconds
    let isCapturing = false;
    let captureMode = 'camera';
    let filters = { brightness: 100, contrast: 100, saturate: 100, warmth: 100, sharpness: 0, blur: 0 };

    // === DOM ELEMENTS ===
    const mainMenu = document.getElementById('main-menu');
    const appContent = document.getElementById('app-content');
    const reviewScreen = document.getElementById('review-screen');
    const resultScreen = document.getElementById('result-screen');
    const templateUploadInput = document.getElementById('template-upload-input');
    const stickerUploadInput = document.getElementById('sticker-upload-input');
    const addTemplateFloatBtn = document.getElementById('add-template-float-btn');
    const continueBtn = document.getElementById('continue-btn');
    const finalizeBtn = document.getElementById('finalize-btn');
    const timerControls = document.getElementById('timer-controls');
    const startCaptureBtn = document.getElementById('start-capture-btn');
    const countdownDisplay = document.getElementById('countdown-display');
    const modeSelection = document.getElementById('mode-selection');
    const uploadArea = document.getElementById('upload-area');
    const photoUploadInput = document.getElementById('photo-upload-input');
    const photoUploadBtn = document.getElementById('photo-upload-btn');
    const uploadThumbnailsContainer = document.getElementById('upload-thumbnails-container');
    const filterControls = document.getElementById('filter-controls');
    const sharpenMatrix = document.getElementById('sharpen-matrix');
    const warmthMatrix = document.getElementById('warmth-matrix');

    // === INITIALIZATION ===
    function initApp() {
        templateUploadInput.addEventListener('change', (e) => handleFileUpload(e, '/upload_template', loadLayoutGallery));
        stickerUploadInput.addEventListener('change', (e) => handleFileUpload(e, '/upload_sticker', loadStickerGallery));
        addTemplateFloatBtn.addEventListener('click', () => templateUploadInput.click());
        continueBtn.addEventListener('click', () => { if (selectedTemplate.data) { templateInfo = selectedTemplate.data; startPhotoSession(); } });
        startCaptureBtn.addEventListener('click', startCaptureSequence);
        document.getElementById('capture-btn').addEventListener('click', handleManualCapture);
        timerControls.addEventListener('click', (e) => {
            if (e.target.classList.contains('timer-btn')) {
                document.querySelectorAll('.timer-btn').forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');
                selectedTimer = parseInt(e.target.dataset.time, 10);
            }
        });
        modeSelection.addEventListener('click', (e) => {
            if (e.target.classList.contains('mode-btn')) {
                const newMode = e.target.dataset.mode;
                if (newMode !== captureMode) {
                    switchCaptureMode(newMode);
                }
            }
        });
        photoUploadBtn.addEventListener('click', () => photoUploadInput.click());
        photoUploadInput.addEventListener('change', handlePhotoUpload);
        filterControls.addEventListener('input', (e) => {
            if (e.target.type === 'range') {
                filters[e.target.dataset.filter] = parseInt(e.target.value, 10);
                applyPhotoFilters();
            }
        });

        // Accordion Logic
        document.getElementById('review-right-col').addEventListener('click', (e) => {
            if (e.target.classList.contains('accordion-header')) {
                e.target.classList.toggle('active');
                const content = e.target.nextElementSibling;
                content.classList.toggle('active');
                if (content.style.maxHeight) {
                    content.style.maxHeight = null;
                } else {
                    content.style.maxHeight = content.scrollHeight + "px";
                }
            }
        });
        document.getElementById('save-template-btn').addEventListener('click', handleSaveTemplate);
        finalizeBtn.addEventListener('click', handleComposition);
        window.addEventListener('mousemove', handleStickerMove);
        window.addEventListener('mouseup', handleStickerMouseUp);
        window.addEventListener('mousemove', handleHoleMove);
        window.addEventListener('mouseup', handleHoleMouseUp);
        window.addEventListener('resize', debouncedRender); // Add this line
        document.getElementById('review-preview').addEventListener('dragover', (e) => e.preventDefault());
        document.getElementById('review-preview').addEventListener('drop', (e) => {
            e.preventDefault();
            try {
                const stickerData = JSON.parse(e.dataTransfer.getData('application/json'));
                const p = document.getElementById('review-preview');
                const previewRect = p.getBoundingClientRect();
                const { scale, offsetX, offsetY, renderedWidth } = getPreviewScaling();
                const templateNaturalWidth = renderedWidth / scale;

                if (scale === 1) return; // Preview not ready

                const stickerImg = new Image();
                stickerImg.onload = () => {
                    // Define initial sticker size relative to the template (e.g., 20% of width)
                    const desiredNaturalWidth = templateNaturalWidth * 0.3;
                    const stickerNaturalW = desiredNaturalWidth;
                    const stickerNaturalH = stickerImg.naturalHeight * (desiredNaturalWidth / stickerImg.naturalWidth);

                    // Convert natural size to screen size for centering calculation
                    const stickerScreenW = stickerNaturalW * scale;
                    const stickerScreenH = stickerNaturalH * scale;

                    // Convert screen mouse coordinates to image-natural coordinates
                    const mouseX = e.clientX - previewRect.left;
                    const mouseY = e.clientY - previewRect.top;
                    
                    const imageX = (mouseX - offsetX - (stickerScreenW / 2)) / scale;
                    const imageY = (mouseY - offsetY - (stickerScreenH / 2)) / scale;

                    placedStickers.push({
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
            } catch (err) {
                // This is not a sticker drop, so we can ignore the error
            }
        });
        loadLayoutGallery();
    }

    // --- DEBOUNCE HELPER ---
    function debounce(func, wait) {
        let timeout;
        return function(...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), wait);
        };
    }

    // --- RESIZE HANDLER ---
    const debouncedRender = debounce(() => {
        if (reviewScreen.style.display === 'block') {
            renderPhotoAssignments();
            renderPlacedStickers();
        }
        if (document.getElementById('template-edit-screen').style.display === 'block') {
            renderTemplateEditPreview();
        }
    }, 100);

    // --- 1. GALLERIES & UPLOADS ---
    async function loadLayoutGallery() { 
        try { const r = await fetch('/layouts'); 
            const d = await r.json(); 
            const c = document.getElementById('layout-gallery'); 
            c.innerHTML = ''; d.forEach(l => { 
                const i = document.createElement('div'); i.className = 'layout-item'; 
                const m = document.createElement('img'); 
                m.src = l.thumbnail_path; 
                i.appendChild(m); 
                const p = document.createElement('p'); 
                p.innerHTML = `${l.cell_layout}<br>${l.aspect_ratio}`; 
                i.appendChild(p); 
                i.addEventListener('click', () => handleLayoutSelection(i, l)); 
                c.appendChild(i); 
            }); 
        } 
        catch (e) { console.error(e); } 
    }
    function handleLayoutSelection(el, data) { 
        if (selectedTemplate.element) { 
            selectedTemplate.element.classList.remove('selected'); } 
            selectedTemplate = { element: el, data: data }; 
            el.classList.add('selected'); 
            continueBtn.style.display = 'block'; 
        }
    async function loadStickerGallery() { try { const r = await fetch('/stickers'); const d = await r.json(); const c = document.getElementById('sticker-gallery'); c.innerHTML = ''; d.forEach(s => { const i = document.createElement('div'); i.className = 'sticker-item'; const m = document.createElement('img'); m.src = s.sticker_path; m.draggable = true; m.addEventListener('dragstart', (e) => { e.dataTransfer.setData('application/json', JSON.stringify(s)); }); i.appendChild(m); c.appendChild(i); }); } catch (e) { console.error(e); } }
    async function handleFileUpload(event, endpoint, callback) { 
        const f = event.target.files[0]; 
        if (!f) return; 
        const d = new FormData(); 
        d.append('file', f); 
        try { 
            const r = await fetch(endpoint, { method: 'POST', body: d }); 
            if (!r.ok) throw new Error((await r.json()).detail); 
            const data = await r.json();
            if (endpoint === '/upload_template') {
                showTemplateEditScreen(data);
            } else {
                callback(); 
            }
        } catch (e) { 
            console.error(e); 
        } 
        event.target.value = null; 
    }

    function showTemplateEditScreen(templateData) {
        mainMenu.style.display = 'none';
        appContent.style.display = 'none';
        reviewScreen.style.display = 'none';
        resultScreen.style.display = 'none';
        document.getElementById('template-edit-screen').style.display = 'block';

        editingTemplate = templateData;
        renderTemplateEditPreview();
    }

    function renderTemplateEditPreview() {
        const p = document.getElementById('template-edit-preview');
        p.innerHTML = '';
        const t = document.createElement('img');
        t.src = editingTemplate.template_path;
        t.className = 'preview-template-img';
        t.draggable = false;
        t.onload = () => {
            renderEditableHoles();
        };
        p.appendChild(t);
    }



    function handleCapture() { const v = document.getElementById('camera-stream'), c = document.getElementById('capture-canvas'), x = c.getContext('2d'); c.width = v.videoWidth; c.height = v.videoHeight; x.drawImage(v, 0, 0, c.width, c.height); c.toBlob(b => { capturedPhotos.push(b); const t = document.createElement('img'); t.src = URL.createObjectURL(b); t.classList.add('thumbnail'); document.getElementById('thumbnails-container').appendChild(t); updatePhotoStatus(); }, 'image/jpeg'); }

    // --- 2. PHOTO TAKING ---

    function handleManualCapture() {
        if (isCapturing) handleCapture();
    }

    function startCaptureSequence() {
        if (captureMode === 'upload') {
            if (capturedPhotos.length !== templateInfo.hole_count) {
                alert(`사진을 ${templateInfo.hole_count}개 선택해야 합니다.`);
                return;
            }
            showReviewScreen();
            return;
        }

        isCapturing = true;
        modeSelection.style.display = 'none';
        timerControls.style.display = 'none';
        startCaptureBtn.style.display = 'none';

        if (selectedTimer === 0) {
            document.getElementById('capture-btn').style.display = 'block';
        } else {
            document.getElementById('capture-btn').style.display = 'none';
            runTimerCapture();
        }
    }

    function runTimerCapture() {
        if (capturedPhotos.length >= templateInfo.hole_count) {
            isCapturing = false;
            return;
        }

        let countdown = selectedTimer;
        countdownDisplay.style.display = 'block';
        countdownDisplay.textContent = countdown;

        const countdownInterval = setInterval(() => {
            countdown--;
            countdownDisplay.textContent = countdown;
            if (countdown <= 0) {
                clearInterval(countdownInterval);
                countdownDisplay.style.display = 'none';
                handleCapture();
                setTimeout(runTimerCapture, 1000); // Wait 1 sec before next cycle
            }
        }, 1000);
    }

    function switchCaptureMode(newMode) {
        captureMode = newMode;
        document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector(`.mode-btn[data-mode="${newMode}"]`).classList.add('active');

        if (newMode === 'camera') {
            document.getElementById('camera-stream').style.display = 'block';
            uploadArea.style.display = 'none';
            timerControls.style.display = 'flex';
            startCaptureBtn.textContent = '시작';
        } else {
            document.getElementById('camera-stream').style.display = 'none';
            uploadArea.style.display = 'block';
            timerControls.style.display = 'none';
            startCaptureBtn.textContent = '계속';
        }
    }

    function handlePhotoUpload(event) {
        const files = event.target.files;
        const requiredPhotos = templateInfo.hole_count;
        if (files.length + capturedPhotos.length > requiredPhotos) {
            alert(`최대 ${requiredPhotos}개의 이미지만 업로드할 수 있습니다.`);
            return;
        }

        for (const file of files) {
            if (!file.type.startsWith('image/')) continue;
            const reader = new FileReader();
            reader.onload = (e) => {
                const blob = new Blob([e.target.result], { type: file.type });
                capturedPhotos.push(blob);
                const t = document.createElement('img');
                t.src = URL.createObjectURL(blob);
                t.classList.add('thumbnail');
                uploadThumbnailsContainer.appendChild(t);
                updatePhotoStatus();
            };
            reader.readAsArrayBuffer(file);
        }
        photoUploadInput.value = null; // Reset file input
    }

    function applyPhotoFilters() {
        // Apply base filters to the image itself
        const baseFilterString = `brightness(${filters.brightness}%) contrast(${filters.contrast}%) saturate(${filters.saturate}%) blur(${filters.blur}px)`;
        document.querySelectorAll('.preview-photo-img').forEach(img => {
            img.style.filter = baseFilterString;
        });

        let wrapperFilterString = '';

        // --- Real-time Sharpening via SVG Filter ---
        if (filters.sharpness > 0) {
            const amount = filters.sharpness / 100.0;
            const kernel = [
                0, -amount, 0,
                -amount, 1 + 4 * amount, -amount,
                0, -amount, 0
            ].join(' ');
            sharpenMatrix.setAttribute('kernelMatrix', kernel);
            wrapperFilterString += ` url(#sharpen-filter)`;
        } else {
            sharpenMatrix.setAttribute('kernelMatrix', '0 0 0 0 1 0 0 0 0');
        }

        // --- Real-time Warmth via SVG Filter ---
        if (filters.warmth !== 100) {
            // This offset value is scaled to match the backend's linear channel adjustment
            const amount = (filters.warmth - 100) / 510.0;
            const matrix = `1 0 0 0 ${amount} 0 1 0 0 0 0 0 1 0 ${-amount} 0 0 0 1 0`;
            warmthMatrix.setAttribute('values', matrix);
            wrapperFilterString += ` url(#warmth-filter)`;
        } else {
            warmthMatrix.setAttribute('values', '1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0');
        }

        // Apply wrapper filters
        document.querySelectorAll('.preview-photo-wrapper').forEach(wrapper => {
            wrapper.style.filter = wrapperFilterString.trim();
        });
    }

    async function startPhotoSession() { 
        mainMenu.style.display = 'none'; 
        appContent.style.display = 'block'; 
        document.getElementById('app-title').textContent = '사진 촬영'; 
        switchCaptureMode('camera');
        modeSelection.style.display = 'flex';
        timerControls.style.display = 'flex';
        startCaptureBtn.style.display = 'block';
        document.getElementById('capture-btn').style.display = 'none';
        capturedPhotos = [];
        photoAssignments = [];
        document.getElementById('thumbnails-container').innerHTML = '';
        uploadThumbnailsContainer.innerHTML = '';

        const h = templateInfo.holes[0]; 
        const r = h.w / h.h; 
        try { 
            stream = await navigator.mediaDevices.getUserMedia({ video: { aspectRatio: { ideal: r } } }); 
        } catch (e) { 
            try { 
                stream = await navigator.mediaDevices.getUserMedia({ video: true }); 
            } catch (e2) { 
                return; 
            } 
        } 
        document.getElementById('camera-stream').srcObject = stream; 
        updatePhotoStatus(); 
    }
    function updatePhotoStatus() { const n = templateInfo.hole_count, t = capturedPhotos.length; document.getElementById('app-status').textContent = `${t} / ${n}장 촬영됨`; if (t >= n) { if (stream) stream.getTracks().forEach(tr => tr.stop()); showReviewScreen(); } }
    function handleCapture() { const v = document.getElementById('camera-stream'), c = document.getElementById('capture-canvas'), x = c.getContext('2d'); c.width = v.videoWidth; c.height = v.videoHeight; x.drawImage(v, 0, 0, c.width, c.height); c.toBlob(b => { capturedPhotos.push(b); const t = document.createElement('img'); t.src = URL.createObjectURL(b); t.classList.add('thumbnail'); document.getElementById('thumbnails-container').appendChild(t); updatePhotoStatus(); }, 'image/jpeg'); }

    // --- 3. REVIEW & EDIT ---
    function showReviewScreen() { 
        appContent.style.display = 'none'; 
        reviewScreen.style.display = 'block'; 
        photoAssignments = [...capturedPhotos]; 
        placedStickers = []; 
        filters = { brightness: 100, contrast: 100, saturate: 100, warmth: 100, sharpness: 0, blur: 0 };
        document.querySelectorAll('#filter-controls input[type="range"]').forEach(slider => {
            if (slider.dataset.filter === 'sharpness' || slider.dataset.filter === 'blur') {
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
    function renderReviewThumbnails() { const c = document.getElementById('review-thumbnails'); c.innerHTML = ''; capturedPhotos.forEach((b, i) => { const t = document.createElement('img'); t.src = URL.createObjectURL(b); t.className = 'thumbnail'; t.draggable = true; t.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', i)); t.addEventListener('click', () => handlePhotoSelection(i)); c.appendChild(t); }); }
    async function loadSimilarTemplates() { 
        const { aspect_ratio, cell_layout } = templateInfo; 
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
    function renderPreview() { const p = document.getElementById('review-preview'); p.innerHTML = ''; const t = document.createElement('img'); t.src = templateInfo.template_path; t.className = 'preview-template-img'; t.onload = () => { renderPhotoAssignments(); renderPlacedStickers(); }; p.appendChild(t); }
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
        photoAssignments.forEach((b, hIdx) => { 
            const h = templateInfo.holes[hIdx];
            const wrapper = document.createElement('div');
            wrapper.className = 'preview-photo-wrapper';
            wrapper.style.left = `${offsetX + h.x * scale}px`; 
            wrapper.style.top = `${offsetY + h.y * scale}px`; 
            wrapper.style.width = `${h.w * scale}px`; 
            wrapper.style.height = `${h.h * scale}px`;

            const i = document.createElement('img'); 
            i.src = URL.createObjectURL(b); 
            i.className = 'preview-photo-img'; 
            i.draggable = true; 
            i.addEventListener('dragstart', (e) => { const oIdx = capturedPhotos.findIndex(p => p === b); e.dataTransfer.setData('text/plain', oIdx); }); 
            i.addEventListener('click', () => handleHoleSelection(i, hIdx)); 
            i.addEventListener('dragover', (e) => e.preventDefault()); 
            i.addEventListener('drop', (e) => { 
                e.preventDefault(); 
                try { 
                    const dIdx = parseInt(e.dataTransfer.getData('text/plain'), 10); 
                    if (!isNaN(dIdx)) { 
                        e.stopPropagation(); 
                        handleSwap(hIdx, dIdx); 
                    } 
                } catch (err) {} 
            }); 
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

        placedStickers.forEach(d => {
            const w = document.createElement('div');
            w.className = 'placed-sticker-wrapper';
            if (activeSticker.data && activeSticker.data.id === d.id) {
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

            if (activeSticker.data && activeSticker.data.id === d.id) {
                const selectionBox = document.createElement('div');
                selectionBox.className = 'selection-box';
                w.appendChild(selectionBox);

                const handles = ['nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e'];
                handles.forEach(handle => {
                    const handleEl = document.createElement('div');
                    handleEl.className = `resize-handle ${handle}`;
                    handleEl.addEventListener('mousedown', (e) => {
                        e.stopPropagation();
                        activeSticker.action = `resize-${handle}`;
                        dragStart = { x: e.clientX, y: e.clientY, initialX: d.x, initialY: d.y, initialW: d.width, initialH: d.height };
                    });
                    w.appendChild(handleEl);
                });

                const removeBtn = document.createElement('div');
                removeBtn.className = 'remove-sticker-btn';
                removeBtn.textContent = 'X';
                removeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const index = placedStickers.findIndex(s => s.id === d.id);
                    if (index > -1) {
                        placedStickers.splice(index, 1);
                    }
                    activeSticker = { element: null, data: null, action: null };
                    renderPlacedStickers();
                });
                w.appendChild(removeBtn);

                const rotationHandle = document.createElement('div');
                rotationHandle.className = 'rotation-handle';
                rotationHandle.addEventListener('mousedown', (e) => {
                    e.stopPropagation();
                    activeSticker.action = 'rotate';
                    const stickerRect = w.getBoundingClientRect();
                    const centerX = stickerRect.left + stickerRect.width / 2;
                    const centerY = stickerRect.top + stickerRect.height / 2;
                    dragStart = { x: e.clientX, y: e.clientY, centerX, centerY, initialRotation: d.rotation };
                });
                w.appendChild(rotationHandle);
            }

            previewContainer.appendChild(w);
        });
    }

    function renderEditableHoles() {
        document.querySelectorAll('.editable-hole-wrapper').forEach(w => w.remove());
        const { scale, offsetX, offsetY } = getPreviewScaling('template-edit-preview');
        if (scale === 1) return; // Preview not ready
        const previewContainer = document.getElementById('template-edit-preview');

        editingTemplate.holes.forEach((hole, index) => {
            const transform = editingTemplate.transformations[index];
            const w = document.createElement('div');
            w.className = 'editable-hole-wrapper';
            if (activeHole.index === index) {
                w.classList.add('active');
            }
            w.style.position = 'absolute';
            w.style.left = `${offsetX + hole.x * scale}px`;
            w.style.top = `${offsetY + hole.y * scale}px`;
            w.style.width = `${hole.w * scale}px`;
            w.style.height = `${hole.h * scale}px`;
            w.style.transform = `rotate(${transform.rotation}deg) scale(${transform.scale})`;
            
            const i = document.createElement('div');
            i.className = 'editable-hole-inner';
            i.textContent = `${index + 1}`;
            w.addEventListener('mousedown', (e) => handleHoleMouseDown(e, hole, index, w), false);
            w.appendChild(i);

            if (activeHole.index === index) {
                const selectionBox = document.createElement('div');
                selectionBox.className = 'selection-box';
                w.appendChild(selectionBox);

                const handles = ['nw', 'ne', 'sw', 'se'];
                handles.forEach(handle => {
                    const handleEl = document.createElement('div');
                    handleEl.className = `resize-handle ${handle}`;
                    handleEl.style.transform = `scale(${1 / transform.scale})`; // Counteract parent scale
                    handleEl.style.transformOrigin = 'center'; // Ensure scaling is centered
                    handleEl.addEventListener('mousedown', (e) => {
                        e.stopPropagation();
                        activeHole.action = `resize-${handle}`;
                        dragStart = { x: e.clientX, y: e.clientY, initialScale: transform.scale, initialW: hole.w, initialH: hole.h };
                    });
                    w.appendChild(handleEl);
                });

                const rotationHandle = document.createElement('div');
                rotationHandle.className = 'rotation-handle';
                rotationHandle.style.transform = `scale(${1 / transform.scale})`; // Counteract parent scale
                rotationHandle.style.transformOrigin = 'center'; // Ensure scaling is centered
                rotationHandle.addEventListener('mousedown', (e) => {
                    e.stopPropagation();
                    activeHole.action = 'rotate';
                    const holeRect = w.getBoundingClientRect();
                    const centerX = holeRect.left + holeRect.width / 2;
                    const centerY = holeRect.top + holeRect.height / 2;
                    dragStart = { x: e.clientX, y: e.clientY, centerX, centerY, initialRotation: transform.rotation };
                });
                w.appendChild(rotationHandle);
            }

            previewContainer.appendChild(w);
        });
    }
    function handleStickerMouseDown(e, data, el) {
        e.preventDefault();
        e.stopPropagation();
        if (!activeSticker.data || activeSticker.data.id !== data.id) {
            activeSticker = { element: el, data: data, action: 'move' };
            renderPlacedStickers();
        } else {
            activeSticker.action = 'move';
        }
        dragStart = { x: e.clientX, y: e.clientY, initialX: data.x, initialY: data.y };
    }

    document.getElementById('review-preview').addEventListener('click', (e) => {
        if (e.target.id === 'review-preview') {
            if (activeSticker.data) {
                activeSticker = { element: null, data: null, action: null };
                renderPlacedStickers();
            }
        }
    });
    function handleStickerMove(e) {
        if (!activeSticker.action) return;
        e.preventDefault();
        
        const { scale } = getPreviewScaling();
        if (scale === 1) return;

        // Convert mouse movement from screen pixels to natural image pixels
        const dX_natural = (e.clientX - dragStart.x) / scale;
        const dY_natural = (e.clientY - dragStart.y) / scale;

        const sticker = activeSticker.data;
        const initialRatio = dragStart.initialW / dragStart.initialH;
        const minSizeNatural = 20 / scale; // 20px minimum size in natural units

        if (activeSticker.action === 'move') {
            sticker.x = Math.round(dragStart.initialX + dX_natural);
            sticker.y = Math.round(dragStart.initialY + dY_natural);
        } else if (activeSticker.action === 'rotate') {
            const angle = Math.atan2(e.clientY - dragStart.centerY, e.clientX - dragStart.centerX) * (180 / Math.PI);
            const startAngle = Math.atan2(dragStart.y - dragStart.centerY, dragStart.x - dragStart.centerX) * (180 / Math.PI);
            sticker.rotation = Math.round(dragStart.initialRotation + angle - startAngle);
        } else if (activeSticker.action.startsWith('resize-')) {
            const handle = activeSticker.action.split('-')[1];
            if (handle.includes('e')) {
                sticker.width = Math.max(minSizeNatural, dragStart.initialW + dX_natural);
            }
            if (handle.includes('s')) {
                sticker.height = Math.max(minSizeNatural, dragStart.initialH + dY_natural);
            }
            if (handle.includes('w')) {
                sticker.width = Math.max(minSizeNatural, dragStart.initialW - dX_natural);
                sticker.x = dragStart.initialX + dX_natural;
            }
            if (handle.includes('n')) {
                sticker.height = Math.max(minSizeNatural, dragStart.initialH - dY_natural);
                sticker.y = dragStart.initialY + dY_natural;
            }

            // Maintain aspect ratio for corner handles
            if (handle.length === 2) {
                if (Math.abs(sticker.width / sticker.height - initialRatio) > 0.01) {
                    if (handle.includes('e') || handle.includes('w')) {
                        sticker.height = Math.round(sticker.width / initialRatio);
                    } else {
                        sticker.width = Math.round(sticker.height * initialRatio);
                    }
                }
                 if (handle.includes('n')) {
                    sticker.y = dragStart.initialY + (dragStart.initialH - sticker.height);
                }
                if (handle.includes('w')) {
                    sticker.x = dragStart.initialX + (dragStart.initialW - sticker.width);
                }
            }
        }

        renderPlacedStickers();
    }

    function handleStickerMouseUp() {
        if (activeSticker.action) {
            activeSticker.action = null;
        }
    }

    function handleHoleMouseDown(e, data, index, el) {
        e.preventDefault();
        e.stopPropagation();
        const transform = editingTemplate.transformations[index];
        if (activeHole.index !== index) {
            activeHole = { element: el, data: data, index: index, action: 'move' };
            renderEditableHoles();
        } else {
            activeHole.action = 'move';
        }
        dragStart = { x: e.clientX, y: e.clientY, initialScale: transform.scale };
    }

    function handleHoleMove(e) {
        if (!activeHole.action) return;
        e.preventDefault();
    
        const transform = editingTemplate.transformations[activeHole.index];
        const holeWrapper = activeHole.element;
    
        if (activeHole.action === 'rotate') {
            const angle = Math.atan2(e.clientY - dragStart.centerY, e.clientX - dragStart.centerX) * (180 / Math.PI);
            const startAngle = Math.atan2(dragStart.y - dragStart.centerY, dragStart.x - dragStart.centerX) * (180 / Math.PI);
            transform.rotation = Math.round(dragStart.initialRotation + angle - startAngle);
        } else if (activeHole.action.startsWith('resize-')) {
            const { scale: previewScale } = getPreviewScaling('template-edit-preview');
            if (previewScale === 1) return;

            // Convert mouse movement from screen pixels to natural image pixels
            const dX_natural = (e.clientX - dragStart.x) / previewScale;
            const dY_natural = (e.clientY - dragStart.y) / previewScale;

            const transform = editingTemplate.transformations[activeHole.index];
            const handle = activeHole.action.split('-')[1];
            
            let newW = dragStart.initialW;
            let newH = dragStart.initialH;

            if (handle.includes('e')) {
                newW = dragStart.initialW + dX_natural;
            }
            if (handle.includes('s')) {
                newH = dragStart.initialH + dY_natural;
            }
            if (handle.includes('w')) {
                newW = dragStart.initialW - dX_natural;
            }
            if (handle.includes('n')) {
                newH = dragStart.initialH - dY_natural;
            }

            // For corner handles, maintain aspect ratio by using the larger dimensional change
            const scaleX = newW / dragStart.initialW;
            const scaleY = newH / dragStart.initialH;
            let finalScaleFactor;

            if (handle.length === 2) { // Corner (nw, ne, sw, se)
                 finalScaleFactor = Math.abs(scaleX - 1) > Math.abs(scaleY - 1) ? scaleX : scaleY;
            } else if (handle === 'n' || handle === 's') { // Vertical (n, s)
                finalScaleFactor = scaleY;
            } else { // Horizontal (w, e)
                finalScaleFactor = scaleX;
            }
            
            transform.scale = Math.max(0.1, dragStart.initialScale * finalScaleFactor);
        }
    
        renderTemplateEditPreview();
    }

    function handleHoleMouseUp() {
        if (activeHole.action) {
            if (activeHole.action.startsWith('resize-')) {
                dragStart.initialScale = editingTemplate.transformations[activeHole.index].scale;
            }
            activeHole.action = null;
        }
    }

    async function handleSaveTemplate() {
        try {
            const r = await fetch('/save_template', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(editingTemplate)
            });
            if (!r.ok) throw new Error((await r.json()).detail);
            document.getElementById('template-edit-screen').style.display = 'none';
            mainMenu.style.display = 'block';
            loadLayoutGallery();
        } catch (e) {
            console.error(e);
        }
    }
    function handleHoleSelection(el, hIdx) { if (selectedHole.element) selectedHole.element.classList.remove('selected'); selectedHole = { element: el, index: hIdx }; el.classList.add('selected'); }
    function handlePhotoSelection(pIdx) { if (selectedHole.index === -1) return; handleSwap(selectedHole.index, pIdx); }
    function handleSwap(hIdx, pIdx) { const ptm = capturedPhotos[pIdx], ptr = photoAssignments[hIdx], opor = photoAssignments.findIndex(p => p === ptm); if (opor !== -1) photoAssignments[opor] = ptr; photoAssignments[hIdx] = ptm; if (selectedHole.element) selectedHole.element.classList.remove('selected'); selectedHole = { element: null, index: -1 }; renderPreview(); }
    function handleTemplateChange(newTemplate) { templateInfo = newTemplate; renderPreview(); }
    
    // --- 4. FINAL COMPOSITION ---
    async function handleComposition() { 
        finalizeBtn.disabled = true; 
        const d = new FormData(); 
        d.append('template_path', templateInfo.template_path); 
        d.append('holes', JSON.stringify(templateInfo.holes)); 
        d.append('stickers', JSON.stringify(placedStickers)); 
        d.append('filters', JSON.stringify(filters)); 
        d.append('transformations', JSON.stringify(templateInfo.transformations)); 
        photoAssignments.forEach((b, i) => { 
            d.append('photos', b, `photo_${i}.jpg`); 
        }); 
        try { 
            const r = await fetch('/compose_image', { method: 'POST', body: d }); 
            if (!r.ok) 
                throw new Error((await r.json()).detail); 
            const j = await r.json(); 
            displayFinalResult(j); 
        } 
        catch (e) { 
            console.error(e); finalizeBtn.disabled = false; 
        } 
    }
    function displayFinalResult(result) { 
        reviewScreen.style.display = 'none'; 
        resultScreen.style.display = 'block'; 
        const { result_path, qr_code_path } = result; 
        document.getElementById('result-title').textContent = '완성!'; 
        document.getElementById('result-status').textContent = '이미지가 성공적으로 생성되었습니다.'; 
        const d = document.getElementById('result-display'); 
        d.innerHTML = ''; 
        const i = document.createElement('img'); 
        i.src = result_path; i.style.maxWidth = '100%'; 
        d.appendChild(i); 
        const c = document.createElement('div'); 
        c.style.marginTop = '20px'; 
        const a = document.createElement('a'); 
        a.href = result_path; 
        a.download = 'photobooth_result.png'; 
        const b = document.createElement('button'); 
        b.textContent = 'PC에 다운로드'; 
        a.appendChild(b); c.appendChild(a); 
        if (qr_code_path) { 
            const q = document.createElement('div'); 
            q.style.marginTop = '10px'; 
            q.innerHTML = '<p>또는, 모바일에서 QR 코드를 스캔하여 다운로드하세요:</p>'; 
            const qi = document.createElement('img'); 
            qi.src = qr_code_path; qi.style.width = '150px'; 
            q.appendChild(qi); 
            c.appendChild(q); 
        } 
        d.appendChild(c); 
    }

    // --- START THE APP ---
    initApp();
});
