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

// Initialize layer controls panel
const layerControlsPanel = document.createElement('div');
layerControlsPanel.id = 'layer-controls-panel';
document.body.appendChild(layerControlsPanel);

const toggleButton = document.createElement('button');
toggleButton.id = 'layer-panel-toggle';
toggleButton.innerHTML = '<i class="fas fa-chevron-left"></i>';
document.body.appendChild(toggleButton);

// Utility functions
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// Get maximum z-index
function getMaxZIndex() {
    const elements = Array.from(collageArea.getElementsByClassName('image-item'));
    return Math.max(0, ...elements.map(el => parseInt(el.style.zIndex) || 0));
}

// Create layer controls with optimization
function createLayerControls(element) {
    const controls = document.createElement('div');
    controls.className = 'layer-controls';
    
    const layerCounter = document.createElement('span');
    layerCounter.className = 'layer-counter';
    
    const moveUpBtn = document.createElement('button');
    moveUpBtn.innerHTML = '<i class="fas fa-arrow-up"></i> Up';
    
    const moveDownBtn = document.createElement('button');
    moveDownBtn.innerHTML = '<i class="fas fa-arrow-down"></i> Down';
    
    controls.appendChild(layerCounter);
    controls.appendChild(moveUpBtn);
    controls.appendChild(moveDownBtn);

    // Optimized layer counter update
    const updateLayerCounter = () => {
        layerCounter.innerHTML = `Layer: ${parseInt(element.style.zIndex) || 1}`;
    };

    // Throttled layer operations
    const updateLayers = throttle((direction) => {
        const currentZ = parseInt(element.style.zIndex) || 1;
        const allImages = Array.from(collageArea.getElementsByClassName('image-item'));
        
        if (direction === 'up' && currentZ < allImages.length) {
            const nextImage = allImages.find(img => 
                (parseInt(img.style.zIndex) || 1) === currentZ + 1
            );
            if (nextImage) {
                nextImage.style.zIndex = currentZ;
                element.style.zIndex = currentZ + 1;
                updateAllLayerCounters();
            }
        } else if (direction === 'down' && currentZ > 1) {
            const prevImage = allImages.find(img => 
                (parseInt(img.style.zIndex) || 1) === currentZ - 1
            );
            if (prevImage) {
                prevImage.style.zIndex = currentZ;
                element.style.zIndex = currentZ - 1;
                updateAllLayerCounters();
            }
        }
    }, 100);

    moveUpBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        updateLayers('up');
    });
    
    moveDownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        updateLayers('down');
    });

    updateLayerCounter(); // Initialize the counter
    return controls;
}

// Rotate image function
function rotateImage(element) {
    // Get current rotation
    const transform = element.style.transform || '';
    const currentRotation = transform.match(/rotate\(([^)]+)\)/) 
        ? parseInt(transform.match(/rotate\(([^)]+)\)/)[1]) 
        : 0;
    
    // Calculate new rotation (add 90 degrees)
    const newRotation = currentRotation + 90;
    
    // Get current translation
    const translateMatch = transform.match(/translate3d\(([^,]+),([^,]+),([^)]+)\)/);
    const translateX = translateMatch ? translateMatch[1] : '0px';
    const translateY = translateMatch ? translateMatch[2] : '0px';
    
    // Apply new transform
    element.style.transform = `translate3d(${translateX}, ${translateY}, 0) rotate(${newRotation}deg)`;
}

// Get current transform values
function getCurrentTransformValues(element) {
    const style = window.getComputedStyle(element);
    const matrix = new DOMMatrix(style.transform);
    
    // Extract rotation in degrees from matrix
    const angle = Math.atan2(matrix.b, matrix.a) * (180 / Math.PI);
    
    return {
        x: matrix.e,
        y: matrix.f,
        rotation: angle
    };
}

// Trash bin functionality
function isCursorOverTrash(x, y) {
    const trashRect = trashBin.getBoundingClientRect();
    return (
        x >= trashRect.left &&
        x <= trashRect.right &&
        y >= trashRect.top &&
        y <= trashRect.bottom
    );
}

const checkTrashBinHover = throttle((x, y) => {
    if (isCursorOverTrash(x, y)) {
        trashBin.classList.add('active');
    } else {
        trashBin.classList.remove('active');
    }
}, 100);

function removeTrashBinHover() {
    trashBin.classList.remove('active');
}

