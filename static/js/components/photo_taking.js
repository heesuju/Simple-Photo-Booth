window.eventBus.on('app:init', (appState) => {
    const appContent = document.getElementById('app-content');
    const startCaptureBtn = document.getElementById('start-capture-btn');
    const captureBtn = document.getElementById('capture-btn');
    const timerControls = document.getElementById('timer-controls');
    const modeSelection = document.getElementById('mode-selection');
    const dropArea = document.getElementById('drop-area');
    const photoUploadInput = document.getElementById('photo-upload-input');
    const photoUploadBtn = document.getElementById('photo-upload-btn');

    // Drag & drop events
    dropArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropArea.classList.add('dragover');
    });

    dropArea.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropArea.classList.remove('dragover');
    });

    dropArea.addEventListener('drop', (e) => {
        e.preventDefault();
        dropArea.classList.remove('dragover');

        const files = e.dataTransfer.files;
        // Reuse your existing function
        handlePhotoUpload({ target: { files } });
    });

    const cameraStream = document.getElementById('camera-stream');
    const uploadArea = document.getElementById('upload-area');
    const countdownDisplay = document.getElementById('countdown-display');
    const thumbnailsContainer = document.getElementById('thumbnails-container');

    const croppingModal = document.getElementById('cropping-modal');
    const cropContainer = document.getElementById('crop-container');
    const cropImage = document.getElementById('crop-image');
    const cropRectangle = document.getElementById('crop-rectangle');
    const cropConfirmBtn = document.getElementById('crop-confirm-btn');
    const cropCancelBtn = document.getElementById('crop-cancel-btn');

    let currentCropIndex = -1;
    let cropRectInfo = { x: 0, y: 0, width: 0, height: 0 };
    let isDragging = false;
    let isResizing = false;
    let resizeHandle = '';
    let startX, startY, startWidth, startHeight, startLeft, startTop;
    let tempCropData = {}; // key: index, value: { x, y, width, height, scaleX, scaleY }

    startCaptureBtn.addEventListener('click', () => window.eventBus.dispatch('capture-sequence:start'));
    captureBtn.addEventListener('click', () => window.eventBus.dispatch('capture:manual'));
    const timerSelect = document.getElementById('timer-select');
    timerSelect.addEventListener('change', (e) => {
        appState.selectedTimer = parseInt(e.target.value, 10);
    });
    modeSelection.addEventListener('click', (e) => {
        if (e.target.classList.contains('mode-btn')) {
            const newMode = e.target.dataset.mode;
            if (newMode !== appState.captureMode) {
                switchCaptureMode(newMode);
            }
        }
    });
    photoUploadBtn.addEventListener('click', () => photoUploadInput.click());
    photoUploadInput.addEventListener('change', handlePhotoUpload);

    window.eventBus.on('main-menu:continue', async (data) => {
        appState.templateInfo = data;
        const h = data.holes[0];
        const r = h.w / h.h;
        try {
            appState.stream = await navigator.mediaDevices.getUserMedia({ video: { aspectRatio: { ideal: r }, facingMode: 'user' } });
        } catch (e) {
            console.error('Initial getUserMedia with facingMode failed:', e);
            try {
                appState.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
            } catch (e2) {
                console.error('Fallback getUserMedia with facingMode failed:', e2);
                try {
                    appState.stream = await navigator.mediaDevices.getUserMedia({ video: true });
                } catch (e3) {
                    alert('Camera access failed: ' + e3.message);
                    console.error('Final fallback getUserMedia failed:', e3);
                    return;
                }
            }
        }
        window.eventBus.dispatch('screen:show', 'app-content');
        startPhotoSession();
    });

    window.eventBus.on('photo-taking:start-retake', () => {
        startRetakeSession();
    });

    function startPhotoSession() { 
        appState.isRetaking = false;
        appState.photosToRetake = [];
        appState.newlyCapturedPhotos = [];
        appState.newlyCapturedVideos = [];
        document.getElementById('app-title').textContent = '사진 촬영'; 
        switchCaptureMode('camera');
        modeSelection.style.display = 'flex';
        timerControls.style.display = 'flex';
        startCaptureBtn.style.display = 'block';
        captureBtn.style.display = 'none';
        appState.capturedPhotos = [];
        appState.capturedVideos = [];
        appState.videoUploadPromises = [];
        thumbnailsContainer.innerHTML = '';

        cameraStream.srcObject = appState.stream;
        cameraStream.play();

        updatePhotoStatus(); 
    }

    function startRetakeSession() {
        appState.isRetaking = true;
        appState.newlyCapturedPhotos = [];
        appState.newlyCapturedVideos = [];

        document.getElementById('app-title').textContent = '사진 재촬영';
        switchCaptureMode('camera');
        modeSelection.style.display = 'none';
        timerControls.style.display = 'flex';
        startCaptureBtn.style.display = 'block';
        captureBtn.style.display = 'none';
        appState.videoUploadPromises = [];
        thumbnailsContainer.innerHTML = '';

        if (!appState.stream || appState.stream.getTracks().every(t => t.readyState === 'ended')) {
            const h = appState.templateInfo.holes[0];
            const r = h.w / h.h;
            navigator.mediaDevices.getUserMedia({ video: { aspectRatio: { ideal: r }, facingMode: 'user' } })
                .then(stream => {
                    appState.stream = stream;
                    cameraStream.srcObject = stream;
                    cameraStream.play();
                    updatePhotoStatus();
                })
                .catch(e => {
                    console.error('Retake getUserMedia with aspect ratio failed:', e);
                    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
                        .then(stream => {
                            appState.stream = stream;
                            cameraStream.srcObject = stream;
                            cameraStream.play();
                            updatePhotoStatus();
                        })
                        .catch(e2 => {
                            alert('Camera access failed: ' + e2.message);
                            console.error('Retake fallback getUserMedia failed:', e2);
                        });
                });
        } else {
            cameraStream.srcObject = appState.stream;
            cameraStream.play();
            updatePhotoStatus();
        }
    }

    function switchCaptureMode(newMode) {
        appState.captureMode = newMode;
        document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector(`.mode-btn[data-mode="${newMode}"]`).classList.add('active');

        if (newMode === 'camera') {
            cameraStream.style.display = 'block';
            uploadArea.style.display = 'none';
            timerControls.style.display = 'flex';
            startCaptureBtn.textContent = '시작';
        } else {
            cameraStream.style.display = 'none';
            uploadArea.style.display = 'block';
            timerControls.style.display = 'none';
            startCaptureBtn.textContent = '계속';
        }
    }

    function handlePhotoUpload(event) {
        const files = event.target.files;
        const requiredPhotos = appState.templateInfo.hole_count;
        if (files.length + appState.capturedPhotos.length > requiredPhotos) {
            alert(`최대 ${requiredPhotos}개의 이미지만 업로드할 수 있습니다.`);
            return;
        }

        for (const file of files) {
            if (!file.type.startsWith('image/')) continue;

            const reader = new FileReader();
            reader.onload = (e) => {
                const blob = new Blob([e.target.result], { type: file.type });
                appState.capturedPhotos.push(blob);
                const index = appState.capturedPhotos.length - 1;

                const t = document.createElement('img');
                t.src = URL.createObjectURL(blob);
                t.classList.add('thumbnail', 'upload-thumbnail');
                t.setAttribute('data-index', index);
                t.addEventListener('click', () => openCroppingUI(index));
                thumbnailsContainer.appendChild(t);
                updatePhotoStatus();
            };
            reader.readAsArrayBuffer(file);
        }
        photoUploadInput.value = null;
        modeSelection.style.display = 'none';
    }

    function naturalToDisplayCoords(crop, img, container) {
        const scaleX = img.width / img.naturalWidth;
        const scaleY = img.height / img.naturalHeight;

        return {
            x: crop.x * scaleX + (img.offsetLeft || 0),
            y: crop.y * scaleY + (img.offsetTop || 0),
            width: crop.width * scaleX,
            height: crop.height * scaleY
        };
    }

    function openCroppingUI(index) {
        currentCropIndex = index;
        const blob = appState.capturedPhotos[index];
        cropImage.src = URL.createObjectURL(blob);
        croppingModal.className = 'modal-visible';

        const templateHole = appState.templateInfo.holes[index];
        const targetAspectRatio = templateHole.w / templateHole.h;

        cropImage.onload = () => {
            const imageAspectRatio = cropImage.naturalWidth / cropImage.naturalHeight;
            const containerWidth = cropContainer.offsetWidth;
            const containerHeight = cropContainer.offsetHeight;

            let imgDisplayWidth, imgDisplayHeight, imgDisplayX, imgDisplayY;

            if (containerWidth / containerHeight > imageAspectRatio) {
                imgDisplayHeight = containerHeight;
                imgDisplayWidth = imgDisplayHeight * imageAspectRatio;
                imgDisplayY = 0;
                imgDisplayX = (containerWidth - imgDisplayWidth) / 2;
            } else {
                imgDisplayWidth = containerWidth;
                imgDisplayHeight = imgDisplayWidth / imageAspectRatio;
                imgDisplayX = 0;
                imgDisplayY = (containerHeight - imgDisplayHeight) / 2;
            }

            let rectWidth, rectHeight, rectX, rectY;

            if (tempCropData[index]) {
                const crop = tempCropData[index];
                const displayCrop = naturalToDisplayCoords(crop, cropImage, cropContainer);

                rectX = displayCrop.x;
                rectY = displayCrop.y;
                rectWidth = displayCrop.width;
                rectHeight = displayCrop.height;
            } else {
                if (imageAspectRatio > targetAspectRatio) {
                    rectWidth = imgDisplayHeight * targetAspectRatio;
                    rectHeight = imgDisplayHeight;
                    rectX = (imgDisplayWidth - rectWidth) / 2 + imgDisplayX;
                    rectY = imgDisplayY;
                } else {
                    rectWidth = imgDisplayWidth;
                    rectHeight = rectWidth / targetAspectRatio;
                    rectX = imgDisplayX;
                    rectY = (imgDisplayHeight - rectHeight) / 2 + imgDisplayY;
                }
            }

            cropRectangle.style.width = `${rectWidth}px`;
            cropRectangle.style.height = `${rectHeight}px`;
            cropRectangle.style.left = `${rectX}px`;
            cropRectangle.style.top = `${rectY}px`;

            cropRectInfo = { x: rectX, y: rectY, width: rectWidth, height: rectHeight };

            cropRectangle.innerHTML = `
                <div class="crop-handle nw"></div>
                <div class="crop-handle ne"></div>
                <div class="crop-handle sw"></div>
                <div class="crop-handle se"></div>
            `;
        };
    }

    cropRectangle.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('crop-handle')) {
            isResizing = true;
            resizeHandle = e.target.className.split(' ')[1];
        } else {
            isDragging = true;
        }
        startX = e.clientX;
        startY = e.clientY;
        startLeft = cropRectInfo.x;
        startTop = cropRectInfo.y;
        startWidth = cropRectInfo.width;
        startHeight = cropRectInfo.height;
    });

    window.addEventListener('mousemove', (e) => {
        if (isDragging) {
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            let newLeft = startLeft + dx;
            let newTop = startTop + dy;

            const imageRect = cropImage.getBoundingClientRect();
            const containerRect = cropContainer.getBoundingClientRect();

            if (newLeft < imageRect.left - containerRect.left) newLeft = imageRect.left - containerRect.left;
            if (newTop < imageRect.top - containerRect.top) newTop = imageRect.top - containerRect.top;
            if (newLeft + cropRectInfo.width > imageRect.right - containerRect.left) newLeft = imageRect.right - containerRect.left - cropRectInfo.width;
            if (newTop + cropRectInfo.height > imageRect.bottom - containerRect.top) newTop = imageRect.bottom - containerRect.top - cropRectInfo.height;

            cropRectangle.style.left = `${newLeft}px`;
            cropRectangle.style.top = `${newTop}px`;
            cropRectInfo.x = newLeft;
            cropRectInfo.y = newTop;
        } else if (isResizing) {
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            let newWidth = startWidth;
            let newHeight = startHeight;
            let newLeft = startLeft;
            let newTop = startTop;

            const aspectRatio = startWidth / startHeight;

            if (resizeHandle.includes('e')) {
                newWidth = startWidth + dx;
                newHeight = newWidth / aspectRatio;
            }
            if (resizeHandle.includes('w')) {
                newWidth = startWidth - dx;
                newHeight = newWidth / aspectRatio;
                newLeft = startLeft + dx;
            }
            if (resizeHandle.includes('s')) {
                newHeight = startHeight + dy;
                newWidth = newHeight * aspectRatio;
            }
            if (resizeHandle.includes('n')) {
                newHeight = startHeight - dy;
                newHeight = newHeight < 20 ? 20 : newHeight;
                newWidth = newHeight * aspectRatio;
                newTop = startTop + dy;
            }

            const imageRect = cropImage.getBoundingClientRect();
            const containerRect = cropContainer.getBoundingClientRect();

            if (newWidth > imageRect.width) {
                newWidth = imageRect.width;
                newHeight = newWidth / aspectRatio;
            }
            if (newHeight > imageRect.height) {
                newHeight = imageRect.height;
                newWidth = newHeight * aspectRatio;
            }
            if (newLeft < imageRect.left - containerRect.left) {
                newLeft = imageRect.left - containerRect.left;
            }
            if (newTop < imageRect.top - containerRect.top) {
                newTop = imageRect.top - containerRect.top;
            }
            if (newLeft + newWidth > imageRect.right - containerRect.left) {
                newWidth = imageRect.right - containerRect.left - newLeft;
                newHeight = newWidth / aspectRatio;
            }
            if (newTop + newHeight > imageRect.bottom - containerRect.top) {
                newHeight = imageRect.bottom - containerRect.top - newTop;
                newWidth = newHeight * aspectRatio;
            }

            cropRectangle.style.width = `${newWidth}px`;
            cropRectangle.style.height = `${newHeight}px`;
            cropRectangle.style.left = `${newLeft}px`;
            cropRectangle.style.top = `${newTop}px`;
            cropRectInfo = { x: newLeft, y: newTop, width: newWidth, height: newHeight };
        }
    });

    window.addEventListener('mouseup', () => {
        isDragging = false;
        isResizing = false;
    });

    cropConfirmBtn.addEventListener('click', () => {
        const scaleX = cropImage.naturalWidth / cropImage.width;
        const scaleY = cropImage.naturalHeight / cropImage.height;

        const imageRect = cropImage.getBoundingClientRect();
        const containerRect = cropContainer.getBoundingClientRect();
        const cropX = (cropRectInfo.x - (imageRect.left - containerRect.left)) * scaleX;
        const cropY = (cropRectInfo.y - (imageRect.top - containerRect.top)) * scaleY;

        tempCropData[currentCropIndex] = {
            x: cropX,   // now natural coordinates
            y: cropY,
            width: cropRectInfo.width * scaleX,
            height: cropRectInfo.height * scaleY
        };

        // Generate cropped thumbnail
        const canvas = document.createElement('canvas');
        canvas.width = tempCropData[currentCropIndex].width;
        canvas.height = tempCropData[currentCropIndex].height;
        const ctx = canvas.getContext('2d');

        const img = new Image();
        img.src = cropImage.src;
        img.onload = () => {
        ctx.drawImage(
                img,
                tempCropData[currentCropIndex].x,
                tempCropData[currentCropIndex].y,
                tempCropData[currentCropIndex].width,
                tempCropData[currentCropIndex].height,
            0,
            0,
            canvas.width,
            canvas.height
        );

        canvas.toBlob(blob => {
            const thumb = thumbnailsContainer.querySelector(`[data-index="${currentCropIndex}"]`);
            if (thumb) {
                thumb.src = URL.createObjectURL(blob);
            }
        }, 'image/jpeg');
        };

        croppingModal.className = 'modal-hidden';
    });

    cropCancelBtn.addEventListener('click', () => {
        croppingModal.className = 'modal-hidden';
    });


    let mediaRecorder;
    let recordedBlobs;

    window.eventBus.on('capture-sequence:start', async () => {
        if (appState.captureMode === 'upload') {
            if (appState.capturedPhotos.length !== appState.templateInfo.hole_count) {
                alert(`사진을 ${appState.templateInfo.hole_count}개 선택해야 합니다.`);
                return;
            }

            await applyCropsBeforeNext(); // apply the crops now

            window.eventBus.dispatch('photo-taking:complete', { photos: appState.capturedPhotos, videos: [] });
            return;
        }

        appState.isCapturing = true;
        modeSelection.style.display = 'none';
        timerControls.style.display = 'none';
        startCaptureBtn.style.display = 'none';

        if (appState.selectedTimer === 0) {
            captureBtn.style.display = 'block';
        } else {
            captureBtn.style.display = 'none';
            runTimerCapture();
        }

        startRecording();
    });

    function runTimerCapture() {
        if (appState.capturedPhotos.length >= appState.templateInfo.hole_count) {
            appState.isCapturing = false;
            if (mediaRecorder && mediaRecorder.state === "recording") {
                mediaRecorder.stop();
            }
            return;
        }

        let countdown = appState.selectedTimer;
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

    window.eventBus.on('capture:manual', () => {
        if (appState.isCapturing) handleCapture();
    });

    function updatePhotoStatus() { 
        const isRetake = appState.isRetaking;
        const n = isRetake ? appState.photosToRetake.length : appState.templateInfo.hole_count; 
        const t = isRetake ? appState.newlyCapturedPhotos.length : appState.capturedPhotos.length;
        document.getElementById('app-status').textContent = `${t} / ${n}장 촬영됨`; 
        
        if (t >= n && appState.captureMode === 'upload') {
            startCaptureBtn.textContent = '계속';
            startCaptureBtn.style.display = 'block';
        } else if (t >= n) { 
            if (appState.stream) appState.stream.getTracks().forEach(tr => tr.stop()); 
            Promise.all(appState.videoUploadPromises).then(() => {
                if (isRetake) {
                    appState.photosToRetake.forEach((originalIndex, i) => {
                        const oldPhotoBlob = appState.capturedPhotos[originalIndex];
                        const newPhotoBlob = appState.newlyCapturedPhotos[i];
                        const newVideoPath = appState.newlyCapturedVideos[i];

                        for (let j = 0; j < appState.photoAssignments.length; j++) {
                            if (appState.photoAssignments[j] === oldPhotoBlob) {
                                appState.photoAssignments[j] = newPhotoBlob;
                                appState.videoAssignments[j] = newVideoPath;
                            }
                        }

                        appState.capturedPhotos[originalIndex] = newPhotoBlob;
                        appState.originalCapturedPhotos[originalIndex] = newPhotoBlob;
                        appState.capturedVideos[originalIndex] = newVideoPath;

                        for (const key in appState.stylizedImagesCache) {
                            if (key.startsWith(originalIndex + '-')) {
                                delete appState.stylizedImagesCache[key];
                            }
                        }                    });
                    appState.isRetaking = false;
                    appState.photosToRetake = [];
                    appState.newlyCapturedPhotos = [];
                    appState.newlyCapturedVideos = [];
                    window.eventBus.dispatch('review:edit-existing');
                } else {
                    window.eventBus.dispatch('photo-taking:complete', { photos: appState.capturedPhotos, videos: appState.capturedVideos });
                }
            });
        } 
    }

    function startRecording() {
        recordedBlobs = [];
        const options = { mimeType: 'video/webm;codecs=vp9' };
        try {
            mediaRecorder = new MediaRecorder(appState.stream, options);
        } catch (e) {
            console.error('Exception while creating MediaRecorder:', e);
            return;
        }

        mediaRecorder.onstop = (event) => {
            const videoBlob = new Blob(recordedBlobs, { type: 'video/webm' });
            const uploadPromise = uploadVideo(videoBlob);
            appState.videoUploadPromises.push(uploadPromise);
        };

        mediaRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
                recordedBlobs.push(event.data);
            }
        };

        mediaRecorder.start();
        console.log('Recording started');
    }

    function handleCapture() { 
        if (mediaRecorder && mediaRecorder.state === "recording") {
            mediaRecorder.stop();
        }

        const v = document.getElementById('camera-stream'), 
              c = document.getElementById('capture-canvas'), 
              x = c.getContext('2d'); 
        c.width = v.videoWidth; 
        c.height = v.videoHeight; 
        x.drawImage(v, 0, 0, c.width, c.height); 
        c.toBlob(b => { 
            if (appState.isRetaking) {
                appState.newlyCapturedPhotos.push(b);
            } else {
                appState.capturedPhotos.push(b); 
            }
            const t = document.createElement('img'); 
            t.src = URL.createObjectURL(b); 
            t.classList.add('thumbnail'); 
            t.setAttribute('data-index', appState.capturedPhotos.length - 1);
            thumbnailsContainer.appendChild(t); 
            updatePhotoStatus(); 

            const totalToCapture = appState.isRetaking ? appState.photosToRetake.length : appState.templateInfo.hole_count;
            const currentCaptureCount = appState.isRetaking ? appState.newlyCapturedPhotos.length : appState.capturedPhotos.length;

            if (currentCaptureCount < totalToCapture) {
                startRecording();
            }
        }, 'image/jpeg'); 
    }

    async function uploadVideo(videoBlob) {
        const formData = new FormData();
        formData.append('video', videoBlob, 'video.webm');

        try {
            const response = await fetch('/upload_video_chunk', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            if (appState.isRetaking) {
                appState.newlyCapturedVideos.push(data.video_path);
            } else {
                appState.capturedVideos.push(data.video_path);
            }
        } catch (e) {
            console.error('Error uploading video:', e);
        }
    }

    async function applyCropsBeforeNext() {
        for (const index in tempCropData) {
            const blob = appState.capturedPhotos[index];
            const crop = tempCropData[index];

            const img = new Image();
            img.src = URL.createObjectURL(blob);

            await new Promise(resolve => {
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = crop.width;
                    canvas.height = crop.height;
                    const ctx = canvas.getContext('2d');

                    ctx.drawImage(
                        img,
                        crop.x,
                        crop.y,
                        crop.width,
                        crop.height,
                        0,
                        0,
                        canvas.width,
                        canvas.height
                    );

                    canvas.toBlob(blob => {
                        appState.capturedPhotos[index] = blob;

                        const thumb = thumbnailsContainer.querySelector(`[data-index="${index}"]`);
                        if (thumb) {
                            thumb.src = URL.createObjectURL(blob);
                        }
                        resolve();
                    }, 'image/jpeg');
                };
            });
        }

        tempCropData = {}; // clear
    }
});
