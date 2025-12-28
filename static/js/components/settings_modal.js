window.initSettingsModal = function (appState) {
    const settingsModal = document.getElementById('settings-modal');
    const settingsModalCloseBtn = document.getElementById('settings-modal-close-btn');
    const themeSelect = document.getElementById('theme-select');
    const fullscreenCheckbox = document.getElementById('fullscreen-checkbox');

    function show() {
        const currentTheme = Array.from(document.body.classList).find(c => c.endsWith('-theme'));
        if (currentTheme) {
            themeSelect.value = currentTheme.replace('-theme', '');
        }
        // Update fullscreen checkbox to reflect current state
        fullscreenCheckbox.checked = isFullscreen();
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
        window.eventBus.dispatch('theme:changed', theme);
    }

    // Fullscreen functionality
    function isFullscreen() {
        return !!(document.fullscreenElement || document.webkitFullscreenElement ||
            document.mozFullScreenElement || document.msFullscreenElement);
    }

    function enterFullscreen() {
        const elem = document.documentElement;
        if (elem.requestFullscreen) {
            elem.requestFullscreen();
        } else if (elem.webkitRequestFullscreen) { // Safari
            elem.webkitRequestFullscreen();
        } else if (elem.mozRequestFullScreen) { // Firefox
            elem.mozRequestFullScreen();
        } else if (elem.msRequestFullscreen) { // IE/Edge
            elem.msRequestFullscreen();
        }
    }

    function exitFullscreen() {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) { // Safari
            document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) { // Firefox
            document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) { // IE/Edge
            document.msExitFullscreen();
        }
    }

    // Handle fullscreen checkbox toggle
    fullscreenCheckbox.addEventListener('change', (event) => {
        const shouldBeFullscreen = event.target.checked;

        if (shouldBeFullscreen) {
            enterFullscreen();
        } else {
            exitFullscreen();
        }

        // Save preference to localStorage
        localStorage.setItem('fullscreenPreference', shouldBeFullscreen);
    });

    // Listen for fullscreen changes (e.g., when user presses ESC)
    function onFullscreenChange() {
        const isNowFullscreen = isFullscreen();
        fullscreenCheckbox.checked = isNowFullscreen;
        localStorage.setItem('fullscreenPreference', isNowFullscreen);
    }

    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    document.addEventListener('mozfullscreenchange', onFullscreenChange);
    document.addEventListener('MSFullscreenChange', onFullscreenChange);

    // Apply saved fullscreen preference on load
    const savedFullscreenPref = localStorage.getItem('fullscreenPreference');
    if (savedFullscreenPref === 'true') {
        fullscreenCheckbox.checked = true;
        enterFullscreen();
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
