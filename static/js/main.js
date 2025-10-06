
document.addEventListener('DOMContentLoaded', () => {
    // === STATE VARIABLES ===
    let templateInfo = null, selectedTemplate = { element: null, data: null };
    let capturedPhotos = [], photoAssignments = [];
    let selectedHole = { element: null, index: -1 };
    let placedStickers = [];
    let stream = null;
    let activeSticker = { element: null, data: null, action: null };
    let dragStart = { x: 0, y: 0, initialX: 0, initialY: 0 };
    let selectedTimer = 0; // 0 for manual, otherwise seconds
    let isCapturing = false;
    let captureMode = 'camera';

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

    // === INITIALIZATION ===
    function initApp() {
        templateUploadInput.addEventListener('change', (e) => handleFileUpload(e, '/upload_template', loadTemplateGallery));
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
        finalizeBtn.addEventListener('click', handleComposition);
        window.addEventListener('mousemove', handleStickerMove);
        window.addEventListener('mouseup', handleStickerMouseUp);
        window.addEventListener('resize', debouncedRender); // Add this line
        document.getElementById('review-preview').addEventListener('dragover', (e) => e.preventDefault());
        document.getElementById('review-preview').addEventListener('drop', (e) => {
            e.preventDefault();
            try {
                const stickerData = JSON.parse(e.dataTransfer.getData('application/json'));
                const p = document.getElementById('review-preview');
                const previewRect = p.getBoundingClientRect();
                const templateImg = p.querySelector('.preview-template-img');
                const scale = templateImg.naturalWidth / p.offsetWidth;

                const stickerImg = new Image();
                stickerImg.onload = () => {
                    const maxDim = 150;
                    let w, h;
                    if (stickerImg.naturalWidth > stickerImg.naturalHeight) {
                        w = maxDim;
                        h = (stickerImg.naturalHeight / stickerImg.naturalWidth) * maxDim;
                    } else {
                        h = maxDim;
                        w = (stickerImg.naturalWidth / stickerImg.naturalHeight) * maxDim;
                    }

                    const x = (e.clientX - previewRect.left - (w / 2)) * scale;
                    const y = (e.clientY - previewRect.top - (h / 2)) * scale;

                    placedStickers.push({
                        id: Date.now(),
                        path: stickerData.sticker_path,
                        x: Math.round(x),
                        y: Math.round(y),
                        width: Math.round(w),
                        height: Math.round(h),
                        rotation: 0
                    });
                    renderPlacedStickers();
                };
                stickerImg.src = stickerData.sticker_path;
            } catch (err) {
                // This is not a sticker drop, so we can ignore the error
            }
        });
        loadTemplateGallery();
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
    }, 100);

    // --- 1. GALLERIES & UPLOADS ---
    async function loadTemplateGallery() { try { const r = await fetch('/templates'); const d = await r.json(); const c = document.getElementById('template-gallery'); c.innerHTML = ''; d.forEach(t => { const i = document.createElement('div'); i.className = 'template-item'; const m = document.createElement('img'); m.src = t.template_path; i.appendChild(m); i.addEventListener('click', () => handleTemplateSelection(i, t)); c.appendChild(i); }); } catch (e) { console.error(e); } }
    function handleTemplateSelection(el, data) { if (selectedTemplate.element) { selectedTemplate.element.classList.remove('selected'); } selectedTemplate = { element: el, data: data }; el.classList.add('selected'); continueBtn.style.display = 'block'; }
    async function loadStickerGallery() { try { const r = await fetch('/stickers'); const d = await r.json(); const c = document.getElementById('sticker-gallery'); c.innerHTML = ''; d.forEach(s => { const i = document.createElement('div'); i.className = 'sticker-item'; const m = document.createElement('img'); m.src = s.sticker_path; m.draggable = true; m.addEventListener('dragstart', (e) => { e.dataTransfer.setData('application/json', JSON.stringify(s)); }); i.appendChild(m); c.appendChild(i); }); } catch (e) { console.error(e); } }
    async function handleFileUpload(event, endpoint, callback) { const f = event.target.files[0]; if (!f) return; const d = new FormData(); d.append('file', f); try { const r = await fetch(endpoint, { method: 'POST', body: d }); if (!r.ok) throw new Error((await r.json()).detail); callback(); } catch (e) { console.error(e); } event.target.value = null; }

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
    function showReviewScreen() { appContent.style.display = 'none'; reviewScreen.style.display = 'block'; photoAssignments = [...capturedPhotos]; placedStickers = []; renderReviewThumbnails(); renderPreview(); loadStickerGallery(); }
    function renderReviewThumbnails() { const c = document.getElementById('review-thumbnails'); c.innerHTML = ''; capturedPhotos.forEach((b, i) => { const t = document.createElement('img'); t.src = URL.createObjectURL(b); t.className = 'thumbnail'; t.draggable = true; t.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', i)); t.addEventListener('click', () => handlePhotoSelection(i)); c.appendChild(t); }); }
    function renderPreview() { const p = document.getElementById('review-preview'); p.innerHTML = ''; const t = document.createElement('img'); t.src = templateInfo.template_path; t.className = 'preview-template-img'; t.onload = () => { renderPhotoAssignments(); renderPlacedStickers(); }; p.appendChild(t); }
    function renderPhotoAssignments() { const p = document.getElementById('review-preview'), t = p.querySelector('.preview-template-img'); if (!t || !t.naturalWidth) return; const s = p.offsetWidth / t.naturalWidth; document.querySelectorAll('.preview-photo-img').forEach(i => i.remove()); photoAssignments.forEach((b, hIdx) => { const h = templateInfo.holes[hIdx], i = document.createElement('img'); i.src = URL.createObjectURL(b); i.className = 'preview-photo-img'; i.style.left = `${h.x*s}px`; i.style.top = `${h.y*s}px`; i.style.width = `${h.w*s}px`; i.style.height = `${h.h*s}px`; i.draggable = true; i.addEventListener('dragstart', (e) => { const oIdx = capturedPhotos.findIndex(p => p === b); e.dataTransfer.setData('text/plain', oIdx); }); i.addEventListener('click', () => handleHoleSelection(i, hIdx)); i.addEventListener('dragover', (e) => e.preventDefault()); i.addEventListener('drop', (e) => { 
        e.preventDefault(); 
        try { 
            const dIdx = parseInt(e.dataTransfer.getData('text/plain'), 10); 
            if (!isNaN(dIdx)) { 
                e.stopPropagation(); 
                handleSwap(hIdx, dIdx); 
            } 
        } catch (err) {} 
    }); p.appendChild(i); }); }
    function renderPlacedStickers() {
        document.querySelectorAll('.placed-sticker-wrapper').forEach(w => w.remove());
        const p = document.getElementById('review-preview'), t = p.querySelector('.preview-template-img');
        if (!t || !t.naturalWidth) return;
        const s = p.offsetWidth / t.naturalWidth;
        placedStickers.forEach(d => {
            const w = document.createElement('div');
            w.className = 'placed-sticker-wrapper';
            if (activeSticker.data && activeSticker.data.id === d.id) {
                w.classList.add('active');
            }
            w.style.position = 'absolute';
            w.style.left = `${d.x*s}px`;
            w.style.top = `${d.y*s}px`;
            w.style.width = `${d.width*s}px`;
            w.style.height = `${d.height*s}px`;
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

            p.appendChild(w);
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
        const p = document.getElementById('review-preview'), t = p.querySelector('.preview-template-img');
        if (!t || !t.naturalWidth) return;
        const s = t.naturalWidth / p.offsetWidth;
        const dX = (e.clientX - dragStart.x) * s;
        const dY = (e.clientY - dragStart.y) * s;

        const sticker = activeSticker.data;
        const initialRatio = dragStart.initialW / dragStart.initialH;

        if (activeSticker.action === 'move') {
            sticker.x = Math.round(dragStart.initialX + dX);
            sticker.y = Math.round(dragStart.initialY + dY);
        } else if (activeSticker.action === 'rotate') {
            const angle = Math.atan2(e.clientY - dragStart.centerY, e.clientX - dragStart.centerX) * (180 / Math.PI);
            const startAngle = Math.atan2(dragStart.y - dragStart.centerY, dragStart.x - dragStart.centerX) * (180 / Math.PI);
            sticker.rotation = Math.round(dragStart.initialRotation + angle - startAngle);
        } else if (activeSticker.action.startsWith('resize-')) {
            const handle = activeSticker.action.split('-')[1];
            if (handle.includes('e')) {
                sticker.width = Math.round(Math.max(20, dragStart.initialW + dX));
            }
            if (handle.includes('s')) {
                sticker.height = Math.round(Math.max(20, dragStart.initialH + dY));
            }
            if (handle.includes('w')) {
                sticker.width = Math.round(Math.max(20, dragStart.initialW - dX));
                sticker.x = dragStart.initialX + dX;
            }
            if (handle.includes('n')) {
                sticker.height = Math.round(Math.max(20, dragStart.initialH - dY));
                sticker.y = dragStart.initialY + dY;
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
    function handleHoleSelection(el, hIdx) { if (selectedHole.element) selectedHole.element.classList.remove('selected'); selectedHole = { element: el, index: hIdx }; el.classList.add('selected'); }
    function handlePhotoSelection(pIdx) { if (selectedHole.index === -1) return; handleSwap(selectedHole.index, pIdx); }
    function handleSwap(hIdx, pIdx) { const ptm = capturedPhotos[pIdx], ptr = photoAssignments[hIdx], opor = photoAssignments.findIndex(p => p === ptm); if (opor !== -1) photoAssignments[opor] = ptr; photoAssignments[hIdx] = ptm; if (selectedHole.element) selectedHole.element.classList.remove('selected'); selectedHole = { element: null, index: -1 }; renderPreview(); }
    
    // --- 4. FINAL COMPOSITION ---
    async function handleComposition() { finalizeBtn.disabled = true; const d = new FormData(); d.append('template_path', templateInfo.template_path); d.append('holes', JSON.stringify(templateInfo.holes)); d.append('stickers', JSON.stringify(placedStickers)); photoAssignments.forEach((b, i) => { d.append('photos', b, `photo_${i}.jpg`); }); try { const r = await fetch('/compose_image', { method: 'POST', body: d }); if (!r.ok) throw new Error((await r.json()).detail); const j = await r.json(); displayFinalResult(j); } catch (e) { console.error(e); finalizeBtn.disabled = false; } }
    function displayFinalResult(result) { reviewScreen.style.display = 'none'; resultScreen.style.display = 'block'; const { result_path, qr_code_path } = result; document.getElementById('result-title').textContent = '완성!'; document.getElementById('result-status').textContent = '이미지가 성공적으로 생성되었습니다.'; const d = document.getElementById('result-display'); d.innerHTML = ''; const i = document.createElement('img'); i.src = result_path; i.style.maxWidth = '100%'; d.appendChild(i); const c = document.createElement('div'); c.style.marginTop = '20px'; const a = document.createElement('a'); a.href = result_path; a.download = 'photobooth_result.png'; const b = document.createElement('button'); b.textContent = 'PC에 다운로드'; a.appendChild(b); c.appendChild(a); if (qr_code_path) { const q = document.createElement('div'); q.style.marginTop = '10px'; q.innerHTML = '<p>또는, 모바일에서 QR 코드를 스캔하여 다운로드하세요:</p>'; const qi = document.createElement('img'); qi.src = qr_code_path; qi.style.width = '150px'; q.appendChild(qi); c.appendChild(q); } d.appendChild(c); }

    // --- START THE APP ---
    initApp();
});
