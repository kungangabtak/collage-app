'use strict';

/* ==========================================================================
   Bethany's Collage Studio
   Single source of truth: `state`. The DOM is rendered from it, pointer
   interactions mutate it, undo/redo restores snapshots of it, and the
   whole project autosaves to IndexedDB.
   ========================================================================== */

// ---------- Presets & constants ----------

const PRESETS = [
    { id: 'ig-square',    label: 'Instagram Post — 1080 × 1080',      w: 1080, h: 1080 },
    { id: 'ig-portrait',  label: 'Instagram Portrait — 1080 × 1350',  w: 1080, h: 1350 },
    { id: 'ig-landscape', label: 'Instagram Landscape — 1080 × 566',  w: 1080, h: 566 },
    { id: 'story',        label: 'Story / Reel — 1080 × 1920',        w: 1080, h: 1920 },
    { id: 'ipad11',       label: 'iPad 11″ Wallpaper — 1668 × 2388',  w: 1668, h: 2388 },
    { id: 'mbp14',        label: 'MacBook 14″ Wallpaper — 3024 × 1964', w: 3024, h: 1964 },
    { id: 'mbp16',        label: 'MacBook 16″ Wallpaper — 3456 × 2234', w: 3456, h: 2234 },
    { id: 'pin',          label: 'Pinterest Pin — 1000 × 1500',       w: 1000, h: 1500 },
    { id: 'print-46',     label: 'Print 4×6 in — 1800 × 1200',        w: 1800, h: 1200 },
    { id: 'print-810',    label: 'Print 8×10 in — 3000 × 2400',       w: 3000, h: 2400 },
    { id: 'a4',           label: 'A4 Print — 2480 × 3508',            w: 2480, h: 3508 },
    { id: 'custom',       label: 'Custom size' }
];

const FONTS = {
    sans:   { label: 'Modern Sans',   stack: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" },
    serif:  { label: 'Classic Serif', stack: "Georgia, 'Times New Roman', serif" },
    script: { label: 'Handwritten',   stack: "'Snell Roundhand', 'Segoe Script', 'Brush Script MT', cursive" },
    mono:   { label: 'Typewriter',    stack: "'Courier New', Courier, monospace" }
};

const DEFAULT_FILTERS = { brightness: 100, contrast: 100, saturate: 100, grayscale: 0, sepia: 0 };

const FILTER_PRESETS = [
    { id: 'none',    label: 'Original', f: { ...DEFAULT_FILTERS } },
    { id: 'vivid',   label: 'Vivid',    f: { brightness: 105, contrast: 112, saturate: 135, grayscale: 0, sepia: 0 } },
    { id: 'warm',    label: 'Warm',     f: { brightness: 104, contrast: 102, saturate: 110, grayscale: 0, sepia: 28 } },
    { id: 'mono',    label: 'Mono',     f: { brightness: 102, contrast: 108, saturate: 100, grayscale: 100, sepia: 0 } },
    { id: 'vintage', label: 'Vintage',  f: { brightness: 106, contrast: 90, saturate: 82, grayscale: 0, sepia: 40 } },
    { id: 'fade',    label: 'Fade',     f: { brightness: 112, contrast: 82, saturate: 78, grayscale: 0, sepia: 8 } }
];

const BG_SWATCHES = [
    { c: '#ffffff' }, { c: '#111318' }, { c: '#f6efe6' }, { c: '#fbe4e6' }, { c: '#e0ecfd' }, { c: '#e2f6e9' },
    { g: ['#fceabb', '#f8b500'] }, { g: ['#fecfef', '#ff9a9e'] }, { g: ['#c2e9fb', '#a1c4fd'] },
    { g: ['#d4fc79', '#96e6a1'] }, { g: ['#667eea', '#764ba2'] }, { g: ['#2b3253', '#0f1115'] }
];

const MIN_LAYER_SIZE = 40;   // px, canvas units
const EDGE_MARGIN = 30;      // how much of a layer must stay on canvas
const SNAP_SCREEN_PX = 8;    // snap threshold in screen pixels
const RESIZE_STEP = 10;      // px added/removed by the + / - shortcuts
const HISTORY_LIMIT = 60;

// ---------- State ----------

const state = {
    canvas: { width: 1080, height: 1080, background: '#ffffff', gradient: null, transparent: false },
    layers: [],          // z-order = array order (index 0 is at the back)
    selectedId: null,
    gap: 16
};

let zoom = 1;
let zoomMode = 'fit';    // 'fit' re-computes on resize until the user zooms manually
let history = [];
let future = [];
let lastSnapshot = null;
let idCounter = 1;
let editingId = null;    // text layer currently in inline-edit mode

// ---------- DOM ----------

const $ = (id) => document.getElementById(id);

const viewportEl = $('viewport');
const stageEl = $('stage');
const canvasEl = $('canvas');
const clipEl = $('clip');
const selectionEl = $('selection-box');
const guideV = $('guide-v');
const guideH = $('guide-h');
const badgeEl = $('drag-badge');
const emptyStateEl = $('empty-state');
const fileInput = $('file-input');
const layersListEl = $('layers-list');

const layerEls = new Map();  // layer id -> element
const blobCache = new Map(); // photo layer id -> Blob (for autosave)

// ---------- Small helpers ----------

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const uid = () => `layer-${idCounter++}`;
const byId = (id) => state.layers.find((l) => l.id === id) || null;
const selectedLayer = () => byId(state.selectedId);
const snapshot = () => structuredClone({ canvas: state.canvas, layers: state.layers, gap: state.gap });

function toast(message) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    $('toasts').appendChild(el);
    setTimeout(() => {
        el.classList.add('leaving');
        setTimeout(() => el.remove(), 400);
    }, 2400);
}

function filterString(f) {
    if (!f) return 'none';
    const parts = [];
    if (f.brightness !== 100) parts.push(`brightness(${f.brightness}%)`);
    if (f.contrast !== 100) parts.push(`contrast(${f.contrast}%)`);
    if (f.saturate !== 100) parts.push(`saturate(${f.saturate}%)`);
    if (f.grayscale) parts.push(`grayscale(${f.grayscale}%)`);
    if (f.sepia) parts.push(`sepia(${f.sepia}%)`);
    return parts.join(' ') || 'none';
}

function textFont(layer) {
    return `${layer.bold ? 700 : 400} ${layer.fontSize}px ${FONTS[layer.font].stack}`;
}

const measureCtx = document.createElement('canvas').getContext('2d');

function measureTextLayer(layer) {
    measureCtx.font = textFont(layer);
    const lines = layer.text.split('\n');
    let maxW = 0;
    for (const line of lines) maxW = Math.max(maxW, measureCtx.measureText(line || ' ').width);
    layer.w = Math.max(24, maxW + layer.fontSize * 0.35);
    layer.h = lines.length * layer.fontSize * 1.25 + layer.fontSize * 0.25;
}

// fill in defaults so layers from older saves keep working
function normalizeLayer(layer) {
    if (!layer.type) layer.type = 'photo';
    if (layer.type === 'photo') {
        layer.filters = { ...DEFAULT_FILTERS, ...(layer.filters || {}) };
        layer.border = { width: 0, color: '#ffffff', ...(layer.border || {}) };
        layer.shadow = layer.shadow || 0;
    }
    return layer;
}

// ---------- Persistence (IndexedDB autosave) ----------

function openDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('collage-studio', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('project');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function idbPut(value) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('project', 'readwrite');
        tx.objectStore('project').put(value, 'current');
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
}

