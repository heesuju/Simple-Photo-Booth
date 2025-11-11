window.initSettingsModal = function(appState) {
    const settingsModal = document.getElementById('settings-modal');
    const settingsModalCloseBtn = document.getElementById('settings-modal-close-btn');
    const themeSelect = document.getElementById('theme-select');

    function show() {
        settingsModal.classList.add('modal-visible');
    }

    function hide() {
        settingsModal.classList.remove('modal-visible');
    }

    settingsModalCloseBtn.addEventListener('click', hide);

    themeSelect.addEventListener('change', async (event) => {
        const selectedTheme = event.target.value;
        setTheme(selectedTheme);
        try {
            await fetch('/set_theme', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `theme=${selectedTheme}`
            });
        } catch (error) {
            console.error("Error saving theme:", error);
        }
    });

    function setTheme(theme) {
        document.body.classList.remove('light-theme', 'dark-theme', 'halloween-theme', 'christmas-theme', 'valentines-theme');
        document.body.classList.add(`${theme}-theme`);
        themeSelect.value = theme; // Update dropdown to reflect current theme
    }

    // Populate theme dropdown
    const themes = ['light', 'dark', 'halloween', 'christmas', 'valentines'];
    themes.forEach(theme => {
        const option = document.createElement('option');
        option.value = theme;
        option.textContent = theme.charAt(0).toUpperCase() + theme.slice(1);
        themeSelect.appendChild(option);
    });

    return { show, hide };
};
