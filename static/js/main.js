
document.addEventListener('DOMContentLoaded', () => {
    // === STATE VARIABLES ===
    let templateInfo = null; // The template for the active session
    let selectedTemplate = { element: null, data: null }; // The template currently highlighted in the gallery
    let capturedPhotos = [];
    let photoAssignments = [];
    let selectedHole = { element: null, index: -1 };
    let stream = null;

    // === DOM ELEMENTS ===
    const mainMenu = document.getElementById('main-menu');
    const appContent = document.getElementById('app-content');
    const reviewScreen = document.getElementById('review-screen');
    const resultScreen = document.getElementById('result-screen');
    const addTemplateBtn = document.getElementById('add-template-btn');
    const templateUploadInput = document.getElementById('template-upload-input');
    const continueBtn = document.getElementById('continue-btn');
    const captureBtn = document.getElementById('capture-btn');
    const finalizeBtn = document.getElementById('finalize-btn');

    // === INITIALIZATION ===
    function initApp() {
        // addTemplateBtn is now dynamic, so its listener is set in loadTemplateGallery
        templateUploadInput.addEventListener('change', handleTemplateUpload);
        continueBtn.addEventListener('click', () => {
            if (selectedTemplate.data) {
                templateInfo = selectedTemplate.data;
                startPhotoSession();
            }
        });
        captureBtn.addEventListener('click', handleCapture);
        finalizeBtn.addEventListener('click', handleComposition);
        loadTemplateGallery();
    }

    // --- 1. TEMPLATE GALLERY & UPLOAD ---
    async function loadTemplateGallery() {
        try {
            const response = await fetch('/templates');
            const templates = await response.json();
            const galleryContainer = document.getElementById('template-gallery');
            galleryContainer.innerHTML = '';
            if (templates.length === 0) {
                // If no templates, just show the add button
            }
            
            templates.forEach(template => {
                const item = document.createElement('div');
                item.className = 'template-item';
                const img = document.createElement('img');
                img.src = template.template_path;
                item.appendChild(img);
                
                item.addEventListener('click', () => handleTemplateSelection(item, template));
                
                galleryContainer.appendChild(item);
            });

            // Dynamically create and add the "Add New" button
            const addItem = document.createElement('div');
            addItem.className = 'add-template-item';
            addItem.textContent = '+';
            addItem.addEventListener('click', () => templateUploadInput.click());
            galleryContainer.appendChild(addItem);

        } catch (error) {
            console.error('Failed to load templates:', error);
        }
    }

    function handleTemplateSelection(element, data) {
        // Deselect previous
        if (selectedTemplate.element) {
            selectedTemplate.element.classList.remove('selected');
        }

        // Select new
        selectedTemplate = { element, data };
        element.classList.add('selected');

        // Show continue button
        continueBtn.style.display = 'block';
    }

    async function handleTemplateUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('file', file);
        try {
            const response = await fetch('/upload_template', { method: 'POST', body: formData });
            if (!response.ok) throw new Error((await response.json()).detail);
            alert('새 템플릿이 성공적으로 추가되었습니다.');
            loadTemplateGallery();
        } catch (error) {
            console.error('Error:', error);
        }
        event.target.value = null;
    }

    // --- 2. PHOTO TAKING ---
    async function startPhotoSession() {
        mainMenu.style.display = 'none';
        reviewScreen.style.display = 'none';
        resultScreen.style.display = 'none';
        appContent.style.display = 'block';
        document.getElementById('app-title').textContent = '사진 촬영';
        const firstHole = templateInfo.holes[0];
        const desiredAspectRatio = firstHole.w / firstHole.h;
        const constraints = { video: { aspectRatio: { ideal: desiredAspectRatio } }, audio: false };
        try {
            stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (err) {
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            } catch (finalErr) {
                console.error("Camera access error:", finalErr);
                return;
            }
        }
        document.getElementById('camera-stream').srcObject = stream;
        updatePhotoStatus();
    }

    function updatePhotoStatus() {
        const needed = templateInfo.hole_count;
        const taken = capturedPhotos.length;
        document.getElementById('app-status').textContent = `${taken} / ${needed}장 촬영됨`;
        if (taken >= needed) {
            if(stream) stream.getTracks().forEach(track => track.stop());
            showReviewScreen();
        }
    }

    function handleCapture() {
        const video = document.getElementById('camera-stream');
        const canvas = document.getElementById('capture-canvas');
        const context = canvas.getContext('2d');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => {
            capturedPhotos.push(blob);
            const thumb = document.createElement('img');
            thumb.src = URL.createObjectURL(blob);
            thumb.classList.add('thumbnail');
            document.getElementById('thumbnails-container').appendChild(thumb);
            updatePhotoStatus();
        }, 'image/jpeg');
    }

    // --- 3. REVIEW & EDIT ---
    function showReviewScreen() {
        appContent.style.display = 'none';
        resultScreen.style.display = 'none';
        reviewScreen.style.display = 'block';
        photoAssignments = [...capturedPhotos];
        renderReviewThumbnails();
        renderPreview();
    }

    function renderReviewThumbnails() {
        const reviewThumbnails = document.getElementById('review-thumbnails');
        reviewThumbnails.innerHTML = '';
        capturedPhotos.forEach((photoBlob, index) => {
            const thumb = document.createElement('img');
            thumb.src = URL.createObjectURL(photoBlob);
            thumb.className = 'thumbnail';
            thumb.draggable = true;
            thumb.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', index);
            });
            thumb.addEventListener('click', () => {
                handlePhotoSelection(index);
            });
            reviewThumbnails.appendChild(thumb);
        });
    }

    function renderPreview() {
        const previewContainer = document.getElementById('review-preview');
        previewContainer.innerHTML = '';
        const templateImg = document.createElement('img');
        templateImg.src = templateInfo.template_path;
        templateImg.className = 'preview-template-img';
        templateImg.onload = () => {
            const containerWidth = previewContainer.offsetWidth;
            const scale = containerWidth / templateImg.naturalWidth;
            photoAssignments.forEach((photoBlob, holeIndex) => {
                const hole = templateInfo.holes[holeIndex];
                const photo = document.createElement('img');
                photo.src = URL.createObjectURL(photoBlob);
                photo.className = 'preview-photo-img';
                photo.style.left = `${hole.x * scale}px`;
                photo.style.top = `${hole.y * scale}px`;
                photo.style.width = `${hole.w * scale}px`;
                photo.style.height = `${hole.h * scale}px`;
                photo.draggable = true;
                photo.addEventListener('dragstart', (e) => {
                    const originalIndex = capturedPhotos.findIndex(p => p === photoBlob);
                    e.dataTransfer.setData('text/plain', originalIndex);
                });
                photo.addEventListener('click', () => handleHoleSelection(photo, holeIndex));
                photo.addEventListener('dragover', (e) => e.preventDefault());
                photo.addEventListener('drop', (e) => {
                    e.preventDefault();
                    const draggedPhotoIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
                    handleSwap(holeIndex, draggedPhotoIndex);
                });
                previewContainer.appendChild(photo);
            });
        };
        previewContainer.appendChild(templateImg);
    }

    function handleHoleSelection(element, holeIndex) {
        if (selectedHole.element) {
            selectedHole.element.classList.remove('selected');
        }
        selectedHole = { element, index: holeIndex };
        element.classList.add('selected');
    }

    function handlePhotoSelection(photoIndex) {
        if (selectedHole.index === -1) return;
        handleSwap(selectedHole.index, photoIndex);
    }

    function handleSwap(holeIndex, photoIndex) {
        const photoToMove = capturedPhotos[photoIndex];
        const photoToReplace = photoAssignments[holeIndex];
        const originalPositionOfReplaced = photoAssignments.findIndex(p => p === photoToMove);
        if (originalPositionOfReplaced !== -1) {
            photoAssignments[originalPositionOfReplaced] = photoToReplace;
        }
        photoAssignments[holeIndex] = photoToMove;
        if (selectedHole.element) {
            selectedHole.element.classList.remove('selected');
        }
        selectedHole = { element: null, index: -1 };
        renderPreview();
    }

    // --- 4. FINAL COMPOSITION ---
    async function handleComposition() {
        const statusP = document.querySelector('#review-screen > p');
        statusP.textContent = '사진을 합성하는 중입니다... 잠시만 기다려주세요.';
        finalizeBtn.disabled = true;
        const formData = new FormData();
        formData.append('template_path', templateInfo.template_path);
        formData.append('holes', JSON.stringify(templateInfo.holes));
        photoAssignments.forEach((blob, index) => {
            formData.append('photos', blob, `photo_${index}.jpg`);
        });
        try {
            const response = await fetch('/compose_image', { method: 'POST', body: formData });
            if (!response.ok) throw new Error((await response.json()).detail);
            const result = await response.json();
            displayFinalResult(result);
        } catch (error) {
            console.error('Error:', error);
            statusP.textContent = `합성 중 오류가 발생했습니다: ${error.message}`;
            finalizeBtn.disabled = false;
        }
    }

    function displayFinalResult(result) {
        reviewScreen.style.display = 'none';
        resultScreen.style.display = 'block';
        const { result_path, qr_code_path } = result;
        document.getElementById('result-title').textContent = '완성!';
        document.getElementById('result-status').textContent = '이미지가 성공적으로 생성되었습니다.';
        const resultDisplay = document.getElementById('result-display');
        resultDisplay.innerHTML = '';
        const resultImage = document.createElement('img');
        resultImage.src = result_path;
        resultImage.style.maxWidth = '100%';
        resultDisplay.appendChild(resultImage);
        const downloadContainer = document.createElement('div');
        downloadContainer.style.marginTop = '20px';
        const pcDownloadLink = document.createElement('a');
        pcDownloadLink.href = result_path;
        pcDownloadLink.download = 'photobooth_result.png';
        const pcDownloadButton = document.createElement('button');
        pcDownloadButton.textContent = 'PC에 다운로드';
        pcDownloadLink.appendChild(pcDownloadButton);
        downloadContainer.appendChild(pcDownloadLink);
        if (qr_code_path) {
            const qrContainer = document.createElement('div');
            qrContainer.style.marginTop = '10px';
            qrContainer.innerHTML = '<p>또는, 모바일에서 QR 코드를 스캔하여 다운로드하세요:</p>';
            const qrImage = document.createElement('img');
            qrImage.src = qr_code_path;
            qrImage.style.width = '150px';
            qrContainer.appendChild(qrImage);
            downloadContainer.appendChild(qrContainer);
        }
        resultDisplay.appendChild(downloadContainer);
    }

    // --- START THE APP ---
    initApp();
});