async function idbGet() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const req = db.transaction('project', 'readonly').objectStore('project').get('current');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

let saveTimer = null;

function scheduleAutosave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveProject, 800);
}

async function saveProject() {
    try {
        const layers = state.layers
            .map((L) => {
                const { src, ...rest } = L;
                return { ...structuredClone(rest), blob: L.type === 'photo' ? blobCache.get(L.id) || null : null };
            })
            .filter((L) => L.type === 'text' || L.blob);
        await idbPut({
            canvas: structuredClone(state.canvas),
            gap: state.gap,
            layers,
            savedAt: Date.now()
        });
    } catch { /* storage unavailable (private mode etc.) — editing still works */ }
}

async function loadProject() {
    try {
        const rec = await idbGet();
        if (!rec || !Array.isArray(rec.layers)) return false;
        state.canvas = { gradient: null, ...rec.canvas };
        state.gap = rec.gap ?? 16;
        state.layers = rec.layers.map(({ blob, ...rest }) => {
            const layer = normalizeLayer(rest);
            if (layer.type === 'photo') {
                layer.src = URL.createObjectURL(blob);
                blobCache.set(layer.id, blob);
            }
            return layer;
        });
        const nums = state.layers.map((l) => parseInt(String(l.id).split('-')[1], 10) || 0);
        idCounter = Math.max(0, ...nums) + 1;
        return state.layers.length > 0;
    } catch {
        return false;
    }
}

// ---------- History ----------

function commit() {
    history.push(lastSnapshot);
    if (history.length > HISTORY_LIMIT) history.shift();
    future = [];
    lastSnapshot = snapshot();
    updateHistoryButtons();
    scheduleAutosave();
}

function restore(snap, { animate = true } = {}) {
    state.canvas = snap.canvas;
    state.layers = snap.layers.map(normalizeLayer);
    state.gap = snap.gap;
    if (state.selectedId && !byId(state.selectedId)) state.selectedId = null;
    if (animate) animateNextRender();
    renderAll();
    scheduleAutosave();
}

function undo() {
    if (!history.length) return;
    future.push(snapshot());
    restore(history.pop());
    lastSnapshot = snapshot();
    updateHistoryButtons();
}

function redo() {
    if (!future.length) return;
    history.push(snapshot());
    restore(future.pop());
    lastSnapshot = snapshot();
    updateHistoryButtons();
}

function updateHistoryButtons() {
    $('undo-btn').disabled = history.length === 0;
    $('redo-btn').disabled = future.length === 0;
}

function animateNextRender() {
    canvasEl.classList.add('animating');
    clearTimeout(animateNextRender._t);
    animateNextRender._t = setTimeout(() => canvasEl.classList.remove('animating'), 450);
}

// ---------- Rendering ----------

function renderAll() {
    renderCanvas();
    renderLayers();
    syncSelection();
    renderLayersPanel();
    renderEditPanel();
    syncCanvasInputs();
}

function renderCanvas() {
    const { width, height, background, gradient, transparent } = state.canvas;
    canvasEl.style.width = `${width}px`;
    canvasEl.style.height = `${height}px`;
    canvasEl.classList.toggle('transparent', transparent);
    if (transparent) canvasEl.style.background = '';
    else if (gradient) canvasEl.style.background = `linear-gradient(135deg, ${gradient.from}, ${gradient.to})`;
    else canvasEl.style.background = background;
    if (zoomMode === 'fit') fitZoom();
    else applyZoom();
    updateExportHint();
}

function createLayerEl(layer) {
    const el = document.createElement('div');
    el.dataset.id = layer.id;
    if (layer.type === 'text') {
        el.className = 'layer text-layer';
        const content = document.createElement('div');
        content.className = 'text-content';
        content.textContent = layer.text;
        content.addEventListener('blur', commitTextEdit);
        content.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Escape') {
                e.preventDefault();
                content.blur();
            }
        });
        el.appendChild(content);
    } else {
        el.className = 'layer';
        const img = document.createElement('img');
        img.src = layer.src;
        img.alt = layer.name;
        img.draggable = false;
        el.appendChild(img);
    }
    return el;
}

function syncLayerEl(layer) {
    const el = layerEls.get(layer.id);
    if (!el) return;
    el.style.width = `${layer.w}px`;
    el.style.height = `${layer.h}px`;
    el.style.transform = `translate3d(${layer.x}px, ${layer.y}px, 0) rotate(${layer.rotation}deg)`;
    el.style.opacity = layer.opacity;

    if (layer.type === 'text') {
        const content = el.querySelector('.text-content');
        content.style.font = textFont(layer);
        content.style.color = layer.color;
        if (editingId !== layer.id && content.textContent !== layer.text) {
            content.textContent = layer.text;
        }
        return;
    }

    el.style.borderRadius = `${(layer.radius / 100) * Math.min(layer.w, layer.h)}px`;
    el.style.border = layer.border.width ? `${layer.border.width}px solid ${layer.border.color}` : '';
    el.style.boxShadow = layer.shadow
        ? `0 ${layer.shadow * 0.35}px ${layer.shadow}px rgba(0, 0, 0, 0.4)`
        : '';
    const img = el.querySelector('img');
    img.style.transform = `scale(${layer.flipH ? -1 : 1}, ${layer.flipV ? -1 : 1})`;
    img.style.filter = filterString(layer.filters);
}

function renderLayers() {
    for (const [id, el] of layerEls) {
        if (!byId(id)) {
            el.remove();
            layerEls.delete(id);
        }
    }
    for (const layer of state.layers) {
        let el = layerEls.get(layer.id);
        if (!el) {
            el = createLayerEl(layer);
            layerEls.set(layer.id, el);
        }
        clipEl.appendChild(el); // re-append: DOM order == stacking order
        syncLayerEl(layer);
    }
    // keep chrome elements above the layers
    canvasEl.append(guideV, guideH, badgeEl, selectionEl);
    emptyStateEl.style.display = state.layers.length ? 'none' : '';
}

function syncSelection() {
    const layer = selectedLayer();
    if (!layer || editingId === layer.id) {
        selectionEl.hidden = true;
        return;
    }
    selectionEl.hidden = false;
    selectionEl.classList.toggle('is-text', layer.type === 'text');
    selectionEl.style.width = `${layer.w}px`;
    selectionEl.style.height = `${layer.h}px`;
    selectionEl.style.transform = `translate3d(${layer.x}px, ${layer.y}px, 0) rotate(${layer.rotation}deg)`;
}

function selectLayer(id, { switchTab = true } = {}) {
    if (state.selectedId === id) {
        syncSelection();
        return;
    }
    state.selectedId = id;
    syncSelection();
    renderLayersPanel();
    renderEditPanel();
    if (switchTab) {
        if (id) activateTab('photo');
        else if (activeTab === 'photo') activateTab('canvas');
    }
}

// ---------- Zoom ----------

function applyZoom() {
    const { width, height } = state.canvas;
    stageEl.style.width = `${width * zoom + 88}px`;
    stageEl.style.height = `${height * zoom + 88}px`;
    canvasEl.style.transform = `scale(${zoom})`;
    canvasEl.style.setProperty('--zoom', zoom);
    $('zoom-fit-btn').textContent = `${Math.round(zoom * 100)}%`;
}

function setZoom(z, mode = 'manual') {
    zoom = clamp(z, 0.05, 4);
    zoomMode = mode;
    applyZoom();
}

