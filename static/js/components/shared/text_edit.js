window.initTextEdit = function (appState, colorPicker) {
    const textInputModal = document.getElementById('text-input-modal');
    const textInputField = document.getElementById('text-input-field');
    const textInputConfirmBtn = document.getElementById('text-input-confirm-btn');
    const textInputCancelBtn = document.getElementById('text-input-cancel-btn');
    const fontSelect = document.getElementById('text-font-select');
    const colorPalette = document.getElementById('text-color-palette');
    const justificationButtons = document.querySelectorAll('.justification-btn');
    const textPreview = document.getElementById('text-preview');
    const uploadFontBtn = document.getElementById('upload-font-btn');
    const fontUploadInput = document.getElementById('font-upload-input');

    let resolvePromise;

    // Function to load fonts from the server and populate the select dropdown
    async function loadFonts(selectedFont) {
        try {
            const response = await fetch('/fonts');
            const fonts = await response.json();

            fontSelect.innerHTML = '';

            if (fonts.length === 0) {
                const option = document.createElement('option');
                option.textContent = 'No fonts available';
                fontSelect.appendChild(option);
                return;
            }

            fonts.forEach(font => {
                const option = document.createElement('option');
                option.value = font.font_name;
                option.textContent = font.font_name;
                option.dataset.fontPath = font.font_path;
                option.style.fontFamily = `'${font.font_name}'`;
                fontSelect.appendChild(option);

                // Preload all fonts asynchronously
                const fontFace = new FontFace(font.font_name, `url(${font.font_path})`);
                fontFace.load().then(loaded_face => {
                    document.fonts.add(loaded_face);
                }).catch(error => {
                    console.warn(`Failed to preload font '${font.font_name}':`, error);
                });
            });

            if (selectedFont && fonts.some(f => f.font_name === selectedFont)) {
                fontSelect.value = selectedFont;
            }

            applyFontToPreview();

        } catch (error) {
            console.error('Error loading fonts:', error);
        }
    }

    // Function to apply the selected font to the text preview
    function applyFontToPreview() {
        const selectedFontName = fontSelect.value;
        if (selectedFontName) {
            // Assuming font files are served from /static/fonts/
            // And font_name in DB matches the filename without extension
            textPreview.style.fontFamily = `'${selectedFontName}', sans-serif`;
        } else {
            textPreview.style.fontFamily = 'sans-serif'; // Default fallback
        }
    }

    uploadFontBtn.addEventListener('click', () => {
        fontUploadInput.click();
    });

    fontUploadInput.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (file) {
            const formData = new FormData();
            formData.append('file', file);

            try {
                const response = await fetch('/upload_font', {
                    method: 'POST',
                    body: formData,
                });

                if (response.ok) {
                    const result = await response.json();
                    await loadFonts(result.font_name); // Reload fonts and select the new one
                    // Manually trigger change to update preview
                    fontSelect.dispatchEvent(new Event('change'));
                    applyFontToPreview();
                } else {
                    const errorData = await response.json();
                    alert(`Error uploading font: ${errorData.detail}`);
                }
            } catch (error) {
                alert('Network error during font upload.');
            } finally {
                fontUploadInput.value = '';
            }
        }
    });


    function show(existingTextData) {
        return new Promise(async (resolve) => {
            resolvePromise = resolve;

            let selectedFont = existingTextData ? existingTextData.font : null;
            let selectedColor = existingTextData ? existingTextData.color : '#000000';
            let selectedJustification = existingTextData ? existingTextData.justify : 'left';

            await loadFonts(selectedFont);
            if (!selectedFont) {
                selectedFont = fontSelect.value;
            }


            function updatePreview() {
                textPreview.textContent = textInputField.value;
                // textPreview.style.fontFamily set in applyFontToPreview
                textPreview.style.color = selectedColor;
                textPreview.style.textAlign = selectedJustification;
                applyFontToPreview();
            }

            textInputModal.className = 'modal-visible';
            textInputField.value = existingTextData ? existingTextData.text : '';
            textInputField.focus();
            textInputField.addEventListener('input', updatePreview);


            fontSelect.addEventListener('change', () => {
                selectedFont = fontSelect.value;
                updatePreview();
            });

            // Populate Colors
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