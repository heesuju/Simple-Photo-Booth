window.PhotoTransformManager = class PhotoTransformManager {
    constructor(appState) {
        this.appState = appState;
        this.transforms = [];
        this.caches = []; // Separate cache to avoid serialization issues if any
    }

    init(photoCount) {
        this.transforms = Array(photoCount).fill(null).map(() => ({
            base: {
                type: 'original', // 'original' or 'stylized'
                stylePrompt: null,
                styleId: null
            },
            crop: {
                enabled: false,
                data: null // { x, y, width, height }
            },
            filters: {
                enabled: false,
                values: { // Default filter values
                    brightness: 100,
                    contrast: 100,
                    saturate: 100,
                    blur: 0
                }
            },
            background: {
                enabled: false, // If true, we show the bg removed version
                settings: {
                    threshold: 240,
                    bgThreshold: 10,
                    erodeSize: 10
                },
                replaced: false,
                replacementColor: null
            }
        }));

        this.caches = Array(photoCount).fill(null).map(() => ({
            stylizedBlob: null,
            bgRemovedBlob: null, // derived from current base
            finalComposedBlob: null,
            lastComposedHash: null
        }));
    }

    // --- State Getters/Setters ---

    getTransform(index) {
        return this.transforms[index];
    }

    getBaseBlob(index) {
        const t = this.transforms[index];
        if (t.base.type === 'stylized' && this.caches[index].stylizedBlob) {
            return this.caches[index].stylizedBlob;
        }
        return this.appState.originalPhotos[index];
    }

    setStylizedDecoration(index, stylePrompt, styleId, blob) {
        const t = this.transforms[index];
        t.base.type = 'stylized';
        t.base.stylePrompt = stylePrompt;
        t.base.styleId = styleId;
        this.caches[index].stylizedBlob = blob;

        // Dependency Resolution: Changing Base invalidates upper layers
        t.crop.enabled = false;
        // Don't clear data, just disable. User can re-enable to try applying same crop.

        t.background.enabled = false;
        t.background.replaced = false;

        // Invalidate downstream caches
        this.caches[index].bgRemovedBlob = null;
        this.caches[index].finalComposedBlob = null;
    }

    resetToOriginal(index) {
        const t = this.transforms[index];
        t.base.type = 'original';
        t.base.stylePrompt = null;
        t.base.styleId = null;

        // Dependency Resolution: Resetting Base resets upper layers to avoid conflicts
        // t.crop.enabled = false; 
        // Keep crop enabled for Reset? User said "Reset only one layer".
        // If I Reset Style, do I want to keep Original Crop?
        // If I had Original + Crop -> Stylized (Crop Disabled) -> Reset Style.
        // I am back to Original. Should I Re-enable Crop?
        // If I didn't clear crop.data, I can re-enable?
        // Or just leave it disabled?
        // Safest is LEAVE IT AS IS (from before reset).
        // Before reset, it was Stylized (Crop Disabled).
        // So Reset -> Original (Crop Disabled).
        // This is safe.

        // BUT if user had Original + Crop -> Stylize -> "Undo" (Reset).
        // They might want Crop back.
        // But "Reset Style" (Button) is usually "Remove Style".
        // If I was in "Original + Crop", I am already "Original".
        // If I am in "Stylized", I am "Stylized + No Crop".
        // Reset -> "Original + No Crop". 
        // This is consistent.
        // User reports "Reset in style should reset style and apply original image".
        // This achieves it.

        t.crop.enabled = false; // Ensure it's clean
        t.background.enabled = false;

        // Invalidate downstream
        this.caches[index].bgRemovedBlob = null;
        this.caches[index].finalComposedBlob = null;
    }

    setCrop(index, cropData) {
        const t = this.transforms[index];
        t.crop.enabled = !!cropData;
        t.crop.data = cropData;
        this.caches[index].finalComposedBlob = null;
    }

    setFilters(index, values) {
        const t = this.transforms[index];
        t.filters.enabled = true;
        t.filters.values = { ...t.filters.values, ...values };
        // Validating if we need to recompose blob or just update CSS
        // Usually filters are CSS only until finalize. 
        // We'll decide in composition logic.
    }

    setBackgroundRemoval(index, enabled, settings = {}) {
        const t = this.transforms[index];
        t.background.enabled = enabled;
        if (settings) {
            t.background.settings = { ...t.background.settings, ...settings };
        }
        // If settings changed, we might need to re-fetch BG removal (handled by caller usually, but ideally here)
        // For now, assume caller handles the fetch and calls setBgRemovedBlob
    }

    setBgRemovedBlob(index, blob) {
        this.caches[index].bgRemovedBlob = blob;
        this.caches[index].finalComposedBlob = null;
    }

    setBgReplacement(index, replaced, color) {
        const t = this.transforms[index];
        t.background.replaced = replaced;
        t.background.replacementColor = color;
        this.caches[index].finalComposedBlob = null;
    }

    // --- Composition ---

    async getPreCropBlob(index) {
        const t = this.transforms[index];
        const cache = this.caches[index];

        let blob = this.getBaseBlob(index);

        if (t.background.enabled && cache.bgRemovedBlob) {
            blob = cache.bgRemovedBlob;
            if (t.background.replaced && t.background.replacementColor) {
                blob = await this._applyBgReplacement(blob, t.background.replacementColor);
            }
        }
        return blob;
    }

    async compose(index) {
        const t = this.transforms[index];
        const cache = this.caches[index];

        // 1. Determine Base
        let currentBlob = this.getBaseBlob(index);

        // 2. Background Removal
        if (t.background.enabled && cache.bgRemovedBlob) {
            currentBlob = cache.bgRemovedBlob;
            // If replaced (or just enabled replacement with transparent/color), apply it.
            if (t.background.replaced) {
                currentBlob = await this._applyBgReplacement(currentBlob, t.background.replacementColor);
            }
        }

        // 3. Crop
        if (t.crop.enabled && t.crop.data && this.appState.cropper) {
            const result = await this.appState.cropper.crop(currentBlob, null, t.crop.data);
            currentBlob = result.croppedBlob;
        }

        cache.finalComposedBlob = currentBlob;
        return currentBlob;
    }

    async getFinalBlob(index) {
        let blob = await this.compose(index);
        const t = this.transforms[index];

        // 5. Bake Filters
        if (this._hasFilters(t.filters.values)) {
            blob = await this._bakeFilters(blob, t.filters.values);
        }
        return blob;
    }

    _hasFilters(values) {
        const defaults = { brightness: 100, contrast: 100, saturate: 100, warmth: 100, sharpness: 0, blur: 0, grain: 0 };
        return Object.keys(defaults).some(k => values[k] !== defaults[k]);
    }

    async _bakeFilters(blob, filters) {
        const formData = new FormData();
        formData.append('file', blob);
        formData.append('filters', JSON.stringify(filters));

        try {
            const res = await fetch('/apply_filters_to_image', { method: 'POST', body: formData });
            if (!res.ok) throw new Error('Filter application failed');
            return await res.blob();
        } catch (e) {
            console.error("Filter baking failed:", e);
            return blob;
        }
    }

    async _applyBgReplacement(imageBlob, color) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');

                // Draw color
                ctx.fillStyle = color;
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                // Draw image on top
                ctx.drawImage(img, 0, 0);

                canvas.toBlob(resolve, 'image/png'); // PNG to support transparency if needed
            };
            img.src = URL.createObjectURL(imageBlob);
        });
    }

    // Helper to get CSS filter string
    getFilterString(index) {
        const t = this.transforms[index];
        if (!t.filters.enabled) return 'none';
        const f = t.filters.values;
        return `brightness(${f.brightness}%) contrast(${f.contrast}%) saturate(${f.saturate}%) blur(${f.blur}px)`;
    }

    // Reorder
    reorder(fromIndex, toIndex) {
        const move = (arr, from, to) => {
            const item = arr.splice(from, 1)[0];
            arr.splice(to, 0, item);
        };
        move(this.transforms, fromIndex, toIndex);
        move(this.caches, fromIndex, toIndex);
    }
};
