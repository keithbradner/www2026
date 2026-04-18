/**
 * Top-right nav toggle shared by the auction and photobooth pages.
 * Renders the _other_ surface as a one-tap escape hatch.
 *
 * Each button is draggable: the staff can move it anywhere on screen and
 * the position persists in localStorage (separate key per button).
 */

const ICON_CAMERA = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 7h3l2-2h6l2 2h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
`

const ICON_TICKET = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8z" />
    <path d="M10 6v12" stroke-dasharray="2 3" />
  </svg>
`

const DRAG_THRESHOLD_PX = 6

export function mountNav(target = '#top-nav') {
    const host = typeof target === 'string' ? document.querySelector(target) : target
    if (!host) return

    const path = window.location.pathname
    const onPhotobooth = path.startsWith('/photobooth')

    const btn = document.createElement('button')
    btn.className = 'nav-btn'

    const passInner = (icon, label) => `
      <span class="pass-clip"></span>
      <span class="icon-wrap">${icon}</span>
      <span class="nav-label">${label}</span>
      <span class="pass-holo"></span>
    `

    let destination
    const storageKey = onPhotobooth ? 'wwww.navPos.auction' : 'wwww.navPos.photobooth'
    if (onPhotobooth) {
        btn.innerHTML = passInner(ICON_TICKET, 'Auction')
        btn.setAttribute('aria-label', 'Back to auction')
        destination = '/'
    } else {
        btn.innerHTML = passInner(ICON_CAMERA, 'Photobooth')
        btn.setAttribute('aria-label', 'Open photobooth')
        destination = '/photobooth'
    }

    const wrap = document.createElement('nav')
    wrap.className = 'top-nav'
    wrap.appendChild(btn)
    host.replaceWith(wrap)

    // Restore saved position after the element is in the DOM (so we can measure).
    applySavedPosition(wrap, storageKey)
    // Re-clamp on window resize so the button doesn't end up off-screen.
    window.addEventListener('resize', () => applySavedPosition(wrap, storageKey))

    attachDragAndClick(btn, wrap, storageKey, destination)
}

function applySavedPosition(wrap, storageKey) {
    const saved = readPos(storageKey)
    if (!saved) return
    const w = wrap.offsetWidth || 168
    const h = wrap.offsetHeight || 192
    const maxLeft = Math.max(0, window.innerWidth - w)
    const maxTop = Math.max(0, window.innerHeight - h)
    wrap.style.left = clamp(saved.left, 0, maxLeft) + 'px'
    wrap.style.top = clamp(saved.top, 0, maxTop) + 'px'
    wrap.style.right = 'auto'
}

function attachDragAndClick(btn, wrap, storageKey, destination) {
    let pointerId = null
    let start = null
    let moved = false

    btn.addEventListener('pointerdown', (e) => {
        if (pointerId !== null) return
        pointerId = e.pointerId
        const rect = wrap.getBoundingClientRect()
        start = {
            clientX: e.clientX,
            clientY: e.clientY,
            offsetX: e.clientX - rect.left,
            offsetY: e.clientY - rect.top
        }
        moved = false
        btn.setPointerCapture(e.pointerId)
    })

    btn.addEventListener('pointermove', (e) => {
        if (e.pointerId !== pointerId || !start) return
        const dx = e.clientX - start.clientX
        const dy = e.clientY - start.clientY
        if (!moved && Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
            moved = true
            btn.classList.add('is-dragging')
        }
        if (moved) {
            const w = wrap.offsetWidth
            const h = wrap.offsetHeight
            const left = clamp(e.clientX - start.offsetX, 0, window.innerWidth - w)
            const top = clamp(e.clientY - start.offsetY, 0, window.innerHeight - h)
            wrap.style.left = left + 'px'
            wrap.style.top = top + 'px'
            wrap.style.right = 'auto'
        }
    })

    const endDrag = (e) => {
        if (e.pointerId !== pointerId) return
        if (moved) {
            const rect = wrap.getBoundingClientRect()
            writePos(storageKey, { top: Math.round(rect.top), left: Math.round(rect.left) })
            // Keep 'is-dragging' through the synthetic click so our click
            // handler below knows to swallow it.
            requestAnimationFrame(() => {
                requestAnimationFrame(() => btn.classList.remove('is-dragging'))
            })
        }
        pointerId = null
        start = null
    }
    btn.addEventListener('pointerup', endDrag)
    btn.addEventListener('pointercancel', endDrag)

    btn.addEventListener('click', (e) => {
        // If the user dragged, suppress the synthetic click that follows.
        if (btn.classList.contains('is-dragging') || moved) {
            e.preventDefault()
            e.stopImmediatePropagation()
            moved = false
            return
        }
        window.location.href = destination
    })
}

function readPos(key) {
    try {
        const raw = localStorage.getItem(key)
        if (!raw) return null
        const v = JSON.parse(raw)
        if (typeof v?.top === 'number' && typeof v?.left === 'number') return v
        return null
    } catch {
        return null
    }
}
function writePos(key, pos) {
    try { localStorage.setItem(key, JSON.stringify(pos)) } catch {}
}
function clamp(v, min, max) { return Math.min(max, Math.max(min, v)) }