function fitZoom() {
    const pad = 72;
    const w = viewportEl.clientWidth - pad;
    const h = viewportEl.clientHeight - pad;
    if (w <= 0 || h <= 0) return;
    setZoom(Math.min(w / state.canvas.width, h / state.canvas.height, 3), 'fit');
}

function toCanvasPoint(e) {
    const rect = canvasEl.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom };
}

// ---------- Adding photos & text ----------

async function addFiles(fileList) {
    const files = [...fileList].filter((f) => f.type.startsWith('image/'));
    if (!files.length) {
        toast('No image files found');
        return;
    }
    const loaded = await Promise.all(files.map((file) => new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const probe = new Image();
        probe.onload = () => resolve({ file, url, nw: probe.naturalWidth, nh: probe.naturalHeight, name: file.name });
        probe.onerror = () => resolve(null);
        probe.src = url;
    })));

    const ok = loaded.filter(Boolean);
    if (!ok.length) {
        toast('Could not read those files');
        return;
    }

    const { width: W, height: H } = state.canvas;
    ok.forEach((item, i) => {
        const scale = Math.min((W * 0.55) / item.nw, (H * 0.55) / item.nh);
        const w = Math.max(MIN_LAYER_SIZE, item.nw * scale);
        const h = Math.max(MIN_LAYER_SIZE, item.nh * scale);
        const offset = ((state.layers.length + i) % 6) * 28;
        const layer = normalizeLayer({
            id: uid(),
            type: 'photo',
            src: item.url,
            name: item.name.replace(/\.[^.]+$/, '') || 'Photo',
            x: (W - w) / 2 - 70 + offset,
            y: (H - h) / 2 - 70 + offset,
            w, h,
            rotation: 0,
            opacity: 1,
            radius: 0,
            flipH: false,
            flipV: false,
            nw: item.nw,
            nh: item.nh
        });
        blobCache.set(layer.id, item.file);
        state.layers.push(layer);
    });

    state.selectedId = state.layers[state.layers.length - 1].id;
    commit();
    renderAll();
    activateTab('photo');
    toast(`Added ${ok.length} photo${ok.length > 1 ? 's' : ''}`);
}

function addTextLayer() {
    const { width: W, height: H } = state.canvas;
    const layer = {
        id: uid(),
        type: 'text',
        text: 'Double-click to edit',
        font: 'sans',
        fontSize: Math.max(24, Math.round(W * 0.055)),
        bold: true,
        color: '#111111',
        x: 0, y: 0, w: 0, h: 0,
        rotation: 0,
        opacity: 1
    };
    measureTextLayer(layer);
    layer.x = (W - layer.w) / 2;
    layer.y = (H - layer.h) / 2;
    state.layers.push(layer);
    state.selectedId = layer.id;
    commit();
    renderAll();
    activateTab('photo');
}

// ---------- Inline text editing ----------

function startTextEdit(layer) {
    const el = layerEls.get(layer.id);
    if (!el || editingId === layer.id) return;
    commitTextEdit();
    editingId = layer.id;
    selectLayer(layer.id);
    el.classList.add('editing');
    const content = el.querySelector('.text-content');
    try { content.contentEditable = 'plaintext-only'; } catch { /* older engines */ }
    if (content.contentEditable !== 'plaintext-only') content.contentEditable = 'true';
    content.focus();
    const range = document.createRange();
    range.selectNodeContents(content);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    syncSelection(); // hides the selection box while editing
}

function commitTextEdit() {
    if (!editingId) return;
    const layer = byId(editingId);
    const el = layerEls.get(editingId);
    editingId = null;
    if (!layer || !el) return;
    const content = el.querySelector('.text-content');
    content.contentEditable = 'false';
    el.classList.remove('editing');
    const text = content.innerText.replace(/\u00A0/g, ' ').replace(/\n+$/, '');
    if (!text.trim()) {
        deleteLayer(layer.id);
        return;
    }
    if (text !== layer.text) {
        layer.text = text;
        measureTextLayer(layer);
        commit();
    }
    renderAll();
}

canvasEl.addEventListener('dblclick', (e) => {
    // the pointer capture taken in pointerdown retargets this event to the
    // canvas itself, so hit-test the pointer position to find the text layer
    const hit = document.elementFromPoint(e.clientX, e.clientY) || e.target;
    const layerEl = hit.closest('.layer.text-layer');
    if (!layerEl) return;
    const layer = byId(layerEl.dataset.id);
    if (layer) startTextEdit(layer);
});

// ---------- Pointer interactions (move / resize / rotate) ----------

let drag = null;
let rafPending = false;
let lastPointerEvent = null;

canvasEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;

    // let the browser handle text selection inside a layer being edited;
    // clicking anywhere else commits the edit first
    if (editingId) {
        const editEl = layerEls.get(editingId);
        if (editEl && editEl.contains(e.target)) return;
        commitTextEdit();
    }

    const handle = e.target.closest('[data-handle]');
    const layerEl = e.target.closest('.layer');
    const p = toCanvasPoint(e);

    if (handle) {
        const layer = selectedLayer();
        if (!layer) return;
        const kind = handle.dataset.handle;
        const cx = layer.x + layer.w / 2;
        const cy = layer.y + layer.h / 2;
        if (kind === 'rot') {
            drag = {
                type: 'rotate', layer, cx, cy,
                startAngle: Math.atan2(p.y - cy, p.x - cx) * 180 / Math.PI,
                origRotation: layer.rotation,
                moved: false
            };
        } else {
            // corners drag both axes; side handles (n/s/e/w) leave one axis at 0
            const sx = kind.includes('e') ? 1 : kind.includes('w') ? -1 : 0;
            const sy = kind.includes('s') ? 1 : kind.includes('n') ? -1 : 0;
            if (layer.type === 'text' && (!sx || !sy)) return; // text scales from corners only
            const rad = layer.rotation * Math.PI / 180;
            // fixed point in canvas coordinates: the opposite corner, or for a
            // side handle the midpoint of the opposite edge
            const ox = -sx * layer.w / 2;
            const oy = -sy * layer.h / 2;
            drag = {
                type: 'resize', layer, sx, sy, rad,
                fx: cx + ox * Math.cos(rad) - oy * Math.sin(rad),
                fy: cy + ox * Math.sin(rad) + oy * Math.cos(rad),
                aspect: layer.w / layer.h,
                origW: layer.w,
                origH: layer.h,
                origFont: layer.fontSize,
                moved: false
            };
        }
    } else if (layerEl) {
        const layer = byId(layerEl.dataset.id);
        if (!layer) return;
        selectLayer(layer.id);
        drag = { type: 'move', layer, start: p, ox: layer.x, oy: layer.y, moved: false };
    } else {
        selectLayer(null);
        return;
    }

    e.preventDefault();
    try { canvasEl.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
});

canvasEl.addEventListener('pointermove', (e) => {
    if (!drag) return;
    lastPointerEvent = e;
    if (!rafPending) {
        rafPending = true;
        requestAnimationFrame(applyDrag);
    }
});

