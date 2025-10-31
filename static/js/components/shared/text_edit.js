window.initTextEdit = function(appState, colorPicker) {
    const textInputModal = document.getElementById('text-input-modal');
    const textInputField = document.getElementById('text-input-field');
    const textInputConfirmBtn = document.getElementById('text-input-confirm-btn');
    const textInputCancelBtn = document.getElementById('text-input-cancel-btn');
    const fontSelect = document.getElementById('text-font-select');
    const colorPalette = document.getElementById('text-color-palette');
    const justificationButtons = document.querySelectorAll('.justification-btn');
    const textPreview = document.getElementById('text-preview');

    let resolvePromise;

    function show(existingTextData) {
        return new Promise((resolve) => {
            resolvePromise = resolve;

            let selectedFont = existingTextData ? existingTextData.font : null;
            let selectedColor = existingTextData ? existingTextData.color : '#000000';
            let selectedJustification = existingTextData ? existingTextData.justify : 'left';

            function updatePreview() {
                textPreview.textContent = textInputField.value;
                textPreview.style.fontFamily = selectedFont;
                textPreview.style.color = selectedColor;
                textPreview.style.textAlign = selectedJustification;
            }

            textInputModal.className = 'modal-visible';
            textInputField.value = existingTextData ? existingTextData.text : '';
            textInputField.focus();
            textInputField.addEventListener('input', updatePreview);

            // 1. Populate Fonts
            fontSelect.innerHTML = '';
            fetch('/fonts').then(r => r.json()).then(fonts => {
                if (fonts.length === 0) {
                    const option = document.createElement('option');
                    option.textContent = 'No fonts available';
                    fontSelect.appendChild(option);
                    updatePreview();
                    return;
                }

                fonts.forEach(font => {
                    const option = document.createElement('option');
                    option.value = font.font_name;
                    option.textContent = font.font_name;
                    option.style.fontFamily = font.font_name;
                    fontSelect.appendChild(option);
                });

                if (selectedFont) {
                    fontSelect.value = selectedFont;
                } else {
                    selectedFont = fonts[0].font_name;
                    fontSelect.value = selectedFont;
                }
                updatePreview();
            });

            fontSelect.addEventListener('change', () => {
                selectedFont = fontSelect.value;
                updatePreview();
            });

            // 2. Populate Colors
            colorPalette.innerHTML = '';
            fetch('/colors').then(r => r.json()).then(colors => {
                colors.forEach(color => {
                    const swatch = document.createElement('div');
                    swatch.className = 'palette-swatch';
                    swatch.style.backgroundColor = color.hex_code;
                    if (color.hex_code.toLowerCase() === selectedColor.toLowerCase()) {
                        swatch.classList.add('selected');
                    }
                    swatch.addEventListener('click', () => {
                        selectedColor = color.hex_code;
                        const currentSelected = colorPalette.querySelector('.selected');
                        if (currentSelected) {
                            currentSelected.classList.remove('selected');
                        }
                        swatch.classList.add('selected');
                        updatePreview();
                    });
                    colorPalette.appendChild(swatch);
                });

                // Add custom color button
                const addColorBtn = document.createElement('div');
                addColorBtn.id = 'add-color-btn';
                addColorBtn.className = 'palette-swatch';
                addColorBtn.style.border = '2px dashed #ccc';
                addColorBtn.style.backgroundColor = 'transparent';
                addColorBtn.addEventListener('click', async () => {
                    const result = await colorPicker.show(selectedColor);
                    if (result) {
                        selectedColor = result.color;
                        const currentSelected = colorPalette.querySelector('.selected');
                        if (currentSelected) {
                            currentSelected.classList.remove('selected');
                        }
                        const newSwatch = document.createElement('div');
                        newSwatch.className = 'palette-swatch selected';
                        newSwatch.style.backgroundColor = selectedColor;
                        colorPalette.insertBefore(newSwatch, addColorBtn);
                        updatePreview();
                    }
                });
                colorPalette.appendChild(addColorBtn);
                updatePreview();
            });

            // 3. Setup Justification Buttons
            justificationButtons.forEach(button => {
                button.classList.remove('selected');
                if (button.dataset.justify === selectedJustification) {
                    button.classList.add('selected');
                }
                button.addEventListener('click', () => {
                    selectedJustification = button.dataset.justify;
                    justificationButtons.forEach(btn => btn.classList.remove('selected'));
                    button.classList.add('selected');
                    updatePreview();
                });
            });

            const confirmHandler = () => {
                const newText = textInputField.value;
                selectedFont = fontSelect.value; // Get latest value on confirm

                const result = {
                    text: newText,
                    font: selectedFont,
                    color: selectedColor,
                    justify: selectedJustification
                };

                if (resolvePromise) {
                    resolvePromise(result);
                }
                hide();
            };

            const cancelHandler = () => {
                if (resolvePromise) {
                    resolvePromise(null);
                }
                hide();
            };

            const keydownHandler = (e) => {
                if (e.key === 'Escape') {
                    cancelHandler();
                }
            };

            const hide = () => {
                textInputModal.className = 'modal-hidden';
                textInputConfirmBtn.removeEventListener('click', confirmHandler);
                textInputCancelBtn.removeEventListener('click', cancelHandler);
                textInputField.removeEventListener('keydown', keydownHandler);
            };

            textInputConfirmBtn.addEventListener('click', confirmHandler);
            textInputCancelBtn.addEventListener('click', cancelHandler);
            textInputField.addEventListener('keydown', keydownHandler);
        });
    }

    return { show };
};