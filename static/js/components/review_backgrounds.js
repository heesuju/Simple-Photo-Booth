window.initReviewBackgrounds = (appState, callbacks) => {
    const {
        renderPreview,
        renderReviewThumbnails,
        stripContainer,
        stripBackBtn,
        genericAddBtn,
        finalizeBtn,
        showToast
    } = callbacks;

    // State Initialization
    appState.backgroundColors = appState.backgroundColors || new Array(appState.capturedPhotos.length).fill(null);

    // Cache for raw BG removed blobs (without color fill)
    // Key: photoIndex (int) -> Blob
    // We will composite color on the fly in CSS or on a canvas if needed, 
    // but for simple preview, setting backgroundColor on the img element is easiest if the image is transparent.
    appState.rawBgRemovedBlobs = appState.rawBgRemovedBlobs || {};

    const backgroundPanel = document.createElement('div');
    backgroundPanel.id = 'background-color-panel';
    backgroundPanel.className = 'strip-panel';
    backgroundPanel.dataset.panel = 'backgrounds';
    stripContainer.appendChild(backgroundPanel);

    // Current context
    let currentPhotoIndex = -1;

    async function showBackgroundPanel(photoIndex) {
        currentPhotoIndex = photoIndex;
        backgroundPanel.innerHTML = ''; // Clear

        // Hide other panels
        stripContainer.querySelectorAll('.strip-panel').forEach(p => p.classList.remove('show'));

        // Setup Header/UI if needed, or just swatches
        // We reuse the look of the color palette panel

        // 1. None Option (Restore Original)
        const noneOption = document.createElement('div');
        noneOption.className = 'palette-swatch';
        noneOption.style.backgroundColor = '#ddd'; // Placeholder for "None"
        noneOption.style.backgroundImage = 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)';
        noneOption.style.backgroundSize = '10px 10px';
        noneOption.style.backgroundPosition = '0 0, 0 5px, 5px -5px, -5px 0px';
        noneOption.title = 'Original';
        noneOption.addEventListener('click', () => applyBackgroundColor(currentPhotoIndex, null));
        backgroundPanel.appendChild(noneOption);

        // 2. Load Colors
        try {
            const r = await fetch('/colors');
            const colors = await r.json();
            colors.forEach(colorObj => {
                const swatch = document.createElement('div');
                swatch.className = 'palette-swatch';
                swatch.style.backgroundColor = colorObj.hex_code;
                swatch.addEventListener('click', () => applyBackgroundColor(currentPhotoIndex, colorObj.hex_code));
                backgroundPanel.appendChild(swatch);
            });
        } catch (e) {
            console.error("Failed to load colors:", e);
        }

        backgroundPanel.classList.add('show');
        stripBackBtn.style.display = 'block';

        // Manage Main Action Buttons
        genericAddBtn.style.display = 'none'; // No "Add" for this specific tool
        finalizeBtn.style.display = 'none';
    }

    async function applyBackgroundColor(index, color) {
        appState.backgroundColors[index] = color;

        if (color === null) {

        } else {
            if (!appState.rawBgRemovedBlobs[index]) {
                try {

                    const wrappers = document.querySelectorAll('.preview-photo-wrapper');
                    const targetWrapper = document.querySelectorAll('.preview-photo-wrapper')[appState.photoAssignments.indexOf(appState.capturedPhotos[index])];

                    // Allow UI to update
                    if (showToast) showToast('Removing background...', 'info');

                    const currentBlob = appState.capturedPhotos[index];
                    const formData = new FormData();
                    formData.append('file', currentBlob);

                    const res = await fetch('/remove_background', { method: 'POST', body: formData });
                    if (!res.ok) throw new Error('Failed to remove background');

                    const blob = await res.blob();
                    appState.rawBgRemovedBlobs[index] = blob;

                } catch (e) {
                    console.error(e);
                    if (showToast) showToast('Failed to remove background', 'error');
                    appState.backgroundColors[index] = null; // Revert
                    return;
                }
            }
        }

        applyBackgroundsToPreview();
        renderReviewThumbnails(); // Update UI if we want to show an indicator on the thumb
    }

    function applyBackgroundsToPreview() {
        // Iterate over assignments to find DOM elements
        appState.photoAssignments.forEach((assignedBlob, hIdx) => {
            const pIdx = appState.capturedPhotos.indexOf(assignedBlob);

            if (pIdx === -1) return;

            const wrappers = document.querySelectorAll('.preview-photo-wrapper');
            const wrapper = wrappers[hIdx];
            if (!wrapper) return;

            const img = wrapper.querySelector('.preview-photo-img');
            const color = appState.backgroundColors[pIdx];

            if (color && appState.rawBgRemovedBlobs[pIdx]) {
                const bgRemovedUrl = URL.createObjectURL(appState.rawBgRemovedBlobs[pIdx]);

                // Only update src if it changed to avoid flicker? 
                // Browser handles blob URL caching usually.
                if (img.src !== bgRemovedUrl) {
                    img.src = bgRemovedUrl;
                }

                wrapper.style.backgroundColor = color;
            } else {
                // Restore original (cropped/stylized) blob
                const originalUrl = URL.createObjectURL(appState.capturedPhotos[pIdx]);
                if (img.src !== originalUrl) {
                    img.src = originalUrl;
                }
                wrapper.style.backgroundColor = 'transparent';
            }
        });
    }

    return {
        showBackgroundPanel,
        applyBackgroundColor,
        applyBackgroundsToPreview
    };
};
