/**
 * Camera init, countdown, and capture.
 * Adapted from timmons/src/photobooth.js (lines 144-283), with the 4K
 * resolution constraint relaxed to tablet-friendly 1920x2400.
 */

import { state } from './state.js'

const CAPTURE_ASPECT = 4 / 5
const IDEAL_WIDTH = 1440
const IDEAL_HEIGHT = 1800

export async function initCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: IDEAL_WIDTH },
                height: { ideal: IDEAL_HEIGHT },
                aspectRatio: { ideal: CAPTURE_ASPECT },
                facingMode: 'user',
                focusMode: 'continuous',
                exposureMode: 'continuous',
                whiteBalanceMode: 'continuous'
            },
            audio: false
        })
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
        state.elements.cameraLoading.textContent = 'Camera access denied. Please enable camera permissions.'
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
