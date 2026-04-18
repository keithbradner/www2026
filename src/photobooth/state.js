/**
 * Photobooth state machine + shared references.
 */

export const state = {
    // Runtime
    videoStream: null,
    capturedCanvas: null,   // OffscreenCanvas-like: HTMLCanvasElement with the raw capture (4:5)
    segMask: null,          // Float32Array soft mask, capture resolution
    baseCanvas: null,       // HTMLCanvasElement — source-of-truth after optional BG swap
    currentFilter: 'none',
    currentFrame: null,     // { src } or null
    stickers: [],           // [{ id, src, x, y, scale, rotation, el, pickerSrc, widthNorm }]

    // DOM references set at init
    elements: {}
}

export function setElements(map) { Object.assign(state.elements, map) }

export function showPanel(name) {
    for (const p of document.querySelectorAll('.panel')) {
        p.classList.toggle('hidden', p.id !== `panel-${name}`)
    }
}