function deleteImage(element) {
    // Apply transition for smooth deletion
    element.style.transition = 'opacity 0.3s, transform 0.3s';
    element.style.opacity = '0';
    element.style.transform += ' scale(0)';
    
    setTimeout(() => {
        if (element.parentElement === collageArea) {
            collageArea.removeChild(element);
            debouncedUpdateLayerPanel();
        }
    }, 300);
}

// Optimized drag and resize functionality
function addDragAndResize(element) {
    let isDragging = false;
    let isResizing = false;
    let isRotating = false;
    let startX, startY, startTransformX = 0, startTransformY = 0;
    let startWidth, startHeight;
    let currentRotation = 0;
    let startAngle = 0;

    // Enable GPU acceleration
    element.style.transform = 'translate3d(0,0,0)';
    element.style.willChange = 'transform';

    // Find handles in the element
    const resizeHandle = element.querySelector('.resize-handle');
    const rotateHandle = element.querySelector('.rotate-handle');

    const handleMove = throttle((clientX, clientY) => {
        requestAnimationFrame(() => {
            if (isDragging) {
                const dx = clientX - startX;
                const dy = clientY - startY;
                const newX = startTransformX + dx;
                const newY = startTransformY + dy;
                
                // Apply boundaries
                const boundedX = Math.max(0, Math.min(newX, currentSize.width - element.offsetWidth));
                const boundedY = Math.max(0, Math.min(newY, currentSize.height - element.offsetHeight));
                
                element.style.transform = `translate3d(${boundedX}px, ${boundedY}px, 0) rotate(${currentRotation}deg)`;
                
                // Check trash bin
                checkTrashBinHover(clientX, clientY);
            }
    
            if (isResizing) {
                const dx = clientX - startX;
                const dy = clientY - startY;
                const newWidth = Math.max(50, Math.min(startWidth + dx, 
                    currentSize.width - parseInt(element.style.left || 0)));
                const newHeight = Math.max(50, Math.min(startHeight + dy,
                    currentSize.height - parseInt(element.style.top || 0)));
                
                // Update both wrapper and image dimensions
                element.style.width = `${newWidth}px`;
                element.style.height = `${newHeight}px`;
                
                // Update the image inside the wrapper
                const img = element.querySelector('img');
                if (img) {
                    img.style.width = '100%';
                    img.style.height = '100%';
                    img.style.objectFit = 'cover';
                }
            }
    
            if (isRotating) {
                const rect = element.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                const angle = Math.atan2(clientY - centerY, clientX - centerX) * 180 / Math.PI;
                const newRotation = angle - startAngle;
                
                const transform = getCurrentTransformValues(element);
                element.style.transform = `translate3d(${transform.x}px, ${transform.y}px, 0) rotate(${newRotation}deg)`;
                currentRotation = newRotation;
            }
        });
    }, 16);

    // Mouse event handlers
    element.addEventListener('mousedown', (e) => {
        if (e.target === resizeHandle || e.target === rotateHandle) return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const transform = getCurrentTransformValues(element);
        startTransformX = transform.x;
        startTransformY = transform.y;
        currentRotation = transform.rotation;
        element.style.zIndex = getMaxZIndex() + 1;
        element.classList.add('selected');
    }, { passive: true });

    if (resizeHandle) {
        resizeHandle.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startY = e.clientY;
            startWidth = element.offsetWidth;
            startHeight = element.offsetHeight;
            element.classList.add('selected');
            e.stopPropagation();
        }, { passive: true });
    }

    if (rotateHandle) {
        rotateHandle.addEventListener('mousedown', (e) => {
            isRotating = true;
            const rect = element.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * 180 / Math.PI - currentRotation;
            element.classList.add('selected');
            e.stopPropagation();
        }, { passive: true });
    }

    // Touch event handlers
    element.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];
        if (e.target === rotateHandle) {
            isRotating = true;
            const rect = element.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            startAngle = Math.atan2(touch.clientY - centerY, touch.clientX - centerX) * 180 / Math.PI - currentRotation;
        } else if (e.target === resizeHandle) {
            isResizing = true;
            startX = touch.clientX;
            startY = touch.clientY;
            startWidth = element.offsetWidth;
            startHeight = element.offsetHeight;
        } else {
            isDragging = true;
            startX = touch.clientX;
            startY = touch.clientY;
            const transform = getCurrentTransformValues(element);
            startTransformX = transform.x;
            startTransformY = transform.y;
            currentRotation = transform.rotation;
            element.style.zIndex = getMaxZIndex() + 1;
        }
        element.classList.add('selected');
        e.preventDefault(); // Prevent scrolling when manipulating elements
    }, { passive: false });

    // Common move handler
    const moveHandler = (e) => {
        let clientX, clientY;
        
        if (e.type === 'mousemove') {
            clientX = e.clientX;
            clientY = e.clientY;
        } else if (e.type === 'touchmove') {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
            e.preventDefault(); // Prevent scrolling during touch moves
        }
        
        if (clientX && clientY) {
            handleMove(clientX, clientY);
        }
    };

    document.addEventListener('mousemove', moveHandler, { passive: true });
    document.addEventListener('touchmove', moveHandler, { passive: false });

    // Common end handler
    const endHandler = (e) => {
        if (isDragging) {
            // Only check for trash if we're ending a drag operation
            let clientX, clientY;
            
            if (e.type === 'mouseup') {
                clientX = e.clientX;
                clientY = e.clientY;
            } else if (e.type === 'touchend' && e.changedTouches.length > 0) {
                clientX = e.changedTouches[0].clientX;
                clientY = e.changedTouches[0].clientY;
            }
            
            if (clientX && clientY && isCursorOverTrash(clientX, clientY)) {
                deleteImage(element);
            }
            
            removeTrashBinHover();
        }
        
        isDragging = false;
        isResizing = false;
        isRotating = false;
        element.classList.remove('selected');
    };

    document.addEventListener('mouseup', endHandler, { passive: true });
    document.addEventListener('touchend', endHandler, { passive: true });

    // Selection handling
    element.addEventListener('click', (e) => {
        if (e.target.closest('.resize-handle') || e.target.closest('.rotate-handle')) return;
        
        const allImages = Array.from(collageArea.getElementsByClassName('image-item'));
        allImages.forEach(img => {
            if (img !== element) {
                img.classList.remove('selected');
            }
        });
        
        element.classList.toggle('selected');
        debouncedUpdateLayerPanel();
    }, { passive: true });
}

