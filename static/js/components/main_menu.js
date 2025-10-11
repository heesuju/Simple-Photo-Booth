window.eventBus.on('app:init', (appState) => {
    const templateUploadInput = document.getElementById('template-upload-input');
    const addTemplateFloatBtn = document.getElementById('add-template-float-btn');
    const continueBtn = document.getElementById('continue-btn');

    templateUploadInput.addEventListener('change', (e) => window.handleFileUpload(e, '/upload_template', loadLayoutGallery));
    addTemplateFloatBtn.addEventListener('click', () => templateUploadInput.click());
    continueBtn.addEventListener('click', () => {
        if (appState.selectedTemplate.data) {
            window.eventBus.dispatch('main-menu:continue', appState.selectedTemplate.data);
        }
    });

    async function loadLayoutGallery() { 
        try { 
            const r = await fetch('/layouts'); 
            const d = await r.json(); 
            const c = document.getElementById('layout-gallery'); 
            c.innerHTML = ''; 
            d.forEach(l => { 
                const i = document.createElement('div'); 
                i.className = 'layout-item'; 
                const m = document.createElement('img'); 
                m.src = l.thumbnail_path; 
                i.appendChild(m); 
                const p = document.createElement('p'); 
                p.innerHTML = `${l.cell_layout}<br>${l.aspect_ratio}`; 
                i.appendChild(p); 
                i.addEventListener('click', () => handleLayoutSelection(i, l)); 
                c.appendChild(i); 
            }); 
        } 
        catch (e) { console.error(e); } 
    }

    function handleLayoutSelection(el, data) { 
        if (appState.selectedTemplate.element) { 
            appState.selectedTemplate.element.classList.remove('selected'); 
        } 
        appState.selectedTemplate = { element: el, data: data }; 
        el.classList.add('selected'); 
        continueBtn.style.display = 'block'; 
    }

    window.eventBus.on('template:uploaded', (data) => {
        window.eventBus.dispatch('screen:show', 'template-edit-screen');
        window.eventBus.dispatch('template-edit:show', data);
    });

    loadLayoutGallery();
});