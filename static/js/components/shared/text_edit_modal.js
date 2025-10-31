window.initTextEditModal = (appState) => {
    const textInputModal = document.getElementById('text-input-modal');
    const textFontSelect = document.getElementById('text-font-select');
    const uploadFontBtn = document.getElementById('upload-font-btn');
    const fontUploadInput = document.getElementById('font-upload-input');
    const textPreview = document.getElementById('text-preview'); // Assuming this exists for preview

    let currentActiveHole = null; // To store the currently active hole for text editing

    // Function to load fonts from the server and populate the select dropdown
    async function loadFonts() {
        try {
            const response = await fetch('/fonts');
            const fonts = await response.json();

            // Clear existing options
            textFontSelect.innerHTML = '';

            // Add a default option
            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = '기본 폰트';
            textFontSelect.appendChild(defaultOption);

            fonts.forEach(font => {
                const option = document.createElement('option');
                option.value = font.font_name;
                option.textContent = font.font_name;
                textFontSelect.appendChild(option);
            });

            // If a font was previously selected for the active hole, re-select it
            if (currentActiveHole && currentActiveHole.text && currentActiveHole.text.font) {
                textFontSelect.value = currentActiveHole.text.font;
            }

            // Apply the selected font to the preview
            applyFontToPreview();

        } catch (error) {
            console.error('Error loading fonts:', error);
        }
    }

    // Function to apply the selected font to the text preview
    function applyFontToPreview() {
        const selectedFontName = textFontSelect.value;
        if (selectedFontName) {
            // Assuming font files are served from /static/fonts/
            // And font_name in DB matches the filename without extension
            textPreview.style.fontFamily = `'${selectedFontName}', sans-serif`;
            // Dynamically load the font if not already loaded
            const fontPath = `/static/fonts/${selectedFontName}.ttf`; // Assuming .ttf, might need to be dynamic
            const fontFace = new FontFace(selectedFontName, `url(${fontPath})`);
            fontFace.load().then(function(loaded_face) {
                document.fonts.add(loaded_face);
                console.log(`Font '${selectedFontName}' loaded.`);
            }).catch(function(error) {
                console.error(`Failed to load font '${selectedFontName}':`, error);
            });
        } else {
            textPreview.style.fontFamily = 'sans-serif'; // Default fallback
        }
    }

    // Event listener for the upload font button
    uploadFontBtn.addEventListener('click', () => {
        fontUploadInput.click(); // Trigger the hidden file input
    });

    // Event listener for when a file is selected
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
                    console.log('Font uploaded successfully:', result);
                    await loadFonts(); // Reload fonts to show the new one
                    // Optionally, select the newly uploaded font
                    textFontSelect.value = result.font_name;
                    applyFontToPreview();
                } else {
                    const errorData = await response.json();
                    alert(`Error uploading font: ${errorData.detail}`);
                    console.error('Error uploading font:', errorData);
                }
            } catch (error) {
                alert('Network error or server issue during font upload.');
                console.error('Network error during font upload:', error);
            } finally {
                fontUploadInput.value = ''; // Clear the input so the same file can be selected again
            }
        }
    });

    // Event listener for font selection change
    textFontSelect.addEventListener('change', applyFontToPreview);

    // Event listener for when the text input modal is shown
    window.eventBus.on('text-input-modal:show', (data) => {
        currentActiveHole = data.activeHole; // Store the active hole data
        loadFonts(); // Load fonts every time the modal is shown
    });

    // Initial load of fonts when the modal is first initialized
    loadFonts();

    return {}; // Return an empty object or any necessary API for the modal
};
