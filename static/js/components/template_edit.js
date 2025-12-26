window.eventBus.on('app:init', (appState) => {
    const saveTemplateBtn = document.getElementById('save-template-btn');
    saveTemplateBtn.addEventListener('click', () => window.eventBus.dispatch('template-edit:save'));

    window.eventBus.on('template-edit:show', (data) => {
        appState.editingTemplate = data;
        // Ensure transformations array exists and matches the number of holes
        if (!appState.editingTemplate.transformations || appState.editingTemplate.transformations.length !== appState.editingTemplate.holes.length) {
            appState.editingTemplate.transformations = appState.editingTemplate.holes.map(() => ({ rotation: 0 }));
        }
        renderTemplateEditPreview();
    });

    function renderTemplateEditPreview() {
        const p = document.getElementById('template-edit-preview');
        p.innerHTML = '';
        const t = document.createElement('img');
        t.src = appState.editingTemplate.template_path;
        t.className = 'preview-template-img';
        t.draggable = false;
        t.onload = () => {
            renderEditableHoles();
        };
        p.appendChild(t);
    }

    function renderEditableHoles() {
        document.querySelectorAll('.editable-hole-wrapper').forEach(w => w.remove());
        const { scale, offsetX, offsetY } = getPreviewScaling('template-edit-preview');
        if (scale === 1) return; // Preview not ready
        const previewContainer = document.getElementById('template-edit-preview');

        appState.editingTemplate.holes.forEach((hole, index) => {
            const transform = appState.editingTemplate.transformations[index];
            const w = document.createElement('div');
            w.className = 'editable-hole-wrapper';
            if (appState.activeHole.index === index) {
                w.classList.add('active');
            }
            w.style.position = 'absolute';
            w.style.left = `${offsetX + hole.x * scale}px`;
            w.style.top = `${offsetY + hole.y * scale}px`;
            w.style.width = `${hole.w * scale}px`;
            w.style.height = `${hole.h * scale}px`;
            w.style.transform = `rotate(${transform.rotation}deg)`;

            const i = document.createElement('div');
            i.className = 'editable-hole-inner';
            i.textContent = `${index + 1}`;
            w.addEventListener('mousedown', (e) => handleHoleMouseDown(e, hole, index, w), false);
            w.appendChild(i);

            if (appState.activeHole.index === index) {
                const selectionBox = document.createElement('div');
                selectionBox.className = 'selection-box';
                w.appendChild(selectionBox);

                // Combined Resize/Rotate Handle -> Now Rotate Only
                const rotateHandle = document.createElement('div');
                rotateHandle.className = 'sticker-handle rotate-only'; // Changed class
                rotateHandle.addEventListener('mousedown', (e) => {
                    e.stopPropagation();
                    appState.activeHole.action = 'rotate-only';

                    const { scale, offsetX, offsetY } = getPreviewScaling('template-edit-preview');
                    const previewRect = document.getElementById('template-edit-preview').getBoundingClientRect();

                    // Original natural dimensions of the hole (before scaling for preview)
                    const holeNatX = hole.x;
                    const holeNatY = hole.y;
                    const holeNatW = hole.w;
                    const holeNatH = hole.h;

                    const centerX = previewRect.left + offsetX + (holeNatX + holeNatW / 2) * scale;
                    const centerY = previewRect.top + offsetY + (holeNatY + holeNatH / 2) * scale;

                    appState.dragStart = {
                        x: e.clientX,
                        y: e.clientY,
                        centerX,
                        centerY,
                        initialWidth: holeNatW,
                        initialHeight: holeNatH,
                        initialRotation: transform.rotation,
                        initialDistance: Math.hypot(e.clientX - centerX, e.clientY - centerY),
                        initialX: holeNatX,
                        initialY: holeNatY
                    };
                });
                w.appendChild(rotateHandle);
            }

            previewContainer.appendChild(w);
        });
    }

    function handleHoleMouseDown(e, data, index, el) {
        e.preventDefault();
        e.stopPropagation();
        const transform = appState.editingTemplate.transformations[index];
        if (appState.activeHole.index !== index) {
            appState.activeHole = { element: el, data: data, index: index, action: null }; // No move action
            renderEditableHoles();
        } else {
            // appState.activeHole.action = 'move'; // Disabled
        }
        appState.dragStart = { x: e.clientX, y: e.clientY, initialX: data.x, initialY: data.y };
    }

    function handleHoleMove(e) {
        if (!appState.activeHole.action) return;
        e.preventDefault();

        const transform = appState.editingTemplate.transformations[appState.activeHole.index];

        const { scale: previewScale } = window.getPreviewScaling('template-edit-preview');

        if (appState.activeHole.action === 'rotate-only') {
            const centerX = appState.dragStart.centerX;
            const centerY = appState.dragStart.centerY;

            const mouseVecX = e.clientX - centerX;
            const mouseVecY = e.clientY - centerY;

            const newRotationRad = Math.atan2(mouseVecY, mouseVecX);
            const initialAngleRad = Math.atan2(appState.dragStart.y - centerY, appState.dragStart.x - centerX);

            // Calculate rotation
            const rotationChange = (newRotationRad - initialAngleRad) * (180 / Math.PI);
            transform.rotation = Math.round(appState.dragStart.initialRotation + rotationChange);
        }
        // Move and resize logic removed

        renderTemplateEditPreview();
    }

    function handleHoleMouseUp() {
        if (appState.activeHole.action) {
            appState.activeHole.action = null;
        }
    }

    window.addEventListener('mousemove', handleHoleMove);
    window.addEventListener('mouseup', handleHoleMouseUp);

    window.eventBus.on('template-edit:save', async () => {
        try {
            const r = await fetch('/save_template', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(appState.editingTemplate)
            });
            if (!r.ok) throw new Error((await r.json()).detail);
            window.eventBus.dispatch('screen:show', 'main-menu');
            window.eventBus.dispatch('layout-gallery:load');
        } catch (e) {
            console.error(e);
        }
    });
});