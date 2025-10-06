
document.addEventListener('DOMContentLoaded', () => {
    // State variables
    let templateInfo = null;
    let capturedPhotos = [];
    let stream = null;

    // DOM Elements
    const mainMenu = document.getElementById('main-menu');
    const appContent = document.getElementById('app-content');
    
    const registerTemplateBtn = document.getElementById('register-template-btn');
    const templateUploadInput = document.getElementById('template-upload-input');
    
    const appTitle = document.getElementById('app-title');
    const appStatus = document.getElementById('app-status');
    const video = document.getElementById('camera-stream');
    const canvas = document.getElementById('capture-canvas');
    const thumbnailsContainer = document.getElementById('thumbnails-container');
    
    const captureBtn = document.getElementById('capture-btn');
    const composeBtn = document.getElementById('compose-btn');

    // --- 1. TEMPLATE UPLOAD ---
    registerTemplateBtn.addEventListener('click', () => {
        templateUploadInput.click();
    });

    templateUploadInput.addEventListener('change', async (event) => {
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
            templateInfo = await response.json();

            if (templateInfo.hole_count === 0) {
                alert('템플릿에서 투명 영역을 찾을 수 없습니다. 다른 파일을 시도해주세요.');
                return;
            }
            
            console.log('Template analysis result:', templateInfo);
            startPhotoSession();
        } catch (error) {
            console.error('Error:', error);
            alert(`오류가 발생했습니다: ${error.message}`);
        }
    });

    // --- 2. PHOTO TAKING ---
    async function startPhotoSession() {
        mainMenu.style.display = 'none';
        appContent.style.display = 'block';
        appTitle.textContent = '사진 촬영';
        
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            video.srcObject = stream;
            updatePhotoStatus();
        } catch (err) {
            console.error("카메라 접근 오류:", err);
            alert("카메라에 접근할 수 없습니다. 권한을 확인해주세요.");
        }
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

    captureBtn.addEventListener('click', () => {
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
    });

    // --- 3. IMAGE COMPOSITION ---
    composeBtn.addEventListener('click', async () => {
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
            const response = await fetch('/compose_image', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Image composition failed');
            }

            const result = await response.json();
            displayFinalResult(result.result_path);

        } catch (error) {
            console.error('Error:', error);
            alert(`합성 중 오류가 발생했습니다: ${error.message}`);
            appStatus.textContent = '오류가 발생했습니다. 다시 시도해주세요.';
            composeBtn.disabled = false;
        }
    });

    function displayFinalResult(imagePath) {
        appTitle.textContent = '완성!';
        appStatus.innerHTML = `이미지가 성공적으로 생성되었습니다. <a href="${imagePath}" download>다운로드</a>`;
        
        // Clear the photo booth content
        const photoBooth = document.getElementById('photo-booth');
        photoBooth.innerHTML = '';

        const resultImage = document.createElement('img');
        resultImage.src = imagePath;
        resultImage.style.maxWidth = '100%';
        resultImage.style.borderRadius = '5px';
        photoBooth.appendChild(resultImage);

        // Hide action buttons
        document.getElementById('action-buttons').style.display = 'none';
    }
});
