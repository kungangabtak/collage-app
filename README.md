# Bethany's Collage Studio

## How to open the app (no tech skills needed)

1. Download the project (on GitHub: **Code → Download ZIP**) and unzip it.
2. Open the extracted folder.
3. Double-click **`OPEN COLLAGE STUDIO.html`**.

The app opens in your default web browser. **No installation, terminal, account, or internet connection is required** — everything runs on your computer, and your photos never leave it.

---

A fast, fully offline photo-collage editor that runs in the browser. Upload photos, arrange them freely or with one-click auto layouts, then export a pixel-perfect PNG or JPEG.

No build step, no frameworks, no CDNs — just `OPEN COLLAGE STUDIO.html`, `styles.css`, and `script.js` (`index.html` is a small stub that redirects to the app, so hosted setups like GitHub Pages keep working).

## Optional: developer server

Only needed for development — regular use is just double-clicking `OPEN COLLAGE STUDIO.html` as described above.

```bash
python3 serve.py
```

Then open <http://localhost:5500>. Pass a different port (`python3 serve.py 8080`) or add `--open` to launch your browser automatically.

Any static file server works too, e.g. `python3 -m http.server 5500` or `npx serve .`.

## Features

- **Canvas presets** for Instagram posts/stories, Pinterest pins, and print sizes (4×6, 8×10, A4) plus fully custom dimensions
- **Backgrounds** — any solid color, one-tap swatches and gradients, or full transparency
- **Zoom-to-fit workspace** — large canvases scale to your screen while exporting at full resolution (0.5×/1×/2× scale, PNG or JPEG)
- **Fluid editing** — drag, resize (corner handles), and rotate with a Figma-style selection box; smart snap guides against canvas edges, centers, and other photos
- **Auto layouts** — arrange all photos into a Grid, Columns, Rows, Spotlight, or playful Scatter with adjustable spacing, animated into place
- **Filters** — one-tap presets (Original, Vivid, Warm, Mono, Vintage, Fade) plus brightness, contrast, and saturation sliders
- **Photo styling** — borders (width + color), drop shadows, corner radius, opacity, rotation, flips; borders + Scatter = instant polaroid wall
- **Text layers** — add captions with the toolbar button, double-click to edit in place, choose font, size, color, and bold; corner handles scale the type
- **Layers panel** — thumbnails, drag-to-reorder, quick delete
- **Undo / redo** of every action (up to 60 steps)
- **Autosave** — the whole project (photos included) is saved to your browser's IndexedDB and restored when you come back
- **Dark & light themes** — warm charcoal dark mode and paper-toned light mode; follows your OS preference by default, and the sun/moon toggle in the top bar remembers your choice
- **Add photos any way you like** — the upload button, drag & drop from your desktop, or paste from the clipboard

## Keyboard shortcuts

| Keys | Action |
| --- | --- |
| `Cmd/Ctrl + Z` / `Shift + Cmd/Ctrl + Z` | Undo / redo |
| `Cmd/Ctrl + D` | Duplicate selected photo |
| `Delete` / `Backspace` | Delete selected photo |
| Arrow keys (`Shift` = ×10) | Nudge selected photo for micro adjustments |
| `+` / `-` (`Shift` = ×5) | Grow / shrink the selected photo by 10 px, keeping its aspect ratio (text scales its type size) |
| `Cmd/Ctrl + ]` / `Cmd/Ctrl + [` | Bring forward / send backward |
| `Shift` while resizing | Lock aspect ratio |
| `Shift` while rotating | Snap to 15° |
| `Alt` while dragging | Disable snapping |
| `Enter` | Edit selected text layer |
| `Esc` | Deselect (or finish text editing) |
| `Cmd/Ctrl + scroll` | Zoom |

## Notes

- Photos never leave your machine — everything happens in the browser.
- Exports honor exactly what you see: cover-cropping, rotation, opacity, rounded corners, and flips are all reproduced on the output canvas.

Made with ♥ for Bethany.