function applyDrag() {
    rafPending = false;
    if (!drag || !lastPointerEvent) return;
    const e = lastPointerEvent;
    const p = toCanvasPoint(e);
    const L = drag.layer;
    const { width: W, height: H } = state.canvas;

    if (drag.type === 'move') {
        let nx = drag.ox + (p.x - drag.start.x);
        let ny = drag.oy + (p.y - drag.start.y);
        const snapped = applySnap(L, nx, ny, e.altKey);
        nx = snapped.x;
        ny = snapped.y;
        L.x = clamp(nx, EDGE_MARGIN - L.w, W - EDGE_MARGIN);
        L.y = clamp(ny, EDGE_MARGIN - L.h, H - EDGE_MARGIN);
        showBadge(L.x + L.w / 2, L.y, `${Math.round(L.x)}, ${Math.round(L.y)}`);
    } else if (drag.type === 'resize') {
        const dx = p.x - drag.fx;
        const dy = p.y - drag.fy;
        const cos = Math.cos(-drag.rad);
        const sin = Math.sin(-drag.rad);
        // pointer offset from the fixed point in the layer's local axes; a zero
        // sx/sy (side handle) keeps that dimension at its original size
        let lw = drag.sx ? (dx * cos - dy * sin) * drag.sx : drag.origW;
        let lh = drag.sy ? (dx * sin + dy * cos) * drag.sy : drag.origH;
        lw = Math.max(MIN_LAYER_SIZE, lw);
        lh = Math.max(MIN_LAYER_SIZE, lh);
        if (L.type === 'text') {
            // text scales uniformly through its type size
            const s = Math.max(lw / drag.origW, lh / drag.origH);
            L.fontSize = clamp(Math.round(drag.origFont * s), 8, 800);
            measureTextLayer(L);
            lw = L.w;
            lh = L.h;
            showBadge(drag.fx, L.y, `${L.fontSize} px`);
        } else {
            if (e.shiftKey) {
                if (!drag.sx || !drag.sy) {
                    // side handle: scale both axes from the dragged one; the
                    // perpendicular axis grows evenly around the fixed edge's
                    // midpoint because the center offset along it stays 0
                    const s = Math.max(
                        drag.sx ? lw / drag.origW : lh / drag.origH,
                        MIN_LAYER_SIZE / drag.origW,
                        MIN_LAYER_SIZE / drag.origH
                    );
                    lw = drag.origW * s;
                    lh = drag.origH * s;
                } else if (lw / drag.aspect > lh) lh = lw / drag.aspect;
                else lw = lh * drag.aspect;
            }
            L.w = lw;
            L.h = lh;
            showBadge(drag.fx, L.y, `${Math.round(lw)} × ${Math.round(lh)}`);
        }
        const hx = drag.sx * lw / 2;
        const hy = drag.sy * lh / 2;
        const cx = drag.fx + hx * Math.cos(drag.rad) - hy * Math.sin(drag.rad);
        const cy = drag.fy + hx * Math.sin(drag.rad) + hy * Math.cos(drag.rad);
        L.x = cx - lw / 2;
        L.y = cy - lh / 2;
    } else if (drag.type === 'rotate') {
        const angle = Math.atan2(p.y - drag.cy, p.x - drag.cx) * 180 / Math.PI;
        let rot = drag.origRotation + (angle - drag.startAngle);
        if (e.shiftKey) {
            rot = Math.round(rot / 15) * 15;
        } else {
            const near = Math.round(rot / 90) * 90;
            if (Math.abs(rot - near) < 4) rot = near;
        }
        rot = ((rot % 360) + 360) % 360;
        L.rotation = rot;
        showBadge(drag.cx, L.y, `${Math.round(rot)}°`);
    }

    drag.moved = true;
    syncLayerEl(L);
    syncSelection();
    if (drag.type !== 'move') hideGuides();
}

function endDrag() {
    if (!drag) return;
    if (rafPending) applyDrag(); // flush a move that hasn't hit its animation frame yet
    const moved = drag.moved;
    drag = null;
    lastPointerEvent = null;
    hideGuides();
    badgeEl.hidden = true;
    if (moved) {
        commit();
        renderEditPanel();
    }
}

canvasEl.addEventListener('pointerup', endDrag);
canvasEl.addEventListener('pointercancel', endDrag);

// click on the workspace outside the canvas deselects
viewportEl.addEventListener('pointerdown', (e) => {
    if (e.target === viewportEl || e.target === stageEl) {
        commitTextEdit();
        selectLayer(null);
    }
});

// ---------- Snapping ----------

function applySnap(layer, nx, ny, disabled) {
    hideGuides();
    if (disabled) return { x: nx, y: ny };
    const threshold = SNAP_SCREEN_PX / zoom;
    const { width: W, height: H } = state.canvas;

    const xTargets = [0, W / 2, W];
    const yTargets = [0, H / 2, H];
    for (const other of state.layers) {
        if (other.id === layer.id) continue;
        xTargets.push(other.x, other.x + other.w / 2, other.x + other.w);
        yTargets.push(other.y, other.y + other.h / 2, other.y + other.h);
    }

    const xOffsets = [0, layer.w / 2, layer.w];
    const yOffsets = [0, layer.h / 2, layer.h];

    let bestX = null;
    let bestY = null;
    for (const t of xTargets) {
        for (const o of xOffsets) {
            const d = Math.abs(nx + o - t);
            if (d < threshold && (!bestX || d < bestX.d)) bestX = { d, x: t - o, line: t };
        }
    }
    for (const t of yTargets) {
        for (const o of yOffsets) {
            const d = Math.abs(ny + o - t);
            if (d < threshold && (!bestY || d < bestY.d)) bestY = { d, y: t - o, line: t };
        }
    }

    if (bestX) {
        nx = bestX.x;
        guideV.style.left = `${bestX.line}px`;
        guideV.hidden = false;
    }
    if (bestY) {
        ny = bestY.y;
        guideH.style.top = `${bestY.line}px`;
        guideH.hidden = false;
    }
    return { x: nx, y: ny };
}

function hideGuides() {
    guideV.hidden = true;
    guideH.hidden = true;
}

function showBadge(x, y, text) {
    badgeEl.hidden = false;
    badgeEl.textContent = text;
    badgeEl.style.left = `${x}px`;
    badgeEl.style.top = `${y}px`;
}

// ---------- Layer operations ----------

function deleteLayer(id) {
    const idx = state.layers.findIndex((l) => l.id === id);
    if (idx === -1) return;
    state.layers.splice(idx, 1);
    if (state.selectedId === id) state.selectedId = null;
    commit();
    renderAll();
}

function duplicateLayer(id) {
    const layer = byId(id);
    if (!layer) return;
    const copy = structuredClone(layer);
    copy.id = uid();
    copy.x += 28;
    copy.y += 28;
    if (copy.name) copy.name = `${layer.name} copy`;
    if (layer.type === 'photo' && blobCache.has(id)) blobCache.set(copy.id, blobCache.get(id));
    state.layers.push(copy);
    state.selectedId = copy.id;
    commit();
    renderAll();
}

function moveLayerOrder(id, delta) {
    const idx = state.layers.findIndex((l) => l.id === id);
    const to = idx + delta;
    if (idx === -1 || to < 0 || to >= state.layers.length) return;
    const [layer] = state.layers.splice(idx, 1);
    state.layers.splice(to, 0, layer);
    commit();
    renderAll();
}

function reorderLayer(draggedId, targetId) {
    if (draggedId === targetId) return;
    const from = state.layers.findIndex((l) => l.id === draggedId);
    const to = state.layers.findIndex((l) => l.id === targetId);
    if (from === -1 || to === -1) return;
    const [layer] = state.layers.splice(from, 1);
    state.layers.splice(to, 0, layer);
    commit();
    renderAll();
}

