window.initReviewFilters = (appState, callbacks) => {
    const {
        renderPreview,
        showToast
    } = callbacks;

    // DOM Elements
    const filterControls = document.getElementById('filter-controls');
    const addPresetConfirmBtn = document.getElementById('add-preset-confirm-btn');
    const addPresetCancelBtn = document.getElementById('add-preset-cancel-btn');
    const addFilterPresetModal = document.getElementById('add-filter-preset-modal');
    // const removeBgCheckbox = document.getElementById('remove-bg-checkbox'); // Removed
    const filterPresetStrip = document.getElementById('filter-preset-strip');

    // Attach Event Listeners
    if (filterControls) {
        filterControls.addEventListener('input', (e) => {
            if (e.target.type === 'range') {
                appState.filters[e.target.dataset.filter] = parseInt(e.target.value, 10);
                applyPhotoFilters();
            }
        });
    }

    if (addPresetConfirmBtn) {
        addPresetConfirmBtn.addEventListener('click', () => {
            const name = document.getElementById('new-preset-name').value;
            if (!name) {
                alert('Please enter a name for the preset.');
                return;
            }

            const presetFilterControls = document.getElementById('preset-filter-controls');
            const values = {};
            presetFilterControls.querySelectorAll('input[type="range"]').forEach(slider => {
                values[slider.dataset.filter] = parseInt(slider.value, 10);
            });

            addFilterPreset(name, values);
        });
    }

    if (addPresetCancelBtn) {
        addPresetCancelBtn.addEventListener('click', () => {
            addFilterPresetModal.className = 'modal-hidden';
        });
    }



    // --- Core Functions ---

    async function loadFilterPresets() {
        try {
            const response = await fetch('/filter_presets');
            const presets = await response.json();
            filterPresetStrip.innerHTML = '';

            const firstPhoto = appState.capturedPhotos[0];
            const firstPhotoUrl = firstPhoto ? URL.createObjectURL(firstPhoto) : '';

            const nonePresetContainer = document.createElement('div');
            nonePresetContainer.className = 'filter-preset-container';

            const nonePresetItem = document.createElement('div');
            nonePresetItem.className = 'style-strip-item';

            const noneThumbnail = document.createElement('img');
            noneThumbnail.className = 'filter-preset-thumbnail';
            noneThumbnail.src = firstPhotoUrl;

            const noneName = document.createElement('div');
            noneName.className = 'filter-preset-label';
            noneName.textContent = 'None';

            nonePresetItem.appendChild(noneThumbnail);
            nonePresetContainer.appendChild(nonePresetItem);
            nonePresetContainer.appendChild(noneName);

            nonePresetContainer.addEventListener('click', () => {
                appState.filters = { brightness: 100, contrast: 100, saturate: 100, warmth: 100, sharpness: 0, blur: 0, grain: 0 };
                for (const filter in appState.filters) {
                    const slider = document.querySelector(`#filter-controls input[data-filter="${filter}"]`);
                    if (slider) {
                        slider.value = appState.filters[filter];
                    }
                }
                applyPhotoFilters();
            });
            filterPresetStrip.appendChild(nonePresetContainer);

            presets.forEach(preset => {
                const presetContainer = document.createElement('div');
                presetContainer.className = 'filter-preset-container';

                const presetItem = document.createElement('div');
                presetItem.className = 'style-strip-item';

                const thumbnail = document.createElement('img');
                thumbnail.className = 'filter-preset-thumbnail';
                thumbnail.src = firstPhotoUrl;
                const values = preset.values;
                thumbnail.style.filter = `brightness(${values.brightness}%) contrast(${values.contrast}%) saturate(${values.saturate}%) blur(${values.blur}px)`;

                const name = document.createElement('div');
                name.className = 'filter-preset-label';
                name.textContent = preset.name;

                presetItem.appendChild(thumbnail);
                presetContainer.appendChild(presetItem);
                presetContainer.appendChild(name);

                presetContainer.addEventListener('click', () => applyFilterPreset(preset.values));
                filterPresetStrip.appendChild(presetContainer);
            });
        } catch (e) {
            console.error("Failed to load filter presets:", e);
        }
    }

    async function addFilterPreset(name, values) {
        try {
            await fetch('/filter_presets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, filter_values: values })
            });
            addFilterPresetModal.className = 'modal-hidden';
            loadFilterPresets();
        } catch (e) {
            console.error("Failed to add filter preset:", e);
        }
    }

    async function applyFilterPreset(values) {
        appState.filters = { ...values };
        for (const filter in values) {
            const slider = document.querySelector(`#filter-controls input[data-filter="${filter}"]`);
            if (slider) {
                slider.value = values[filter];
            }
        }
        applyPhotoFilters(); // Apply CSS filters for instant preview

        for (const pIdx of appState.selectedForRetake) {
            const imageBlob = appState.originalPhotos[pIdx];
            const formData = new FormData();
            formData.append('file', imageBlob, 'photo.png');
            formData.append('filters', JSON.stringify(values));

            try {
                const response = await fetch('/apply_filters_to_image', {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Failed to apply filters: ${errorText}`);
                }

                const newImageBlob = await response.blob();
                const newImageUrl = URL.createObjectURL(newImageBlob);

                const assignmentIndex = appState.photoAssignments.findIndex(p => p === appState.capturedPhotos[pIdx]);
                appState.capturedPhotos[pIdx] = newImageBlob;
                if (assignmentIndex !== -1) {
                    appState.photoAssignments[assignmentIndex] = newImageBlob;
                }

                const thumb = document.getElementById('review-thumbnails').children[pIdx];
                if (thumb) {
                    thumb.src = newImageUrl;
                }
            } catch (error) {
                console.error('Error applying filters:', error);
                if (showToast) {
                    showToast('필터 적용 중 오류가 발생했습니다.', 'error');
                } else {
                    alert('An error occurred while applying filters. Please check the console for details.');
                }
            }
        }
        renderPreview();
    }

    function applyPhotoFilters() {
        const baseFilterString = `brightness(${appState.filters.brightness}%) contrast(${appState.filters.contrast}%) saturate(${appState.filters.saturate}%) blur(${appState.filters.blur}px)`;
        document.querySelectorAll('.preview-photo-img').forEach(img => {
            img.style.filter = baseFilterString;
        });

        let wrapperFilterString = '';

        if (appState.filters.sharpness > 0) {
            const amount = appState.filters.sharpness / 100.0;
            const kernel = [
                0, -amount, 0,
                -amount, 1 + 4 * amount, -amount,
                0, -amount, 0
            ].join(' ');
            document.getElementById('sharpen-matrix').setAttribute('kernelMatrix', kernel);
            wrapperFilterString += ` url(#sharpen-filter)`;
        } else {
            document.getElementById('sharpen-matrix').setAttribute('kernelMatrix', '0 0 0 0 1 0 0 0 0');
        }

        if (appState.filters.warmth !== 100) {
            const amount = (appState.filters.warmth - 100) / 510.0;
            const matrix = `1 0 0 0 ${amount} 0 1 0 0 0 0 0 1 0 ${-amount} 0 0 0 1 0`;
            document.getElementById('warmth-matrix').setAttribute('values', matrix);
            wrapperFilterString += ` url(#warmth-filter)`;
        } else {
            document.getElementById('warmth-matrix').setAttribute('values', '1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0');
        }

        document.querySelectorAll('.preview-photo-wrapper').forEach(wrapper => {
            wrapper.style.filter = wrapperFilterString.trim();
            const grainAmount = appState.filters.grain / 100;
            if (grainAmount > 0) {
                wrapper.style.setProperty('--grain-opacity', grainAmount);
                wrapper.classList.add('grain-effect');
            } else {
                wrapper.classList.remove('grain-effect');
            }
        });
    }



    // Public API
    return {
        loadFilterPresets,
        addFilterPreset,
        applyFilterPreset,
        applyPhotoFilters
    };
};
