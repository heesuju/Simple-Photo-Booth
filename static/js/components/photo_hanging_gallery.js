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

    // Pagination state
    let allImages = [];
    let currentPage = 0;
    const itemsPerPage = 6;

    let isTransitioning = false;

    // --- Extracted Photo Loading Function ---
    async function loadGalleryPhotos() {
        const galleryContainer = document.getElementById('photo-gallery');
        if (!galleryContainer) return;

        try {
            const response = await fetch('/recent_results?limit=50');
            if (response.ok) {
                allImages = await response.json();
                currentPage = 0; // Reset to first page on reload
                renderGalleryPage(null); // Initial render, no transition
            } else {
                console.error('Failed to fetch recent results:', response.statusText);
            }
        } catch (error) {
            console.error('Error fetching recent results:', error);
        }
    }

    async function renderGalleryPage(direction) {
        if (isTransitioning) return;
        const galleryContainer = document.getElementById('photo-gallery');
        if (!galleryContainer) return;
        const parent = galleryContainer.parentElement;

        if (direction) {
            isTransitioning = true;
            isLoopRunning = false; // Stop physics loop

            // --- SIMULTANEOUS TRANSITION: CLONE OUTGOING ---
            // Clone the current container to animate it out
            const outgoingContainer = galleryContainer.cloneNode(true);
            outgoingContainer.removeAttribute('id');
            outgoingContainer.style.pointerEvents = 'none';
            outgoingContainer.style.zIndex = '10'; // Keep it visible on top

            // Append FIRST so it exists in DOM
            parent.appendChild(outgoingContainer);

            // Use double rAF to ensure browser registers the element and effectively "paints" it
            // before we add the transition class. This prevents instant disappearance.
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    const outgoingPhotos = outgoingContainer.querySelectorAll('.hanging-photo');
                    outgoingPhotos.forEach(el => {
                        // Rely on !important in CSS to override physics transform
                        if (direction === 'next') {
                            el.classList.add('slide-out-left');
                        } else {
                            el.classList.add('slide-out-right');
                        }
                    });
                });
            });
        }

        // --- RENDER INCOMING (REAL CONTAINER) ---
        galleryContainer.innerHTML = '';
        photos = []; // Reset animation array

        const start = currentPage * itemsPerPage;
        const end = start + itemsPerPage;
        const photosToRender = allImages.slice(start, end);

        photos = photosToRender.map(item => {
            const photoDiv = document.createElement('div');
            photoDiv.className = 'hanging-photo';

            // --- PREPARE ENTRY POSITION ---
            if (direction) {
                // Prepare off-screen position
                if (direction === 'next') {
                    photoDiv.classList.add('prepare-slide-in-right');
                } else {
                    photoDiv.classList.add('prepare-slide-in-left');
                }
            }

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

        // --- ANIMATE IN ---
        if (direction) {
            // Trigger reflow to ensure start positions are registered
            void galleryContainer.offsetWidth;

            // Activate entry animation
            photos.forEach(p => {
                p.element.classList.remove('prepare-slide-in-right', 'prepare-slide-in-left');
                p.element.classList.add('slide-in-active');
            });

            // Wait for transition to finish
            await new Promise(r => setTimeout(r, 450)); // Slightly longer than CSS 0.4s to be safe

            // Cleanup
            const outgoingContainer = parent.querySelector('.photo-gallery-container:not(#photo-gallery)');
            if (outgoingContainer) {
                outgoingContainer.remove();
            }

            photos.forEach(p => {
                p.element.classList.remove('slide-in-active');
                p.element.style.transform = '';
            });

            isTransitioning = false;
        }

        // Restart animation
        mouseState.speed = 0; // Reset momentum
        isLoopRunning = true;
        animate();
    }

    // Scroll listener for pagination
    if (photoHangingGallery) {
        photoHangingGallery.addEventListener('wheel', (e) => {
            // Prevent default scroll behavior if we are paginating
            // But maybe we want normal scroll if not over the gallery?
            // The gallery usually takes up the screen so preventDefault is good to stop page scroll
            // e.preventDefault();

            if (allImages.length <= itemsPerPage) return;
            if (isTransitioning) return; // Ignore scroll during transition

            const maxPage = Math.ceil(allImages.length / itemsPerPage) - 1;

            if (e.deltaY > 0) {
                // Scroll Down -> Next Page
                if (currentPage < maxPage) {
                    currentPage++;
                    renderGalleryPage('next');
                }
            } else {
                // Scroll Up -> Prev Page
                if (currentPage > 0) {
                    currentPage--;
                    renderGalleryPage('prev');
                }
            }
        }, { passive: true });

        // --- Swipe Support (Mobile) ---
        let touchStartX = 0;
        let touchStartY = 0;

        photoHangingGallery.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
            touchStartY = e.changedTouches[0].screenY;
            // Reset momentum on touch start to ensure taps register cleanly
            // (otherwise stale speed from previous swipe might block click)
            mouseState.speed = 0;
        }, { passive: true });

        photoHangingGallery.addEventListener('touchend', (e) => {
            if (isTransitioning) return;
            const touchEndX = e.changedTouches[0].screenX;
            const touchEndY = e.changedTouches[0].screenY;

            const diffX = touchEndX - touchStartX;
            const diffY = touchEndY - touchStartY;

            // Horizontal Swipe Check (threshold > 50px, vertical < 100px)
            if (Math.abs(diffX) > 50 && Math.abs(diffY) < 100) {
                if (diffX < 0) {
                    // Swipe Left -> Next Page
                    if (allImages.length > itemsPerPage) {
                        const maxPage = Math.ceil(allImages.length / itemsPerPage) - 1;
                        if (currentPage < maxPage) {
                            currentPage++;
                            renderGalleryPage('next');
                        }
                    }
                } else {
                    // Swipe Right -> Prev Page
                    if (currentPage > 0) {
                        currentPage--;
                        renderGalleryPage('prev');
                    }
                }
            }
        }, { passive: true });
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