// Function to set collage area size
function setCollageSize(width, height) {
    collageArea.style.width = `${width}px`;
    collageArea.style.height = `${height}px`;
}

// Move layer up or down
function moveLayer(imgWrapper, direction) {
    const currentZ = parseInt(imgWrapper.style.zIndex) || 1;
    const allImages = Array.from(collageArea.getElementsByClassName('image-item'));
    
    if (direction === 'up') {
        const nextImage = allImages.find(img => 
            (parseInt(img.style.zIndex) || 1) === currentZ + 1
        );
        if (nextImage) {
            nextImage.style.zIndex = currentZ;
            imgWrapper.style.zIndex = currentZ + 1;
        }
    } else if (direction === 'down') {
        const prevImage = allImages.find(img => 
            (parseInt(img.style.zIndex) || 1) === currentZ - 1
        );
        if (prevImage) {
            prevImage.style.zIndex = currentZ;
            imgWrapper.style.zIndex = currentZ - 1;
        }
    }
    
    updateAllLayerCounters();
    debouncedUpdateLayerPanel();
}

// Reorder layers by dragging
function reorderLayers(fromZ, toZ) {
    const allImages = Array.from(collageArea.getElementsByClassName('image-item'));
    const draggedImage = allImages.find(img => 
        (parseInt(img.style.zIndex) || 1) === fromZ
    );
    
    if (!draggedImage) return;
    
    if (fromZ < toZ) {
        // Moving down
        allImages.forEach(img => {
            const currentZ = parseInt(img.style.zIndex) || 1;
            if (currentZ > fromZ && currentZ <= toZ) {
                img.style.zIndex = currentZ - 1;
            }
        });
    } else {
        // Moving up
        allImages.forEach(img => {
            const currentZ = parseInt(img.style.zIndex) || 1;
            if (currentZ >= toZ && currentZ < fromZ) {
                img.style.zIndex = currentZ + 1;
            }
        });
    }
    
    draggedImage.style.zIndex = toZ;
    updateAllLayerCounters();
    debouncedUpdateLayerPanel();
}

