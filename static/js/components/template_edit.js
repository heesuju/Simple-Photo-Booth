window.eventBus.on('app:init', (appState) => {
    const saveTemplateBtn = document.getElementById('save-template-btn');
    saveTemplateBtn.addEventListener('click', () => window.eventBus.dispatch('template-edit:save'));

    window.eventBus.on('template-edit:show', (data) => {
        appState.editingTemplate = data;
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
            w.style.transform = `rotate(${transform.rotation}deg) scale(${transform.scale})`;
            
            const i = document.createElement('div');
            i.className = 'editable-hole-inner';
            i.textContent = `${index + 1}`;
            w.addEventListener('mousedown', (e) => handleHoleMouseDown(e, hole, index, w), false);
            w.appendChild(i);

            if (appState.activeHole.index === index) {
                const selectionBox = document.createElement('div');
                selectionBox.className = 'selection-box';
                w.appendChild(selectionBox);

                const handles = ['nw', 'ne', 'sw', 'se'];
                handles.forEach(handle => {
                    const handleEl = document.createElement('div');
                    handleEl.className = `resize-handle ${handle}`;
                    handleEl.style.transform = `scale(${1 / transform.scale})`; // Counteract parent scale
                    handleEl.style.transformOrigin = 'center'; // Ensure scaling is centered
                    handleEl.addEventListener('mousedown', (e) => {
                        e.stopPropagation();
                        appState.activeHole.action = `resize-${handle}`;
                        appState.dragStart = { x: e.clientX, y: e.clientY, initialScale: transform.scale, initialW: hole.w, initialH: hole.h };
                    });
                    w.appendChild(handleEl);
                });

                const rotationHandle = document.createElement('div');
                rotationHandle.className = 'rotation-handle';
                rotationHandle.style.transform = `scale(${1 / transform.scale})`; // Counteract parent scale
                rotationHandle.style.transformOrigin = 'center'; // Ensure scaling is centered
                rotationHandle.addEventListener('mousedown', (e) => {
                    e.stopPropagation();
                    appState.activeHole.action = 'rotate';
                    const holeRect = w.getBoundingClientRect();
                    const centerX = holeRect.left + holeRect.width / 2;
                    const centerY = holeRect.top + holeRect.height / 2;
                    appState.dragStart = { x: e.clientX, y: e.clientY, centerX, centerY, initialRotation: transform.rotation };
                });
                w.appendChild(rotationHandle);
            }

            previewContainer.appendChild(w);
        });
    }

    function handleHoleMouseDown(e, data, index, el) {
        e.preventDefault();
        e.stopPropagation();
        const transform = appState.editingTemplate.transformations[index];
        if (appState.activeHole.index !== index) {
            appState.activeHole = { element: el, data: data, index: index, action: 'move' };
            renderEditableHoles();
        } else {
            appState.activeHole.action = 'move';
        }
        appState.dragStart = { x: e.clientX, y: e.clientY, initialScale: transform.scale };
    }

    function handleHoleMove(e) {
        if (!appState.activeHole.action) return;
        e.preventDefault();
    
        const transform = appState.editingTemplate.transformations[appState.activeHole.index];
    
        if (appState.activeHole.action === 'rotate') {
            const angle = Math.atan2(e.clientY - appState.dragStart.centerY, e.clientX - appState.dragStart.centerX) * (180 / Math.PI);
            const startAngle = Math.atan2(appState.dragStart.y - appState.dragStart.centerY, appState.dragStart.x - appState.dragStart.centerX) * (180 / Math.PI);
            transform.rotation = Math.round(appState.dragStart.initialRotation + angle - startAngle);
        } else if (appState.activeHole.action.startsWith('resize-')) {
            const { scale: previewScale } = getPreviewScaling('template-edit-preview');
            if (previewScale === 1) return;

            const dX_natural = (e.clientX - appState.dragStart.x) / previewScale;
            const dY_natural = (e.clientY - appState.dragStart.y) / previewScale;

            const handle = appState.activeHole.action.split('-')[1];
            
            let newW = appState.dragStart.initialW;
            let newH = appState.dragStart.initialH;

            if (handle.includes('e')) {
                newW = appState.dragStart.initialW + dX_natural;
            }
            if (handle.includes('s')) {
                newH = appState.dragStart.initialH + dY_natural;
            }
            if (handle.includes('w')) {
                newW = appState.dragStart.initialW - dX_natural;
            }
            if (handle.includes('n')) {
                newH = appState.dragStart.initialH - dY_natural;
            }

            const scaleX = newW / appState.dragStart.initialW;
            const scaleY = newH / appState.dragStart.initialH;
            let finalScaleFactor;

            if (handle.length === 2) { // Corner (nw, ne, sw, se)
                 finalScaleFactor = Math.abs(scaleX - 1) > Math.abs(scaleY - 1) ? scaleX : scaleY;
            } else if (handle === 'n' || handle === 's') { // Vertical (n, s)
                finalScaleFactor = scaleY;
            } else { // Horizontal (w, e)
                finalScaleFactor = scaleX;
            }
            
            transform.scale = Math.max(0.1, appState.dragStart.initialScale * finalScaleFactor);
        }
    
        renderTemplateEditPreview();
    }

    function handleHoleMouseUp() {
        if (appState.activeHole.action) {
            if (appState.activeHole.action.startsWith('resize-')) {
                appState.dragStart.initialScale = appState.editingTemplate.transformations[appState.activeHole.index].scale;
            }
            appState.activeHole.action = null;
        }
    }

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