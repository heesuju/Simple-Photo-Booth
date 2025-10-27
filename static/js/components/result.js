window.eventBus.on('app:init', (appState) => {

  let cachedVideoResult = null; // store composed video after first creation

  window.eventBus.on('review:finalize', async (data) => {
    const finalizeBtn = document.getElementById('finalize-btn');
    if (finalizeBtn) finalizeBtn.disabled = true;

    // Compose image immediately
    const imageComposePromise = (async () => {
      const d = new FormData();

      if (appState.templateInfo.colored_template_path) {
        const blob = await (await fetch(appState.templateInfo.colored_template_path)).blob();
        d.append('template_file', blob, 'template.png');
      } else {
        d.append('template_path', appState.templateInfo.template_path);
      }

      d.append('holes', JSON.stringify(appState.templateInfo.holes));
      d.append('stickers', JSON.stringify(appState.placedStickers));
      d.append('texts', JSON.stringify(appState.placedTexts));
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

    try {
      const imageResult = await imageComposePromise;
      displayFinalResult(imageResult, data, appState);
    } catch (e) {
      console.error(e);
      if (finalizeBtn) finalizeBtn.disabled = false;
    }
  });

  function displayFinalResult(imageResult, data, appState) {
    window.eventBus.dispatch('screen:show', 'result-screen');

    // DOM references
    const resultTitle = document.getElementById('result-title');
    const resultStatus = document.getElementById('result-status');
    const resultDisplay = document.getElementById('result-display');
    const videoDisplay = document.getElementById('video-result-display');
    const qrContainer = document.getElementById('qr-container');
    const qrImage = document.getElementById('qr-image');

    const downloadImageBtn = document.getElementById('download-image-btn');
    const downloadVideoBtn = document.getElementById('download-video-btn');
    const downloadOriginalBtn = document.getElementById('download-original-btn');
    const downloadGeneratedBtn = document.getElementById('download-generated-btn');
    const continueEditingBtn = document.getElementById('continue-editing-btn');
    const goHomeBtn = document.getElementById('go-home-btn');

    resultTitle.textContent = '완성!';
    resultStatus.textContent = '이미지가 성공적으로 생성되었습니다.';

    // Hide generated button if no stylized images
    if (Object.keys(appState.stylizedImagesCache).length === 0) {
      downloadGeneratedBtn.style.display = 'none';
    } else {
      downloadGeneratedBtn.style.display = 'block';
    }

    // Reset content
    resultDisplay.innerHTML = '';
    videoDisplay.innerHTML = '';
    qrContainer.style.display = 'none';
    qrContainer.classList.remove('fade-in');

    // --- DISPLAY IMAGE ---
    const img = document.createElement('img');
    img.src = imageResult.result_path;
    img.alt = 'Final Result';
    img.classList.add('fade-in');

    // Only show image, hide video
    resultDisplay.style.display = 'flex';
    videoDisplay.style.display = 'none';
    resultDisplay.appendChild(img);

    // --- QR helper ---
    const showQr = (type) => {
      let qrPath = '';
      switch (type) {
        case 'image':
          qrPath = imageResult.qr_code_path;
          break;
        case 'video':
          qrPath = cachedVideoResult?.qr_code_path || '/qr/video';
          break;
        case 'original':
          qrPath = '/qr/original';
          break;
        case 'generated':
          qrPath = '/qr/generated';
          break;
      }

      if (!qrPath) {
        qrContainer.style.display = 'none';
        return;
      }

      qrImage.src = qrPath;
      qrContainer.style.display = 'block';
      qrContainer.classList.remove('fade-in');
      void qrContainer.offsetWidth; // trigger reflow
      qrContainer.classList.add('fade-in');
    };

    // --- IMAGE DOWNLOAD ---
    downloadImageBtn.onclick = () => {
      const a = document.createElement('a');
      a.href = imageResult.result_path;
      a.download = 'photobooth_result.png';
      a.click();
      showQr('image');

      // Ensure only image is visible
      resultDisplay.style.display = 'flex';
      videoDisplay.style.display = 'none';
    };

    // --- VIDEO DOWNLOAD (lazy compose, cached) ---
    downloadVideoBtn.onclick = async () => {
      try {
        downloadVideoBtn.disabled = true;
        downloadVideoBtn.textContent = cachedVideoResult
          ? '다운로드 중...'
          : '비디오 생성 중...';

        let videoResult = cachedVideoResult;

        // Small delay to ensure any file writes have completed
        await new Promise((resolve) => setTimeout(resolve, 300));

        if (!videoResult) {
          const d = new FormData();

          // Template
          if (appState.templateInfo.colored_template_path) {
            const blob = await (await fetch(appState.templateInfo.colored_template_path)).blob();
            d.append('template_file', blob, 'template.png');
          } else {
            d.append('template_path', appState.templateInfo.template_path);
          }

          // Metadata
          d.append('holes', JSON.stringify(appState.templateInfo.holes));
          d.append('stickers', JSON.stringify(appState.placedStickers));
          d.append('texts', JSON.stringify(appState.placedTexts));
          d.append('transformations', JSON.stringify(appState.templateInfo.transformations));

          // Videos
          for (const video_path of data.videos) {
            // Ensure the file exists and has finished uploading
            if (!video_path) continue;
            d.append('video_paths', video_path);
          }

          // Call API
          const r = await fetch('/compose_video', { method: 'POST', body: d });
          if (!r.ok) {
            const errData = await r.json();
            throw new Error(errData.detail || '서버 오류');
          }

          videoResult = await r.json();
          cachedVideoResult = videoResult;
        }

        // Show video
        resultDisplay.style.display = 'none';
        videoDisplay.style.display = 'flex';
        videoDisplay.innerHTML = '';

        const video = document.createElement('video');
        video.src = videoResult.result_path;
        video.controls = true;
        video.classList.add('fade-in');
        videoDisplay.appendChild(video);

        showQr('video');

        // Auto download
        const a = document.createElement('a');
        a.href = videoResult.result_path;
        a.download = 'photobooth_video.mp4';
        a.click();
      } catch (err) {
        console.error(err);
        alert(`비디오 생성/다운로드에 실패했습니다.\n\n오류: ${err.message}`);
      } finally {
        downloadVideoBtn.disabled = false;
        downloadVideoBtn.textContent = '비디오 다운로드';
      }
    };


    // --- ORIGINAL DOWNLOAD ---
    downloadOriginalBtn.onclick = async () => {
      try {
        downloadOriginalBtn.disabled = true;
        downloadOriginalBtn.textContent = '압축 중...';

        const formData = new FormData();
        appState.originalPhotos.forEach((photoBlob, i) => {
          formData.append('photos', photoBlob, `photo_${i}.jpg`);
        });

        // Upload images and create zip on server
        const response = await fetch('/zip_originals', { method: 'POST', body: formData });
        if (!response.ok) throw new Error('Failed to create zip file.');
        const zipResult = await response.json();

        // Display QR code
        qrImage.src = zipResult.qr_code_path;
        qrContainer.style.display = 'block';
        qrContainer.classList.remove('fade-in');
        void qrContainer.offsetWidth; // trigger reflow
        qrContainer.classList.add('fade-in');

        // Download the zip automatically
        const link = document.createElement('a');
        link.href = zipResult.result_path;
        link.download = 'original_photos.zip';
        link.click();

      } catch (err) {
        console.error(err);
        alert('원본 사진을 다운로드하는 데 실패했습니다.');
      } finally {
        downloadOriginalBtn.disabled = false;
        downloadOriginalBtn.textContent = '원본 다운로드';
      }
    };

    // --- GENERATED DOWNLOAD ---
    downloadGeneratedBtn.onclick = async () => {
      try {
        downloadGeneratedBtn.disabled = true;
        downloadGeneratedBtn.textContent = '압축 중...';

        const formData = new FormData();
        for (const key in appState.stylizedImagesCache) {
          const photoBlob = appState.stylizedImagesCache[key];
          const [photoIndex, prompt] = key.split('-');
          const safePrompt = prompt.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 20);
          formData.append('photos', photoBlob, `photo_${photoIndex}_${safePrompt}.jpg`);
        }

        const response = await fetch('/zip_originals', { method: 'POST', body: formData });
        if (!response.ok) throw new Error('Failed to create zip file.');
        const zipResult = await response.json();

        // Display QR code
        qrImage.src = zipResult.qr_code_path;
        qrContainer.style.display = 'block';
        qrContainer.classList.remove('fade-in');
        void qrContainer.offsetWidth; // trigger reflow
        qrContainer.classList.add('fade-in');

        // Download the zip automatically
        const link = document.createElement('a');
        link.href = zipResult.result_path;
        link.download = 'generated_photos.zip';
        link.click();

      } catch (err) {
        console.error(err);
        alert('생성된 사진을 다운로드하는 데 실패했습니다.');
      } finally {
        downloadGeneratedBtn.disabled = false;
        downloadGeneratedBtn.textContent = '생성된 파일 다운로드';
      }
    };

    // --- CONTINUE EDITING ---
    continueEditingBtn.onclick = () => {
      cachedVideoResult = null;
      window.eventBus.dispatch('review:edit-existing');
    };

    // --- GO MAIN MENU ---
    goHomeBtn.onclick = () => {
      cachedVideoResult = null;
      window.eventBus.dispatch('review:home');
    };
  }
});
