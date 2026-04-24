/**
 * Editor — compositing pipeline, tab switching, flatten & upload.
 *
 * Render order (filter scoped to the photo only):
 *   1. If backdrop chosen: draw backdrop (no filter) → draw masked subject (filtered)
 *      Else: draw captured image (filtered)
 *   2. Frame overlay (no filter)
 *   3. Stickers (no filter)
 */

import { state } from './state.js'
import { FILTERS, getFilterCss } from './filters.js'
import { FRAME_LIBRARY, renderFramePicker } from './frames.js'
import {
    BACKDROP_LIBRARY,
    renderBackdropPicker,
    getMaskFor,
    loadBackdropImage,
    clearBackdropCache
} from './backdrops.js'
import { createMaskedSubject, drawCoverTo } from './segmentation.js'
import { STICKER_LIBRARY, initStickers, renderStickerPicker, clearStickers } from './stickers.js'

const EXPORT_WIDTH = 2000
const EXPORT_HEIGHT = 2500

let canvas = null
let ctx = null
let stageEl = null

// Backdrop state cached on the module so we don't re-fetch on every redraw.
let backdropImg = null          // HTMLImageElement of the chosen backdrop, null = original
let maskedSubjectCanvas = null  // Canvas containing just the subject with mask as alpha

export async function initEditor({ capturedCanvas }) {
    state.capturedCanvas = capturedCanvas
    state.currentFilter = 'none'
    state.currentFrame = null
    state.stickers = []
    backdropImg = null
    maskedSubjectCanvas = null
    clearBackdropCache()

    canvas = state.elements.editorCanvas
    stageEl = canvas.parentElement
    ctx = canvas.getContext('2d')

    // Display canvas res: match capture aspect, modest size for perf.
    const dispW = 640
    const dispH = Math.round(dispW * (capturedCanvas.height / capturedCanvas.width))
    canvas.width = dispW
    canvas.height = dispH

    const stickersLayer = state.elements.stickersLayer
    const placeStickersLayer = () => {
        const r = canvas.getBoundingClientRect()
        stickersLayer.style.width = `${r.width}px`
        stickersLayer.style.height = `${r.height}px`
    }
    placeStickersLayer()
    window.addEventListener('resize', placeStickersLayer)

    initStickers(stickersLayer)

    renderFilterPicker(state.elements.panels.filters)
    renderFramePicker(state.elements.panels.frames, onFrameChange, 'none')
    renderBackdropPicker(state.elements.panels.backdrops, onBackdropChange, 'none')
    renderStickerPicker(state.elements.panels.stickers)

    wireActions()
    await redrawDisplay()
}

function renderFilterPicker(panelEl) {
    panelEl.innerHTML = ''
    for (const f of FILTERS) {
        const tile = document.createElement('button')
        tile.className = 'tool-item' + (f.id === state.currentFilter ? ' active' : '')
        const swatch = f.icon
            ? `<div class="swatch swatch-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M8 7 L9.4 4.6 L14.6 4.6 L16 7" />
                  <rect x="3" y="7" width="18" height="12" rx="2" />
                  <circle cx="12" cy="13" r="4" />
                  <circle cx="17.5" cy="10" r="0.6" fill="currentColor" />
                </svg>
              </div>`
            : `<div class="swatch" style="filter: ${f.css}; background: linear-gradient(135deg, #f7b8d7, #c8a24a);"></div>`
        tile.innerHTML = `${swatch}<div class="label">${f.label}</div>`
        tile.addEventListener('click', () => {
            state.currentFilter = f.id
            panelEl.querySelectorAll('.tool-item').forEach(el => el.classList.toggle('active', el === tile))
            redrawDisplay()
        })
        panelEl.appendChild(tile)
    }
}

async function onFrameChange(frame) {
    state.currentFrame = frame.id === 'none' ? null : frame
    await redrawDisplay()
}

