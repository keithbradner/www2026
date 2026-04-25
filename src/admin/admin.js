/**
 * Admin console — auction items CRUD, photo gallery, logs.
 */

const els = {
    tabs: document.querySelectorAll('.admin-tab'),
    panels: document.querySelectorAll('.admin-panel'),

    itemsList: document.getElementById('items-list'),
    btnNew: document.getElementById('btn-new-item'),

    modal: document.getElementById('item-modal'),
    modalTitle: document.getElementById('modal-title'),
    modalClose: document.getElementById('modal-close'),
    modalCancel: document.getElementById('modal-cancel'),
    modalSave: document.getElementById('modal-save'),
    fieldTitle: document.getElementById('field-title'),
    fieldTagline: document.getElementById('field-tagline'),
    fieldDescription: document.getElementById('field-description'),
    imageSlots: document.getElementById('image-slots'),

    photosGrid: document.getElementById('photos-grid'),
    photoCount: document.getElementById('photo-count'),
    btnDeleteAllPhotos: document.getElementById('btn-delete-all-photos'),
    btnDownloadAllPhotos: document.getElementById('btn-download-all-photos'),

    logsTbody: document.getElementById('logs-tbody'),
    logTypeFilter: document.getElementById('log-type-filter'),
    btnRefreshLogs: document.getElementById('btn-refresh-logs'),
    btnClearLogs: document.getElementById('btn-clear-logs')
}

let editingItem = null

// ------------- Tabs -------------
els.tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        const name = tab.dataset.tab
        els.tabs.forEach(t => t.classList.toggle('active', t === tab))
        els.panels.forEach(p => p.classList.toggle('active', p.dataset.panel === name))
        if (name === 'photos') refreshPhotos()
        if (name === 'logs') refreshLogs()
    })
})

// ------------- Auction -------------
async function refreshItems() {
    const items = await (await fetch('/api/auction-items')).json()
    els.itemsList.innerHTML = ''
    if (!items.length) {
        els.itemsList.innerHTML = `<div style="padding: 24px; color: var(--mauve); text-align: center;">No auction items yet — click <strong>+ New auction item</strong> to create one.</div>`
        return
    }
    for (const item of items) {
        const row = document.createElement('div')
        row.className = 'item-row'
        const thumbs = []
        for (let s = 1; s <= 4; s++) {
            const img = item.images.find(i => i.position === s)
            thumbs.push(img
                ? `<img class="item-thumb" src="${img.url}" alt="" />`
                : `<div class="item-thumb empty">${s}</div>`)
        }
        row.innerHTML = `
            <div class="item-row-main">
              <h3>${escapeHtml(item.title)}</h3>
              ${item.tagline ? `<div class="item-row-tagline">${escapeHtml(item.tagline)}</div>` : ''}
              <p>${escapeHtml(item.description || '')}</p>
              <div class="item-row-thumbs">${thumbs.join('')}</div>
            </div>
            <div class="item-row-actions">
              <button class="btn-secondary" data-act="edit">Edit</button>
              <button class="btn-secondary btn-danger" data-act="delete">Delete</button>
            </div>
        `
        row.querySelector('[data-act="edit"]').addEventListener('click', () => openItemEditor(item))
        row.querySelector('[data-act="delete"]').addEventListener('click', () => deleteItem(item))
        els.itemsList.appendChild(row)
    }
}

els.btnNew.addEventListener('click', async () => {
    const res = await fetch('/api/admin/auction-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Untitled', tagline: '', description: '' })
    })
    if (!res.ok) return alert('Failed to create item')
    const item = await res.json()
    await refreshItems()
    openItemEditor(item)
})

async function deleteItem(item) {
    if (!confirm(`Delete "${item.title}" and its images?`)) return
    await fetch(`/api/admin/auction-items/${item.id}`, { method: 'DELETE' })
    await refreshItems()
}

function openItemEditor(item) {
    editingItem = item
    els.modalTitle.textContent = `Auction item — ${item.title}`
    els.fieldTitle.value = item.title || ''
    els.fieldTagline.value = item.tagline || ''
    els.fieldDescription.value = item.description || ''
    renderImageSlots(item)
    els.modal.classList.remove('hidden')
}

function closeModal() {
    els.modal.classList.add('hidden')
    editingItem = null
}
els.modalClose.addEventListener('click', closeModal)
els.modalCancel.addEventListener('click', closeModal)
els.modal.addEventListener('click', (e) => { if (e.target === els.modal) closeModal() })

