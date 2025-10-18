window.eventBus.on('app:init', (appState) => {
    const appContent = document.getElementById('app-content');
    const startCaptureBtn = document.getElementById('start-capture-btn');
    const captureBtn = document.getElementById('capture-btn');
    const timerControls = document.getElementById('timer-controls');
    const modeSelection = document.getElementById('mode-selection');
    const photoUploadBtn = document.getElementById('photo-upload-btn');
    const photoUploadInput = document.getElementById('photo-upload-input');
    const cameraStream = document.getElementById('camera-stream');
    const uploadArea = document.getElementById('upload-area');
    const countdownDisplay = document.getElementById('countdown-display');
    const thumbnailsContainer = document.getElementById('thumbnails-container');
    const uploadThumbnailsContainer = document.getElementById('upload-thumbnails-container');

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
        uploadThumbnailsContainer.innerHTML = '';

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

        // Re-acquire camera stream if it's stopped
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
                const img = new Image();
                img.onload = () => {
                    const templateHole = appState.templateInfo.holes[0];
                    const targetAspectRatio = templateHole.w / templateHole.h;

                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');

                    let srcX = 0, srcY = 0, srcWidth = img.width, srcHeight = img.height;
                    const currentAspectRatio = img.width / img.height;

                    if (currentAspectRatio > targetAspectRatio) {
                        // Image is wider than target
                        srcWidth = img.height * targetAspectRatio;
                        srcX = (img.width - srcWidth) / 2;
                    } else if (currentAspectRatio < targetAspectRatio) {
                        // Image is taller than target
                        srcHeight = img.width / targetAspectRatio;
                        srcY = (img.height - srcHeight) / 2;
                    }

                    // Set canvas to the size of the first hole for consistency
                    canvas.width = templateHole.w;
                    canvas.height = templateHole.h;

                    ctx.drawImage(img, srcX, srcY, srcWidth, srcHeight, 0, 0, canvas.width, canvas.height);

                    canvas.toBlob(blob => {
                        appState.capturedPhotos.push(blob);
                        const t = document.createElement('img');
                        t.src = URL.createObjectURL(blob);
                        t.classList.add('thumbnail');
                        uploadThumbnailsContainer.appendChild(t);
                        updatePhotoStatus();
                    }, file.type);
                };
                img.src = URL.createObjectURL(new Blob([e.target.result], { type: file.type }));
            };
            reader.readAsArrayBuffer(file);
        }
        photoUploadInput.value = null; // Reset file input
    }

    let mediaRecorder;
    let recordedBlobs;

    window.eventBus.on('capture-sequence:start', () => {
        if (appState.captureMode === 'upload') {
            if (appState.capturedPhotos.length !== appState.templateInfo.hole_count) {
                alert(`사진을 ${appState.templateInfo.hole_count}개 선택해야 합니다.`);
                return;
            }
            window.eventBus.dispatch('photo-taking:complete');
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
        
        if (t >= n) { 
            if (appState.stream) appState.stream.getTracks().forEach(tr => tr.stop()); 
            Promise.all(appState.videoUploadPromises).then(() => {
                if (isRetake) {
                    appState.photosToRetake.forEach((originalIndex, i) => {
                        const oldPhotoBlob = appState.capturedPhotos[originalIndex];
                        const newPhotoBlob = appState.newlyCapturedPhotos[i];
                        const newVideoPath = appState.newlyCapturedVideos[i];

                        // Find all occurrences of the old blob in photo assignments and replace them.
                        // At the same time, replace the video at the same index.
                        for (let j = 0; j < appState.photoAssignments.length; j++) {
                            if (appState.photoAssignments[j] === oldPhotoBlob) {
                                appState.photoAssignments[j] = newPhotoBlob;
                                appState.videoAssignments[j] = newVideoPath;
                            }
                        }

                        // Now, update the master lists
                        appState.capturedPhotos[originalIndex] = newPhotoBlob;
                        appState.capturedVideos[originalIndex] = newVideoPath;
                    });
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