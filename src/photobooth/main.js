/**
 * Photobooth entry: wires top nav, camera, editor, and success flow.
 */

import { mountNav } from '../shared/nav.js'
import { setupInactivityTimer } from '../shared/inactivity.js'
import { state, setElements, showPanel } from './state.js'
import { initCamera, stopCamera, startCountdown } from './camera.js'
import { initEditor, flattenAndExport } from './editor.js'
import QRCode from 'qrcode'

// Public base URL used for QR codes and gallery links. The kiosk may be
// serving itself over LAN, but the phone scanning the QR needs the public
// Railway URL to reach the photo.
const PUBLIC_BASE_URL = 'https://jhm.up.railway.app'

mountNav('#top-nav')

setElements({
    video: document.getElementById('video'),
    cameraLoading: document.getElementById('camera-loading'),
    countdownOverlay: document.getElementById('countdown-overlay'),
    countdownNumber: document.getElementById('countdown-number'),
    captureBtn: document.getElementById('capture-btn'),
    captureLabel: document.getElementById('capture-label'),
    captureProcessing: document.getElementById('capture-processing'),
    captureProcessingText: document.getElementById('capture-processing-text'),

    editorCanvas: document.getElementById('editor-canvas'),
    stickersLayer: document.getElementById('stickers-layer'),
    editorProcessing: document.getElementById('editor-processing'),
    editorProcessingText: document.getElementById('editor-processing-text'),
    btnRetake: document.getElementById('btn-retake'),
    btnReset: document.getElementById('btn-reset'),
    btnDone: document.getElementById('btn-done'),
    panels: {
        filters: document.getElementById('panel-filters'),
        frames: document.getElementById('panel-frames'),
        backdrops: document.getElementById('panel-backdrops'),
        stickers: document.getElementById('panel-stickers')
    },

    confirmImg: document.getElementById('confirm-img'),
    btnConfirmBack: document.getElementById('btn-confirm-back'),
    btnConfirmPost: document.getElementById('btn-confirm-post'),

    qrCanvas: document.getElementById('qr-canvas'),
    qrLink: document.getElementById('qr-link'),
    btnAgain: document.getElementById('btn-again'),
    btnViewGallery: document.getElementById('btn-view-gallery')
})

// Flattened dataURL carries over from editor → confirm → post.
let pendingDataUrl = null

// --- Stage wiring ---
state.elements.captureBtn.addEventListener('click', () => {
    if (state.elements.captureBtn.disabled) return
    startCountdown(onCaptureDone)
})

async function onCaptureDone(capturedCanvas) {
    stopCamera()
    showPanel('editor')
    await initEditor({ capturedCanvas })
}

state.elements.btnRetake.addEventListener('click', () => {
    showPanel('camera')
    initCamera()
})

state.elements.btnDone.addEventListener('click', async () => {
    state.elements.btnDone.disabled = true
    try {
        pendingDataUrl = await flattenAndExport()
        state.elements.confirmImg.src = pendingDataUrl
        showPanel('confirm')
    } catch (err) {
        console.error('Flatten failed:', err)
        alert('Something went wrong generating your photo. Try again.')
    } finally {
        state.elements.btnDone.disabled = false
    }
})

state.elements.btnConfirmBack.addEventListener('click', () => {
    pendingDataUrl = null
    showPanel('editor')
})

state.elements.btnConfirmPost.addEventListener('click', async () => {
    if (!pendingDataUrl) return
    state.elements.btnConfirmPost.disabled = true
    const originalText = state.elements.btnConfirmPost.textContent
    state.elements.btnConfirmPost.textContent = 'Posting…'
    try {
        const { id } = await uploadPhoto(pendingDataUrl)
        if (!id) throw new Error('Server did not return a photo id')
        await showSuccess(id)
    } catch (err) {
        console.error('Upload failed:', err)
        alert(uploadErrorMessage(err))
        state.elements.btnConfirmPost.textContent = originalText
        state.elements.btnConfirmPost.disabled = false
    }
})

state.elements.btnAgain.addEventListener('click', () => {
    window.location.reload()
})

state.elements.btnViewGallery.addEventListener('click', () => {
    window.location.href = '/gallery'
})

async function uploadPhoto(dataUrl) {
    const res = await fetch('/api/photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            image: dataUrl,
            settings: {
                filter: state.currentFilter,
                frame: state.currentFrame?.id || null,
                stickerCount: state.stickers.length
            }
        })
    })
    if (!res.ok) {
        let serverMsg = ''
        try { serverMsg = (await res.json()).error || '' } catch {}
        const err = new Error(`Upload failed: ${res.status}${serverMsg ? ` — ${serverMsg}` : ''}`)
        err.status = res.status
        err.serverMsg = serverMsg
        throw err
    }
    return await res.json()
}

function uploadErrorMessage(err) {
    if (err?.status === 413) return 'Photo is too large to upload. Try again with fewer stickers.'
    if (err?.status >= 500) return `Server error (${err.status}). Try again in a moment.`
    if (err?.status) return `Upload failed (${err.status}). ${err.serverMsg || 'Try again.'}`
    return 'Upload failed. Check the connection and try again.'
}

async function showSuccess(id) {
    const url = `${PUBLIC_BASE_URL}/gallery?photo=${id}`
    showPanel('success')
    await QRCode.toCanvas(state.elements.qrCanvas, url, {
        width: 240,
        margin: 1,
        color: { dark: '#1a1520', light: '#fbf6ef' }
    })
    state.elements.qrLink.textContent = url
}

// --- Boot: go straight into camera panel ---
showPanel('camera')
initCamera()

// Idle guests — reset to carousel
setupInactivityTimer(() => { window.location.href = '/' }, 5 * 60 * 1000)
