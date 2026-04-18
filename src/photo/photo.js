/**
 * /photo/:id — single-photo download page.
 * Works on iOS Safari and Android Chrome.
 */

const PHOTO_ID = window.location.pathname.split('/').filter(Boolean)[1]
const imgEl = document.getElementById('photo-img')
const loadingEl = document.getElementById('photo-loading')
const btnSave = document.getElementById('btn-save')
const btnShare = document.getElementById('btn-share')

let dataUrl = null

async function loadPhoto() {
    try {
        const res = await fetch(`/api/photos/${PHOTO_ID}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        dataUrl = data.image
        imgEl.src = dataUrl
        imgEl.addEventListener('load', () => {
            imgEl.classList.add('loaded')
            loadingEl.style.display = 'none'
        })
    } catch (err) {
        console.error(err)
        loadingEl.textContent = 'Photo unavailable'
    }
}

btnSave.addEventListener('click', saveToDevice)
btnShare.addEventListener('click', share)

async function saveToDevice() {
    if (!dataUrl) return
    await logDownload()
    // Use a download anchor — reliable on Android.
    // On iOS Safari, this opens the image in a new tab; the user can long-press → Save.
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `wwww-${PHOTO_ID}.jpg`
    document.body.appendChild(a)
    a.click()
    a.remove()
}

async function share() {
    if (!dataUrl) return
    if (navigator.canShare) {
        try {
            const blob = await (await fetch(dataUrl)).blob()
            const file = new File([blob], `wwww-${PHOTO_ID}.jpg`, { type: 'image/jpeg' })
            if (navigator.canShare({ files: [file] })) {
                await navigator.share({ files: [file], title: 'What Women Want — 2026' })
                await logDownload()
                return
            }
        } catch (err) {
            if (err.name !== 'AbortError') console.error(err)
        }
    }
    // Fallback: save
    saveToDevice()
}

async function logDownload() {
    try {
        await fetch(`/api/photos/${PHOTO_ID}/log-download`, { method: 'POST' })
    } catch {}
}

if (!PHOTO_ID) {
    loadingEl.textContent = 'No photo id'
} else {
    loadPhoto()
}
