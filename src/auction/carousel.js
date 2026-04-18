/**
 * Auction carousel — editorial 4-photo collage per item.
 * Swipe, chevrons, dots, auto-advance. Cross-fades between items.
 */

import { mountNav } from '../shared/nav.js'

const AUTO_ADVANCE_MS = 18_000
const SWIPE_THRESHOLD = 60

const stageEl = document.getElementById('carousel-stage')
const slotEls = {
    1: document.querySelector('.slot-1'),
    2: document.querySelector('.slot-2'),
    3: document.querySelector('.slot-3'),
    4: document.querySelector('.slot-4')
}
const titleEl = document.getElementById('item-title')
const descriptionEl = document.getElementById('item-description')
const metaEl = document.getElementById('carousel-meta')
const pagerEl = document.getElementById('pager')
const prevBtn = document.getElementById('nav-prev')
const nextBtn = document.getElementById('nav-next')
const emptyEl = document.getElementById('carousel-empty')

let items = []
let index = 0
let autoTimer = null
let isTransitioning = false

mountNav('#top-nav')

init().catch(err => {
    console.error('Carousel failed to load:', err)
    showEmpty()
})

async function init() {
    items = await loadItems()
    if (!items.length) {
        showEmpty()
        return
    }
    renderPager()
    renderItem(items[0], { instant: true })
    scheduleAuto()
    attachControls()

    // Refetch every 60s so admin edits appear without a reload
    setInterval(async () => {
        try {
            const fresh = await loadItems()
            if (JSON.stringify(fresh) !== JSON.stringify(items)) {
                items = fresh
                if (index >= items.length) index = 0
                renderPager()
                renderItem(items[index], { instant: true })
            }
        } catch {}
    }, 60_000)
}

async function loadItems() {
    const res = await fetch('/api/auction-items')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
}

function showEmpty() {
    emptyEl.classList.remove('hidden')
    stageEl.style.display = 'none'
    metaEl.style.display = 'none'
    document.querySelector('.carousel-controls').style.display = 'none'
}

function renderPager() {
    pagerEl.innerHTML = ''
    items.forEach((_, i) => {
        const dot = document.createElement('button')
        dot.className = 'pager-dot' + (i === index ? ' active' : '')
        dot.setAttribute('aria-label', `Item ${i + 1}`)
        dot.addEventListener('click', () => goTo(i))
        pagerEl.appendChild(dot)
    })
}

function updatePager() {
    Array.from(pagerEl.children).forEach((dot, i) => {
        dot.classList.toggle('active', i === index)
    })
}

const SLOT_CAPTIONS = ['dream ♥', 'yes pls', 'omg', 'BFF']

function renderItem(item, { instant } = {}) {
    // Slot images
    for (let slot = 1; slot <= 4; slot++) {
        const el = slotEls[slot]
        if (!el) continue
        const img = item.images.find(i => i.position === slot)

        // Clear prior content
        el.innerHTML = ''
        el.classList.remove('placeholder', 'leaving', 'entering')

        if (img) {
            const imgEl = document.createElement('img')
            imgEl.src = img.url
            imgEl.alt = ''
            imgEl.loading = 'eager'
            el.appendChild(imgEl)

            const caption = document.createElement('div')
            caption.className = 'slot-caption'
            caption.textContent = SLOT_CAPTIONS[slot - 1] || ''
            el.appendChild(caption)
        } else {
            el.classList.add('placeholder')
            el.textContent = 'coming soon ✨'
        }

        if (!instant) el.classList.add('entering')
    }

    // Meta
    titleEl.textContent = item.title || ''
    descriptionEl.textContent = item.description || ''
}

function goTo(next) {
    if (isTransitioning || next === index || !items.length) return
    isTransitioning = true

    const outSlots = Object.values(slotEls)
    outSlots.forEach(el => el.classList.add('leaving'))
    metaEl.classList.add('transitioning')

    const target = ((next % items.length) + items.length) % items.length

    setTimeout(() => {
        index = target
        renderItem(items[index])
        updatePager()
        metaEl.classList.remove('transitioning')
        isTransitioning = false
    }, 380)

    scheduleAuto()
}

function next() { goTo(index + 1) }
function prev() { goTo(index - 1) }

function scheduleAuto() {
    if (autoTimer) clearTimeout(autoTimer)
    autoTimer = setTimeout(next, AUTO_ADVANCE_MS)
}

function attachControls() {
    nextBtn.addEventListener('click', next)
    prevBtn.addEventListener('click', prev)

    // Swipe (pointer events)
    let startX = null
    let startT = 0
    stageEl.addEventListener('pointerdown', (e) => {
        startX = e.clientX
        startT = Date.now()
    })
    stageEl.addEventListener('pointerup', (e) => {
        if (startX === null) return
        const dx = e.clientX - startX
        const dt = Date.now() - startT
        startX = null
        if (dt > 700) return
        if (dx <= -SWIPE_THRESHOLD) next()
        else if (dx >= SWIPE_THRESHOLD) prev()
    })
    stageEl.addEventListener('pointercancel', () => { startX = null })

    // Keyboard
    window.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') prev()
        else if (e.key === 'ArrowRight') next()
    })
}