// Update all layer counters
function updateAllLayerCounters() {
    const allImages = Array.from(collageArea.getElementsByClassName('image-item'));
    allImages.forEach(img => {
        const counter = img.querySelector('.layer-counter');
        if (counter) {
            counter.innerHTML = `Layer: ${parseInt(img.style.zIndex) || 1}`;
        }
    });
}

// Optimized layer panel update
function updateLayerPanel() {
    layerControlsPanel.innerHTML = '<h3>Layers</h3>';
    
    const allImages = Array.from(collageArea.getElementsByClassName('image-item'));
    const sortedImages = allImages.sort((a, b) => 
        (parseInt(b.style.zIndex) || 0) - (parseInt(a.style.zIndex) || 0)
    );
    
    sortedImages.forEach((imgWrapper) => {
        const layerItem = document.createElement('div');
        layerItem.className = 'layer-item';
        layerItem.draggable = true; // Enable drag functionality
        
        if (imgWrapper.classList.contains('selected')) {
            layerItem.classList.add('selected');
        }
        
        // Create layer item content
        const thumbnail = imgWrapper.querySelector('img').cloneNode(true);
        thumbnail.style.width = '40px';
        thumbnail.style.height = '40px';
        thumbnail.style.objectFit = 'cover';
        
        const layerCounter = document.createElement('span');
        layerCounter.className = 'layer-counter';
        layerCounter.innerHTML = `Layer ${parseInt(imgWrapper.style.zIndex) || 1}`;
        
        // Create buttons container
        const buttonsContainer = document.createElement('div');
        buttonsContainer.className = 'layer-buttons';
        
        // Create move up button
        const moveUpBtn = document.createElement('button');
        moveUpBtn.innerHTML = '<i class="fas fa-arrow-up"></i>';
        moveUpBtn.title = 'Move Layer Up';
        moveUpBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            moveLayer(imgWrapper, 'up');
        });
        
        // Create move down button
        const moveDownBtn = document.createElement('button');
        moveDownBtn.innerHTML = '<i class="fas fa-arrow-down"></i>';
        moveDownBtn.title = 'Move Layer Down';
        moveDownBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            moveLayer(imgWrapper, 'down');
        });

        // Create rotate button
        const rotateBtn = document.createElement('button');
        rotateBtn.innerHTML = '<i class="fas fa-redo"></i>';
        rotateBtn.title = 'Rotate 90°';
        rotateBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            rotateImage(imgWrapper);
        });
        
        // Add all elements to the layer item
        buttonsContainer.appendChild(moveUpBtn);
        buttonsContainer.appendChild(moveDownBtn);
        buttonsContainer.appendChild(rotateBtn);
        layerItem.appendChild(thumbnail);
        layerItem.appendChild(layerCounter);
        layerItem.appendChild(buttonsContainer);
        
        // Add drag and drop event listeners
        layerItem.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', imgWrapper.style.zIndex);
            layerItem.classList.add('dragging');
        });
        
        layerItem.addEventListener('dragend', () => {
            layerItem.classList.remove('dragging');
        });
        
        layerItem.addEventListener('dragover', (e) => {
            e.preventDefault();
            const draggingItem = layerControlsPanel.querySelector('.dragging');
            if (draggingItem !== layerItem) {
                layerItem.classList.add('drag-over');
            }
        });
        
        layerItem.addEventListener('dragleave', () => {
            layerItem.classList.remove('drag-over');
        });
        
        layerItem.addEventListener('drop', (e) => {
            e.preventDefault();
            layerItem.classList.remove('drag-over');
            const draggedZIndex = e.dataTransfer.getData('text/plain');
            const targetZIndex = imgWrapper.style.zIndex;
            
            if (draggedZIndex !== targetZIndex) {
                reorderLayers(parseInt(draggedZIndex), parseInt(targetZIndex));
            }
        });
        
        // Click handler for selection
        layerItem.addEventListener('click', (e) => {
            if (!e.target.closest('button')) {
                allImages.forEach(img => img.classList.remove('selected'));
                imgWrapper.classList.add('selected');
                debouncedUpdateLayerPanel();
            }
        });
        
        layerControlsPanel.appendChild(layerItem);
    });
}

const debouncedUpdateLayerPanel = debounce(updateLayerPanel, 100);

// Event Listeners
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

