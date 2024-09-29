// script.js

// Get DOM elements
const sizeSelect = document.getElementById('size-select');
const collageArea = document.getElementById('collage-area');
const uploadInput = document.getElementById('upload-input');
const downloadBtn = document.getElementById('download-btn');
const customSizeInputs = document.getElementById('custom-size-inputs');
const setCustomSizeBtn = document.getElementById('set-custom-size');
const customWidthInput = document.getElementById('custom-width');
const customHeightInput = document.getElementById('custom-height');
const trashBin = document.getElementById('trash-bin');

// Preset sizes
const presets = {
    ipad_portrait: { width: 768, height: 1024 },
    ipad_landscape: { width: 1024, height: 768 },
    laptop: { width: 1366, height: 768 },
    instagram_portrait: { width: 1080, height: 1920 },
    instagram_landscape: { width: 1920, height: 1080 }
};

// Current selected size
let currentSize = presets.ipad_portrait;

// Handle size selection
sizeSelect.addEventListener('change', (e) => {
    const value = e.target.value;
    if (value === 'custom') {
        customSizeInputs.classList.remove('hidden');
    } else {
        customSizeInputs.classList.add('hidden');
        currentSize = presets[value];
        setCollageSize(currentSize.width, currentSize.height);
    }
});

// Set custom size
setCustomSizeBtn.addEventListener('click', () => {
    const width = parseInt(customWidthInput.value);
    const height = parseInt(customHeightInput.value);
    if (width > 0 && height > 0) {
        currentSize = { width, height };
        setCollageSize(width, height);
        customSizeInputs.classList.add('hidden');
    } else {
        alert('Please enter valid width and height.');
    }
});

// Function to set collage area size
function setCollageSize(width, height) {
    collageArea.style.width = `${width}px`;
    collageArea.style.height = `${height}px`;
}

// Handle image uploads
uploadInput.addEventListener('change', (e) => {
    const files = e.target.files;
    for (let file of files) {
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = function(event) {
                const imgWrapper = document.createElement('div');
                imgWrapper.classList.add('image-item');
                imgWrapper.style.width = '150px';
                imgWrapper.style.height = 'auto';
                imgWrapper.style.left = '10px';
                imgWrapper.style.top = '10px';

                const img = document.createElement('img');
                img.src = event.target.result;
                img.draggable = false;

                const resizeHandle = document.createElement('div');
                resizeHandle.classList.add('resize-handle');

                imgWrapper.appendChild(img);
                imgWrapper.appendChild(resizeHandle);
                addDragAndResize(imgWrapper);
                collageArea.appendChild(imgWrapper);
            }
            reader.readAsDataURL(file);
        }
    }
    // Reset the input
    uploadInput.value = '';
});

