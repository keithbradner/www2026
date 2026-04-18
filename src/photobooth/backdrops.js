/**
 * Backdrop picker — runs MODNet segmentation on the captured image and
 * composites the subject over the chosen backdrop.
 */

import { segment, compositeOnBackground } from './segmentation.js'

export const BACKDROP_LIBRARY = [
    { id: 'none',        label: 'Original',     src: null },
    { id: 'rose',        label: 'Rose Garden',  src: '/backdrops/rose-garden.svg' },
    { id: 'champagne',   label: 'Champagne',    src: '/backdrops/champagne-room.svg' },
    { id: 'seaside',     label: 'Seaside',      src: '/backdrops/seaside.svg' }
]

export function renderBackdropPicker(panelEl, onSelect, currentId) {
    panelEl.innerHTML = ''
    for (const b of BACKDROP_LIBRARY) {
        const tile = document.createElement('button')
        tile.className = 'tool-item' + (b.id === currentId ? ' active' : '')
        tile.dataset.id = b.id
        tile.innerHTML = `
          <div class="swatch">${b.src ? `<img src="${b.src}" alt="" />` : `<div style="color: var(--cream); opacity: 0.6; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase;">Original</div>`}</div>
          <div class="label">${b.label}</div>
        `
        tile.addEventListener('click', () => {
            panelEl.querySelectorAll('.tool-item').forEach(el => el.classList.toggle('active', el === tile))
            onSelect(b)
        })
        panelEl.appendChild(tile)
    }
}

/**
 * Given the original capture canvas + a chosen backdrop,
 * run segmentation (once, cached) and composite the result.
 * Returns a new HTMLCanvasElement at the same resolution as capturedCanvas.
 */
let cachedMask = null
let cachedSource = null

export async function renderWithBackdrop(capturedCanvas, backdropSrc) {
    if (!backdropSrc) return capturedCanvas // Original — caller uses capturedCanvas directly

    if (cachedSource !== capturedCanvas) {
        cachedMask = null
        cachedSource = capturedCanvas
    }
    if (!cachedMask) cachedMask = await segment(capturedCanvas)

    const bgImg = await loadImage(backdropSrc)
    const bgCanvas = imageToCanvas(bgImg, capturedCanvas.width, capturedCanvas.height)
    return compositeOnBackground(capturedCanvas, cachedMask, bgCanvas)
}

export function clearBackdropCache() {
    cachedMask = null
    cachedSource = null
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => resolve(img)
        img.onerror = reject
        img.src = src
    })
}

function imageToCanvas(img, w, h) {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')
    // Cover fit
    const ia = img.naturalWidth / img.naturalHeight
    const ta = w / h
    let dw, dh, dx, dy
    if (ia > ta) { dh = h; dw = dh * ia; dx = (w - dw) / 2; dy = 0 }
    else { dw = w; dh = dw / ia; dx = 0; dy = (h - dh) / 2 }
    ctx.drawImage(img, dx, dy, dw, dh)
    return c
}
