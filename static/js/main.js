document.addEventListener('DOMContentLoaded', () => {
    // A simple event bus for inter-component communication
    window.eventBus = {
        on(event, callback) {
            document.addEventListener(event, (e) => callback(e.detail));
        },
        dispatch(event, data) {
            document.dispatchEvent(new CustomEvent(event, { detail: data }));
        },
    };

    // Loads the HTML for each component into the main index.html file
    async function loadHtmlComponents() {
        const components = [
            { id: 'photo-hanging-gallery', url: '/static/components/photo_hanging_gallery.html', css: '/static/css/photo_hanging_gallery.css' },
            { id: 'main-menu', url: '/static/components/main_menu.html', css: '/static/css/main_menu.css' },
            { id: 'app-content', url: '/static/components/photo_taking_screen.html', css: '/static/css/photo_taking_screen.css' },
            { id: 'review-screen', url: '/static/components/review_screen.html', css: '/static/css/review_screen.css' },
            { id: 'result-screen', url: '/static/components/result_screen.html', css: '/static/css/result_screen.css' },
            { id: 'template-edit-screen', url: '/static/components/template_edit_screen.html', css: '/static/css/template_edit_screen.css' },
            { id: 'crop-modal-container', url: '/static/components/shared/crop_modal.html' },
            { id: 'color-picker-modal-container', url: '/static/components/shared/color_picker_modal.html' },
            { id: 'text-edit-modal-container', url: '/static/components/shared/text_edit_modal.html' },
            { id: 'settings-modal-container', url: '/static/components/settings_modal.html' }
        ];

        for (const component of components) {
            try {
                const response = await fetch(component.url);
                const html = await response.text();
                document.getElementById(component.id).innerHTML = html;

                if (component.css) {
                    await loadStyleSheet(component.css, component.id);
                }
            } catch (error) {
                console.error(`Error loading component or CSS for ${component.id}:`, error);
            }
        }
    }

    // Dynamically loads all the component JavaScript files
    async function loadJsComponents() {
        const scripts = [
            '/static/js/components/photo_hanging_gallery.js',
            '/static/js/components/shared.js',
            '/static/js/components/main_menu.js',
            '/static/js/components/photo_taking.js',
            '/static/js/components/review.js',
            '/static/js/components/result.js',
            '/static/js/components/template_edit.js',
            '/static/js/components/shared/text_edit_modal.js'
        ];

        for (const script of scripts) {
            try {
                await new Promise((resolve, reject) => {
                    const scriptElement = document.createElement('script');
                    scriptElement.src = script;
                    scriptElement.onload = resolve;
                    scriptElement.onerror = reject;
                    document.body.appendChild(scriptElement);
                });
            } catch (error) {
                console.error(`Error loading script: ${script}`, error);
            }
        }
    }

    function loadStyleSheet(cssFile, componentId) {
        return new Promise((resolve, reject) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = cssFile;
            link.setAttribute('data-component-id', componentId);
            link.onload = () => resolve();
            link.onerror = () => reject(new Error(`Failed to load ${cssFile}`));
            document.head.appendChild(link);
        });
    }

    // The global application state
    const appState = {
        templateInfo: null,
        selectedTemplate: { element: null, data: null },
        capturedPhotos: [],
        originalPhotos: [],
        cropData: [],
            photoAssignments: [],
            videoAssignments: [],        selectedHole: { element: null, index: -1 },
        placedStickers: [],
        stream: null,
        activeSticker: { element: null, data: null, action: null },
        editingTemplate: null,
        activeHole: { element: null, data: null, index: -1, action: null },
        dragStart: { x: 0, y: 0, initialX: 0, initialY: 0 },
        selectedTimer: 0,
        isCapturing: false,
        captureMode: 'camera',
        filters: { brightness: 100, contrast: 100, saturate: 100, warmth: 100, sharpness: 0, blur: 0, grain: 0 },
        photosToRetake: [],
    };

    // Handles showing and hiding the different application screens
    window.eventBus.on('screen:show', (screenId) => {
        ['main-menu', 'app-content', 'review-screen', 'result-screen', 'template-edit-screen', 'photo-hanging-gallery'].forEach(id => {
            const screenElement = document.getElementById(id);
            if (screenElement) {
                screenElement.style.display = 'none';
            }
        });

        const activeScreen = document.getElementById(screenId);
        if (activeScreen) {
            activeScreen.style.display = 'block';
        }

        // Disable all component-specific stylesheets
        document.querySelectorAll('link[data-component-id]').forEach(link => {
            link.disabled = true;
        });

        // Enable the stylesheet for the active screen
        const activeStylesheet = document.querySelector(`link[data-component-id="${screenId}"]`);
        if (activeStylesheet) {
            activeStylesheet.disabled = false;
        }
    });

    window.eventBus.on('review:retake', (data) => {
        appState.photosToRetake = data.indices;
        window.eventBus.dispatch('screen:show', 'app-content');
        window.eventBus.dispatch('photo-taking:start-retake');
    });

    // Initializes the application by loading all components and dispatching the app:init event
    async function initApp() {
        await loadHtmlComponents();
        await loadJsComponents();
        appState.cropper = window.initCropper(appState);
        appState.settingsModal = window.initSettingsModal(appState);
        appState.textEditModal = window.initTextEditModal(appState);

        let initialTheme = 'light';
        // Fetch and apply initial theme
        try {
            const response = await fetch('/get_theme');
            const data = await response.json();
            initialTheme = data.theme || 'light';
            document.body.classList.add(`${initialTheme}-theme`);
        } catch (error) {
            console.error("Error fetching initial theme:", error);
            document.body.classList.add('light-theme'); // Fallback to light theme
        }

        window.eventBus.dispatch('app:init', appState);
        window.eventBus.dispatch('app:theme-ready', initialTheme);
    }

    initApp();

    window.addEventListener('beforeunload', function (e) {
        // Modern browsers ignore custom messages
        e.preventDefault();
        e.returnValue = ''; // Shows the default confirmation dialog
    });
});