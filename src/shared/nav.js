/**
 * Top-right nav toggle shared by the auction and photobooth pages.
 * Renders the _other_ surface as a one-tap escape hatch.
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

export function mountNav(target = '#top-nav') {
    const host = typeof target === 'string' ? document.querySelector(target) : target
    if (!host) return

    const path = window.location.pathname
    const onPhotobooth = path.startsWith('/photobooth')

    const btn = document.createElement('button')
    btn.className = 'nav-btn'

    if (onPhotobooth) {
        btn.innerHTML = `<span class="icon-wrap">${ICON_TICKET}</span><span class="nav-label">Auction</span>`
        btn.setAttribute('aria-label', 'Back to auction')
        btn.addEventListener('click', () => { window.location.href = '/' })
    } else {
        btn.innerHTML = `<span class="icon-wrap">${ICON_CAMERA}</span><span class="nav-label">Photobooth</span>`
        btn.setAttribute('aria-label', 'Open photobooth')
        btn.addEventListener('click', () => { window.location.href = '/photobooth' })
    }

    const wrap = document.createElement('nav')
    wrap.className = 'top-nav'
    wrap.appendChild(btn)
    host.replaceWith(wrap)
}
