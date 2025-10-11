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
    timerControls.addEventListener('click', (e) => {
        if (e.target.classList.contains('timer-btn')) {
            document.querySelectorAll('.timer-btn').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            appState.selectedTimer = parseInt(e.target.dataset.time, 10);
        }
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

    function startPhotoSession() { 
        document.getElementById('app-title').textContent = '사진 촬영'; 
        switchCaptureMode('camera');
        modeSelection.style.display = 'flex';
        timerControls.style.display = 'flex';
        startCaptureBtn.style.display = 'block';
        captureBtn.style.display = 'none';
        appState.capturedPhotos = [];
        appState.photoAssignments = [];
        thumbnailsContainer.innerHTML = '';
        uploadThumbnailsContainer.innerHTML = '';

        cameraStream.srcObject = appState.stream;
        cameraStream.play();

        updatePhotoStatus(); 
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
    });

    function runTimerCapture() {
        if (appState.capturedPhotos.length >= appState.templateInfo.hole_count) {
            appState.isCapturing = false;
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
        const n = appState.templateInfo.hole_count, t = appState.capturedPhotos.length; 
        document.getElementById('app-status').textContent = `${t} / ${n}장 촬영됨`; 
        if (t >= n) { 
            if (appState.stream) appState.stream.getTracks().forEach(tr => tr.stop()); 
            window.eventBus.dispatch('photo-taking:complete');
        } 
    }

    function handleCapture() { 
        const v = document.getElementById('camera-stream'), 
              c = document.getElementById('capture-canvas'), 
              x = c.getContext('2d'); 
        c.width = v.videoWidth; 
        c.height = v.videoHeight; 
        x.drawImage(v, 0, 0, c.width, c.height); 
        c.toBlob(b => { 
            appState.capturedPhotos.push(b); 
            const t = document.createElement('img'); 
            t.src = URL.createObjectURL(b); 
            t.classList.add('thumbnail'); 
            thumbnailsContainer.appendChild(t); 
            updatePhotoStatus(); 
        }, 'image/jpeg'); 
    }
});