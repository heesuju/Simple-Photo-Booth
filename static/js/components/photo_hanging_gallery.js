(function () {
    const photoHangingGallery = document.querySelector('.photo-hanging-gallery');
    if (!photoHangingGallery) return;

    function updatePanningBackground(theme) {
        const imageUrl = `/static/img/effects/${theme}.png`;
        const img = new Image();
        img.onload = function () {
            photoHangingGallery.style.setProperty('--panning-bg-image', `url(${imageUrl}), url(${imageUrl})`);
            photoHangingGallery.classList.add('panning-background');
        }
        img.onerror = function () {
            photoHangingGallery.classList.remove('panning-background');
            photoHangingGallery.style.removeProperty('--panning-bg-image');
        }
        img.src = imageUrl;
    }

    let photos = []; // Shared state for animation
    const mouseState = { x: 0, speed: 0 };
    let isLoopRunning = false;

    // --- Extracted Photo Loading Function ---
    async function loadGalleryPhotos() {
        const galleryContainer = document.getElementById('photo-gallery');
        if (!galleryContainer) return;

        // Clear existing items
        galleryContainer.innerHTML = '';
        photos = []; // Reset photos array

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

        const maxItems = 6;
        const photosToRender = imageList.slice(0, maxItems);

        photos = photosToRender.map(item => { // Update shared photos array
            const photoDiv = document.createElement('div');
            photoDiv.className = 'hanging-photo';

            const clip = document.createElement('img');
            clip.src = '/static/icons/clip.png';
            clip.className = 'clip';
            photoDiv.appendChild(clip);

            const frame = document.createElement('div');
            frame.className = 'photo-frame';
            const img = document.createElement('img');
            img.src = item.path || item;
            frame.appendChild(img);
            photoDiv.appendChild(frame);

            if (item.session_id) {
                photoDiv.style.cursor = 'pointer';
                photoDiv.addEventListener('click', (e) => {
                    if (Math.abs(mouseState.speed) > 2) return;
                    console.log('Navigating to session:', item.session_id);
                    window.eventBus.dispatch('session:load', item.session_id);
                });
            }

            galleryContainer.appendChild(photoDiv);

            // Add hover listeners directly
            const photoObj = {
                element: photoDiv,
                angle: 0,
                velocity: 0,
                hovering: false
            };

            photoDiv.addEventListener('mouseenter', () => { photoObj.hovering = true; });
            photoDiv.addEventListener('mouseleave', () => { photoObj.hovering = false; });

            return photoObj;
        });

        // Restart animation if needed
        if (!isLoopRunning) {
            isLoopRunning = true;
            animate();
        }
    }

    // --- Animation Logic ---
    function animate() {
        let allSettled = true;

        photos.forEach(photo => {
            if (photo.hovering && Math.abs(mouseState.speed) > 0.5) {
                photo.velocity += -mouseState.speed * 0.05;
                allSettled = false;
            }

            const stiffness = 0.05;
            const damping = 0.08;
            const acceleration = -photo.angle * stiffness - photo.velocity * damping;
            photo.velocity += acceleration;
            photo.angle += photo.velocity;

            if (Math.abs(photo.angle) < 0.1 && Math.abs(photo.velocity) < 0.1) {
                if (photo.angle !== 0) {
                    photo.angle = 0;
                    photo.velocity = 0;
                    photo.element.style.transform = `rotate(0deg)`;
                }
            } else {
                allSettled = false;
                photo.element.style.transform = `rotate(${photo.angle.toFixed(2)}deg)`;
            }
        });

        if (Math.abs(mouseState.speed) > 0.01) {
            mouseState.speed *= 0.9;
            allSettled = false;
        } else {
            mouseState.speed = 0;
        }

        if (!allSettled) {
            requestAnimationFrame(animate);
            isLoopRunning = true;
        } else {
            isLoopRunning = false;
        }
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
            // *** RELOAD PHOTOS WHEN SCREEN IS SHOWN ***
            loadGalleryPhotos();
        }
    });

    // ... (keep Mouse/Touch event listeners, but ensure they access shared 'photos' and 'mouseState') ...

    // Mouse tracking
    let lastMouseX = 0;
    let lastTime = performance.now();

    document.addEventListener('mousemove', (e) => {
        const now = performance.now();
        const dt = Math.max(now - lastTime, 1);
        const dx = e.clientX - lastMouseX;
        mouseState.x = e.clientX;
        mouseState.speed = dx / dt * 16;
        lastMouseX = e.clientX;
        lastTime = now;

        if (!isLoopRunning) {
            isLoopRunning = true;
            animate();
        }
    });

    // Touch tracking ...
    let lastTouchX = 0;
    let lastTouchTime = performance.now();
    let activeTouchId = null;
    let cachedRects = [];

    function updateCachedRects() {
        cachedRects = photos.map(photo => { // uses shared photos
            const r = photo.element.getBoundingClientRect();
            return {
                photo: photo,
                left: r.left,
                right: r.right,
                top: r.top,
                bottom: r.bottom
            };
        });
    }

    document.addEventListener('touchstart', (e) => {
        if (e.touches.length > 0) {
            const touch = e.touches[0];
            activeTouchId = touch.identifier;
            lastTouchX = touch.clientX;
            lastTouchTime = performance.now();
            mouseState.x = touch.clientX;

            updateCachedRects();

            cachedRects.forEach(rectData => {
                if (touch.clientX >= rectData.left && touch.clientX <= rectData.right &&
                    touch.clientY >= rectData.top && touch.clientY <= rectData.bottom) {
                    rectData.photo.hovering = true;
                }
            });

            if (!isLoopRunning) {
                isLoopRunning = true;
                animate();
            }
        }
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (e.touches.length > 0) {
            const touch = Array.from(e.touches).find(t => t.identifier === activeTouchId);
            if (touch) {
                const now = performance.now();
                const dt = Math.max(now - lastTouchTime, 1);
                const dx = touch.clientX - lastTouchX;
                mouseState.x = touch.clientX;
                mouseState.speed = dx / dt * 16;
                lastTouchX = touch.clientX;
                lastTouchTime = now;

                cachedRects.forEach(rectData => {
                    if (touch.clientX >= rectData.left && touch.clientX <= rectData.right &&
                        touch.clientY >= rectData.top && touch.clientY <= rectData.bottom) {
                        rectData.photo.hovering = true;
                    } else {
                        rectData.photo.hovering = false;
                    }
                });

                if (!isLoopRunning) {
                    isLoopRunning = true;
                    animate();
                }
            }
        }
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        photos.forEach(photo => {
            photo.hovering = false;
        });
        mouseState.speed = 0;
        activeTouchId = null;
        cachedRects = [];
    }, { passive: true });


    window.eventBus.on('app:init', async (appState) => {
        loadGalleryPhotos();

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
