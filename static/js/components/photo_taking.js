window.eventBus.on('app:init', (appState) => {
    const appContent = document.getElementById('app-content');
    const startCaptureBtn = document.getElementById('start-capture-btn');
    const captureBtn = document.getElementById('capture-btn');
    const timerControls = document.getElementById('timer-controls');
    const modeSelection = document.getElementById('mode-selection');
    const dropArea = document.getElementById('drop-area');
    const photoUploadInput = document.getElementById('photo-upload-input');
    const photoUploadBtn = document.getElementById('photo-upload-btn');
    const flashToggleControls = document.getElementById('flash-toggle-controls');
    const flashToggle = document.getElementById('flash-toggle');

    const ghostOverlay = document.getElementById('ghost-overlay');
    let ghostImages = [];

    fetch('/ghosts')
        .then(response => response.json())
        .then(data => {
            ghostImages = data;
        });

    appState.useFlash = flashToggle.checked;

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
    const flashOverlay = document.getElementById('flash-overlay');




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

    flashToggle.addEventListener('change', (e) => {
        appState.useFlash = e.target.checked;
    });

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
        flashToggleControls.style.display = 'flex';
        startCaptureBtn.style.display = 'block';
        captureBtn.style.display = 'none';
        appState.capturedPhotos = [];
        appState.originalPhotos = [];
        appState.cropData = [];
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
        flashToggleControls.style.display = 'flex';
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
            flashToggleControls.style.display = 'none';
            startCaptureBtn.textContent = '계속';
        }
    }

    async function handlePhotoUpload(event) { // Made async
        const files = event.target.files;
        const requiredPhotos = appState.templateInfo.hole_count;
        
        const filesArray = Array.from(files);
        const imageFiles = filesArray.filter(file => file.type.startsWith('image/'));

        if (imageFiles.length + appState.capturedPhotos.length > requiredPhotos) {
            alert(`최대 ${requiredPhotos}개의 이미지만 업로드할 수 입니다.`);
            return;
        }

        const processedImages = await Promise.all(imageFiles.map(async (file, i) => {
            return new Promise(resolve => {
                const reader = new FileReader();
                reader.onload = async (e) => {
                    const originalBlob = new Blob([e.target.result], { type: file.type });
                    
                    // Calculate the index based on current appState.capturedPhotos.length + current file's position in imageFiles
                    const actualIndex = appState.capturedPhotos.length + i; 

                    const templateHole = appState.templateInfo.holes[actualIndex];
                    const targetAspectRatio = templateHole.w / templateHole.h;
                    
                    const defaultCropData = await appState.cropper.getDefaultCropData(originalBlob, targetAspectRatio);
                    const croppedResult = await appState.cropper.crop(originalBlob, targetAspectRatio, defaultCropData);

                    resolve({
                        originalBlob: originalBlob,
                        croppedBlob: croppedResult.croppedBlob,
                        cropData: croppedResult.cropData,
                        index: actualIndex // Store the actual index
                    });
                };
                reader.readAsArrayBuffer(file);
            });
        }));

        processedImages.forEach(item => {
            appState.capturedPhotos.push(item.croppedBlob);
            appState.originalPhotos.push(item.originalBlob);
            appState.cropData.push(item.cropData);
            
            const t = document.createElement('img');
            t.src = URL.createObjectURL(item.croppedBlob);
            t.classList.add('thumbnail', 'upload-thumbnail');
            t.setAttribute('data-index', item.index);
            t.addEventListener('click', () => openCroppingUI(item.index));
            thumbnailsContainer.appendChild(t);
        });

        updatePhotoStatus();
        photoUploadInput.value = null;
        modeSelection.style.display = 'none';
    }



    function openCroppingUI(index) {
        const originalBlob = appState.originalPhotos[index];
        const currentCropData = appState.cropData[index];
        const templateHole = appState.templateInfo.holes[index];
        const targetAspectRatio = templateHole.w / templateHole.h;

        appState.cropper.show(originalBlob, targetAspectRatio, currentCropData).then(result => {
            if (result) {
                appState.capturedPhotos[index] = result.croppedBlob;
                appState.cropData[index] = result.cropData;
                const thumb = thumbnailsContainer.querySelector(`[data-index="${index}"]`);
                if (thumb) {
                    thumb.src = URL.createObjectURL(result.croppedBlob);
                }
            }
        });
    }


    let mediaRecorder;
    let recordedBlobs;

    window.eventBus.on('capture-sequence:start', async () => {
        if (appState.captureMode === 'upload') {
            if (appState.capturedPhotos.length !== appState.templateInfo.hole_count) {
                alert(`사진을 ${appState.templateInfo.hole_count}개 선택해야 합니다.`);
                return;
            }

            window.eventBus.dispatch('photo-taking:complete', { photos: appState.capturedPhotos, originalPhotos: appState.originalPhotos, cropData: appState.cropData, videos: [] });
            return;
        }

        appState.isCapturing = true;
        modeSelection.style.display = 'none';
        timerControls.style.display = 'none';
        flashToggleControls.style.display = 'none';
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
                showFlash(handleCapture, 300); // Flash for 300ms before capture
                setTimeout(runTimerCapture, 1000); // Wait 1 sec before next cycle
            }
        }, 1000);
    }

    window.eventBus.on('capture:manual', () => {
        if (appState.isCapturing) {
            showFlash(handleCapture, 300);
        }
    });

    function showFlash(callback, duration = 300) {
        if (!appState.useFlash) {
            if (callback) callback();
            return;
        }

        // 25% chance to show a ghost
        if (Math.random() < 0.25 && ghostImages.length > 0) {
            const randomGhost = ghostImages[Math.floor(Math.random() * ghostImages.length)];
            ghostOverlay.src = randomGhost;
            ghostOverlay.classList.add('active');
            setTimeout(() => {
                ghostOverlay.classList.remove('active');
                if (callback) callback();
            }, duration);
        } else {
            flashOverlay.classList.add('active');
            setTimeout(() => {
                flashOverlay.classList.remove('active');
                if (callback) callback();
            }, duration);
        }
    }

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
                        appState.originalPhotos[originalIndex] = newPhotoBlob;
                        appState.cropData[originalIndex] = null;
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
                    window.eventBus.dispatch('photo-taking:complete', { photos: appState.capturedPhotos, originalPhotos: appState.originalPhotos, cropData: appState.cropData, videos: appState.capturedVideos });
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
                appState.originalPhotos.push(b);
                appState.cropData.push(null);
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


});
