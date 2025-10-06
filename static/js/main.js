document.addEventListener('DOMContentLoaded', () => {
    // === STATE VARIABLES ===
    let templateInfo = null;
    let capturedPhotos = [];
    let stream = null;

    // === DOM ELEMENTS ===
    const mainMenu = document.getElementById('main-menu');
    const appContent = document.getElementById('app-content');
    const galleryContainer = document.getElementById('template-gallery');
    const addTemplateBtn = document.getElementById('add-template-btn');
    const templateUploadInput = document.getElementById('template-upload-input');
    
    const appTitle = document.getElementById('app-title');
    const appStatus = document.getElementById('app-status');
    const video = document.getElementById('camera-stream');
    const canvas = document.getElementById('capture-canvas');
    const thumbnailsContainer = document.getElementById('thumbnails-container');
    
    const captureBtn = document.getElementById('capture-btn');
    const composeBtn = document.getElementById('compose-btn');

    // === INITIALIZATION ===
    function initApp() {
        addTemplateBtn.addEventListener('click', () => templateUploadInput.click());
        templateUploadInput.addEventListener('change', handleTemplateUpload);
        captureBtn.addEventListener('click', handleCapture);
        composeBtn.addEventListener('click', handleComposition);
        loadTemplateGallery();
    }

    // --- 1. TEMPLATE GALLERY & UPLOAD ---
    async function loadTemplateGallery() {
        try {
            const response = await fetch('/templates');
            const templates = await response.json();
            
            galleryContainer.innerHTML = ''; // Clear existing gallery

            if (templates.length === 0) {
                galleryContainer.textContent = '저장된 템플릿이 없습니다. 새 템플릿을 추가해보세요.';
            }

            templates.forEach(template => {
                const item = document.createElement('div');
                item.className = 'template-item';
                
                const img = document.createElement('img');
                img.src = template.template_path;
                img.alt = `Template ${template.id}`;
                
                item.appendChild(img);
                item.addEventListener('click', () => {
                    templateInfo = template;
                    console.log('Selected template:', templateInfo);
                    startPhotoSession();
                });
                galleryContainer.appendChild(item);
            });
        } catch (error) {
            console.error('Failed to load templates:', error);
            galleryContainer.textContent = '템플릿을 불러오는 데 실패했습니다.';
        }
    }

    async function handleTemplateUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/upload_template', { method: 'POST', body: formData });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'File upload failed');
            }
            alert('새 템플릿이 성공적으로 추가되었습니다.');
            loadTemplateGallery(); // Refresh the gallery
        } catch (error) {
            console.error('Error:', error);
            alert(`오류가 발생했습니다: ${error.message}`);
        }
        // Reset file input to allow uploading the same file again
        event.target.value = null;
    }

    // --- 2. PHOTO TAKING ---
    async function startPhotoSession() {
        mainMenu.style.display = 'none';
        appContent.style.display = 'block';
        appTitle.textContent = '사진 촬영';

        // --- Aspect Ratio Constraint ---
        const firstHole = templateInfo.holes[0];
        const desiredAspectRatio = firstHole.w / firstHole.h;

        const constraints = {
            video: { aspectRatio: { ideal: desiredAspectRatio } },
            audio: false
        };

        try {
            // First, try to get the camera with the ideal aspect ratio
            stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (err) {
            console.warn(`Failed to get camera with ideal aspect ratio (${desiredAspectRatio}). Retrying with default.`, err);
            try {
                // If it fails, fall back to the default camera without aspect ratio constraints
                stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            } catch (finalErr) {
                console.error("Camera access error:", finalErr);
                alert("카메라에 접근할 수 없습니다. 권한을 확인해주세요.");
                return; // Stop if camera is not accessible at all
            }
        }
        
        video.srcObject = stream;
        updatePhotoStatus();
    }

    function updatePhotoStatus() {
        const needed = templateInfo.hole_count;
        const taken = capturedPhotos.length;
        appStatus.textContent = `${taken} / ${needed}장 촬영됨`;

        if (taken >= needed) {
            captureBtn.style.display = 'none';
            composeBtn.style.display = 'block';
            video.style.display = 'none';
            if(stream) {
                stream.getTracks().forEach(track => track.stop());
            }
            appStatus.textContent = '모든 사진을 촬영했습니다. 아래 버튼을 눌러 사진을 합성하세요.';
        }
    }

    function handleCapture() {
        if (!templateInfo) return;

        const context = canvas.getContext('2d');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(blob => {
            capturedPhotos.push(blob);
            const thumb = document.createElement('img');
            thumb.src = URL.createObjectURL(blob);
            thumb.classList.add('thumbnail');
            thumbnailsContainer.appendChild(thumb);
            updatePhotoStatus();
        }, 'image/jpeg');
    }

    // --- 3. IMAGE COMPOSITION ---
    async function handleComposition() {
        if (!templateInfo || capturedPhotos.length !== templateInfo.hole_count) {
            alert('사진의 개수가 템플릿과 맞지 않습니다.');
            return;
        }

        appStatus.textContent = '사진을 합성하는 중입니다... 잠시만 기다려주세요.';
        composeBtn.disabled = true;

        const formData = new FormData();
        formData.append('template_path', templateInfo.template_path);
        formData.append('holes', JSON.stringify(templateInfo.holes));

        capturedPhotos.forEach((blob, index) => {
            formData.append('photos', blob, `photo_${index}.jpg`);
        });

        try {
            const response = await fetch('/compose_image', { method: 'POST', body: formData });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Image composition failed');
            }
            const result = await response.json();
            displayFinalResult(result.result_path);
        } catch (error) {
            console.error('Error:', error);
            alert(`합성 중 오류가 발생했습니다: ${error.message}`);
            composeBtn.disabled = false;
        }
    }

    function displayFinalResult(imagePath) {
        appTitle.textContent = '완성!';
        appStatus.innerHTML = `이미지가 성공적으로 생성되었습니다. <a href="${imagePath}" download>다운로드</a>`;
        document.getElementById('photo-booth').innerHTML = '';
        const resultImage = document.createElement('img');
        resultImage.src = imagePath;
        resultImage.style.maxWidth = '100%';
        document.getElementById('photo-booth').appendChild(resultImage);
        document.getElementById('action-buttons').style.display = 'none';
    }

    // --- START THE APP ---
    initApp();
});