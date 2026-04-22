/**
 * Backdrop picker — runs MODNet segmentation on the captured image so that
 * the editor can composite the subject over a chosen backdrop at render time
 * (keeps the filter applied to the subject only, not the backdrop).
 */

import { segment } from './segmentation.js'

export const BACKDROP_LIBRARY = [
    { id: 'none',          label: 'Original',          src: null },
    { id: 'patches',       label: 'Boy Band Patches',  src: '/backdrops/boy-band-patches.jpg' },
    { id: 'graffiti',      label: 'Graffiti Wall',     src: '/backdrops/graffiti-wall.jpg' },
    { id: 'may',           label: "It's Gonna Be May", src: '/backdrops/its-gonna-be-may.jpg' },
    { id: 'neon-squiggles', label: 'Neon Squiggles',   src: '/backdrops/neon-squiggles.jpg' },
    { id: 'doodles',       label: '90s Doodles',       src: '/backdrops/90s-doodles.jpg' },
    { id: 'memphis-floor', label: 'Memphis Floor',     src: '/backdrops/memphis-floor.jpg' },
    { id: 'terrazzo',      label: 'Terrazzo',          src: '/backdrops/terrazzo.jpg' },
    { id: 'memphis-grid',  label: 'Memphis Grid',      src: '/backdrops/memphis-grid.jpg' },
    { id: 'purple-memphis', label: 'Purple Memphis',   src: '/backdrops/purple-memphis.jpg' }
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

let cachedMask = null
let cachedSource = null

/** Lazy-compute & cache the MODNet mask for the captured canvas. */
export async function getMaskFor(capturedCanvas) {
    if (cachedSource !== capturedCanvas) {
        cachedMask = null
        cachedSource = capturedCanvas
    }
    if (!cachedMask) cachedMask = await segment(capturedCanvas)
    return cachedMask
}

export function clearBackdropCache() {
    cachedMask = null
    cachedSource = null
}

/** Load a backdrop image and return it as an HTMLImageElement. */
export function loadBackdropImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => resolve(img)
        img.onerror = reject
        img.src = src
    })
}
