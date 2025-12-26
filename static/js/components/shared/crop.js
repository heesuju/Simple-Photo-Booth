window.initCropper = function (appState) {
    const croppingModal = document.getElementById('cropping-modal');
    const cropContainer = document.getElementById('crop-container');
    const cropImage = document.getElementById('crop-image');
    const cropRectangle = document.getElementById('crop-rectangle');
    const cropConfirmBtn = document.getElementById('crop-confirm-btn');
    const cropCancelBtn = document.getElementById('crop-cancel-btn');

    let cropRectInfo = { x: 0, y: 0, width: 0, height: 0 };
    let isDragging = false;
    let isResizing = false;
    let resizeHandle = '';
    let startX, startY, startWidth, startHeight, startLeft, startTop;
    let resolvePromise;

    function show(imageBlob, aspectRatio, initialCropData = null) {
        return new Promise((resolve) => {
            resolvePromise = resolve;
            cropImage.src = URL.createObjectURL(imageBlob);
            croppingModal.className = 'modal-visible';

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

                if (initialCropData) {
                    const scaleX = imgDisplayWidth / cropImage.naturalWidth;
                    const scaleY = imgDisplayHeight / cropImage.naturalHeight;
                    rectWidth = initialCropData.width * scaleX;
                    rectHeight = initialCropData.height * scaleY;
                    rectX = initialCropData.x * scaleX + imgDisplayX;
                    rectY = initialCropData.y * scaleY + imgDisplayY;
                } else {
                    if (imageAspectRatio > aspectRatio) {
                        rectHeight = imgDisplayHeight;
                        rectWidth = rectHeight * aspectRatio;
                        rectY = imgDisplayY;
                        rectX = (imgDisplayWidth - rectWidth) / 2 + imgDisplayX;
                    } else {
                        rectWidth = imgDisplayWidth;
                        rectHeight = rectWidth / aspectRatio;
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
        });
    }

    function hide() {
        croppingModal.className = 'modal-hidden';
        if (resolvePromise) {
            resolvePromise(null);
        }
    }

    cropRectangle.addEventListener('mousedown', (e) => {
        e.preventDefault();

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
        if (!isResizing && !isDragging) return;

        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        const imageRect = cropImage.getBoundingClientRect();
        const containerRect = cropContainer.getBoundingClientRect();

        // Boundaries relative to container
        const imgL = imageRect.left - containerRect.left;
        const imgT = imageRect.top - containerRect.top;
        const imgR = imageRect.right - containerRect.left;
        const imgB = imageRect.bottom - containerRect.top;

        let newLeft = startLeft;
        let newTop = startTop;
        let newWidth = startWidth;
        let newHeight = startHeight;

        const aspectRatio = startWidth / startHeight;

        if (isDragging) {
            newLeft = Math.max(startLeft + dx, imgL);
            newTop = Math.max(startTop + dy, imgT);
            newLeft = Math.min(newLeft, imgR - startWidth);
            newTop = Math.min(newTop, imgB - startHeight);

            cropRectangle.style.left = `${newLeft}px`;
            cropRectangle.style.top = `${newTop}px`;
            cropRectInfo.x = newLeft;
            cropRectInfo.y = newTop;
            return;
        }

        const minSize = 20;

        if (resizeHandle === 'nw') {
            const anchorRight = startLeft + startWidth;
            const anchorBottom = startTop + startHeight;
            newWidth = startWidth - dx;

            // Ensure min size first
            newWidth = Math.max(newWidth, minSize);

            // Apply constraints
            const maxW_Left = anchorRight - imgL;
            const maxH_Top = anchorBottom - imgT;
            const maxW_Top = maxH_Top * aspectRatio;

            newWidth = Math.min(newWidth, maxW_Left, maxW_Top);

            newHeight = newWidth / aspectRatio;
            newLeft = anchorRight - newWidth;
            newTop = anchorBottom - newHeight;

        } else if (resizeHandle === 'ne') {
            const anchorLeft = startLeft;
            const anchorBottom = startTop + startHeight;
            newWidth = startWidth + dx;

            newWidth = Math.max(newWidth, minSize);

            const maxW_Right = imgR - anchorLeft;
            const maxH_Top = anchorBottom - imgT;
            const maxW_Top = maxH_Top * aspectRatio;

            newWidth = Math.min(newWidth, maxW_Right, maxW_Top);

            newHeight = newWidth / aspectRatio;
            newLeft = anchorLeft;
            newTop = anchorBottom - newHeight;

        } else if (resizeHandle === 'sw') {
            const anchorRight = startLeft + startWidth;
            const anchorTop = startTop;
            newWidth = startWidth - dx;

            newWidth = Math.max(newWidth, minSize);

            const maxW_Left = anchorRight - imgL;
            const maxH_Bottom = imgB - anchorTop;
            const maxW_Bottom = maxH_Bottom * aspectRatio;

            newWidth = Math.min(newWidth, maxW_Left, maxW_Bottom);

            newHeight = newWidth / aspectRatio;
            newLeft = anchorRight - newWidth;
            newTop = anchorTop;

        } else if (resizeHandle === 'se') {
            const anchorLeft = startLeft;
            const anchorTop = startTop;
            newWidth = startWidth + dx;

            newWidth = Math.max(newWidth, minSize);

            const maxW_Right = imgR - anchorLeft;
            const maxH_Bottom = imgB - anchorTop;
            const maxW_Bottom = maxH_Bottom * aspectRatio;

            newWidth = Math.min(newWidth, maxW_Right, maxW_Bottom);

            newHeight = newWidth / aspectRatio;
            newLeft = anchorLeft;
            newTop = anchorTop;
        }

        cropRectangle.style.left = `${newLeft}px`;
        cropRectangle.style.top = `${newTop}px`;
        cropRectangle.style.width = `${newWidth}px`;
        cropRectangle.style.height = `${newHeight}px`;
        cropRectInfo = { x: newLeft, y: newTop, width: newWidth, height: newHeight };
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

        const cropData = {
            x: cropX,
            y: cropY,
            width: cropRectInfo.width * scaleX,
            height: cropRectInfo.height * scaleY
        };

        const canvas = document.createElement('canvas');
        canvas.width = cropData.width;
        canvas.height = cropData.height;
        const ctx = canvas.getContext('2d');

        const img = new Image();
        img.src = cropImage.src;
        img.onload = () => {
            ctx.drawImage(
                img,
                cropData.x,
                cropData.y,
                cropData.width,
                cropData.height,
                0,
                0,
                canvas.width,
                canvas.height
            );

            canvas.toBlob(blob => {
                if (resolvePromise) {
                    resolvePromise({ croppedBlob: blob, cropData: cropData });
                }
                croppingModal.className = 'modal-hidden';
            }, 'image/jpeg');
        };
    });

    cropCancelBtn.addEventListener('click', hide);

    async function crop(imageBlob, targetAspectRatio, cropData) {
        return new Promise((resolve) => {
            const img = new Image();
            img.src = URL.createObjectURL(imageBlob);
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = cropData.width;
                canvas.height = cropData.height;
                const ctx = canvas.getContext('2d');

                ctx.drawImage(
                    img,
                    cropData.x,
                    cropData.y,
                    cropData.width,
                    cropData.height,
                    0,
                    0,
                    canvas.width,
                    canvas.height
                );

                canvas.toBlob(blob => {
                    resolve({ croppedBlob: blob, cropData: cropData });
                }, 'image/jpeg');
            };
        });
    }

    async function getDefaultCropData(imageBlob, targetAspectRatio) {
        const img = new Image();
        img.src = URL.createObjectURL(imageBlob);
        await new Promise(resolve => img.onload = resolve); // Ensure image is loaded to get natural dimensions

        const imageNaturalWidth = img.naturalWidth;
        const imageNaturalHeight = img.naturalHeight;
        const imageAspectRatio = imageNaturalWidth / imageNaturalHeight;

        let cropWidth, cropHeight, cropX, cropY;

        if (imageAspectRatio > targetAspectRatio) {
            // Image is wider than the target aspect ratio, crop height
            cropHeight = imageNaturalHeight;
            cropWidth = imageNaturalHeight * targetAspectRatio;
            cropX = (imageNaturalWidth - cropWidth) / 2;
            cropY = 0;
        } else {
            // Image is taller than the target aspect ratio, crop width
            cropWidth = imageNaturalWidth;
            cropHeight = imageNaturalWidth / targetAspectRatio;
            cropX = 0;
            cropY = (imageNaturalHeight - cropHeight) / 2;
        }

        return {
            x: cropX,
            y: cropY,
            width: cropWidth,
            height: cropHeight
        };
    }

    return { show, crop, getDefaultCropData };
};