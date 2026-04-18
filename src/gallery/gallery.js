/**
 * /gallery — public photo wall. Newest first, click-to-zoom, auto-refresh.
 */

const REFRESH_MS = 30_000
const CAPTIONS = ['♥ fan club', 'omg!', 'BFF', 'yes pls', '★ VIP ★', 'dream', 'no. 1', 'heart-throb', 'backstage', 'mixtape']

const gridEl = document.getElementById('gallery-grid')
const emptyEl = document.getElementById('gallery-empty')
const lightboxEl = document.getElementById('lightbox')
const lightboxImg = document.getElementById('lightbox-img')
const lightboxClose = document.getElementById('lightbox-close')

let knownIds = new Set()

refresh()
setInterval(refresh, REFRESH_MS)

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
        return
    }
    emptyEl.classList.add('hidden')

    // Rebuild if the set of IDs has changed.
    const ids = new Set(items.map(i => i.id))
    const changed =
        ids.size !== knownIds.size ||
        items.some(i => !knownIds.has(i.id))
    if (!changed) return
    knownIds = ids

    gridEl.innerHTML = ''
    items.forEach((p, idx) => {
        const tile = document.createElement('div')
        tile.className = 'gallery-tile'
        tile.innerHTML = `
          <img alt="" />
          <div class="tile-caption">${CAPTIONS[idx % CAPTIONS.length]}</div>
        `
        const img = tile.querySelector('img')
        fetch(`/api/photos/${p.id}`)
            .then(r => r.json())
            .then(d => { img.src = d.image })
            .catch(() => {})
        tile.addEventListener('click', () => {
            if (img.src) openLightbox(img.src)
        })
        gridEl.appendChild(tile)
    })
}

function openLightbox(src) {
    lightboxImg.src = src
    lightboxEl.classList.remove('hidden')
}
function closeLightbox() {
    lightboxEl.classList.add('hidden')
}
lightboxEl.addEventListener('click', (e) => {
    if (e.target === lightboxEl || e.target === lightboxClose) closeLightbox()
})
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeLightbox()
})
