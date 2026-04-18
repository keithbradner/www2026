/**
 * Editor — compositing pipeline, tab switching, flatten & upload.
 */

import { state } from './state.js'
import { FILTERS, getFilterCss } from './filters.js'
import { FRAME_LIBRARY, renderFramePicker } from './frames.js'
import { BACKDROP_LIBRARY, renderBackdropPicker, renderWithBackdrop, clearBackdropCache } from './backdrops.js'
import { STICKER_LIBRARY, initStickers, renderStickerPicker, clearStickers } from './stickers.js'

const EXPORT_WIDTH = 2000
const EXPORT_HEIGHT = 2500

let canvas = null
let ctx = null
let stageEl = null

let currentBackdrop = 'none'

export async function initEditor({ capturedCanvas }) {
    state.capturedCanvas = capturedCanvas
    state.baseCanvas = capturedCanvas
    state.currentFilter = 'none'
    state.currentFrame = null
    state.stickers = []
    currentBackdrop = 'none'
    clearBackdropCache()

    canvas = state.elements.editorCanvas
    stageEl = canvas.parentElement
    ctx = canvas.getContext('2d')

    // Display canvas res: match capture aspect, modest size for perf.
    const dispW = 640
    const dispH = Math.round(dispW * (capturedCanvas.height / capturedCanvas.width))
    canvas.width = dispW
    canvas.height = dispH

    // Size stickers layer to match the displayed canvas
    const stickersLayer = state.elements.stickersLayer
    const placeStickersLayer = () => {
        const r = canvas.getBoundingClientRect()
        stickersLayer.style.width = `${r.width}px`
        stickersLayer.style.height = `${r.height}px`
    }
    placeStickersLayer()
    window.addEventListener('resize', placeStickersLayer)

    initStickers(stickersLayer)

    // Populate panels
    renderFilterPicker(state.elements.panels.filters)
    renderFramePicker(state.elements.panels.frames, onFrameChange, 'none')
    renderBackdropPicker(state.elements.panels.backdrops, onBackdropChange, 'none')
    renderStickerPicker(state.elements.panels.stickers)

    wireTabs()
    wireActions()
    await redrawDisplay()
}

function renderFilterPicker(panelEl) {
    panelEl.innerHTML = ''
    for (const f of FILTERS) {
        const tile = document.createElement('button')
        tile.className = 'tool-item' + (f.id === state.currentFilter ? ' active' : '')
        tile.innerHTML = `
          <div class="swatch" style="filter: ${f.css}; background: linear-gradient(135deg, #f7b8d7, #c8a24a);"></div>
          <div class="label">${f.label}</div>
        `
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
    currentBackdrop = backdrop.id
    showEditorProcessing(backdrop.id === 'none' ? 'Removing backdrop…' : 'Placing backdrop…')
    try {
        if (backdrop.id === 'none') {
            state.baseCanvas = state.capturedCanvas
        } else {
            state.baseCanvas = await renderWithBackdrop(state.capturedCanvas, backdrop.src)
        }
        await redrawDisplay()
    } catch (err) {
        console.error('Backdrop change failed:', err)
        alert('Background swap failed — check console for details.')
    } finally {
        hideEditorProcessing()
    }
}

function wireTabs() {
    const tabs = document.querySelectorAll('.tool-tab')
    const panels = document.querySelectorAll('.tool-panel')
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const name = tab.dataset.tab
            tabs.forEach(t => t.classList.toggle('active', t === tab))
            panels.forEach(p => p.classList.toggle('active', p.dataset.panel === name))
        })
    })
}

function wireActions() {
    state.elements.btnReset.addEventListener('click', resetEdits)
}

function resetEdits() {
    state.currentFilter = 'none'
    state.currentFrame = null
    state.baseCanvas = state.capturedCanvas
    currentBackdrop = 'none'
    clearBackdropCache()
    clearStickers()

    // Re-render pickers with fresh active states
    renderFilterPicker(state.elements.panels.filters)
    renderFramePicker(state.elements.panels.frames, onFrameChange, 'none')
    renderBackdropPicker(state.elements.panels.backdrops, onBackdropChange, 'none')
    redrawDisplay()
}

async function redrawDisplay() {
    if (!state.baseCanvas) return
    ctx.save()
    ctx.filter = getFilterCss(state.currentFilter)
    ctx.drawImage(state.baseCanvas, 0, 0, canvas.width, canvas.height)
    ctx.restore()

    if (state.currentFrame) {
        const img = await loadImage(state.currentFrame.src)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    }
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

        // Base (filtered)
        exCtx.save()
        exCtx.filter = getFilterCss(state.currentFilter)
        exCtx.drawImage(state.baseCanvas, 0, 0, EXPORT_WIDTH, EXPORT_HEIGHT)
        exCtx.restore()

        // Frame
        if (state.currentFrame) {
            const frameImg = await loadImage(state.currentFrame.src)
            exCtx.drawImage(frameImg, 0, 0, EXPORT_WIDTH, EXPORT_HEIGHT)
        }

        // Stickers — stage coords → export coords
        const stageRect = state.elements.stickersLayer.getBoundingClientRect()
        const sx = EXPORT_WIDTH / stageRect.width
        const sy = EXPORT_HEIGHT / stageRect.height
        for (const st of state.stickers) {
            const img = await loadImage(st.src)
            const w = (st.el.offsetWidth || 96) * st.scale * sx
            const h = (st.el.offsetHeight || 96) * st.scale * sy
            // Sticker position is top-left corner of un-transformed element.
            // The rendered center is offset by half width/height (un-scaled).
            const cxPx = st.x + (st.el.offsetWidth || 96) / 2
            const cyPx = st.y + (st.el.offsetHeight || 96) / 2
            const cx = cxPx * sx
            const cy = cyPx * sy
            exCtx.save()
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
