window.initReviewFilters = (appState, callbacks) => {
    const {
        renderPreview,
        showToast,
        updateAddFinalizeButtons
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
        addPresetConfirmBtn.addEventListener('click', async () => {
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

            const editingPresetId = addFilterPresetModal.dataset.editingPresetId;
            if (editingPresetId) {
                // Update existing preset
                try {
                    await fetch(`/filter_presets/${editingPresetId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name, filter_values: values })
                    });
                    delete addFilterPresetModal.dataset.editingPresetId;
                    addFilterPresetModal.className = 'modal-hidden';
                    loadFilterPresets();
                } catch (e) {
                    console.error("Failed to update filter preset:", e);
                }
            } else {
                // Create new preset
                addFilterPreset(name, values);
            }
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

            // Initialize selectedFilterPresetId if it doesn't exist
            if (!appState.hasOwnProperty('selectedFilterPresetId')) {
                appState.selectedFilterPresetId = null;
            }

            // Add button
            const addPresetContainer = document.createElement('div');
            addPresetContainer.className = 'filter-preset-container add-filter-preset-btn';
            addPresetContainer.textContent = '+';
            addPresetContainer.title = 'Add New Filter Preset';
            addPresetContainer.addEventListener('click', openAddFilterPresetModal);
            filterPresetStrip.appendChild(addPresetContainer);

            presets.forEach(preset => {
                const container = document.createElement('div');
                container.className = 'filter-preset-item';

                const presetContainer = document.createElement('div');
                presetContainer.className = 'filter-preset-container';

                const thumbnail = document.createElement('img');
                thumbnail.className = 'filter-preset-thumbnail';
                thumbnail.src = firstPhotoUrl;
                const values = preset.values;
                thumbnail.style.filter = `brightness(${values.brightness}%) contrast(${values.contrast}%) saturate(${values.saturate}%) blur(${values.blur}px)`;

                // Check if this preset is currently selected
                if (appState.selectedFilterPresetId !== null && appState.selectedFilterPresetId === preset.id) {
                    presetContainer.classList.add('selected');
                }

                presetContainer.addEventListener('click', () => {
                    appState.selectedFilterPresetId = preset.id;
                    applyFilterPreset(preset.values);
                });

                const menuButton = document.createElement('button');
                menuButton.className = 'filter-preset-menu-button';
                menuButton.innerHTML = '⋮';
                menuButton.title = 'Options';

                const dropdown = document.createElement('div');
                dropdown.className = 'filter-preset-menu-dropdown';

                const editOption = document.createElement('button');
                editOption.className = 'filter-preset-menu-option';
                editOption.innerHTML = '<span>✏️</span><span>Edit</span>';
                editOption.addEventListener('click', (e) => {
                    e.stopPropagation();
                    dropdown.classList.remove('show');
                    openEditFilterPresetModal(preset);
                });

                const removeOption = document.createElement('button');
                removeOption.className = 'filter-preset-menu-option';
                removeOption.innerHTML = '<span>🗑️</span><span>Remove</span>';
                removeOption.addEventListener('click', (e) => {
                    e.stopPropagation();
                    dropdown.classList.remove('show');
                    removeFilterPreset(preset.id);
                });

                dropdown.appendChild(editOption);
                dropdown.appendChild(removeOption);

                menuButton.addEventListener('click', (e) => {
                    e.stopPropagation();

                    // Close all other open dropdowns
                    document.querySelectorAll('.filter-preset-menu-dropdown.show').forEach(d => {
                        if (d !== dropdown) d.classList.remove('show');
                    });

                    dropdown.classList.toggle('show');
                });

                presetContainer.appendChild(thumbnail);
                container.appendChild(presetContainer);
                container.appendChild(menuButton);
                container.appendChild(dropdown);
                filterPresetStrip.appendChild(container);
            });
        } catch (e) {
            console.error("Failed to load filter presets:", e);
        }

        // Apply current filters to preview
        applyPhotoFilters();
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

    function openAddFilterPresetModal() {
        const presetFilterControls = document.getElementById('preset-filter-controls');
        const filterControls = document.getElementById('filter-controls');
        presetFilterControls.innerHTML = filterControls.innerHTML;

        const presetPreview = document.getElementById('preset-preview');
        const firstPhoto = appState.capturedPhotos[0];
        if (firstPhoto) {
            const imageUrl = URL.createObjectURL(firstPhoto);
            presetPreview.style.backgroundImage = `url(${imageUrl})`;

            const updatePreviewFilters = () => {
                const values = {};
                presetFilterControls.querySelectorAll('input[type="range"]').forEach(slider => {
                    values[slider.dataset.filter] = parseInt(slider.value, 10);
                });
                const filterString = `brightness(${values.brightness}%) contrast(${values.contrast}%) saturate(${values.saturate}%) blur(${values.blur}px)`;
                presetPreview.style.filter = filterString;
            };

            presetFilterControls.addEventListener('input', updatePreviewFilters);
            updatePreviewFilters();
        }
        addFilterPresetModal.className = 'modal-visible';
    }

    function openEditFilterPresetModal(preset) {
        const presetFilterControls = document.getElementById('preset-filter-controls');
        const filterControls = document.getElementById('filter-controls');
        presetFilterControls.innerHTML = filterControls.innerHTML;

        // Populate with preset values
        const newPresetNameInput = document.getElementById('new-preset-name');
        newPresetNameInput.value = preset.name;

        Object.keys(preset.values).forEach(key => {
            const slider = presetFilterControls.querySelector(`input[data-filter="${key}"]`);
            if (slider) {
                slider.value = preset.values[key];
            }
        });

        const presetPreview = document.getElementById('preset-preview');
        const firstPhoto = appState.capturedPhotos[0];
        if (firstPhoto) {
            const imageUrl = URL.createObjectURL(firstPhoto);
            presetPreview.style.backgroundImage = `url(${imageUrl})`;

            const updatePreviewFilters = () => {
                const values = {};
                presetFilterControls.querySelectorAll('input[type="range"]').forEach(slider => {
                    values[slider.dataset.filter] = parseInt(slider.value, 10);
                });
                const filterString = `brightness(${values.brightness}%) contrast(${values.contrast}%) saturate(${values.saturate}%) blur(${values.blur}px)`;
                presetPreview.style.filter = filterString;
            };

            presetFilterControls.addEventListener('input', updatePreviewFilters);
            updatePreviewFilters();
        }

        // Store preset ID for updating instead of creating new
        addFilterPresetModal.dataset.editingPresetId = preset.id;
        addFilterPresetModal.className = 'modal-visible';
    }

    async function removeFilterPreset(presetId) {
        if (!confirm('Are you sure you want to delete this filter preset?')) {
            return;
        }

        try {
            await fetch(`/filter_presets?preset_id=${presetId}`, {
                method: 'DELETE'
            });
            loadFilterPresets();
        } catch (e) {
            console.error("Failed to remove filter preset:", e);
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
        loadFilterPresets(); // Refresh to update selection indicator

        // Update action buttons to show reset button if needed
        if (typeof updateAddFinalizeButtons !== 'undefined') {
            updateAddFinalizeButtons();
        }
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



    function resetFilters() {
        appState.filters = { brightness: 100, contrast: 100, saturate: 100, warmth: 100, sharpness: 0, blur: 0, grain: 0 };
        appState.selectedFilterPresetId = null; // Clear selection
        for (const filter in appState.filters) {
            const slider = document.querySelector(`#filter-controls input[data-filter="${filter}"]`);
            if (slider) {
                slider.value = appState.filters[filter];
            }
        }
        applyPhotoFilters();
        loadFilterPresets(); // Refresh to update selection indicator
        updateAddFinalizeButtons(); // Hide reset button
    }

    // Public API
    return {
        loadFilterPresets,
        addFilterPreset,
        applyFilterPreset,
        applyPhotoFilters,
        resetFilters
    };
};