// Optimized image upload handler
uploadInput.addEventListener('change', (e) => {
    const files = e.target.files;
    Array.from(files).forEach(file => {
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = function(event) {
                const imgWrapper = document.createElement('div');
                imgWrapper.classList.add('image-item');
                imgWrapper.style.width = '150px';  // Initial width
                imgWrapper.style.height = '150px'; // Initial height
                imgWrapper.style.transform = 'translate3d(10px, 10px, 0)';
                imgWrapper.style.willChange = 'transform';
                
                const img = document.createElement('img');
                img.src = event.target.result;
                img.draggable = false;
                img.style.width = '100%';
                img.style.height = '100%';
                img.style.objectFit = 'cover';
                
                const resizeHandle = document.createElement('div');
                resizeHandle.classList.add('resize-handle');
                
                const rotateHandle = document.createElement('div');
                rotateHandle.classList.add('rotate-handle');
                
                // Add layer controls
                const layerControls = createLayerControls(imgWrapper);
                
                imgWrapper.appendChild(img);
                imgWrapper.appendChild(resizeHandle);
                imgWrapper.appendChild(rotateHandle);
                imgWrapper.appendChild(layerControls);
                
                // Set initial z-index
                const allImages = Array.from(collageArea.getElementsByClassName('image-item'));
                const maxZ = Math.max(0, ...allImages.map(img => parseInt(img.style.zIndex) || 1));
                imgWrapper.style.zIndex = maxZ + 1;
                
                addDragAndResize(imgWrapper);
                collageArea.appendChild(imgWrapper);
                
                debouncedUpdateLayerPanel();
            };
            reader.readAsDataURL(file);
        }
    });
    uploadInput.value = '';
});

// Optimized download functionality
downloadBtn.addEventListener('click', async () => {
    // Create offscreen canvas for better performance
    const canvas = document.createElement('canvas');
    canvas.width = currentSize.width;
    canvas.height = currentSize.height;
    const ctx = canvas.getContext('2d');

    // Fill background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const images = Array.from(collageArea.getElementsByClassName('image-item'));
    images.sort((a, b) => (parseInt(a.style.zIndex) || 0) - (parseInt(b.style.zIndex) || 0));

    try {
        await Promise.all(images.map(imgWrapper => {
            return new Promise((resolve, reject) => {
                const img = imgWrapper.querySelector('img');
                const transform = getCurrentTransformValues(imgWrapper);
                const width = imgWrapper.offsetWidth;
                const height = imgWrapper.offsetHeight;

                const image = new Image();
                image.crossOrigin = "Anonymous";
                image.src = img.src;
                image.onload = () => {
                    ctx.save();
                    
                    // Apply transformations
                    ctx.translate(transform.x + width/2, transform.y + height/2);
                    ctx.rotate(transform.rotation * Math.PI / 180);
                    ctx.drawImage(image, -width/2, -height/2, width, height);
                    
                    ctx.restore();
                    resolve();
                };
                image.onerror = reject;
            });
        }));

        // Download the image
        const link = document.createElement('a');
        link.download = 'collage.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
    } catch (err) {
        console.error('Error generating collage:', err);
        alert('Failed to generate collage. Please try again.');
    }
});

// Trash bin clear all functionality
trashBin.addEventListener('click', () => {
    const allImages = Array.from(collageArea.getElementsByClassName('image-item'));
    if (allImages.length > 0) {
        if (confirm('Are you sure you want to delete all images?')) {
            allImages.forEach(img => deleteImage(img));
        }
    }
});

// Toggle button for layer panel
toggleButton.addEventListener('click', () => {
    layerControlsPanel.classList.toggle('expanded');
    toggleButton.classList.toggle('expanded');
    
    // Update the toggle button icon
    const icon = toggleButton.querySelector('i');
    if (layerControlsPanel.classList.contains('expanded')) {
        icon.className = 'fas fa-chevron-right';
    } else {
        icon.className = 'fas fa-chevron-left';
    }
});

// Background click handler for deselection
collageArea.addEventListener('click', (e) => {
    if (e.target === collageArea) {
        const allImages = Array.from(collageArea.getElementsByClassName('image-item'));
        allImages.forEach(img => img.classList.remove('selected'));
        debouncedUpdateLayerPanel();
    }
});

// Initialize the application
function init() {
    // Set initial collage size
    setCollageSize(currentSize.width, currentSize.height);
    
    // Initialize the layer panel
    debouncedUpdateLayerPanel();
}

// Run initialization when DOM is fully loaded
document.addEventListener('DOMContentLoaded', init);