/**
 * Sticker system: picker grid + draggable overlay layer.
 * Stickers are DOM elements positioned in sticker-layer-relative pixels.
 * On flatten (see editor.js), we walk state.stickers and draw each to the
 * export canvas after scaling stage coords to export coords.
 */

import { state } from './state.js'

export const STICKER_LIBRARY = [
    { id: 'heart',        src: '/stickers/heart.svg',        label: 'Heart' },
    { id: 'heart-arrow',  src: '/stickers/heart-arrow.svg',  label: 'Cupid' },
    { id: 'star',         src: '/stickers/star.svg',         label: 'Star' },
    { id: 'sparkle',      src: '/stickers/sparkle.svg',      label: 'Sparkle' },
    { id: 'crown',        src: '/stickers/crown.svg',        label: 'Crown' },
    { id: 'boombox',      src: '/stickers/boombox.svg',      label: 'Boombox' },
    { id: 'cassette',     src: '/stickers/cassette.svg',     label: 'Mixtape' },
    { id: 'cd',           src: '/stickers/cd.svg',           label: 'CD' },
    { id: 'vinyl',        src: '/stickers/vinyl.svg',        label: 'Vinyl' },
    { id: 'microphone',   src: '/stickers/microphone.svg',   label: 'Mic' },
    { id: 'disco-ball',   src: '/stickers/disco-ball.svg',   label: 'Disco' },
    { id: 'roller-skate', src: '/stickers/roller-skate.svg', label: 'Skate' },
    { id: 'pager',        src: '/stickers/pager.svg',        label: 'Pager' },
    { id: 'butterfly',    src: '/stickers/butterfly.svg',    label: 'Butterfly' },
    { id: 'daisy',        src: '/stickers/daisy.svg',        label: 'Daisy' },
    { id: 'rainbow',      src: '/stickers/rainbow.svg',      label: 'Rainbow' },
    { id: 'lightning',    src: '/stickers/lightning.svg',    label: 'Lightning' },
    { id: 'peace',        src: '/stickers/peace.svg',        label: 'Peace' },
    { id: 'yinyang',      src: '/stickers/yinyang.svg',      label: 'Yin Yang' },
    { id: 'smiley',       src: '/stickers/smiley.svg',       label: 'Smiley' },
    { id: 'omg',          src: '/stickers/omg.svg',          label: 'OMG!' },
    { id: 'bff',          src: '/stickers/bff.svg',          label: 'BFF' },
    { id: 'win',          src: '/stickers/win.svg',          label: 'WIN!' }
]

let layerEl = null
let selected = null
let idCounter = 0

export function initStickers(layer) {
    layerEl = layer
    layerEl.classList.add('active')
    layerEl.addEventListener('pointerdown', (e) => {
        if (e.target === layerEl) clearSelection()
    })
}

export function renderStickerPicker(panelEl) {
    panelEl.innerHTML = ''
    for (const st of STICKER_LIBRARY) {
        const tile = document.createElement('button')
        tile.className = 'tool-item'
        tile.innerHTML = `
          <div class="swatch icon-only"><img src="${st.src}" alt="${st.label}" /></div>
          <div class="label">${st.label}</div>
        `
        tile.addEventListener('click', () => addSticker(st))
        panelEl.appendChild(tile)
    }
}

export function addSticker(st) {
    if (!layerEl) return
    const id = `sticker-${++idCounter}`
    const el = document.createElement('div')
    el.className = 'sticker'
    el.dataset.id = id

    const rect = layerEl.getBoundingClientRect()
    const size = 96
    // Place centered
    const x = rect.width / 2 - size / 2
    const y = rect.height / 2 - size / 2

    const data = { id, src: st.src, label: st.label, x, y, scale: 1, rotation: 0, el }
    el.style.left = `${x}px`
    el.style.top = `${y}px`
    el.style.width = `${size}px`
    el.style.height = `${size}px`
    el.innerHTML = `
      <img src="${st.src}" alt="" draggable="false" />
      <button class="sticker-handle sticker-delete" aria-label="Remove">×</button>
      <button class="sticker-handle sticker-rotate" aria-label="Rotate">↻</button>
      <button class="sticker-handle sticker-resize" aria-label="Resize">⇲</button>
    `
    const deleteBtn = el.querySelector('.sticker-delete')
    deleteBtn.addEventListener('pointerdown', (e) => { e.stopPropagation() })
    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        removeSticker(data)
    })

    attachRotateHandle(el.querySelector('.sticker-rotate'), el, data)
    attachResizeHandle(el.querySelector('.sticker-resize'), el, data)
    attachDragHandlers(el, data)

    layerEl.appendChild(el)
    state.stickers.push(data)
    select(data)
}