els.modalSave.addEventListener('click', async () => {
    if (!editingItem) return
    const payload = {
        title: els.fieldTitle.value.trim() || 'Untitled',
        tagline: els.fieldTagline.value.trim(),
        description: els.fieldDescription.value.trim()
    }
    const res = await fetch(`/api/admin/auction-items/${editingItem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    if (!res.ok) return alert('Save failed')
    closeModal()
    await refreshItems()
})

function renderImageSlots(item) {
    els.imageSlots.innerHTML = ''
    for (let slot = 1; slot <= 4; slot++) {
        const img = item.images.find(i => i.position === slot)
        const wrap = document.createElement('div')
        wrap.className = 'image-slot'
        wrap.innerHTML = `
            <span class="image-slot-label">${slot}</span>
            ${img ? `<img src="${img.url}?${Date.now()}" alt="" /><button class="slot-delete" title="Remove">×</button>` : `<label class="slot-btn">+ Add<input type="file" accept="image/*" /></label>`}
        `
        const input = wrap.querySelector('input[type="file"]')
        if (input) {
            input.addEventListener('change', (e) => uploadSlot(slot, e.target.files[0]))
        }
        const del = wrap.querySelector('.slot-delete')
        if (del) {
            del.addEventListener('click', () => deleteSlot(slot))
        }
        els.imageSlots.appendChild(wrap)
    }
}

async function uploadSlot(slot, file) {
    if (!file || !editingItem) return
    const fd = new FormData()
    fd.append('image', file)
    fd.append('position', String(slot))
    const res = await fetch(`/api/admin/auction-items/${editingItem.id}/images`, {
        method: 'POST',
        body: fd
    })
    if (!res.ok) { alert('Upload failed'); return }
    const fresh = await (await fetch('/api/auction-items')).json()
    editingItem = fresh.find(i => i.id === editingItem.id) || editingItem
    renderImageSlots(editingItem)
}

async function deleteSlot(slot) {
    if (!editingItem) return
    if (!confirm(`Remove image in slot ${slot}?`)) return
    await fetch(`/api/admin/auction-items/${editingItem.id}/images/${slot}`, { method: 'DELETE' })
    const fresh = await (await fetch('/api/auction-items')).json()
    editingItem = fresh.find(i => i.id === editingItem.id) || editingItem
    renderImageSlots(editingItem)
}

// ------------- Photos -------------
async function refreshPhotos() {
    const res = await fetch('/api/photos')
    const data = await res.json()
    els.photoCount.textContent = `${data.total} photo${data.total === 1 ? '' : 's'}`
    els.photosGrid.innerHTML = ''
    for (const p of data.items) {
        const tile = document.createElement('div')
        tile.className = 'photo-tile'
        tile.innerHTML = `
          <img alt="" />
          <button class="tile-delete" title="Delete">×</button>
        `
        const img = tile.querySelector('img')
        img.loading = 'lazy'
        img.src = `/api/photos/${p.id}/image`

        img.addEventListener('click', () => {
            if (img.src) openPhotoLightbox(img.src)
        })

        tile.querySelector('.tile-delete').addEventListener('click', async (e) => {
            e.stopPropagation()
            if (!confirm('Delete this photo?')) return
            await fetch(`/api/photos/${p.id}`, { method: 'DELETE' })
            refreshPhotos()
        })
        els.photosGrid.appendChild(tile)
    }
}

// ---- Photo lightbox (full-scale viewer) ----
let lightboxEl = null
function ensureLightbox() {
    if (lightboxEl) return lightboxEl
    lightboxEl = document.createElement('div')
    lightboxEl.className = 'photo-lightbox hidden'
    lightboxEl.innerHTML = `
      <img class="photo-lightbox-img" alt="" />
      <button class="photo-lightbox-close" aria-label="Close">×</button>
    `
    lightboxEl.addEventListener('click', (e) => {
        if (e.target === lightboxEl || e.target.classList.contains('photo-lightbox-close')) {
            closePhotoLightbox()
        }
    })
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closePhotoLightbox()
    })
    document.body.appendChild(lightboxEl)
    return lightboxEl
}
function openPhotoLightbox(src) {
    const el = ensureLightbox()
    el.querySelector('.photo-lightbox-img').src = src
    el.classList.remove('hidden')
}
function closePhotoLightbox() {
    if (lightboxEl) lightboxEl.classList.add('hidden')
}

els.btnDeleteAllPhotos.addEventListener('click', async () => {
    if (!confirm('Delete ALL photos? This cannot be undone.')) return
    await fetch('/api/photos', { method: 'DELETE' })
    refreshPhotos()
})

els.btnDownloadAllPhotos.addEventListener('click', async () => {
    const original = els.btnDownloadAllPhotos.textContent
    els.btnDownloadAllPhotos.disabled = true
    els.btnDownloadAllPhotos.textContent = 'Bundling…'
    try {
        // Fetch as blob so a slow server build doesn't tear down the page
        // mid-download and so we can swap the button label back when done.
        const res = await fetch('/api/admin/photos/zip')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const stamp = new Date().toISOString().slice(0, 10)
        const a = document.createElement('a')
        a.href = url
        a.download = `wwww-photos-${stamp}.zip`
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
    } catch (err) {
        console.error(err)
        alert('Download failed — see console.')
    } finally {
        els.btnDownloadAllPhotos.disabled = false
        els.btnDownloadAllPhotos.textContent = original
    }
})

// ------------- Logs -------------
async function refreshLogs() {
    const type = els.logTypeFilter.value
    const url = '/api/admin/logs?limit=200' + (type ? `&type=${encodeURIComponent(type)}` : '')
    const logs = await (await fetch(url)).json()
    els.logsTbody.innerHTML = ''
    for (const row of logs) {
        const tr = document.createElement('tr')
        tr.innerHTML = `
          <td>${escapeHtml(formatDate(row.created_at))}</td>
          <td>${escapeHtml(row.type)}</td>
          <td>${escapeHtml(row.ip || '')}</td>
          <td>${escapeHtml(row.path || '')}</td>
          <td>${escapeHtml(row.photo_id || '')}</td>
        `
        els.logsTbody.appendChild(tr)
    }
}
els.btnRefreshLogs.addEventListener('click', refreshLogs)
els.logTypeFilter.addEventListener('change', refreshLogs)
els.btnClearLogs.addEventListener('click', async () => {
    if (!confirm('Clear all logs?')) return
    await fetch('/api/admin/logs', { method: 'DELETE' })
    refreshLogs()
})

// ------------- Helpers -------------
function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]))
}
function formatDate(iso) {
    try { return new Date(iso).toLocaleString() } catch { return iso }
}

// Init
refreshItems()
