window.eventBus.on('app:init', (appState) => {
    const galleryContainer = document.getElementById('photo-gallery');
    if (!galleryContainer) return;

    const imageList = [
        '/static/results/3ded0d48-92db-43bb-851c-c19ff6bdbff6.png',
        '/static/results/1ea58747-88cf-4f4c-8fb5-a03c498e7b8e.png',
        '/static/results/3ded0d48-92db-43bb-851c-c19ff6bdbff6.png',
        '/static/results/1ea58747-88cf-4f4c-8fb5-a03c498e7b8e.png',
        '/static/results/3ded0d48-92db-43bb-851c-c19ff6bdbff6.png'
        // add more if you want, but max 5 for one line
    ];

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
});
