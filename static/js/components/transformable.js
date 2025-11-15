window.initTransformable = (options) => {
    const { appState, getPreviewScaling, updateSnapLine, renderTexts, renderStickers, } = options;

    const SNAP_THRESHOLD = 5; // degrees

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

        const { scale } = getPreviewScaling();
        if (scale === 1) return;

        const item = appState.activeTransformable.data;

        if (appState.activeTransformable.action === 'move') {
            const dX_natural = (e.clientX - appState.dragStart.x) / scale;
            const dY_natural = (e.clientY - appState.dragStart.y) / scale;
            item.x = Math.round(appState.dragStart.initialX + dX_natural);
            item.y = Math.round(appState.dragStart.initialY + dY_natural);
        } else if (appState.activeTransformable.action === 'resize-rotate') {
            const { scale, offsetX, offsetY } = getPreviewScaling();
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
                item.rotation = newRotation;
            }
            updateSnapLine(isSnapping, appState.dragStart.centerY);

            const newDiagScreen = Math.hypot(mouseVecX, mouseVecY);
            const localDiag = Math.hypot(appState.dragStart.initialWidth / 2, appState.dragStart.initialHeight / 2);
            const scaleFactor = newDiagScreen / (localDiag * scale);

            if (appState.activeTransformable.type === 'text') {
                item.fontSize = Math.max(10, appState.dragStart.initialFontSize * scaleFactor);

                const tempSpan = document.createElement('span');
                tempSpan.style.fontFamily = item.font;
                tempSpan.style.fontSize = item.fontSize + 'px';
                tempSpan.style.whiteSpace = 'pre';
                tempSpan.innerHTML = item.text.replace(/\n/g, '<br>');
                document.body.appendChild(tempSpan);
                item.width = tempSpan.offsetWidth;
                item.height = tempSpan.offsetHeight;
                document.body.removeChild(tempSpan);
            } else { // sticker
                const minSizeNatural = 20 / scale;
                item.width = Math.max(minSizeNatural, appState.dragStart.initialWidth * scaleFactor);
                item.height = Math.max(minSizeNatural, appState.dragStart.initialHeight * scaleFactor);
            }

            const previewRect = document.getElementById('review-preview').getBoundingClientRect();
            const new_center_natural_x = (centerX - (previewRect.left + offsetX)) / scale;
            const new_center_natural_y = (centerY - (previewRect.top + offsetY)) / scale;

            item.x = new_center_natural_x - item.width / 2;
            item.y = new_center_natural_y - item.height / 2;
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
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return { handleMouseDown, handleResizeRotateMouseDown };
};