// Function to add drag and resize functionality to image wrapper
function addDragAndResize(element) {
    let isDragging = false;
    let isResizing = false;
    let startX, startY, startWidth, startHeight, startLeft, startTop;

    const resizeHandle = element.querySelector('.resize-handle');

    // Dragging handlers
    element.addEventListener('mousedown', (e) => {
        if (e.target === resizeHandle) return; // Prevent drag when resizing
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        startLeft = parseInt(element.style.left);
        startTop = parseInt(element.style.top);
        element.classList.add('selected');
        // Bring to front
        element.style.zIndex = getMaxZIndex() + 1;
        e.preventDefault();
    });

    // Resizing handlers
    resizeHandle.addEventListener('mousedown', (e) => {
        isResizing = true;
        startX = e.clientX;
        startY = e.clientY;
        startWidth = parseInt(window.getComputedStyle(element, null).getPropertyValue('width'), 10);
        startHeight = parseInt(window.getComputedStyle(element, null).getPropertyValue('height'), 10);
        e.stopPropagation();
        e.preventDefault();
    });

    // Optimize performance with requestAnimationFrame
    let dragRAF, resizeRAF;

    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            if (!dragRAF) {
                dragRAF = requestAnimationFrame(() => {
                    const dx = e.clientX - startX;
                    const dy = e.clientY - startY;
                    let newLeft = startLeft + dx;
                    let newTop = startTop + dy;

                    // Boundaries
                    newLeft = Math.max(0, Math.min(newLeft, currentSize.width - element.offsetWidth));
                    newTop = Math.max(0, Math.min(newTop, currentSize.height - element.offsetHeight));

                    element.style.left = `${newLeft}px`;
                    element.style.top = `${newTop}px`;
                    dragRAF = null;

                    // Check if over trash bin
                    checkTrashBinHover(e.clientX, e.clientY);
                });
            }
        }

        if (isResizing) {
            if (!resizeRAF) {
                resizeRAF = requestAnimationFrame(() => {
                    const dx = e.clientX - startX;
                    const dy = e.clientY - startY;
                    let newWidth = startWidth + dx;
                    let newHeight = startHeight + dy;

                    // Minimum size
                    newWidth = Math.max(50, newWidth);
                    newHeight = Math.max(50, newHeight);

                    // Boundaries
                    newWidth = Math.min(newWidth, currentSize.width - parseInt(element.style.left));
                    newHeight = Math.min(newHeight, currentSize.height - parseInt(element.style.top));

                    element.style.width = `${newWidth}px`;
                    element.style.height = `${newHeight}px`;
                    resizeRAF = null;
                });
            }
        }
    });

    document.addEventListener('mouseup', (e) => {
        if (isDragging) {
            isDragging = false;
            element.classList.remove('selected');
            // Check if released over trash bin
            const isOverTrash = isCursorOverTrash(e.clientX, e.clientY);
            if (isOverTrash) {
                deleteImage(element);
            }
            removeTrashBinHover();
        }
        if (isResizing) {
            isResizing = false;
            element.classList.remove('selected');
        }
    });

    // Touch support for mobile devices
    element.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];
        if (e.target === resizeHandle) {
            isResizing = true;
            startX = touch.clientX;
            startY = touch.clientY;
            startWidth = parseInt(window.getComputedStyle(element, null).getPropertyValue('width'), 10);
            startHeight = parseInt(window.getComputedStyle(element, null).getPropertyValue('height'), 10);
        } else {
            isDragging = true;
            startX = touch.clientX;
            startY = touch.clientY;
            startLeft = parseInt(element.style.left);
            startTop = parseInt(element.style.top);
            element.classList.add('selected');
            element.style.zIndex = getMaxZIndex() + 1;
        }
    }, { passive: false });

    document.addEventListener('touchmove', (e) => {
        const touch = e.touches[0];
        if (isDragging) {
            if (!dragRAF) {
                dragRAF = requestAnimationFrame(() => {
                    const dx = touch.clientX - startX;
                    const dy = touch.clientY - startY;
                    let newLeft = startLeft + dx;
                    let newTop = startTop + dy;

                    // Boundaries
                    newLeft = Math.max(0, Math.min(newLeft, currentSize.width - element.offsetWidth));
                    newTop = Math.max(0, Math.min(newTop, currentSize.height - element.offsetHeight));

                    element.style.left = `${newLeft}px`;
                    element.style.top = `${newTop}px`;
                    dragRAF = null;

                    // Check if over trash bin
                    checkTrashBinHover(touch.clientX, touch.clientY);
                });
            }
        }

        if (isResizing) {
            if (!resizeRAF) {
                resizeRAF = requestAnimationFrame(() => {
                    const dx = touch.clientX - startX;
                    const dy = touch.clientY - startY;
                    let newWidth = startWidth + dx;
                    let newHeight = startHeight + dy;

                    // Minimum size
                    newWidth = Math.max(50, newWidth);
                    newHeight = Math.max(50, newHeight);

                    // Boundaries
                    newWidth = Math.min(newWidth, currentSize.width - parseInt(element.style.left));
                    newHeight = Math.min(newHeight, currentSize.height - parseInt(element.style.top));

                    element.style.width = `${newWidth}px`;
                    element.style.height = `${newHeight}px`;
                    resizeRAF = null;
                });
            }
        }
    }, { passive: false });

    document.addEventListener('touchend', (e) => {
        if (isDragging) {
            isDragging = false;
            element.classList.remove('selected');
            // Check if released over trash bin
            const touch = e.changedTouches[0];
            const isOverTrash = isCursorOverTrash(touch.clientX, touch.clientY);
            if (isOverTrash) {
                deleteImage(element);
            }
            removeTrashBinHover();
        }
        if (isResizing) {
            isResizing = false;
            element.classList.remove('selected');
        }
    });

    // Function to get the current maximum z-index in collage
    function getMaxZIndex() {
        const elements = collageArea.getElementsByClassName('image-item');
        let max = 0;
        for (let el of elements) {
            const z = parseInt(window.getComputedStyle(el).zIndex) || 0;
            if (z > max) max = z;
        }
        return max;
    }

    // Handle collage download
    downloadBtn.addEventListener('click', () => {
        // Create a canvas
        const canvas = document.createElement('canvas');
        canvas.width = currentSize.width;
        canvas.height = currentSize.height;
        const ctx = canvas.getContext('2d');

        // Fill background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Get all images
        const images = Array.from(collageArea.getElementsByClassName('image-item'));
        // Sort images based on z-index to handle layering
        images.sort((a, b) => (parseInt(a.style.zIndex) || 0) - (parseInt(b.style.zIndex) || 0));

        const promises = images.map(imgWrapper => {
            return new Promise((resolve, reject) => {
                const img = imgWrapper.querySelector('img');
                const x = parseInt(imgWrapper.style.left);
                const y = parseInt(imgWrapper.style.top);
                const width = imgWrapper.offsetWidth;
                const height = imgWrapper.offsetHeight;

                const image = new Image();
                image.crossOrigin = "Anonymous";
                image.src = img.src;
                image.onload = () => {
                    ctx.drawImage(image, x, y, width, height);
                    resolve();
                }
                image.onerror = reject;
            });
        });

        Promise.all(promises).then(() => {
            // Create a link and trigger download
            const link = document.createElement('a');
            link.download = 'collage.png';
            link.href = canvas.toDataURL();
            link.click();
        }).catch((err) => {
            console.error('Error generating collage:', err);
            alert('Failed to generate collage.');
        });
    });

// Trash Bin Interaction Functions

// Function to check if cursor is over trash bin
function isCursorOverTrash(x, y) {
    const trashRect = trashBin.getBoundingClientRect();
    return (
        x >= trashRect.left &&
        x <= trashRect.right &&
        y >= trashRect.top &&
        y <= trashRect.bottom
    );
}

// Function to add hover effect to trash bin
function checkTrashBinHover(x, y) {
    if (isCursorOverTrash(x, y)) {
        trashBin.classList.add('active');
    } else {
        trashBin.classList.remove('active');
    }
}

// Function to remove hover effect from trash bin
function removeTrashBinHover() {
    trashBin.classList.remove('active');
}

// Function to delete image with animation
function deleteImage(element) {
    // Add fade-out animation
    element.style.transition = 'opacity 0.5s, transform 0.5s';
    element.style.opacity = '0';
    element.style.transform = 'scale(0)';
    setTimeout(() => {
        if (element.parentElement === collageArea) {
            collageArea.removeChild(element);
        }
    }, 500);
}

// Optional: Make trash bin clickable to clear all images
trashBin.addEventListener('click', () => {
    const allImages = Array.from(collageArea.getElementsByClassName('image-item'));
    allImages.forEach(img => deleteImage(img));
});
}