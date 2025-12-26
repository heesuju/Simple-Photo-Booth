window.initColorPicker = function (appState) {
    const colorPickerModal = document.getElementById('color-picker-modal');
    const colorPickerContainer = document.getElementById('color-picker-container');
    const colorHexInput = document.getElementById('color-hex-input');
    const colorPreviewBox = document.getElementById('color-preview-box'); // NEW
    const saveColorPresetCheckbox = document.getElementById('save-color-preset');
    const colorPickerConfirmBtn = document.getElementById('color-picker-confirm-btn');
    const colorPickerCancelBtn = document.getElementById('color-picker-cancel-btn');

    let colorPicker = null;
    let resolvePromise;

    function show(initialColor = '#ffffff') {
        return new Promise((resolve) => {
            resolvePromise = resolve;
            colorPickerModal.className = 'modal-visible';
            saveColorPresetCheckbox.checked = false;

            if (colorPreviewBox) {
                colorPreviewBox.style.backgroundColor = initialColor;
            }

            if (!colorPicker) {
                colorPicker = new iro.ColorPicker(colorPickerContainer, {
                    width: 250,
                    color: initialColor
                });

                colorPicker.on('color:change', function (color) {
                    colorHexInput.value = color.hexString;
                    if (colorPreviewBox) {
                        colorPreviewBox.style.backgroundColor = color.hexString;
                    }
                });

                colorHexInput.addEventListener('change', function () {
                    try {
                        colorPicker.color.hexString = this.value;
                        // update preview is handled by color:change event which fires on set?
                        // Usually yes. If not, we might need manual update.
                        // Iro.js documentation says it should fire.
                    } catch (e) { }
                });
            } else {
                colorPicker.color.hexString = initialColor;
                // Force update input and preview just in case
                colorHexInput.value = initialColor;
                if (colorPreviewBox) {
                    colorPreviewBox.style.backgroundColor = initialColor;
                }
            }
        });
    }

    function hide() {
        colorPickerModal.className = 'modal-hidden';
        if (resolvePromise) {
            resolvePromise(null);
        }
    }

    colorPickerConfirmBtn.addEventListener('click', async () => {
        const newColor = colorPicker.color.hexString;
        const savePreset = saveColorPresetCheckbox.checked;

        if (savePreset) {
            try {
                await fetch('/add_color', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ hex_code: newColor })
                });
            } catch (e) {
                console.error("Failed to save color:", e);
            }
        }

        if (resolvePromise) {
            resolvePromise({ color: newColor, saved: savePreset });
        }
        hide();
    });

    colorPickerCancelBtn.addEventListener('click', hide);

    return { show };
};