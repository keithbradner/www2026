/**
 * Camera init, countdown, and capture.
 * Adapted from timmons/src/photobooth.js (lines 144-283), with the 4K
 * resolution constraint relaxed to tablet-friendly 1920x2400.
 */

import { state } from './state.js'

const CAPTURE_ASPECT = 4 / 5
const IDEAL_WIDTH = 1440
const IDEAL_HEIGHT = 1800

const BASE_VIDEO_CONSTRAINTS = {
    width: { ideal: IDEAL_WIDTH },
    height: { ideal: IDEAL_HEIGHT },
    aspectRatio: { ideal: CAPTURE_ASPECT },
    facingMode: 'user'
}

// focusMode/exposureMode/whiteBalanceMode are non-standard on most desktop
// cameras; try with them first, fall back without them on OverconstrainedError.
const ADVANCED_VIDEO_CONSTRAINTS = {
    ...BASE_VIDEO_CONSTRAINTS,
    focusMode: 'continuous',
    exposureMode: 'continuous',
    whiteBalanceMode: 'continuous'
}

async function requestCamera() {
    try {
        return await navigator.mediaDevices.getUserMedia({
            video: ADVANCED_VIDEO_CONSTRAINTS,
            audio: false
        })
    } catch (err) {
        if (err && err.name === 'OverconstrainedError') {
            console.warn('Advanced camera constraints rejected, retrying with base constraints:', err)
            return await navigator.mediaDevices.getUserMedia({
                video: BASE_VIDEO_CONSTRAINTS,
                audio: false
            })
        }
        throw err
    }
}

function describeCameraError(err) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return 'Camera not available. This page must be loaded over https:// or localhost.'
    }
    if (!window.isSecureContext) {
        return 'Insecure context: camera requires https:// or localhost.'
    }
    switch (err && err.name) {
        case 'NotAllowedError':
        case 'SecurityError':
            return 'Camera access denied. Enable camera permission for this site in your browser.'
        case 'NotFoundError':
        case 'OverconstrainedError':
            return 'No compatible camera found on this device.'
        case 'NotReadableError':
            return 'Camera is in use by another app. Close Zoom/Teams/etc. and reload.'
        case 'AbortError':
            return 'Camera start aborted. Reload the page to try again.'
        default:
            return `Camera error: ${(err && (err.message || err.name)) || 'unknown'}`
    }
}

export async function initCamera() {
    try {
        const stream = await requestCamera()
        state.videoStream = stream
        state.elements.video.srcObject = stream
        await state.elements.video.play()

        const track = stream.getVideoTracks()[0]
        const settings = track.getSettings()
        console.log(`Camera: ${settings.width}x${settings.height}`)

        state.elements.cameraLoading.classList.add('hidden')
        state.elements.captureBtn.disabled = false
    } catch (err) {
        console.error('Camera error:', err)
        state.elements.cameraLoading.textContent = describeCameraError(err)
    }
}

export function stopCamera() {
    if (state.videoStream) {
        state.videoStream.getTracks().forEach(t => t.stop())
        state.videoStream = null
    }
}

export function startCountdown(onDone) {
    if (!state.elements.video.videoWidth) return
    state.elements.captureBtn.disabled = true
    state.elements.countdownOverlay.classList.remove('hidden')

    let count = 3
    state.elements.countdownNumber.textContent = count

    const interval = setInterval(() => {
        count--
        if (count > 0) {
            state.elements.countdownNumber.textContent = count
            state.elements.countdownNumber.style.animation = 'none'
            void state.elements.countdownNumber.offsetWidth
            state.elements.countdownNumber.style.animation = 'countdownPop 900ms var(--ease-out)'
        } else {
            clearInterval(interval)
            state.elements.countdownOverlay.classList.add('hidden')
            const canvas = captureFrame(state.elements.video)
            state.elements.video.pause()
            setTimeout(() => onDone(canvas), 30)
        }
    }, 1000)
}

function captureFrame(video) {
    const vw = video.videoWidth, vh = video.videoHeight
    const va = vw / vh
    let cropW, cropH, cropX, cropY
    if (va > CAPTURE_ASPECT) {
        cropH = vh
        cropW = Math.round(vh * CAPTURE_ASPECT)
        cropX = Math.round((vw - cropW) / 2)
        cropY = 0
    } else {
        cropW = vw
        cropH = Math.round(vw / CAPTURE_ASPECT)
        cropX = 0
        cropY = Math.round((vh - cropH) / 2)
    }
    const c = document.createElement('canvas')
    c.width = cropW
    c.height = cropH
    const ctx = c.getContext('2d')
    // Mirror horizontally so front-camera preview matches the captured image
    ctx.translate(c.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH)
    console.log(`Captured ${cropW}x${cropH} (4:5 crop from ${vw}x${vh})`)
    return c
}
