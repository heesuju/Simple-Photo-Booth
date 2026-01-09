window.initTransformable = (options) => {
    const { appState, getPreviewScaling, updateSnapLine, updateVerticalSnapLine, renderDecorations } = options;

    const SNAP_THRESHOLD = 5; // degrees for rotation, pixels for position

    function handleMouseDown(e, data, el, type) {
        // This is for move action
        if (el.querySelector && el.querySelector('.editable-text')?.isContentEditable) return;
        e.preventDefault();
        e.stopPropagation();

        if (appState.activeTransformable && appState.activeTransformable.action) return;

        // Bring to front on touch/click by updating ID
        data.id = Date.now();

        if (!appState.activeTransformable || appState.activeTransformable.data.id !== data.id) {
            appState.activeTransformable = { element: el, data: data, action: 'move', type: type };
            // renderDecorations checks for activeTransformable to add handles, so we render here
            renderDecorations();
        } else {
            appState.activeTransformable.action = 'move';
            // Even if already active, we updated ID so we must re-render to change z-order
            renderDecorations();
        }
        appState.dragStart = { x: e.clientX, y: e.clientY, initialX: data.x, initialY: data.y };
    }

    function handleResizeRotateMouseDown(e, data, el, type) {
        // This is for resize-rotate action
        e.stopPropagation();

        // Bring to front
        data.id = Date.now();

        appState.activeTransformable = { element: el, data: data, action: 'resize-rotate', type: type };

        // render to update z-order
        renderDecorations();

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

            let newX = Math.round(appState.dragStart.initialX + dX_natural);
            let newY = Math.round(appState.dragStart.initialY + dY_natural);

            if (!isNaN(newX)) item.x = newX;
            if (!isNaN(newY)) item.y = newY;

            // Helper to get bounds of a decoration item
            const getItemBounds = (decorationItem, type) => {
                const height = type === 'text' ? decorationItem.height : decorationItem.height;
                return {
                    left: decorationItem.x,
                    right: decorationItem.x + decorationItem.width,
                    top: decorationItem.y,
                    bottom: decorationItem.y + height,
                    centerX: decorationItem.x + decorationItem.width / 2,
                    centerY: decorationItem.y + height / 2
                };
            };

            // Get all other decorations (excluding the one being dragged)
            const otherDecorations = [];
            if (appState.placedStickers) {
                appState.placedStickers.forEach(s => {
                    if (s.id !== item.id) {
                        otherDecorations.push({ item: s, type: 'sticker' });
                    }
                });
            }
            if (appState.placedTexts) {
                appState.placedTexts.forEach(t => {
                    if (t.id !== item.id) {
                        otherDecorations.push({ item: t, type: 'text' });
                    }
                });
            }

            const draggedHeight = appState.activeTransformable.type === 'text' ? item.height : item.height;
            const dragBounds = getItemBounds(item, appState.activeTransformable.type);

            const threshold = SNAP_THRESHOLD / scale;
            let bestSnapX = null;
            let bestSnapY = null;
            let minDistX = threshold;
            let minDistY = threshold;
            let snapLineXPos = null;
            let snapLineYPos = null;

            // Check snapping to other decorations
            for (const { item: other, type: otherType } of otherDecorations) {
                const otherBounds = getItemBounds(other, otherType);

                // Check horizontal (X-axis) snapping points only if not yet found
                if (bestSnapX === null) {
                    const xChecks = [
                        { drag: dragBounds.left, other: otherBounds.left, line: otherBounds.left },
                        { drag: dragBounds.left, other: otherBounds.right, line: otherBounds.right },
                        { drag: dragBounds.left, other: otherBounds.centerX, line: otherBounds.centerX },
                        { drag: dragBounds.right, other: otherBounds.left, line: otherBounds.left },
                        { drag: dragBounds.right, other: otherBounds.right, line: otherBounds.right },
                        { drag: dragBounds.right, other: otherBounds.centerX, line: otherBounds.centerX },
                        { drag: dragBounds.centerX, other: otherBounds.left, line: otherBounds.left },
                        { drag: dragBounds.centerX, other: otherBounds.right, line: otherBounds.right },
                        { drag: dragBounds.centerX, other: otherBounds.centerX, line: otherBounds.centerX }
                    ];

                    for (const check of xChecks) {
                        const dist = Math.abs(check.drag - check.other);
                        if (dist < minDistX) {
                            minDistX = dist;
                            bestSnapX = check.other - (check.drag - item.x);
                            snapLineXPos = check.line;
                        }
                    }
                }

                // Check vertical (Y-axis) snapping points only if not yet found
                if (bestSnapY === null) {
                    const yChecks = [
                        { drag: dragBounds.top, other: otherBounds.top, line: otherBounds.top },
                        { drag: dragBounds.top, other: otherBounds.bottom, line: otherBounds.bottom },
                        { drag: dragBounds.top, other: otherBounds.centerY, line: otherBounds.centerY },
                        { drag: dragBounds.bottom, other: otherBounds.top, line: otherBounds.top },
                        { drag: dragBounds.bottom, other: otherBounds.bottom, line: otherBounds.bottom },
                        { drag: dragBounds.bottom, other: otherBounds.centerY, line: otherBounds.centerY },
                        { drag: dragBounds.centerY, other: otherBounds.top, line: otherBounds.top },
                        { drag: dragBounds.centerY, other: otherBounds.bottom, line: otherBounds.bottom },
                        { drag: dragBounds.centerY, other: otherBounds.centerY, line: otherBounds.centerY }
                    ];

                    for (const check of yChecks) {
                        const dist = Math.abs(check.drag - check.other);
                        if (dist < minDistY) {
                            minDistY = dist;
                            bestSnapY = check.other - (check.drag - item.y);
                            snapLineYPos = check.line;
                        }
                    }
                }

                // Early exit if both X and Y snaps found
                if (bestSnapX !== null && bestSnapY !== null) {
                    break;
                }
            }

            // Apply decoration snapping if found
            if (bestSnapX !== null) {
                item.x = Math.round(bestSnapX);
            }
            if (bestSnapY !== null) {
                item.y = Math.round(bestSnapY);
            }

            // Get template dimensions for edge snapping
            const template = document.querySelector('#review-preview .preview-template-img');
            if (template) {
                const templateWidth = template.naturalWidth;
                const templateHeight = template.naturalHeight;

                // Snap to template edges if no decoration snap found
                if (bestSnapX === null) {
                    // Check left edge snap
                    if (Math.abs(dragBounds.left) < threshold) {
                        item.x = 0;
                        snapLineXPos = 0;
                    }
                    // Check right edge snap
                    else if (Math.abs(dragBounds.right - templateWidth) < threshold) {
                        item.x = templateWidth - item.width;
                        snapLineXPos = templateWidth;
                    }
                    // Check center snap (fallback)
                    else {
                        const itemCenterScreenX = previewRect.left + offsetX + (item.x + item.width / 2) * scale;
                        const canvasCenterScreenX = previewRect.left + previewRect.width / 2;

                        if (Math.abs(itemCenterScreenX - canvasCenterScreenX) < SNAP_THRESHOLD) {
                            item.x = Math.round((templateWidth - item.width) / 2);
                            snapLineXPos = templateWidth / 2;
                        }
                    }
                }

                if (bestSnapY === null) {
                    // Check top edge snap
                    if (Math.abs(dragBounds.top) < threshold) {
                        item.y = 0;
                        snapLineYPos = 0;
                    }
                    // Check bottom edge snap
                    else if (Math.abs(dragBounds.bottom - templateHeight) < threshold) {
                        item.y = templateHeight - draggedHeight;
                        snapLineYPos = templateHeight;
                    }
                    // Center Y snap would go here if needed
                }
            }

            // Show snap lines for decoration snapping
            if (snapLineXPos !== null) {
                const screenX = previewRect.left + offsetX + snapLineXPos * scale;
                updateVerticalSnapLine(true, screenX);
            } else {
                updateVerticalSnapLine(false);
            }

            if (snapLineYPos !== null) {
                const screenY = previewRect.top + offsetY + snapLineYPos * scale;
                updateSnapLine(true, screenY);
            } else {
                updateSnapLine(false);
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

        renderDecorations();
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