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
            { id: 'main-menu', url: '/static/components/main_menu.html' },
            { id: 'app-content', url: '/static/components/photo_taking_screen.html' },
            { id: 'review-screen', url: '/static/components/review_screen.html' },
            { id: 'result-screen', url: '/static/components/result_screen.html' },
            { id: 'template-edit-screen', url: '/static/components/template_edit_screen.html' }
        ];

        for (const component of components) {
            try {
                const response = await fetch(component.url);
                const html = await response.text();
                document.getElementById(component.id).innerHTML = html;
            } catch (error) {
                console.error(`Error loading component: ${component.id}`, error);
            }
        }
    }

    // Dynamically loads all the component JavaScript files
    async function loadJsComponents() {
        const scripts = [
            '/static/js/components/shared.js',
            '/static/js/components/main_menu.js',
            '/static/js/components/photo_taking.js',
            '/static/js/components/review.js',
            '/static/js/components/result.js',
            '/static/js/components/template_edit.js'
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

    // The global application state
    const appState = {
        templateInfo: null,
        selectedTemplate: { element: null, data: null },
        capturedPhotos: [],
        photoAssignments: [],
        selectedHole: { element: null, index: -1 },
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
    };

    // Handles showing and hiding the different application screens
    window.eventBus.on('screen:show', (screenId) => {
        ['main-menu', 'app-content', 'review-screen', 'result-screen', 'template-edit-screen'].forEach(id => {
            document.getElementById(id).style.display = 'none';
        });
        document.getElementById(screenId).style.display = 'block';
    });

    // Initializes the application by loading all components and dispatching the app:init event
    async function initApp() {
        await loadHtmlComponents();
        await loadJsComponents();
        window.eventBus.dispatch('app:init', appState);
    }

    initApp();
});