async function onBackdropChange(backdrop) {
    showEditorProcessing(backdrop.id === 'none' ? 'Removing backdrop…' : 'Placing backdrop…')
    try {
        if (backdrop.id === 'none') {
            backdropImg = null
            maskedSubjectCanvas = null
        } else {
            const [mask, img] = await Promise.all([
                getMaskFor(state.capturedCanvas),
                loadBackdropImage(backdrop.src)
            ])
            backdropImg = img
            maskedSubjectCanvas = createMaskedSubject(state.capturedCanvas, mask)
        }
        await redrawDisplay()
    } catch (err) {
        console.error('Backdrop change failed:', err)
        alert('Background swap failed — check console for details.')
    } finally {
        hideEditorProcessing()
    }
}

function wireActions() {
    state.elements.btnReset.addEventListener('click', resetEdits)
}

function resetEdits() {
    state.currentFilter = 'none'
    state.currentFrame = null
    backdropImg = null
    maskedSubjectCanvas = null
    clearBackdropCache()
    clearStickers()

    renderFilterPicker(state.elements.panels.filters)
    renderFramePicker(state.elements.panels.frames, onFrameChange, 'none')
    renderBackdropPicker(state.elements.panels.backdrops, onBackdropChange, 'none')
    redrawDisplay()
}

/**
 * Composite the scene onto `targetCtx` sized (w,h).
 * Filter applies ONLY to the photo (subject); backdrop/frame/stickers stay clean.
 */
async function compositeScene(targetCtx, w, h) {
    const filterCss = getFilterCss(state.currentFilter)

    if (backdropImg && maskedSubjectCanvas) {
        // Backdrop first, no filter, cover-fit.
        targetCtx.save()
        targetCtx.filter = 'none'
        drawCoverTo(targetCtx, backdropImg, w, h)
        targetCtx.restore()

        // Subject (masked) on top, with filter.
        targetCtx.save()
        targetCtx.filter = filterCss
        targetCtx.drawImage(maskedSubjectCanvas, 0, 0, w, h)
        targetCtx.restore()
    } else {
        // No backdrop — filter the whole captured frame.
        targetCtx.save()
        targetCtx.filter = filterCss
        targetCtx.drawImage(state.capturedCanvas, 0, 0, w, h)
        targetCtx.restore()
    }

    // Frame overlay — no filter.
    if (state.currentFrame) {
        const img = await loadImage(state.currentFrame.src)
        targetCtx.save()
        targetCtx.filter = 'none'
        targetCtx.drawImage(img, 0, 0, w, h)
        targetCtx.restore()
    }
}

async function redrawDisplay() {
    if (!state.capturedCanvas) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    await compositeScene(ctx, canvas.width, canvas.height)
}

function showEditorProcessing(message) {
    const overlay = state.elements.editorProcessing
    const text = state.elements.editorProcessingText
    if (text) text.textContent = message || 'Working…'
    overlay.classList.remove('hidden')
}
function hideEditorProcessing() { state.elements.editorProcessing.classList.add('hidden') }

/**
 * Flatten everything at export resolution and return a JPEG data URL.
 */
export async function flattenAndExport() {
    showEditorProcessing('Finalizing photo…')
    try {
        const exportCanvas = document.createElement('canvas')
        exportCanvas.width = EXPORT_WIDTH
        exportCanvas.height = EXPORT_HEIGHT
        const exCtx = exportCanvas.getContext('2d')

        await compositeScene(exCtx, EXPORT_WIDTH, EXPORT_HEIGHT)

        // Stickers — stage coords → export coords (no filter).
        const stageRect = state.elements.stickersLayer.getBoundingClientRect()
        const sx = EXPORT_WIDTH / stageRect.width
        const sy = EXPORT_HEIGHT / stageRect.height
        for (const st of state.stickers) {
            const img = await loadImage(st.src)
            const w = (st.el.offsetWidth || 96) * st.scale * sx
            const h = (st.el.offsetHeight || 96) * st.scale * sy
            const cxPx = st.x + (st.el.offsetWidth || 96) / 2
            const cyPx = st.y + (st.el.offsetHeight || 96) / 2
            const cx = cxPx * sx
            const cy = cyPx * sy
            exCtx.save()
            exCtx.filter = 'none'
            exCtx.translate(cx, cy)
            exCtx.rotate(st.rotation)
            exCtx.drawImage(img, -w / 2, -h / 2, w, h)
            exCtx.restore()
        }

        return exportCanvas.toDataURL('image/jpeg', 0.92)
    } finally {
        hideEditorProcessing()
    }
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
