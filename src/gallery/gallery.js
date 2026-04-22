/**
 * /gallery — public photo wall. Newest first, click-to-zoom, auto-refresh.
 */

const REFRESH_MS = 30_000
const CAPTIONS = ['♥ fan club', 'omg!', 'BFF', 'yes pls', '★ VIP ★', 'dream', 'no. 1', 'heart-throb', 'backstage', 'mixtape']

const gridEl = document.getElementById('gallery-grid')
const emptyEl = document.getElementById('gallery-empty')
const noticeEl = document.getElementById('gallery-notice')
const lightboxEl = document.getElementById('lightbox')
const lightboxImg = document.getElementById('lightbox-img')
const lightboxClose = document.getElementById('lightbox-close')

const knownIds = new Set()

const autoOpenId = new URLSearchParams(window.location.search).get('photo')
if (autoOpenId) autoOpenFromUrl(autoOpenId)

refresh()
setInterval(refresh, REFRESH_MS)

function imageUrl(id) {
    return `/api/photos/${id}/image`
}

async function autoOpenFromUrl(id) {
    // Probe existence before popping the lightbox, so a stale/bogus QR
    // doesn't leave an empty modal in the user's face.
    try {
        const res = await fetch(imageUrl(id), { method: 'HEAD' })
        if (!res.ok) {
            showNotice("Couldn't find that photo — here's the full gallery.")
            return
        }
        openLightbox(id)
    } catch {
        showNotice("Couldn't load that photo — here's the full gallery.")
    }
}

async function refresh() {
    try {
        const res = await fetch('/api/photos')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        renderList(data.items || [])
    } catch (err) {
        console.error('Gallery fetch failed:', err)
    }
}

function renderList(items) {
    if (!items.length) {
        emptyEl.classList.remove('hidden')
        gridEl.innerHTML = ''
        knownIds.clear()
        return
    }
    emptyEl.classList.add('hidden')

    const incoming = new Set(items.map(i => i.id))

    // Remove tiles that disappeared.
    for (const id of Array.from(knownIds)) {
        if (!incoming.has(id)) {
            const tile = gridEl.querySelector(`[data-photo-id="${cssEscape(id)}"]`)
            if (tile) tile.remove()
            knownIds.delete(id)
        }
    }

    // Insert new tiles in their correct position; leave existing tiles alone
    // so the browser doesn't re-request their images.
    items.forEach((p, idx) => {
        if (knownIds.has(p.id)) return
        const tile = buildTile(p.id, idx)
        const ref = gridEl.children[idx]
        if (ref) gridEl.insertBefore(tile, ref)
        else gridEl.appendChild(tile)
        knownIds.add(p.id)
    })
}

function buildTile(id, idx) {
    const tile = document.createElement('div')
    tile.className = 'gallery-tile'
    tile.dataset.photoId = id
    tile.innerHTML = `
      <img alt="" loading="lazy" src="${imageUrl(id)}" />
      <div class="tile-caption">${CAPTIONS[idx % CAPTIONS.length]}</div>
    `
    tile.addEventListener('click', () => openLightbox(id))
    return tile
}

function openLightbox(id) {
    lightboxImg.src = imageUrl(id)
    lightboxEl.classList.remove('hidden')
    logView(id)
}

function closeLightbox() {
    lightboxEl.classList.add('hidden')
}

async function logView(id) {
    try { await fetch(`/api/photos/${id}/log-view`, { method: 'POST' }) }
    catch {}
}

function showNotice(text) {
    if (!noticeEl) return
    noticeEl.textContent = text
    noticeEl.classList.remove('hidden')
    setTimeout(() => noticeEl.classList.add('hidden'), 6000)
}

// Minimal selector-safe escape for ids. Our ids are [a-z0-9]-ish from
// server-side generation, but guard anyway.
function cssEscape(s) {
    return (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/"/g, '\\"')
}

lightboxEl.addEventListener('click', (e) => {
    if (e.target === lightboxEl || e.target === lightboxClose) closeLightbox()
})
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeLightbox()
})
