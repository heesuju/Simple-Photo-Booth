window.eventBus.on('app:init', (appState) => {

  let cachedVideoResult = null; // store composed video after first creation
  let currentSessionId = null; // Store ID when viewing a past session
  let currentSessionData = null; // Store data when viewing a past session

  window.eventBus.on('review:finalize', async (data) => {
    const finalizeBtn = document.getElementById('finalize-btn');
    if (finalizeBtn) finalizeBtn.disabled = true;

    // Reset session state for new result
    currentSessionId = null;
    currentSessionData = null;

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

      // Pass video paths if available
      if (data.videos && data.videos.length > 0) {
        d.append('video_paths', JSON.stringify(data.videos));
      }

      appState.photoAssignments.forEach((b, i) => {
        d.append('photos', b, `photo_${i}.jpg`);
      });

      const r = await fetch('/compose_image', { method: 'POST', body: d });
      if (!r.ok) throw new Error((await r.json()).detail);
      return r.json();
    })();

    try {
      const imageResult = await imageComposePromise;
      // Store the session ID returned for the NEW session
      currentSessionId = imageResult.session_id;
      displayFinalResult(imageResult, data, appState);
    } catch (e) {
      console.error(e);
      if (finalizeBtn) finalizeBtn.disabled = false;
    }
  });

  // Handle loading a past session
  window.eventBus.on('session:load', async (sessionId) => {
    loadSession(sessionId);
  });

  async function loadSession(sessionId) {
    try {
      const response = await fetch(`/session/${sessionId}`);
      if (!response.ok) throw new Error('Failed to load session');
      const sessionData = await response.json();

      currentSessionId = sessionId;
      currentSessionData = sessionData;
      cachedVideoResult = null; // Reset video cache

      if (sessionData.video_result_path) {
        cachedVideoResult = {
          result_path: sessionData.video_result_path,
          qr_code_path: sessionData.video_qr_path || sessionData.qr_code_path,
          session_id: sessionId
        };
      }

      // Reconstruct a mock result object for display
      const imageResult = {
        result_path: sessionData.result_path,
        qr_code_path: sessionData.qr_code_path,
        session_id: sessionId
      };

      // Reconstruct mock data/appState
      // We only need what's required for display and downloads
      const mockData = { videos: sessionData.videos || [] };
      const mockAppState = {
        stylizedImagesCache: {}, // We assume no generated images for past sessions for now
        templateInfo: {
          holes: sessionData.holes,
          transformations: sessionData.transformations,
          template_path: sessionData.template_path
        },
        placedStickers: sessionData.stickers,
        placedTexts: sessionData.texts,
        filters: sessionData.filters,
        removeBackground: sessionData.remove_background,
        isStreamInverted: false // default
      };

      displayFinalResult(imageResult, mockData, mockAppState);

    } catch (err) {
      console.error('Error loading session:', err);
      alert('Failed to load past session.');
    }
  }

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

    if (!data.videos || Object.keys(data.videos).length === 0) {
      downloadVideoBtn.style.display = 'none';
    } else {
      downloadVideoBtn.style.display = 'block';
    }

    // If viewing a past session, hide "Continue Editing"
    if (currentSessionData) {
      continueEditingBtn.style.display = 'none';
      downloadGeneratedBtn.style.display = 'none'; // Not supported for past sessions yet
    } else {
      continueEditingBtn.style.display = 'inline-block';
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
          if (currentSessionId && currentSessionData) {
            // For sessions requests, we generate QR in the response of zip_session_originals
            // So this logic might be handled in the onclick handler
            qrPath = null;
          } else {
            qrPath = '/qr/original';
          }
          break;
        case 'generated':
          qrPath = '/qr/generated';
          break;
      }

      if (!qrPath) {
        if (type !== 'video' && type !== 'original') qrContainer.style.display = 'none';
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

          // Generate session ID for progress tracking
          // If we are viewing a past session, use a NEW tracking ID, but we operate on PAST session data
          const progressIds = Math.random().toString(36).substring(2) + Date.now().toString(36);
          d.append('session_id', progressIds);
          console.log('[VideoProgress] Session ID:', progressIds);

          // Template
          // Logic for past session vs new session
          if (currentSessionData) {
            // Use stored paths
            if (currentSessionData.template_path.startsWith('static')) {
              d.append('template_path', currentSessionData.template_path);
            } else {
              d.append('template_path', currentSessionData.template_path);
            }
          } else {
            if (appState.templateInfo.colored_template_path) {
              const blob = await (await fetch(appState.templateInfo.colored_template_path)).blob();
              d.append('template_file', blob, 'template.png');
            } else {
              d.append('template_path', appState.templateInfo.template_path);
            }
          }

          // Metadata
          d.append('holes', JSON.stringify(appState.templateInfo.holes));
          d.append('stickers', JSON.stringify(appState.placedStickers));
          d.append('texts', JSON.stringify(appState.placedTexts));
          d.append('transformations', JSON.stringify(appState.templateInfo.transformations));
          d.append('is_inverted', appState.isStreamInverted);

          // Videos
          // For past sessions, appState is mock. data.videos has paths from session JSON.
          for (const video_path of data.videos) {
            if (!video_path) continue;
            d.append('video_paths', video_path);
          }

          // Create progress overlay
          const progressOverlay = document.createElement('div');
          progressOverlay.id = 'video-progress-overlay';
          progressOverlay.innerHTML = `
            <div class="progress-content">
              <h3>비디오 생성 중...</h3>
              <div class="progress-bar">
                <div class="progress-fill" id="progress-fill"></div>
              </div>
              <div class="progress-text" id="progress-text">0%</div>
            </div>
          `;
          document.body.appendChild(progressOverlay);

          const progressFill = document.getElementById('progress-fill');
          const progressText = document.getElementById('progress-text');

          // Start polling for progress
          const pollInterval = setInterval(async () => {
            try {
              const progressRes = await fetch(`/video_progress/${progressIds}`);
              const progressData = await progressRes.json();
              const progress = progressData.progress || 0;

              console.log('[VideoProgress] Polling response:', progress);

              progressFill.style.width = `${progress}%`;
              progressText.textContent = `${progress}%`;

              if (progress >= 100) {
                clearInterval(pollInterval);
              }
            } catch (err) {
              console.error('[VideoProgress] Error polling progress:', err);
            }
          }, 500);

          const composePromise = fetch('/compose_video', { method: 'POST', body: d });

          // Wait for composition to complete
          const r = await composePromise;

          clearInterval(pollInterval);
          progressOverlay.remove();

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

        // Update QR
        qrImage.src = videoResult.qr_code_path;
        qrContainer.style.display = 'block';
        qrContainer.classList.remove('fade-in');
        void qrContainer.offsetWidth; // trigger reflow
        qrContainer.classList.add('fade-in');

        // Auto download
        const a = document.createElement('a');
        a.href = videoResult.result_path;
        a.download = 'photobooth_video.mp4';
        a.click();
      } catch (err) {
        console.error(err);
        alert(`비디오 생성/다운로드에 실패했습니다.\n\n오류: ${err.message}`);

        // Clean up overlay if error
        const overlay = document.getElementById('video-progress-overlay');
        if (overlay) overlay.remove();
      } finally {
        downloadVideoBtn.disabled = false;
        downloadVideoBtn.textContent = '비디오';
      }
    };


    // --- ORIGINAL DOWNLOAD ---
    downloadOriginalBtn.onclick = async () => {
      try {
        downloadOriginalBtn.disabled = true;
        downloadOriginalBtn.textContent = '압축 중...';

        let zipResult;

        if (currentSessionId) {
          // Use new session zip endpoint
          const formData = new FormData();
          formData.append('session_id', currentSessionId);

          const response = await fetch('/zip_session_originals', { method: 'POST', body: formData });
          if (!response.ok) throw new Error('Failed to create zip from session.');
          zipResult = await response.json();

        } else {
          // Live session - uses blobs in memory
          const formData = new FormData();
          appState.originalPhotos.forEach((photoBlob, i) => {
            formData.append('photos', photoBlob, `photo_${i}.jpg`);
          });

          // Upload images and create zip on server
          const response = await fetch('/zip_originals', { method: 'POST', body: formData });
          if (!response.ok) throw new Error('Failed to create zip file.');
          zipResult = await response.json();
        }

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
        downloadOriginalBtn.textContent = '원본';
      }
    };

    // --- GENERATED DOWNLOAD ---
    downloadGeneratedBtn.onclick = async () => {
      // Not supported for past sessions yet as we don't save generated variations
      // We check currentSessionData (which is only set for past sessions) rather than currentSessionId
      if (currentSessionData) return;

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
        downloadGeneratedBtn.textContent = '수정본';
      }
    };

    // --- CONTINUE EDITING ---
    continueEditingBtn.onclick = () => {
      if (currentSessionId) return; // Should be hidden, but safety check
      cachedVideoResult = null;
      window.eventBus.dispatch('review:edit-existing');
    };

    // --- GO MAIN MENU ---
    goHomeBtn.onclick = () => {
      cachedVideoResult = null;
      currentSessionId = null;
      currentSessionData = null;
      window.eventBus.dispatch('review:home');
    };
  }
});

