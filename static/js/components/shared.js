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
window.handleFileUpload = async function(event, endpoint, callback) { 
    const f = event.target.files[0]; 
    if (!f) return; 
    const d = new FormData(); 
    d.append('file', f); 
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