// grow/shrink the selected layer around its center, keeping the aspect ratio
function resizeSelectedBy(delta) {
    const layer = selectedLayer();
    if (!layer) return;
    const cx = layer.x + layer.w / 2;
    const cy = layer.y + layer.h / 2;
    if (layer.type === 'text') {
        const next = clamp(layer.fontSize + Math.sign(delta) * 2, 8, 800);
        if (next === layer.fontSize) return;
        layer.fontSize = next;
        measureTextLayer(layer);
    } else {
        const aspect = layer.h / layer.w;
        const nw = clamp(layer.w + delta, MIN_LAYER_SIZE, 20000);
        const nh = Math.max(MIN_LAYER_SIZE, nw * aspect);
        if (nw === layer.w) return;
        layer.w = nw;
        layer.h = nh;
    }
    layer.x = cx - layer.w / 2;
    layer.y = cy - layer.h / 2;
    syncLayerEl(layer);
    syncSelection();
    showBadge(cx, layer.y, layer.type === 'text' ? `${layer.fontSize} px` : `${Math.round(layer.w)} × ${Math.round(layer.h)}`);
    clearTimeout(window._kbdCommit);
    window._kbdCommit = setTimeout(() => {
        badgeEl.hidden = true;
        commit();
        renderEditPanel();
    }, 400);
}

function updateSelected(patch, { commitNow = false } = {}) {
    const layer = selectedLayer();
    if (!layer) return;
    Object.assign(layer, patch);
    if (layer.type === 'text') measureTextLayer(layer);
    syncLayerEl(layer);
    syncSelection();
    if (commitNow) commit();
}

// ---------- Auto layouts (photos only — text stays put) ----------

function layoutRects(kind, n) {
    const { width: W, height: H } = state.canvas;
    const g = state.gap;
    const rects = [];

    if (n === 1 && kind !== 'scatter') {
        return [{ x: g, y: g, w: W - 2 * g, h: H - 2 * g, r: 0 }];
    }

    if (kind === 'grid') {
        const cols = Math.max(1, Math.round(Math.sqrt(n * W / H)));
        const rows = Math.ceil(n / cols);
        const cellH = (H - g * (rows + 1)) / rows;
        for (let r = 0; r < rows; r++) {
            const count = Math.min(cols, n - r * cols);
            const cellW = (W - g * (count + 1)) / count;
            for (let c = 0; c < count; c++) {
                rects.push({ x: g + c * (cellW + g), y: g + r * (cellH + g), w: cellW, h: cellH, r: 0 });
            }
        }
    } else if (kind === 'columns') {
        const cellW = (W - g * (n + 1)) / n;
        for (let i = 0; i < n; i++) {
            rects.push({ x: g + i * (cellW + g), y: g, w: cellW, h: H - 2 * g, r: 0 });
        }
    } else if (kind === 'rows') {
        const cellH = (H - g * (n + 1)) / n;
        for (let i = 0; i < n; i++) {
            rects.push({ x: g, y: g + i * (cellH + g), w: W - 2 * g, h: cellH, r: 0 });
        }
    } else if (kind === 'spotlight') {
        const mainW = (W - 3 * g) * 0.62;
        rects.push({ x: g, y: g, w: mainW, h: H - 2 * g, r: 0 });
        const rest = n - 1;
        const sideX = g * 2 + mainW;
        const sideW = W - sideX - g;
        const cellH = (H - g * (rest + 1)) / rest;
        for (let i = 0; i < rest; i++) {
            rects.push({ x: sideX, y: g + i * (cellH + g), w: sideW, h: cellH, r: 0 });
        }
    } else if (kind === 'scatter') {
        const base = Math.min(W, H);
        for (let i = 0; i < n; i++) {
            const size = base * (0.3 + Math.random() * 0.16);
            rects.push({
                x: g + Math.random() * (W - size - 2 * g),
                y: g + Math.random() * (H - size - 2 * g),
                w: size,
                h: size * (0.8 + Math.random() * 0.4),
                r: Math.round((Math.random() - 0.5) * 24)
            });
        }
    }
    return rects;
}

function applyLayout(kind) {
    const photos = state.layers.filter((l) => l.type === 'photo');
    if (!photos.length) {
        toast('Add some photos first');
        return;
    }
    const rects = layoutRects(kind, photos.length);
    photos.forEach((layer, i) => {
        const r = rects[i];
        if (!r) return;
        layer.x = r.x;
        layer.y = r.y;
        layer.w = Math.max(MIN_LAYER_SIZE, r.w);
        layer.h = Math.max(MIN_LAYER_SIZE, r.h);
        layer.rotation = r.r;
    });
    animateNextRender();
    commit();
    renderAll();
}

// ---------- Export ----------

function roundRectPath(ctx, x, y, w, h, r) {
    if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(x, y, w, h, r);
        return;
    }
    r = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
}

function drawLayer(ctx, layer) {
    ctx.save();
    ctx.globalAlpha = layer.opacity;
    ctx.translate(layer.x + layer.w / 2, layer.y + layer.h / 2);
    ctx.rotate(layer.rotation * Math.PI / 180);

    if (layer.type === 'text') {
        ctx.font = textFont(layer);
        ctx.fillStyle = layer.color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const lines = layer.text.split('\n');
        const lineH = layer.fontSize * 1.25;
        const total = lines.length * lineH;
        lines.forEach((line, i) => {
            ctx.fillText(line, 0, -total / 2 + lineH * (i + 0.5));
        });
        ctx.restore();
        return;
    }

    const el = layerEls.get(layer.id);
    const img = el && el.querySelector('img');
    if (!img || !img.complete || !img.naturalWidth) {
        ctx.restore();
        return;
    }

    const w = layer.w;
    const h = layer.h;
    const radius = (layer.radius / 100) * Math.min(w, h);
    const bw = Math.min(layer.border.width, w / 2 - 1, h / 2 - 1);

    // drop shadow behind the whole frame
    if (layer.shadow > 0) {
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
        ctx.shadowBlur = layer.shadow;
        ctx.shadowOffsetY = layer.shadow * 0.35;
        ctx.beginPath();
        roundRectPath(ctx, -w / 2, -h / 2, w, h, radius);
        ctx.fillStyle = '#000';
        ctx.fill();
        ctx.restore();
    }

    // border frame
    if (bw > 0) {
        ctx.beginPath();
        roundRectPath(ctx, -w / 2, -h / 2, w, h, radius);
        ctx.fillStyle = layer.border.color;
        ctx.fill();
    }

    // image clipped inside the frame, matching on-screen object-fit: cover
    const iw = w - 2 * bw;
    const ih = h - 2 * bw;
    ctx.beginPath();
    roundRectPath(ctx, -iw / 2, -ih / 2, iw, ih, Math.max(0, radius - bw));
    ctx.clip();
    if ('filter' in ctx) ctx.filter = filterString(layer.filters);
    ctx.scale(layer.flipH ? -1 : 1, layer.flipV ? -1 : 1);
    const scale = Math.max(iw / layer.nw, ih / layer.nh);
    const sw = iw / scale;
    const sh = ih / scale;
    ctx.drawImage(
        img,
        (layer.nw - sw) / 2, (layer.nh - sh) / 2, sw, sh,
        -iw / 2, -ih / 2, iw, ih
    );
    ctx.restore();
}

