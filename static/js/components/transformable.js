window.initTransformable = (options) => {
    const { appState, getPreviewScaling, updateSnapLine, updateVerticalSnapLine, renderTexts, renderStickers, } = options;

    const SNAP_THRESHOLD = 5; // degrees for rotation, pixels for position

    function handleMouseDown(e, data, el, type) {
        // This is for move action
        if (el.querySelector && el.querySelector('.editable-text')?.isContentEditable) return;
        e.preventDefault();
        e.stopPropagation();

        if (appState.activeTransformable && appState.activeTransformable.action) return;

        if (!appState.activeTransformable || appState.activeTransformable.data.id !== data.id) {
            appState.activeTransformable = { element: el, data: data, action: 'move', type: type };
            renderTexts();
            renderStickers();
        } else {
            appState.activeTransformable.action = 'move';
        }
        appState.dragStart = { x: e.clientX, y: e.clientY, initialX: data.x, initialY: data.y };
    }

    function handleResizeRotateMouseDown(e, data, el, type) {
        // This is for resize-rotate action
        e.stopPropagation();
        appState.activeTransformable = { element: el, data: data, action: 'resize-rotate', type: type };

        const { scale, offsetX, offsetY } = getPreviewScaling();
        const previewRect = document.getElementById('review-preview').getBoundingClientRect();

        const itemHeight = (type === 'text') ? el.offsetHeight / scale : data.height;

        const centerX = previewRect.left + offsetX + (data.x + data.width / 2) * scale;
        const centerY = previewRect.top + offsetY + (data.y + itemHeight / 2) * scale;

        appState.dragStart = {
            x: e.clientX,
            y: e.clientY,
            centerX,
            centerY,
            initialWidth: data.width,
            initialHeight: itemHeight,
            initialRotation: data.rotation,
            initialDistance: Math.hypot(e.clientX - centerX, e.clientY - centerY),
            initialAngle: Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI)
        };

        if (type === 'text') {
            appState.dragStart.initialFontSize = data.fontSize;
        }
    }

    function handleMouseMove(e) {
        if (!appState.activeTransformable || !appState.activeTransformable.action) return;
        e.preventDefault();

        const { scale, offsetX, offsetY } = getPreviewScaling();
        if (scale === 1) return;

        const item = appState.activeTransformable.data;
        const previewContainer = document.getElementById('review-preview');
        const previewRect = previewContainer.getBoundingClientRect();

        if (appState.activeTransformable.action === 'move') {
            const dX_natural = (e.clientX - appState.dragStart.x) / scale;
            const dY_natural = (e.clientY - appState.dragStart.y) / scale;

            const newX = Math.round(appState.dragStart.initialX + dX_natural);
            const newY = Math.round(appState.dragStart.initialY + dY_natural);

            if (!isNaN(newX)) item.x = newX;
            if (!isNaN(newY)) item.y = newY;

            const itemCenterScreenX = previewRect.left + offsetX + (item.x + item.width / 2) * scale;
            const canvasCenterScreenX = previewRect.left + previewRect.width / 2;

            if (Math.abs(itemCenterScreenX - canvasCenterScreenX) < SNAP_THRESHOLD) {
                const template = document.querySelector('#review-preview .preview-template-img');
                const imageNaturalWidth = template.naturalWidth;
                item.x = Math.round((imageNaturalWidth - item.width) / 2); // Round this too
                updateVerticalSnapLine(true, canvasCenterScreenX);
            } else {
                updateVerticalSnapLine(false);
            }

        } else if (appState.activeTransformable.action === 'resize-rotate') {
            const centerX = appState.dragStart.centerX;
            const centerY = appState.dragStart.centerY;

            const mouseVecX = e.clientX - centerX;
            const mouseVecY = e.clientY - centerY;

            const localAngleRad = Math.atan2(appState.dragStart.initialHeight / 2, appState.dragStart.initialWidth / 2);
            const newRotationRad = Math.atan2(mouseVecY, mouseVecX);
            let newRotation = (newRotationRad - localAngleRad) * (180 / Math.PI);

            let isSnapping = false;
            if (Math.abs(newRotation) < SNAP_THRESHOLD || Math.abs(newRotation - 360) < SNAP_THRESHOLD || Math.abs(newRotation + 360) < SNAP_THRESHOLD) {
                item.rotation = 0;
                isSnapping = true;
            } else {
                item.rotation = !isNaN(newRotation) ? newRotation : item.rotation;
            }
            updateSnapLine(isSnapping, appState.dragStart.centerY);

            const newDiagScreen = Math.hypot(mouseVecX, mouseVecY);
            const localDiag = Math.hypot(appState.dragStart.initialWidth / 2, appState.dragStart.initialHeight / 2);
            // Avoid division by zero if localDiag or scale is 0
            const scaleFactor = (localDiag * scale) > 0.0001 ? newDiagScreen / (localDiag * scale) : 1;

            if (appState.activeTransformable.type === 'text') {
                const newFontSize = Math.max(10, appState.dragStart.initialFontSize * scaleFactor);
                if (!isNaN(newFontSize)) item.fontSize = newFontSize;

                // precise measurement logic duplicated for Transformable to be self-contained
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                context.font = `${item.fontSize}px "${item.font}"`;
                const lines = item.text.split('\n');
                let maxWidth = 0;
                let totalHeight = 0;
                const lineHeight = item.fontSize * 1.3;

                lines.forEach((line) => {
                    const metrics = context.measureText(line);
                    const currentWidth = Math.abs(metrics.actualBoundingBoxLeft) + Math.abs(metrics.actualBoundingBoxRight) + 4;
                    if (currentWidth > maxWidth) maxWidth = currentWidth;
                });

                if (lines.length === 1) {
                    const metrics = context.measureText(lines[0]);
                    const actualHeight = Math.abs(metrics.actualBoundingBoxAscent) + Math.abs(metrics.actualBoundingBoxDescent) + 4;
                    totalHeight = Math.max(actualHeight, lineHeight);
                } else {
                    totalHeight = lines.length * lineHeight;
                }

                item.width = Math.ceil(maxWidth);
                item.height = Math.ceil(totalHeight);
            } else { // sticker
                const minSizeNatural = 20 / scale;
                const newWidth = Math.max(minSizeNatural, appState.dragStart.initialWidth * scaleFactor);
                const newHeight = Math.max(minSizeNatural, appState.dragStart.initialHeight * scaleFactor);

                if (!isNaN(newWidth)) item.width = Math.round(newWidth);
                if (!isNaN(newHeight)) item.height = Math.round(newHeight);
            }

            const new_center_natural_x = (centerX - (previewRect.left + offsetX)) / scale;
            const new_center_natural_y = (centerY - (previewRect.top + offsetY)) / scale;

            if (!isNaN(new_center_natural_x) && !isNaN(new_center_natural_y)) {
                item.x = Math.round(new_center_natural_x - item.width / 2);
                item.y = Math.round(new_center_natural_y - item.height / 2);
            }
        }

        if (appState.activeTransformable.type === 'text') {
            renderTexts();
        } else {
            renderStickers();
        }
    }

    function handleMouseUp(e) {
        if (appState.activeTransformable && appState.activeTransformable.action) {
            appState.activeTransformable.action = null;
        }
        updateSnapLine(false);
        updateVerticalSnapLine(false);
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return { handleMouseDown, handleResizeRotateMouseDown };
};