window.eventBus.on('app:init', (appState) => {
    window.eventBus.on('review:finalize', async () => {
        const finalizeBtn = document.getElementById('finalize-btn');
        finalizeBtn.disabled = true; 
        const d = new FormData(); 
        d.append('template_path', appState.templateInfo.template_path); 
        d.append('holes', JSON.stringify(appState.templateInfo.holes)); 
        d.append('stickers', JSON.stringify(appState.placedStickers)); 
        d.append('filters', JSON.stringify(appState.filters)); 
        d.append('transformations', JSON.stringify(appState.templateInfo.transformations)); 
        appState.photoAssignments.forEach((b, i) => { 
            d.append('photos', b, `photo_${i}.jpg`); 
        }); 
        try { 
            const r = await fetch('/compose_image', { method: 'POST', body: d }); 
            if (!r.ok) 
                throw new Error((await r.json()).detail); 
            const j = await r.json(); 
            displayFinalResult(j); 
        } 
        catch (e) { 
            console.error(e); 
            finalizeBtn.disabled = false; 
        } 
    });

    function displayFinalResult(result) { 
        window.eventBus.dispatch('screen:show', 'result-screen');
        const { result_path, qr_code_path } = result; 
        document.getElementById('result-title').textContent = '완성!'; 
        document.getElementById('result-status').textContent = '이미지가 성공적으로 생성되었습니다.'; 
        const d = document.getElementById('result-display'); 
        d.innerHTML = ''; 
        const i = document.createElement('img'); 
        i.src = result_path; 
        i.style.maxWidth = '100%'; 
        d.appendChild(i); 
        const c = document.createElement('div'); 
        c.style.marginTop = '20px'; 
        const a = document.createElement('a'); 
        a.href = result_path; 
        a.download = 'photobooth_result.png'; 
        const b = document.createElement('button'); 
        b.textContent = 'PC에 다운로드'; 
        a.appendChild(b); 
        c.appendChild(a); 
        if (qr_code_path) { 
            const q = document.createElement('div'); 
            q.style.marginTop = '10px'; 
            q.innerHTML = '<p>또는, 모바일에서 QR 코드를 스캔하여 다운로드하세요:</p>'; 
            const qi = document.createElement('img'); 
            qi.src = qr_code_path; 
            qi.style.width = '150px'; 
            q.appendChild(qi); 
            c.appendChild(q); 
        } 
        d.appendChild(c); 
    }
});