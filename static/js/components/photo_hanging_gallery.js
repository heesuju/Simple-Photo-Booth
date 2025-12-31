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

        const maxItems = 6; // limit number of items to display
        const photosToRender = imageList.slice(0, maxItems);

        const photos = photosToRender.map(item => {
            const photoDiv = document.createElement('div');
            photoDiv.className = 'hanging-photo';

            const clip = document.createElement('img');
            clip.src = '/static/icons/clip.png';
            clip.className = 'clip';
            photoDiv.appendChild(clip);

            const frame = document.createElement('div');
            frame.className = 'photo-frame';
            const img = document.createElement('img');
            img.src = item.path || item; // Handle both new object format and old string format
            frame.appendChild(img);
            photoDiv.appendChild(frame);

            // Add click listener for navigation
            if (item.session_id) {
                photoDiv.style.cursor = 'pointer';
                photoDiv.addEventListener('click', (e) => {
                    // Prevent click if we are dragging (simple check)
                    if (Math.abs(mouseState.speed) > 2) return;

                    console.log('Navigating to session:', item.session_id);
                    window.eventBus.dispatch('session:load', item.session_id);
                });
            }

            galleryContainer.appendChild(photoDiv);

            return {
                element: photoDiv,
                angle: 0,
                velocity: 0,
                hovering: false
            };

        });

        // Hover detection (mouse)
        photos.forEach(photo => {
            photo.element.addEventListener('mouseenter', () => { photo.hovering = true; });
            photo.element.addEventListener('mouseleave', () => { photo.hovering = false; });
        });

        // Mouse tracking
        let lastMouseX = 0;
        let lastTime = performance.now();
        const mouseState = { x: 0, speed: 0 };
        let isLoopRunning = false;

        document.addEventListener('mousemove', (e) => {
            const now = performance.now();
            const dt = Math.max(now - lastTime, 1);
            const dx = e.clientX - lastMouseX;
            mouseState.x = e.clientX;
            mouseState.speed = dx / dt * 16;
            lastMouseX = e.clientX;
            lastTime = now;

            // Wake up animation if needed
            if (!isLoopRunning) {
                isLoopRunning = true;
                animate();
            }
        });

        // Touch tracking for mobile
        let lastTouchX = 0;
        let lastTouchTime = performance.now();
        let activeTouchId = null;
        let cachedRects = []; // Cache rects during touch interaction

        // Helper to update cached rects
        function updateCachedRects() {
            cachedRects = photos.map(photo => {
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

                // Cache rects at start of interaction to avoid thrashing during move
                updateCachedRects();

                // Check which photo is being touched
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

                    // Update hover state based on touch position using cached rects
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
            // Reset hover state on all photos when touch ends
            photos.forEach(photo => {
                photo.hovering = false;
            });
            mouseState.speed = 0;
            activeTouchId = null;
            cachedRects = []; // Clear cache
        }, { passive: true });

        // Simple pendulum animation
        function animate() {
            let allSettled = true;

            photos.forEach(photo => {
                // Apply mouse influence
                if (photo.hovering && Math.abs(mouseState.speed) > 0.5) {
                    photo.velocity += -mouseState.speed * 0.05; // weak & reversed
                    allSettled = false;
                }

                const stiffness = 0.05;
                const damping = 0.08;
                const acceleration = -photo.angle * stiffness - photo.velocity * damping;
                photo.velocity += acceleration;
                photo.angle += photo.velocity;

                // Check for "settled" state
                if (Math.abs(photo.angle) < 0.1 && Math.abs(photo.velocity) < 0.1) {
                    // Snap to zero if very close
                    if (photo.angle !== 0) {
                        photo.angle = 0;
                        photo.velocity = 0;
                        photo.element.style.transform = `rotate(0deg)`;
                    }
                    // If strictly 0, it contributes to being settled
                    // If we just snapped it, it's now settled for next frame
                } else {
                    allSettled = false;
                    photo.element.style.transform = `rotate(${photo.angle.toFixed(2)}deg)`;
                }
            });

            // Decay global mouse speed even if no photo hovered
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
                // console.log("Animation paused (idle)");
            }
        }

        // Start animation initially
        isLoopRunning = true;
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
