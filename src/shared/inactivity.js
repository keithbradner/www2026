/**
 * Reset the kiosk to a landing route after a period of inactivity.
 * Ported from timmons/src/inactivity.js.
 */

const DEFAULT_TIMEOUT = 5 * 60 * 1000 // 5 minutes

let inactivityTimer = null

export function setupInactivityTimer(onTimeout, timeoutMs = DEFAULT_TIMEOUT) {
    function reset() {
        if (inactivityTimer) clearTimeout(inactivityTimer)
        inactivityTimer = setTimeout(onTimeout, timeoutMs)
    }

    ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'pointerdown'].forEach(evt => {
        document.addEventListener(evt, reset, { passive: true })
    })

    reset()
    return reset
}

export function clearInactivityTimer() {
    if (inactivityTimer) {
        clearTimeout(inactivityTimer)
        inactivityTimer = null
    }
}
