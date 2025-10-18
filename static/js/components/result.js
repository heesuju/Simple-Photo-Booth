window.eventBus.on('app:init', (appState) => {
    window.eventBus.on('review:finalize', async (data) => {
            const finalizeBtn = document.getElementById('finalize-btn');
            finalizeBtn.disabled = true; 
    
            const imageComposePromise = (async () => {
                const d = new FormData();

                // Handle colored template
                if (appState.templateInfo.colored_template_path) {
                    const blob = await (await fetch(appState.templateInfo.colored_template_path)).blob();
                    d.append('template_file', blob, 'template.png');
                } else {
                    d.append('template_path', appState.templateInfo.template_path);
                }

                d.append('holes', JSON.stringify(appState.templateInfo.holes)); 
                d.append('stickers', JSON.stringify(appState.placedStickers)); 
                d.append('filters', JSON.stringify(appState.filters)); 
                d.append('transformations', JSON.stringify(appState.templateInfo.transformations)); 
                d.append('remove_background', appState.removeBackground);
                appState.photoAssignments.forEach((b, i) => { 
                    d.append('photos', b, `photo_${i}.jpg`); 
                }); 
                const r = await fetch('/compose_image', { method: 'POST', body: d }); 
                if (!r.ok) throw new Error((await r.json()).detail); 
                return r.json();
            })();
    
                    const videoComposePromise = (async () => {
                        const d = new FormData();

                        // Handle colored template
                        if (appState.templateInfo.colored_template_path) {
                            const blob = await (await fetch(appState.templateInfo.colored_template_path)).blob();
                            d.append('template_file', blob, 'template.png');
                        } else {
                            d.append('template_path', appState.templateInfo.template_path);
                        }

                        d.append('holes', JSON.stringify(appState.templateInfo.holes));
                        d.append('stickers', JSON.stringify(appState.placedStickers));
                        d.append('transformations', JSON.stringify(appState.templateInfo.transformations));
                        data.videos.forEach((video_path, i) => {
                            d.append('video_paths', video_path);
                        });
            
                        const r = await fetch('/compose_video', { 
                            method: 'POST', 
                            body: d
                        });
                        if (!r.ok) throw new Error((await r.json()).detail);
                        return r.json();
                    })();    
            try {
                const [imageResult, videoResult] = await Promise.all([imageComposePromise, videoComposePromise]);
                displayFinalResult(imageResult, videoResult);
            } catch (e) {
                console.error(e);
                finalizeBtn.disabled = false;
            }
        });
    
        function displayFinalResult(imageResult, videoResult) { 
            window.eventBus.dispatch('screen:show', 'result-screen');
            const { result_path, qr_code_path } = imageResult; 
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

            // Add Download Original button
            const originalBtn = document.createElement('button');
            originalBtn.textContent = '원본 다운로드';
            originalBtn.style.marginLeft = '10px';
            originalBtn.onclick = async () => {
                try {
                    originalBtn.disabled = true;
                    originalBtn.textContent = '압축 중...';

                    const formData = new FormData();
                    appState.photoAssignments.forEach((photoBlob, i) => {
                        formData.append('photos', photoBlob, `photo_${i}.jpg`);
                    });

                    const response = await fetch('/zip_originals', {
                        method: 'POST',
                        body: formData
                    });

                    if (!response.ok) {
                        throw new Error('Failed to create zip file.');
                    }

                    const zipBlob = await response.blob();
                    const url = window.URL.createObjectURL(zipBlob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.setAttribute('download', 'original_photos.zip');
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    window.URL.revokeObjectURL(url);

                } catch (err) {
                    console.error('Failed to download originals:', err);
                    alert('원본 사진을 다운로드하는 데 실패했습니다.');
                } finally {
                    originalBtn.disabled = false;
                    originalBtn.textContent = '원본 다운로드';
                }
            };
            c.appendChild(originalBtn);

            // Add Continue Editing button
            const editBtn = document.createElement('button');
            editBtn.textContent = '수정 계속하기';
            editBtn.style.marginLeft = '10px';
            editBtn.style.backgroundColor = '#28a745'; // Green
            editBtn.onclick = () => {
                window.eventBus.dispatch('review:edit-existing');
            };
            c.appendChild(editBtn);
    
            if (videoResult && videoResult.result_path) {
                const videoLink = document.createElement('a');
                videoLink.href = videoResult.result_path;
                videoLink.download = 'photobooth_video.mp4';
                const videoButton = document.createElement('button');
                videoButton.textContent = '비디오 다운로드';
                videoLink.appendChild(videoButton);
                c.appendChild(videoLink);
            }
    
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
        }});