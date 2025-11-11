(function() {
    const photoHangingGallery = document.querySelector('.photo-hanging-gallery');
    if (!photoHangingGallery) return;

    function updatePanningBackground(theme) {
        const imageUrl = `/static/img/effects/${theme}.png`;
        const img = new Image();
        img.onload = function() {
            photoHangingGallery.style.setProperty('--panning-bg-image', `url(${imageUrl}), url(${imageUrl})`);
            photoHangingGallery.classList.add('panning-background');
        }
        img.onerror = function() {
            photoHangingGallery.classList.remove('panning-background');
            photoHangingGallery.style.removeProperty('--panning-bg-image');
        }
        img.src = imageUrl;
    }

    window.eventBus.on('app:theme-ready', (theme) => {
        if (document.getElementById('photo-hanging-gallery').style.display !== 'none') {
            updatePanningBackground(theme);
        }
    });

    window.eventBus.on('screen:show', (screenId) => {
        if (screenId === 'photo-hanging-gallery') {
            const currentTheme = Array.from(document.body.classList).find(c => c.endsWith('-theme'));
            if (currentTheme) {
                updatePanningBackground(currentTheme.replace('-theme', ''));
            }
        }
    });

    window.eventBus.on('theme:changed', (theme) => {
        // only apply when the gallery is visible
        if (photoHangingGallery.offsetParent !== null) {
            updatePanningBackground(theme);
        }
    });

    window.eventBus.on('app:init', async (appState) => {
        const galleryContainer = document.getElementById('photo-gallery');
        if (!galleryContainer) return;

        let imageList = [];
        try {
            const response = await fetch('/recent_results');
            if (response.ok) {
                imageList = await response.json();
            } else {
                console.error('Failed to fetch recent results:', response.statusText);
            }
        } catch (error) {
            console.error('Error fetching recent results:', error);
        }

        const maxItems = 5; // limit number of items to display
        const photosToRender = imageList.slice(0, maxItems);

        const photos = photosToRender.map(src => {
            const photoDiv = document.createElement('div');
            photoDiv.className = 'hanging-photo';

            const clip = document.createElement('img');
            clip.src = '/static/icons/clip.png';
            clip.className = 'clip';
            photoDiv.appendChild(clip);

            const frame = document.createElement('div');
            frame.className = 'photo-frame';
            const img = document.createElement('img');
            img.src = src;
            frame.appendChild(img);
            photoDiv.appendChild(frame);

            galleryContainer.appendChild(photoDiv);

            return {
                element: photoDiv,
                angle: 0,
                velocity: 0,
                hovering: false
            };
        });

        // Hover detection
        photos.forEach(photo => {
            photo.element.addEventListener('mouseenter', () => { photo.hovering = true; });
            photo.element.addEventListener('mouseleave', () => { photo.hovering = false; });
        });

        // Mouse tracking
        let lastMouseX = 0;
        let lastTime = performance.now();
        const mouseState = { x: 0, speed: 0 };

        document.addEventListener('mousemove', (e) => {
            const now = performance.now();
            const dt = Math.max(now - lastTime, 1);
            const dx = e.clientX - lastMouseX;
            mouseState.x = e.clientX;
            mouseState.speed = dx / dt * 16;
            lastMouseX = e.clientX;
            lastTime = now;
        });

        // Simple pendulum animation
        function animate() {
            photos.forEach(photo => {
                if (photo.hovering && Math.abs(mouseState.speed) > 0.5) {
                    photo.velocity += -mouseState.speed * 0.05; // weak & reversed
                }

                const stiffness = 0.05;
                const damping = 0.08;
                const acceleration = -photo.angle * stiffness - photo.velocity * damping;
                photo.velocity += acceleration;
                photo.angle += photo.velocity;

                photo.element.style.transform = `rotate(${photo.angle}deg)`;
            });

            requestAnimationFrame(animate);
        }

        animate();

        const enterButton = document.getElementById('enter-button');
        if (enterButton) {
            enterButton.addEventListener('click', () => {
                window.eventBus.dispatch('screen:show', 'main-menu');
            });
        }

        const configButton = document.getElementById('config-button');
        if (configButton) {
            configButton.addEventListener('click', () => {
                appState.settingsModal.show();
            });
        }
    });
})();
