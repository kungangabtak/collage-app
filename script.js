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

// Preset sizes
const presets = {
    ipad: { width: 768, height: 1024 },
    laptop: { width: 1366, height: 768 },
    instagram: { width: 1080, height: 1920 }
};

// Current selected size
let currentSize = presets.ipad;

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
                const img = document.createElement('img');
                img.src = event.target.result;
                img.classList.add('image-item');
                img.style.width = '150px';
                img.style.height = 'auto';
                img.style.left = '10px';
                img.style.top = '10px';
                addDragAndDrop(img);
                collageArea.appendChild(img);
            }
            reader.readAsDataURL(file);
        }
    }
    // Reset the input
    uploadInput.value = '';
});

// Function to add drag and drop functionality to images
function addDragAndDrop(element) {
    let isDragging = false;
    let offsetX, offsetY;

    element.addEventListener('mousedown', (e) => {
        isDragging = true;
        offsetX = e.offsetX;
        offsetY = e.offsetY;
        element.classList.add('selected');
        // Bring the selected image to front
        element.style.zIndex = parseInt(getMaxZIndex()) + 1;
    });

    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            const rect = collageArea.getBoundingClientRect();
            let x = e.clientX - rect.left - offsetX;
            let y = e.clientY - rect.top - offsetY;

            // Boundaries
            x = Math.max(0, Math.min(x, rect.width - element.offsetWidth));
            y = Math.max(0, Math.min(y, rect.height - element.offsetHeight));

            element.style.left = `${x}px`;
            element.style.top = `${y}px`;
        }
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            element.classList.remove('selected');
        }
    });

    // Optional: Add touch support for mobile devices
    element.addEventListener('touchstart', (e) => {
        isDragging = true;
        const touch = e.touches[0];
        const rect = element.getBoundingClientRect();
        offsetX = touch.clientX - rect.left;
        offsetY = touch.clientY - rect.top;
        element.classList.add('selected');
        element.style.zIndex = parseInt(getMaxZIndex()) + 1;
    });

    document.addEventListener('touchmove', (e) => {
        if (isDragging) {
            const touch = e.touches[0];
            const rect = collageArea.getBoundingClientRect();
            let x = touch.clientX - rect.left - offsetX;
            let y = touch.clientY - rect.top - offsetY;

            // Boundaries
            x = Math.max(0, Math.min(x, rect.width - element.offsetWidth));
            y = Math.max(0, Math.min(y, rect.height - element.offsetHeight));

            element.style.left = `${x}px`;
            element.style.top = `${y}px`;
        }
    });

    document.addEventListener('touchend', () => {
        if (isDragging) {
            isDragging = false;
            element.classList.remove('selected');
        }
    });
}

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
    const images = collageArea.getElementsByClassName('image-item');
    const promises = [];

    for (let img of images) {
        const imgData = img;
        const x = parseInt(img.style.left);
        const y = parseInt(img.style.top);
        const width = img.width;
        const height = img.height;

        // Load image
        const imgPromise = new Promise((resolve, reject) => {
            const image = new Image();
            image.crossOrigin = "Anonymous";
            image.src = imgData.src;
            image.onload = () => {
                ctx.drawImage(image, x, y, width, height);
                resolve();
            }
            image.onerror = reject;
        });

        promises.push(imgPromise);
    }

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