function attachRotateHandle(handle, el, data) {
    handle.addEventListener('pointerdown', (e) => {
        e.stopPropagation()
        handle.setPointerCapture(e.pointerId)
        select(data)
        const rect = el.getBoundingClientRect()
        const cx = rect.left + rect.width / 2
        const cy = rect.top + rect.height / 2
        const startAngle = Math.atan2(e.clientY - cy, e.clientX - cx)
        const startRot = data.rotation

        const move = (m) => {
            const a = Math.atan2(m.clientY - cy, m.clientX - cx)
            data.rotation = startRot + (a - startAngle)
            applyTransform(data)
        }
        const end = () => {
            handle.removeEventListener('pointermove', move)
            handle.removeEventListener('pointerup', end)
            handle.removeEventListener('pointercancel', end)
        }
        handle.addEventListener('pointermove', move)
        handle.addEventListener('pointerup', end)
        handle.addEventListener('pointercancel', end)
    })
    // Swallow clicks to avoid surprise selection side-effects.
    handle.addEventListener('click', (e) => e.stopPropagation())
}

function attachResizeHandle(handle, el, data) {
    handle.addEventListener('pointerdown', (e) => {
        e.stopPropagation()
        handle.setPointerCapture(e.pointerId)
        select(data)
        const rect = el.getBoundingClientRect()
        const cx = rect.left + rect.width / 2
        const cy = rect.top + rect.height / 2
        const startDist = Math.hypot(e.clientX - cx, e.clientY - cy)
        const startScale = data.scale || 1

        const move = (m) => {
            const d = Math.hypot(m.clientX - cx, m.clientY - cy)
            if (startDist <= 0) return
            data.scale = clamp(startScale * (d / startDist), 0.3, 4)
            applyTransform(data)
        }
        const end = () => {
            handle.removeEventListener('pointermove', move)
            handle.removeEventListener('pointerup', end)
            handle.removeEventListener('pointercancel', end)
        }
        handle.addEventListener('pointermove', move)
        handle.addEventListener('pointerup', end)
        handle.addEventListener('pointercancel', end)
    })
    handle.addEventListener('click', (e) => e.stopPropagation())
}

function attachDragHandlers(el, data) {
    const pointers = new Map()
    let pinchStart = null // { dist, scale, rotation, angle, cx, cy }
    let dragStart = null

    el.addEventListener('pointerdown', (e) => {
        e.stopPropagation()
        el.setPointerCapture(e.pointerId)
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

        if (pointers.size === 1) {
            select(data)
            const rect = layerEl.getBoundingClientRect()
            dragStart = {
                px: e.clientX,
                py: e.clientY,
                x: data.x,
                y: data.y
            }
        } else if (pointers.size === 2) {
            const [p1, p2] = Array.from(pointers.values())
            pinchStart = {
                dist: Math.hypot(p2.x - p1.x, p2.y - p1.y),
                scale: data.scale,
                rotation: data.rotation,
                angle: Math.atan2(p2.y - p1.y, p2.x - p1.x)
            }
            dragStart = null
        }
    })

    el.addEventListener('pointermove', (e) => {
        if (!pointers.has(e.pointerId)) return
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

        if (pointers.size === 2 && pinchStart) {
            const [p1, p2] = Array.from(pointers.values())
            const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y)
            const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x)
            data.scale = clamp(pinchStart.scale * (dist / pinchStart.dist), 0.3, 4)
            data.rotation = pinchStart.rotation + (angle - pinchStart.angle)
            applyTransform(data)
        } else if (pointers.size === 1 && dragStart) {
            data.x = dragStart.x + (e.clientX - dragStart.px)
            data.y = dragStart.y + (e.clientY - dragStart.py)
            applyTransform(data)
        }
    })

    const end = (e) => {
        pointers.delete(e.pointerId)
        if (pointers.size < 2) pinchStart = null
        if (pointers.size === 0) dragStart = null
    }
    el.addEventListener('pointerup', end)
    el.addEventListener('pointercancel', end)
}

function applyTransform(data) {
    data.el.style.left = `${data.x}px`
    data.el.style.top = `${data.y}px`
    data.el.style.transform = `rotate(${data.rotation}rad) scale(${data.scale})`
}

function select(data) {
    clearSelection()
    selected = data
    data.el.classList.add('selected')
}
function clearSelection() {
    if (selected) {
        selected.el.classList.remove('selected')
        selected = null
    }
}

export function removeSticker(data) {
    const idx = state.stickers.indexOf(data)
    if (idx >= 0) state.stickers.splice(idx, 1)
    data.el.remove()
    if (selected === data) selected = null
}

export function clearStickers() {
    for (const s of [...state.stickers]) removeSticker(s)
}

function clamp(v, a, b) { return Math.min(b, Math.max(a, v)) }
