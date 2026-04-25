/**
 * Camera init, countdown, and capture.
 * Adapted from timmons/src/photobooth.js (lines 144-283), with the 4K
 * resolution constraint relaxed to tablet-friendly 1920x2400.
 *
 * If the camera is unavailable (no device, denied permission, insecure
 * context, etc.) the panel falls back to a static backdrop image so the
 * user can still tap "Take Photo" and walk the rest of the editor flow —
 * useful for demos on machines without a webcam.
 */

import { state } from './state.js'

const CAPTURE_ASPECT = 4 / 5
const IDEAL_WIDTH = 1440
const IDEAL_HEIGHT = 1800
const FALLBACK_BACKDROP_SRC = '/backdrops/90s-doodles.jpg'

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
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const err = new Error('mediaDevices.getUserMedia not available')
        err.name = 'NotSupportedError'
        throw err
    }
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
        return 'No camera — demo mode'
    }
    if (!window.isSecureContext) {
        return 'Insecure context — demo mode'
    }
    switch (err && err.name) {
        case 'NotAllowedError':
        case 'SecurityError':
            return 'Camera blocked — demo mode'
        case 'NotFoundError':
        case 'OverconstrainedError':
            return 'No camera — demo mode'
        case 'NotReadableError':
            return 'Camera in use — demo mode'
        case 'AbortError':
            return 'Camera unavailable — demo mode'
        default:
            return 'No camera — demo mode'
    }
}

export async function initCamera() {
    resetCameraUI()

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
        console.warn('Camera unavailable — entering demo fallback:', err)
        await enterFallbackMode(describeCameraError(err))
    }
}

function resetCameraUI() {
    state.fallbackCanvas = null

    const video = state.elements.video
    video.style.display = ''

    const previewFrame = video.parentElement
    previewFrame.style.backgroundImage = ''
    previewFrame.style.backgroundSize = ''
    previewFrame.style.backgroundPosition = ''

    const lookHere = document.querySelector('.look-here')
    if (lookHere) lookHere.style.display = ''

    state.elements.cameraLoading.classList.remove('hidden')
    state.elements.cameraLoading.textContent = 'Starting camera…'
    state.elements.captureBtn.disabled = true
}

async function enterFallbackMode(message) {
    try {
        state.fallbackCanvas = await createFallbackCanvas(FALLBACK_BACKDROP_SRC)
    } catch (imgErr) {
        console.error('Fallback backdrop failed to load, using flat fill:', imgErr)
        state.fallbackCanvas = createFlatFallbackCanvas()
    }

    const video = state.elements.video
    video.style.display = 'none'

    const previewFrame = video.parentElement
    previewFrame.style.backgroundImage = `url("${FALLBACK_BACKDROP_SRC}")`
    previewFrame.style.backgroundSize = 'cover'
    previewFrame.style.backgroundPosition = 'center'

    // "Look here!" points at the (missing) camera lens — hide it in demo mode.
    const lookHere = document.querySelector('.look-here')
    if (lookHere) lookHere.style.display = 'none'

    state.elements.cameraLoading.classList.remove('hidden')
    state.elements.cameraLoading.textContent = message
    state.elements.captureBtn.disabled = false
}

async function createFallbackCanvas(src) {
    const img = await loadImage(src)
    const c = document.createElement('canvas')
    c.width = IDEAL_WIDTH
    c.height = IDEAL_HEIGHT
    drawCover(c.getContext('2d'), img, IDEAL_WIDTH, IDEAL_HEIGHT)
    return c
}

function createFlatFallbackCanvas() {
    const c = document.createElement('canvas')
    c.width = IDEAL_WIDTH
    c.height = IDEAL_HEIGHT
    const ctx = c.getContext('2d')
    const grad = ctx.createLinearGradient(0, 0, IDEAL_WIDTH, IDEAL_HEIGHT)
    grad.addColorStop(0, '#2a1a38')
    grad.addColorStop(0.5, '#ff3fa4')
    grad.addColorStop(1, '#5ec8ff')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, IDEAL_WIDTH, IDEAL_HEIGHT)
    return c
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

function drawCover(ctx, image, targetW, targetH) {
    const iw = image.width, ih = image.height
    const ta = targetW / targetH, ia = iw / ih
    let dw, dh, dx, dy
    if (ia > ta) {
        dh = targetH
        dw = dh * ia
        dx = (targetW - dw) / 2
        dy = 0
    } else {
        dw = targetW
        dh = dw / ia
        dx = 0
        dy = (targetH - dh) / 2
    }
    ctx.drawImage(image, dx, dy, dw, dh)
}

export function stopCamera() {
    if (state.videoStream) {
        state.videoStream.getTracks().forEach(t => t.stop())
        state.videoStream = null
    }
}

export function startCountdown(onDone) {
    const hasVideo = state.elements.video.videoWidth > 0
    const hasFallback = !!state.fallbackCanvas
    if (!hasVideo && !hasFallback) return

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
            const canvas = hasVideo
                ? captureFrame(state.elements.video)
                : state.fallbackCanvas
            if (hasVideo) state.elements.video.pause()
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
