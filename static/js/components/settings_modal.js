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

    themeSelect.addEventListener('change', (event) => {
        const selectedTheme = event.target.value;
        setTheme(selectedTheme);
    });

    function setTheme(theme) {
        document.body.classList.remove('light-theme', 'dark-theme', 'halloween-theme');
        document.body.classList.add(`${theme}-theme`);
    }

    // Populate theme dropdown
    const themes = ['light', 'dark', 'halloween'];
    themes.forEach(theme => {
        const option = document.createElement('option');
        option.value = theme;
        option.textContent = theme.charAt(0).toUpperCase() + theme.slice(1);
        themeSelect.appendChild(option);
    });

    return { show, hide };
};
