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
    const filterPresetStrip = document.getElementById('filter-preset-strip');

    // Attach Event Listeners
    if (filterControls) {
        filterControls.addEventListener('input', (e) => {
            if (e.target.type === 'range') {
                const filterName = e.target.dataset.filter;
                const value = parseInt(e.target.value, 10);

                // Update Global UI State
                appState.filters[filterName] = value;

                // Update Manager for ALL photos (Global Mode behavior)
                // In future, could support updating only selected
                if (appState.transformManager) {
                    for (let i = 0; i < appState.capturedPhotos.length; i++) {
                        // We get current filters, update one value, set back
                        const t = appState.transformManager.getTransform(i);
                        const newFilters = { ...t.filters.values, [filterName]: value };
                        appState.transformManager.setFilters(i, newFilters);
                    }
                }

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
        // We clone inputs manually or innerHTML? innerHTML is fine for structure.
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

        // Update sliders
        for (const filter in values) {
            const slider = document.querySelector(`#filter-controls input[data-filter="${filter}"]`);
            if (slider) {
                slider.value = values[filter];
            }
        }

        // Update Manager
        if (appState.transformManager) {
            // Apply to SELECTED or ALL
            const targets = (appState.selectedForRetake.length > 0) ? appState.selectedForRetake : appState.capturedPhotos.map((_, i) => i);

            targets.forEach(i => {
                appState.transformManager.setFilters(i, values);
            });
        }

        applyPhotoFilters();
        loadFilterPresets();

        if (typeof updateAddFinalizeButtons !== 'undefined') {
            updateAddFinalizeButtons();
        }
    }

    function applyPhotoFilters() {
        // Iterate over preview photos in DOM
        const wrappers = document.querySelectorAll('.preview-photo-wrapper');

        wrappers.forEach(wrapper => {
            const pIdx = parseInt(wrapper.dataset.photoIndex, 10);
            if (isNaN(pIdx)) return;

            let filters = appState.filters; // Default to global UI state
            if (appState.transformManager) {
                filters = appState.transformManager.getTransform(pIdx).filters.values;
            }

            // Construct Base CSS String
            const baseFilterString = `brightness(${filters.brightness}%) contrast(${filters.contrast}%) saturate(${filters.saturate}%) blur(${filters.blur}px)`;

            const img = wrapper.querySelector('.preview-photo-img');
            if (img) img.style.filter = baseFilterString;

            // Handle Global SVG Filters (Limitation: uses values from THIS photo, so if photos differ, last one wins or we pick one)
            // Ideally we pick valid values.
            // If all are same, it works.

            let wrapperFilterString = '';

            // Optimization: Update global SVG only if this is the "focused" photo? 
            // Or just update it based on appState.filters (Global UI)?
            // Using appState.filters ensures consistency with sliders.
            // But if we have per-photo settings, we can't truly support it with global SVG.
            // We'll stick to appState.filters for the SVG config to avoid flickering.

            const globalFilters = appState.filters;

            if (globalFilters.sharpness > 0) {
                const amount = globalFilters.sharpness / 100.0;
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

            if (globalFilters.warmth !== 100) {
                const amount = (globalFilters.warmth - 100) / 510.0;
                const matrix = `1 0 0 0 ${amount} 0 1 0 0 0 0 0 1 0 ${-amount} 0 0 0 1 0`;
                document.getElementById('warmth-matrix').setAttribute('values', matrix);
                wrapperFilterString += ` url(#warmth-filter)`;
            } else {
                document.getElementById('warmth-matrix').setAttribute('values', '1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0');
            }

            if (wrapperFilterString) {
                // Determine if we append or replace?
                // The wrapper holds the SVG filters.
                // Note: The previous code replaced wrapper.style.filter.
                wrapper.style.filter = wrapperFilterString.trim();
            } else {
                wrapper.style.filter = '';
            }

            // Grain (Per Element)
            const grainAmount = filters.grain / 100;
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
        appState.selectedFilterPresetId = null;

        for (const filter in appState.filters) {
            const slider = document.querySelector(`#filter-controls input[data-filter="${filter}"]`);
            if (slider) {
                slider.value = appState.filters[filter];
            }
        }

        if (appState.transformManager) {
            for (let i = 0; i < appState.capturedPhotos.length; i++) {
                appState.transformManager.setFilters(i, appState.filters);
            }
        }

        applyPhotoFilters();
        loadFilterPresets();
        updateAddFinalizeButtons();
    }

    return {
        loadFilterPresets,
        addFilterPreset,
        applyFilterPreset,
        applyPhotoFilters,
        resetFilters
    };
};
