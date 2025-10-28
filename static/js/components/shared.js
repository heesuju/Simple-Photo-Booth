window.getPreviewScaling = function(previewId = 'review-preview') {
    const p = document.getElementById(previewId);
    let t;
    if (previewId === 'review-preview') {
        t = p.querySelector('#review-template-overlay');
    } else if (previewId === 'template-edit-preview') {
        t = p.querySelector('.preview-template-img');
    }
    
    if (!t || !t.naturalWidth) return { scale: 1, offsetX: 0, offsetY: 0, renderedWidth: 0, renderedHeight: 0 };

    const containerWidth = p.offsetWidth;
    const containerHeight = p.offsetHeight;
    const imageNaturalWidth = t.naturalWidth;
    const imageNaturalHeight = t.naturalHeight;

    const containerRatio = containerWidth / containerHeight;
    const imageRatio = imageNaturalWidth / imageNaturalHeight;

    let renderedWidth, renderedHeight, offsetX, offsetY;

    if (imageRatio > containerRatio) {
        renderedWidth = containerWidth;
        renderedHeight = containerWidth / imageRatio;
        offsetX = 0;
        offsetY = (containerHeight - renderedHeight) / 2;
    } else {
        renderedHeight = containerHeight;
        renderedWidth = containerHeight * imageRatio;
        offsetX = (containerWidth - renderedWidth) / 2;
        offsetY = 0;
    }

    return {
        scale: renderedWidth / imageNaturalWidth,
        offsetX,
        offsetY,
        renderedWidth,
        renderedHeight
    };
};

// A simple debounce function to limit the rate at which a function can fire.
window.debounce = function(func, wait) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

// Handles file uploads for both templates and stickers
window.handleFileUpload = async function(event, endpoint, callback, category = null) { 
    const f = event.target.files[0]; 
    if (!f) return; 
    const d = new FormData(); 
    d.append('file', f); 
    if (category) {
        d.append('category', category);
    }
    try { 
        const r = await fetch(endpoint, { method: 'POST', body: d }); 
        if (!r.ok) throw new Error((await r.json()).detail); 
        const data = await r.json();
        if (endpoint === '/upload_template') {
            window.eventBus.dispatch('template:uploaded', data);
        } else {
            callback(); 
        }
    } catch (e) { 
        console.error(e); 
    } 
    event.target.value = null; 
}

window.showToast = function(message, type = 'info', duration = 3000) {
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        Object.assign(toastContainer.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            display: 'flex',
            flexDirection: 'column-reverse',
            gap: '10px',
            zIndex: 9999,
        });
        document.body.appendChild(toastContainer);
    }

    const container = toastContainer;
    const toast = document.createElement('div');
    toast.textContent = message;

    const colors = {
        info: 'rgba(0, 123, 255, 0.9)',
        success: 'rgba(40, 167, 69, 0.9)',
        error: 'rgba(220, 53, 69, 0.9)',
        warning: 'rgba(255, 193, 7, 0.9)'
    };

    Object.assign(toast.style, {
        backgroundColor: colors[type] || colors.info,
        color: 'white',
        padding: '10px 40px 10px 20px',
        borderRadius: '8px',
        fontFamily: 'sans-serif',
        fontSize: '14px',
        boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
        opacity: '0',
        transform: 'translateX(100%) translateY(0)',
        transition: 'opacity 0.3s, transform 0.3s',
        position: 'relative',
        maxWidth: '90vw',
        wordWrap: 'break-word',
    });

    const closeBtn = document.createElement('span');
    closeBtn.innerHTML = '&times;';
    Object.assign(closeBtn.style, {
        position: 'absolute',
        top: '50%',
        right: '10px',
        transform: 'translateY(-50%)',
        cursor: 'pointer',
        fontWeight: 'bold',
        fontSize: '16px',
        opacity: '0.7',
        transition: 'opacity 0.2s, transform 0.2s',
    });

    closeBtn.addEventListener('mouseenter', () => {
        closeBtn.style.opacity = '1';
        closeBtn.style.transform = 'translateY(-50%) scale(1.2)';
    });
    closeBtn.addEventListener('mouseleave', () => {
        closeBtn.style.opacity = '0.7';
        closeBtn.style.transform = 'translateY(-50%) scale(1)';
    });
    closeBtn.addEventListener('click', () => removeToast(toast));

    toast.appendChild(closeBtn);
    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(0) translateY(0)';
    });

    setTimeout(() => removeToast(toast), duration);

    function removeToast(toast) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%) translateY(0)';
        toast.addEventListener('transitionend', () => toast.remove());
    }
};