function backgroundFill(ctx) {
    const { width: W, height: H, background, gradient } = state.canvas;
    if (gradient) {
        // matches CSS linear-gradient(135deg, ...)
        const a = 135 * Math.PI / 180;
        const vx = Math.sin(a);
        const vy = -Math.cos(a);
        const half = (Math.abs(W * vx) + Math.abs(H * vy)) / 2;
        const g = ctx.createLinearGradient(W / 2 - vx * half, H / 2 - vy * half, W / 2 + vx * half, H / 2 + vy * half);
        g.addColorStop(0, gradient.from);
        g.addColorStop(1, gradient.to);
        return g;
    }
    return background;
}

async function exportBlob() {
    const scale = parseFloat($('export-scale').value) || 1;
    const format = $('export-format').value;
    const { width, height, transparent } = state.canvas;

    const out = document.createElement('canvas');
    out.width = Math.round(width * scale);
    out.height = Math.round(height * scale);
    const ctx = out.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.scale(scale, scale);

    if (!transparent || format === 'jpeg') {
        ctx.fillStyle = transparent ? '#ffffff' : backgroundFill(ctx);
        ctx.fillRect(0, 0, width, height);
    }
    for (const layer of state.layers) drawLayer(ctx, layer);

    const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    return new Promise((resolve) => out.toBlob(resolve, mime, 0.92));
}

async function downloadCollage() {
    if (!state.layers.length) {
        toast('Add some photos first');
        return;
    }
    commitTextEdit();
    const blob = await exportBlob();
    if (!blob) {
        toast('Export failed — try a smaller size');
        return;
    }
    const format = $('export-format').value === 'jpeg' ? 'jpg' : 'png';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `collage-${state.canvas.width}x${state.canvas.height}.${format}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('Collage downloaded');
}

function updateExportHint() {
    const scale = parseFloat($('export-scale').value) || 1;
    $('export-size-hint').textContent =
        `Output: ${Math.round(state.canvas.width * scale)} × ${Math.round(state.canvas.height * scale)} px`;
}

// ---------- Sidebar: tabs ----------

let activeTab = 'canvas';

function activateTab(name) {
    activeTab = name;
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === `panel-${name}`));
}

document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => activateTab(tab.dataset.tab));
});

// ---------- Sidebar: canvas panel ----------

function syncCanvasInputs() {
    const { width, height, background, gradient, transparent } = state.canvas;
    $('canvas-w').value = width;
    $('canvas-h').value = height;
    $('bg-color').value = background;
    $('bg-transparent').checked = transparent;
    const preset = PRESETS.find((p) => p.w === width && p.h === height);
    $('preset-select').value = preset ? preset.id : 'custom';
    $('gap-range').value = state.gap;
    $('gap-value').textContent = `${state.gap} px`;

    document.querySelectorAll('.swatch').forEach((el, i) => {
        const s = BG_SWATCHES[i];
        const active = !transparent && (s.c
            ? !gradient && background.toLowerCase() === s.c
            : gradient && gradient.from === s.g[0] && gradient.to === s.g[1]);
        el.classList.toggle('active', active);
    });
}

function setCanvasSize(w, h) {
    w = clamp(Math.round(w) || state.canvas.width, 100, 6000);
    h = clamp(Math.round(h) || state.canvas.height, 100, 6000);
    if (w === state.canvas.width && h === state.canvas.height) return;
    state.canvas.width = w;
    state.canvas.height = h;
    zoomMode = 'fit';
    commit();
    renderAll();
}

const presetSelect = $('preset-select');
for (const p of PRESETS) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.label;
    presetSelect.appendChild(opt);
}

presetSelect.addEventListener('change', () => {
    const preset = PRESETS.find((p) => p.id === presetSelect.value);
    if (preset && preset.w) setCanvasSize(preset.w, preset.h);
});

$('canvas-w').addEventListener('change', (e) => setCanvasSize(parseInt(e.target.value, 10), state.canvas.height));
$('canvas-h').addEventListener('change', (e) => setCanvasSize(state.canvas.width, parseInt(e.target.value, 10)));
$('swap-size-btn').addEventListener('click', () => setCanvasSize(state.canvas.height, state.canvas.width));

$('bg-color').addEventListener('input', (e) => {
    state.canvas.background = e.target.value;
    state.canvas.gradient = null;
    state.canvas.transparent = false;
    renderCanvas();
    syncCanvasInputs();
});
$('bg-color').addEventListener('change', () => commit());

$('bg-transparent').addEventListener('change', (e) => {
    state.canvas.transparent = e.target.checked;
    commit();
    renderCanvas();
    syncCanvasInputs();
});

// build the background swatch grid
const swatchesEl = $('bg-swatches');
BG_SWATCHES.forEach((s) => {
    const el = document.createElement('button');
    el.className = 'swatch';
    el.type = 'button';
    if (s.c) {
        el.style.background = s.c;
        el.title = s.c;
    } else {
        el.style.background = `linear-gradient(135deg, ${s.g[0]}, ${s.g[1]})`;
        el.title = 'Gradient';
    }
    el.addEventListener('click', () => {
        if (s.c) {
            state.canvas.background = s.c;
            state.canvas.gradient = null;
        } else {
            state.canvas.gradient = { from: s.g[0], to: s.g[1] };
        }
        state.canvas.transparent = false;
        commit();
        renderCanvas();
        syncCanvasInputs();
    });
    swatchesEl.appendChild(el);
});

$('gap-range').addEventListener('input', (e) => {
    state.gap = parseInt(e.target.value, 10);
    $('gap-value').textContent = `${state.gap} px`;
});

document.querySelectorAll('.layout-btn').forEach((btn) => {
    btn.addEventListener('click', () => applyLayout(btn.dataset.layout));
});

$('export-scale').addEventListener('change', updateExportHint);

// Clear canvas: two-step inline confirmation instead of a blocking confirm()
const clearBtn = $('clear-btn');
let clearTimer = null;
clearBtn.addEventListener('click', () => {
    if (!state.layers.length) {
        toast('Canvas is already empty');
        return;
    }
    if (!clearBtn.classList.contains('confirming')) {
        clearBtn.classList.add('confirming');
        clearBtn.querySelector('span').textContent = 'Really clear everything?';
        clearTimer = setTimeout(resetClearBtn, 3000);
        return;
    }
    clearTimeout(clearTimer);
    resetClearBtn();
    state.layers = [];
    state.selectedId = null;
    commit();
    renderAll();
    toast('Canvas cleared — press Cmd/Ctrl+Z to undo');
});

function resetClearBtn() {
    clearBtn.classList.remove('confirming');
    clearBtn.querySelector('span').textContent = 'Clear canvas';
}

// ---------- Sidebar: edit panel (photo + text) ----------

// filter preset chips
const chipsEl = $('filter-chips');
FILTER_PRESETS.forEach((p) => {
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.type = 'button';
    chip.textContent = p.label;
    chip.dataset.preset = p.id;
    chip.addEventListener('click', () => {
        const layer = selectedLayer();
        if (!layer || layer.type !== 'photo') return;
        layer.filters = { ...p.f };
        syncLayerEl(layer);
        commit();
        renderEditPanel();
    });
    chipsEl.appendChild(chip);
});

// text font options
const textFontSelect = $('text-font');
for (const [id, font] of Object.entries(FONTS)) {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = font.label;
    textFontSelect.appendChild(opt);
}

function renderEditPanel() {
    const layer = selectedLayer();
    $('layer-count').textContent = state.layers.length;
    $('photo-empty').hidden = !!layer;
    $('photo-props').hidden = !layer || layer.type !== 'photo';
    $('text-props').hidden = !layer || layer.type !== 'text';
    if (!layer) return;

    if (layer.type === 'photo') {
        const f = layer.filters;
        $('brightness-range').value = f.brightness;
        $('brightness-value').textContent = `${f.brightness}%`;
        $('contrast-range').value = f.contrast;
        $('contrast-value').textContent = `${f.contrast}%`;
        $('saturation-range').value = f.saturate;
        $('saturation-value').textContent = `${f.saturate}%`;
        $('border-range').value = layer.border.width;
        $('border-value').textContent = `${layer.border.width} px`;
        $('border-color').value = layer.border.color;
        $('shadow-range').value = layer.shadow;
        $('shadow-value').textContent = layer.shadow;
        $('opacity-range').value = Math.round(layer.opacity * 100);
        $('opacity-value').textContent = `${Math.round(layer.opacity * 100)}%`;
        $('radius-range').value = layer.radius;
        $('radius-value').textContent = `${layer.radius}%`;
        $('rotation-input').value = Math.round(layer.rotation);
        const json = JSON.stringify(f);
        document.querySelectorAll('#filter-chips .chip').forEach((chip) => {
            const preset = FILTER_PRESETS.find((p) => p.id === chip.dataset.preset);
            chip.classList.toggle('active', JSON.stringify(preset.f) === json);
        });
    } else {
        $('text-font').value = layer.font;
        $('text-size').value = layer.fontSize;
        $('text-color').value = layer.color;
        $('text-bold-btn').classList.toggle('active', layer.bold);
        $('t-opacity-range').value = Math.round(layer.opacity * 100);
        $('t-opacity-value').textContent = `${Math.round(layer.opacity * 100)}%`;
        $('t-rotation-input').value = Math.round(layer.rotation);
    }
}

// -- photo controls --

function bindFilterSlider(id, valueId, key, suffix) {
    $(id).addEventListener('input', (e) => {
        const layer = selectedLayer();
        if (!layer || layer.type !== 'photo') return;
        layer.filters[key] = parseInt(e.target.value, 10);
        $(valueId).textContent = `${e.target.value}${suffix}`;
        syncLayerEl(layer);
        renderEditPanel();
    });
    $(id).addEventListener('change', () => commit());
}

bindFilterSlider('brightness-range', 'brightness-value', 'brightness', '%');
bindFilterSlider('contrast-range', 'contrast-value', 'contrast', '%');
bindFilterSlider('saturation-range', 'saturation-value', 'saturate', '%');

$('border-range').addEventListener('input', (e) => {
    const layer = selectedLayer();
    if (!layer || layer.type !== 'photo') return;
    layer.border.width = parseInt(e.target.value, 10);
    $('border-value').textContent = `${layer.border.width} px`;
    syncLayerEl(layer);
});
$('border-range').addEventListener('change', () => commit());

$('border-color').addEventListener('input', (e) => {
    const layer = selectedLayer();
    if (!layer || layer.type !== 'photo') return;
    layer.border.color = e.target.value;
    syncLayerEl(layer);
});
$('border-color').addEventListener('change', () => commit());

$('shadow-range').addEventListener('input', (e) => {
    const layer = selectedLayer();
    if (!layer || layer.type !== 'photo') return;
    layer.shadow = parseInt(e.target.value, 10);
    $('shadow-value').textContent = layer.shadow;
    syncLayerEl(layer);
});
$('shadow-range').addEventListener('change', () => commit());

$('opacity-range').addEventListener('input', (e) => {
    updateSelected({ opacity: parseInt(e.target.value, 10) / 100 });
    $('opacity-value').textContent = `${e.target.value}%`;
});
$('opacity-range').addEventListener('change', () => commit());

$('radius-range').addEventListener('input', (e) => {
    updateSelected({ radius: parseInt(e.target.value, 10) });
    $('radius-value').textContent = `${e.target.value}%`;
});
$('radius-range').addEventListener('change', () => commit());

$('rotation-input').addEventListener('change', (e) => {
    const value = ((parseInt(e.target.value, 10) || 0) % 360 + 360) % 360;
    updateSelected({ rotation: value }, { commitNow: true });
    e.target.value = value;
});

$('rotate-cw-btn').addEventListener('click', () => {
    const layer = selectedLayer();
    if (!layer) return;
    updateSelected({ rotation: (layer.rotation + 90) % 360 }, { commitNow: true });
    renderEditPanel();
});
$('rotate-ccw-btn').addEventListener('click', () => {
    const layer = selectedLayer();
    if (!layer) return;
    updateSelected({ rotation: ((layer.rotation - 90) % 360 + 360) % 360 }, { commitNow: true });
    renderEditPanel();
});

$('flip-h-btn').addEventListener('click', () => {
    const layer = selectedLayer();
    if (layer && layer.type === 'photo') updateSelected({ flipH: !layer.flipH }, { commitNow: true });
});
$('flip-v-btn').addEventListener('click', () => {
    const layer = selectedLayer();
    if (layer && layer.type === 'photo') updateSelected({ flipV: !layer.flipV }, { commitNow: true });
});

$('forward-btn').addEventListener('click', () => state.selectedId && moveLayerOrder(state.selectedId, 1));
$('backward-btn').addEventListener('click', () => state.selectedId && moveLayerOrder(state.selectedId, -1));
$('duplicate-btn').addEventListener('click', () => state.selectedId && duplicateLayer(state.selectedId));
$('delete-btn').addEventListener('click', () => state.selectedId && deleteLayer(state.selectedId));

// -- text controls --

$('text-font').addEventListener('change', (e) => {
    updateSelected({ font: e.target.value }, { commitNow: true });
});

$('text-size').addEventListener('change', (e) => {
    const value = clamp(parseInt(e.target.value, 10) || 24, 8, 800);
    updateSelected({ fontSize: value }, { commitNow: true });
    e.target.value = value;
});

$('text-bold-btn').addEventListener('click', () => {
    const layer = selectedLayer();
    if (!layer || layer.type !== 'text') return;
    updateSelected({ bold: !layer.bold }, { commitNow: true });
    renderEditPanel();
});

$('text-color').addEventListener('input', (e) => {
    updateSelected({ color: e.target.value });
});
$('text-color').addEventListener('change', () => commit());

$('t-opacity-range').addEventListener('input', (e) => {
    updateSelected({ opacity: parseInt(e.target.value, 10) / 100 });
    $('t-opacity-value').textContent = `${e.target.value}%`;
});
$('t-opacity-range').addEventListener('change', () => commit());

$('t-rotation-input').addEventListener('change', (e) => {
    const value = ((parseInt(e.target.value, 10) || 0) % 360 + 360) % 360;
    updateSelected({ rotation: value }, { commitNow: true });
    e.target.value = value;
});

$('t-rotate-cw-btn').addEventListener('click', () => {
    const layer = selectedLayer();
    if (!layer) return;
    updateSelected({ rotation: (layer.rotation + 90) % 360 }, { commitNow: true });
    renderEditPanel();
});
$('t-rotate-ccw-btn').addEventListener('click', () => {
    const layer = selectedLayer();
    if (!layer) return;
    updateSelected({ rotation: ((layer.rotation - 90) % 360 + 360) % 360 }, { commitNow: true });
    renderEditPanel();
});

$('t-forward-btn').addEventListener('click', () => state.selectedId && moveLayerOrder(state.selectedId, 1));
$('t-backward-btn').addEventListener('click', () => state.selectedId && moveLayerOrder(state.selectedId, -1));
$('t-duplicate-btn').addEventListener('click', () => state.selectedId && duplicateLayer(state.selectedId));
$('t-delete-btn').addEventListener('click', () => state.selectedId && deleteLayer(state.selectedId));

// ---------- Sidebar: layers panel ----------

function renderLayersPanel() {
    layersListEl.innerHTML = '';
    $('layers-empty').style.display = state.layers.length ? 'none' : '';
    $('layer-count').textContent = state.layers.length;

    // topmost layer first
    [...state.layers].reverse().forEach((layer) => {
        const row = document.createElement('div');
        row.className = 'layer-row';
        row.draggable = true;
        row.dataset.id = layer.id;
        if (layer.id === state.selectedId) row.classList.add('selected');

        let thumb;
        if (layer.type === 'text') {
            thumb = document.createElement('div');
            thumb.className = 'layer-thumb text-thumb';
            thumb.textContent = 'T';
        } else {
            thumb = document.createElement('img');
            thumb.className = 'layer-thumb';
            thumb.src = layer.src;
            thumb.alt = '';
        }

        const name = document.createElement('span');
        name.className = 'layer-name';
        name.textContent = layer.type === 'text' ? layer.text.split('\n')[0] : layer.name;

        const actions = document.createElement('div');
        actions.className = 'layer-row-actions';
        actions.innerHTML = `
            <button class="icon-btn" data-action="up" title="Bring forward"><svg><use href="#i-up"/></svg></button>
            <button class="icon-btn" data-action="down" title="Send backward"><svg><use href="#i-down"/></svg></button>
            <button class="icon-btn danger" data-action="delete" title="Delete"><svg><use href="#i-trash"/></svg></button>`;

        row.append(thumb, name, actions);

        row.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (btn) {
                if (btn.dataset.action === 'up') moveLayerOrder(layer.id, 1);
                else if (btn.dataset.action === 'down') moveLayerOrder(layer.id, -1);
                else deleteLayer(layer.id);
                return;
            }
            selectLayer(layer.id, { switchTab: false });
        });

        row.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', layer.id);
            e.dataTransfer.effectAllowed = 'move';
            row.classList.add('dragging');
        });
        row.addEventListener('dragend', () => row.classList.remove('dragging'));
        row.addEventListener('dragover', (e) => {
            e.preventDefault();
            row.classList.add('drag-over');
        });
        row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
        row.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            row.classList.remove('drag-over');
            reorderLayer(e.dataTransfer.getData('text/plain'), layer.id);
        });

        layersListEl.appendChild(row);
    });
}

// ---------- Top bar ----------

$('upload-btn').addEventListener('click', () => fileInput.click());
$('empty-upload-btn').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
    addFiles(e.target.files);
    fileInput.value = '';
});

$('add-text-btn').addEventListener('click', addTextLayer);
$('download-btn').addEventListener('click', downloadCollage);
$('undo-btn').addEventListener('click', undo);
$('redo-btn').addEventListener('click', redo);

$('zoom-in-btn').addEventListener('click', () => setZoom(zoom * 1.2));
$('zoom-out-btn').addEventListener('click', () => setZoom(zoom / 1.2));
$('zoom-fit-btn').addEventListener('click', fitZoom);

$('sidebar-toggle').addEventListener('click', () => $('sidebar').classList.toggle('open'));

// ---------- Theme toggle ----------

const themeBtn = $('theme-toggle');
const systemLight = window.matchMedia('(prefers-color-scheme: light)');

function currentTheme() {
    const explicit = document.documentElement.dataset.theme;
    if (explicit === 'light' || explicit === 'dark') return explicit;
    return systemLight.matches ? 'light' : 'dark';
}

function syncThemeButton() {
    const theme = currentTheme();
    themeBtn.querySelector('use').setAttribute('href', theme === 'dark' ? '#i-sun' : '#i-moon');
    const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    themeBtn.title = label;
    themeBtn.setAttribute('aria-label', label);
}

themeBtn.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.classList.add('theme-anim');
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('collage-theme', next); } catch { /* private mode */ }
    clearTimeout(themeBtn._animTimer);
    themeBtn._animTimer = setTimeout(() => document.documentElement.classList.remove('theme-anim'), 350);
    syncThemeButton();
});

// keep the icon accurate if the OS theme changes while no explicit choice is set
systemLight.addEventListener?.('change', syncThemeButton);
syncThemeButton();

viewportEl.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    setZoom(zoom * (e.deltaY > 0 ? 0.92 : 1.08));
}, { passive: false });

window.addEventListener('resize', () => {
    if (zoomMode === 'fit') fitZoom();
});

// ---------- Drag & drop + paste upload ----------

let dragDepth = 0;
const dropOverlay = $('drop-overlay');

window.addEventListener('dragenter', (e) => {
    if (![...e.dataTransfer.types].includes('Files')) return;
    dragDepth++;
    dropOverlay.hidden = false;
});
window.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) dropOverlay.hidden = true;
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    dropOverlay.hidden = true;
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
});

window.addEventListener('paste', (e) => {
    if (editingId) return; // pasting text into an edited layer stays plain text
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) addFiles(files);
});

// ---------- Keyboard shortcuts ----------

window.addEventListener('keydown', (e) => {
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;

    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
    }
    if (mod && e.key.toLowerCase() === 'd') {
        if (state.selectedId) {
            e.preventDefault();
            duplicateLayer(state.selectedId);
        }
        return;
    }

    const layer = selectedLayer();
    if (!layer) return;

    if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteLayer(layer.id);
        return;
    }
    if (e.key === 'Escape') {
        selectLayer(null);
        return;
    }
    if (e.key === 'Enter' && layer.type === 'text') {
        e.preventDefault();
        startTextEdit(layer);
        return;
    }
    if (mod && e.key === ']') {
        e.preventDefault();
        moveLayerOrder(layer.id, 1);
        return;
    }
    if (mod && e.key === '[') {
        e.preventDefault();
        moveLayerOrder(layer.id, -1);
        return;
    }

    // + / - grow or shrink the selected layer ("=" is the unshifted + key)
    if (!mod && (e.key === '+' || e.key === '=')) {
        e.preventDefault();
        resizeSelectedBy(e.shiftKey ? RESIZE_STEP * 5 : RESIZE_STEP);
        return;
    }
    if (!mod && (e.key === '-' || e.key === '_')) {
        e.preventDefault();
        resizeSelectedBy(e.shiftKey ? -RESIZE_STEP * 5 : -RESIZE_STEP);
        return;
    }

    const step = e.shiftKey ? 10 : 1;
    const nudge = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (nudge) {
        e.preventDefault();
        layer.x += nudge[0];
        layer.y += nudge[1];
        syncLayerEl(layer);
        syncSelection();
        clearTimeout(window._nudgeCommit);
        window._nudgeCommit = setTimeout(() => commit(), 400);
    }
});

// ---------- Init ----------

(async function init() {
    const restored = await loadProject();
    renderAll();
    fitZoom();
    lastSnapshot = snapshot();
    updateHistoryButtons();
    updateExportHint();
    if (restored) toast('Restored your last session');
})();

// exposed for debugging / automated testing
window.collageApp = { state, exportBlob, addFiles, addTextLayer, applyLayout, setZoom, fitZoom };
