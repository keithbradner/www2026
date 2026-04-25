/**
 * Photobooth post-effects — pure-canvas helpers used by filter `post` callbacks.
 *
 * All helpers operate on the target ctx in place. Some (bloom, chromatic
 * aberration) snapshot ctx.canvas first, then redraw on top — so they assume
 * the photo+filter has already been drawn at (0,0,w,h).
 *
 * Pass `scale = w / EXPORT_WIDTH` from the caller so per-pixel constants
 * (line height, sparkle size, dot pitch) auto-tune between preview and export.
 */

// ---------- Seeded RNG ----------

export function mulberry32(seed) {
    let s = (seed | 0) || 1
    return function () {
        s = (s + 0x6D2B79F5) | 0
        let t = Math.imul(s ^ (s >>> 15), 1 | s)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

// ---------- Sprite preloader ----------

const imageCache = new Map()
export function loadSpriteSet(srcs) {
    return Promise.all(srcs.map(src => {
        if (imageCache.has(src)) return imageCache.get(src)
        const p = new Promise((resolve, reject) => {
            const img = new Image()
            img.crossOrigin = 'anonymous'
            img.onload = () => resolve(img)
            img.onerror = reject
            img.src = src
        })
        imageCache.set(src, p)
        return p
    }))
}

// ---------- Grain ----------

export function applyGrain(ctx, w, h, intensity, rng) {
    const imgData = ctx.getImageData(0, 0, w, h)
    const data = imgData.data
    const amp = intensity * 255
    for (let i = 0; i < data.length; i += 4) {
        const n = (rng() - 0.5) * amp
        data[i]     = clamp(data[i] + n)
        data[i + 1] = clamp(data[i + 1] + n)
        data[i + 2] = clamp(data[i + 2] + n)
    }
    ctx.putImageData(imgData, 0, 0)
}

// ---------- Vignette ----------

export function applyVignette(ctx, w, h, strength = 0.5, color = '0,0,0') {
    ctx.save()
    const r = Math.hypot(w, h) / 2
    const grad = ctx.createRadialGradient(w / 2, h / 2, r * 0.35, w / 2, h / 2, r)
    grad.addColorStop(0, `rgba(${color}, 0)`)
    grad.addColorStop(1, `rgba(${color}, ${strength})`)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)
    ctx.restore()
}

// ---------- Scanlines ----------

export function applyScanlines(ctx, w, h, lineH, opacity, color = '0,0,0') {
    ctx.save()
    ctx.fillStyle = `rgba(${color}, ${opacity})`
    for (let y = 0; y < h; y += lineH * 2) {
        ctx.fillRect(0, y, w, lineH)
    }
    ctx.restore()
}

/**
 * Radial laser burst — multiple thin colored beams emanating from a single
 * origin point, each fading from full opacity at the origin to transparent
 * at the tip. Drawn with `screen` blend so overlapping beams glow.
 *
 * `colors` is an array of rgb triplet strings, e.g. ['255, 63, 164'].
 */
export function applyLaserBurst(ctx, w, h, originX, originY, beamCount, opts) {
    const {
        rng,
        length = Math.hypot(w, h) * 1.6,
        beamWidth = 6,
        colors,
        opacity = 0.55
    } = opts
    ctx.save()
    ctx.globalCompositeOperation = 'screen'
    ctx.globalAlpha = opacity
    ctx.translate(originX, originY)
    for (let i = 0; i < beamCount; i++) {
        const angle = rng() * Math.PI * 2
        const color = colors[Math.floor(rng() * colors.length)]
        const wMul = 0.4 + rng() * 1.6
        const lenMul = 0.6 + rng() * 0.6
        const beamLen = length * lenMul
        const bw = beamWidth * wMul

        ctx.save()
        ctx.rotate(angle)
        const grad = ctx.createLinearGradient(0, 0, beamLen, 0)
        grad.addColorStop(0,    `rgba(${color}, 1)`)
        grad.addColorStop(0.12, `rgba(${color}, 0.85)`)
        grad.addColorStop(0.6,  `rgba(${color}, 0.18)`)
        grad.addColorStop(1,    `rgba(${color}, 0)`)
        ctx.fillStyle = grad
        ctx.fillRect(0, -bw / 2, beamLen, bw)
        ctx.restore()
    }
    ctx.restore()
}

// ---------- Chromatic aberration ----------

/**
 * Snapshot ctx, then redraw as additive R-shifted + GB-shifted copies.
 * Net effect: RGB-split halos at edges. Mid-image stays neutral.
 */
export function applyChromaticAberration(ctx, w, h, offsetPx) {
    const snap = snapshotCtx(ctx, w, h)
    const red  = tintCanvas(snap, w, h, '255,0,0')
    const cyan = tintCanvas(snap, w, h, '0,255,255')
    ctx.save()
    ctx.clearRect(0, 0, w, h)
    ctx.globalCompositeOperation = 'lighter'
    ctx.drawImage(red, -offsetPx, 0)
    ctx.drawImage(cyan, offsetPx, 0)
    ctx.restore()
}

// ---------- Halftone ----------

export function applyHalftone(ctx, w, h, dotPx, fgColor = '#1a1020', bgColor = '#f4ead8') {
    const imgData = ctx.getImageData(0, 0, w, h)
    const data = imgData.data

    // Paper background
    ctx.fillStyle = bgColor
    ctx.fillRect(0, 0, w, h)

    ctx.fillStyle = fgColor
    const rMax = dotPx / 2
    for (let y = 0; y < h; y += dotPx) {
        const yMax = Math.min(y + dotPx, h)
        for (let x = 0; x < w; x += dotPx) {
            const xMax = Math.min(x + dotPx, w)
            // Average luminance of cell, sampled sparsely
            let lum = 0, count = 0
            for (let cy = y; cy < yMax; cy += 2) {
                for (let cx = x; cx < xMax; cx += 2) {
                    const i = (cy * w + cx) * 4
                    lum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
                    count++
                }
            }
            const avg = count > 0 ? lum / count : 255
            const darkness = 1 - avg / 255
            const r = rMax * Math.sqrt(darkness)
            if (r > 0.3) {
                ctx.beginPath()
                ctx.arc(x + dotPx / 2, y + dotPx / 2, r, 0, Math.PI * 2)
                ctx.fill()
            }
        }
    }
}

// ---------- Bloom ----------

export function applyBloom(ctx, w, h, blurPx, opacity) {
    const snap = document.createElement('canvas')
    snap.width = w
    snap.height = h
    const sCtx = snap.getContext('2d')
    sCtx.filter = `blur(${blurPx}px)`
    sCtx.drawImage(ctx.canvas, 0, 0, w, h)

    ctx.save()
    ctx.globalCompositeOperation = 'screen'
    ctx.globalAlpha = opacity
    ctx.drawImage(snap, 0, 0)
    ctx.restore()
}

// ---------- Metallic sheen (Chrome) ----------

export function applyMetallicSheen(ctx, w, h) {
    ctx.save()
    ctx.globalCompositeOperation = 'overlay'
    const grad = ctx.createLinearGradient(0, 0, w, h * 0.7)
    grad.addColorStop(0.0,  'rgba(255, 255, 255, 0.18)')
    grad.addColorStop(0.35, 'rgba(80, 80, 110, 0.0)')
    grad.addColorStop(0.55, 'rgba(255, 255, 255, 0.32)')
    grad.addColorStop(0.75, 'rgba(80, 80, 110, 0.0)')
    grad.addColorStop(1.0,  'rgba(255, 255, 255, 0.18)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)
    ctx.restore()

    // Subtle horizontal banding for that reflective-metal feel
    ctx.save()
    ctx.globalCompositeOperation = 'overlay'
    const bands = ctx.createLinearGradient(0, 0, 0, h)
    bands.addColorStop(0,    'rgba(255, 255, 255, 0.0)')
    bands.addColorStop(0.5,  'rgba(255, 255, 255, 0.08)')
    bands.addColorStop(1,    'rgba(0, 0, 0, 0.12)')
    ctx.fillStyle = bands
    ctx.fillRect(0, 0, w, h)
    ctx.restore()
}

// ---------- Procedural glints (real sparkles) ----------

/**
 * Draw a single procedural glint at (x, y) with a bright white core, a soft
 * coloured halo, and 4 (or 8) radial spikes that taper to transparent at the
 * tips. This reads as actual light glinting — not a static sticker.
 *
 * `rgb` is a comma-separated triplet, e.g. '255, 230, 109'.
 */
export function drawGlint(ctx, x, y, size, rgb, opts = {}) {
    const { eightPoint = false, rotation = 0, alpha = 1, spikeThickness = 0.06 } = opts
    const half = size / 2
    const thick = Math.max(0.6, size * spikeThickness)

    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(rotation)
    ctx.globalAlpha = alpha
    ctx.globalCompositeOperation = 'screen'

    // 1. Halo + bright core (radial gradient with white center fading to colored)
    const haloR = size * 0.55
    const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, haloR)
    halo.addColorStop(0,    'rgba(255, 255, 255, 1)')
    halo.addColorStop(0.18, `rgba(255, 255, 255, 0.85)`)
    halo.addColorStop(0.45, `rgba(${rgb}, 0.45)`)
    halo.addColorStop(1,    `rgba(${rgb}, 0)`)
    ctx.fillStyle = halo
    ctx.fillRect(-haloR, -haloR, haloR * 2, haloR * 2)

    // 2. Horizontal spike — bright at center, transparent at ends
    drawSpike(ctx, size, thick, rgb, false)
    // 3. Vertical spike
    drawSpike(ctx, size, thick, rgb, true)

    // 4. Optional 45° diagonal cross — shorter and dimmer
    if (eightPoint) {
        ctx.save()
        ctx.rotate(Math.PI / 4)
        const diagLen = size * 0.65
        const diagThick = thick * 0.7
        drawSpike(ctx, diagLen, diagThick, rgb, false, 0.55)
        drawSpike(ctx, diagLen, diagThick, rgb, true, 0.55)
        ctx.restore()
    }

    ctx.restore()
}

function drawSpike(ctx, size, thick, rgb, vertical, intensity = 1) {
    const half = size / 2
    const grad = vertical
        ? ctx.createLinearGradient(0, -half, 0, half)
        : ctx.createLinearGradient(-half, 0, half, 0)
    grad.addColorStop(0,    `rgba(${rgb}, 0)`)
    grad.addColorStop(0.42, `rgba(${rgb}, ${0.55 * intensity})`)
    grad.addColorStop(0.5,  `rgba(255, 255, 255, ${1 * intensity})`)
    grad.addColorStop(0.58, `rgba(${rgb}, ${0.55 * intensity})`)
    grad.addColorStop(1,    `rgba(${rgb}, 0)`)
    ctx.fillStyle = grad
    if (vertical) ctx.fillRect(-thick / 2, -half, thick, size)
    else          ctx.fillRect(-half, -thick / 2, size, thick)
}

/**
 * Uniform random scatter of procedural glints across the canvas.
 *
 * `colors` is an array of rgb triplet strings. Each glint randomly picks one.
 */
export function scatterGlints(ctx, w, h, count, opts = {}) {
    const {
        rng,
        colors,
        minSize = 0.012,
        maxSize = 0.05,
        eightPointChance = 0,
        alpha = 1
    } = opts
    if (!colors || colors.length === 0) return
    const minDim = Math.min(w, h)
    for (let i = 0; i < count; i++) {
        const sizeRel = minSize + rng() * (maxSize - minSize)
        const size = sizeRel * minDim
        const x = rng() * w
        const y = rng() * h
        const color = colors[Math.floor(rng() * colors.length)]
        const rotation = rng() * Math.PI * 2
        const eightPoint = rng() < eightPointChance
        drawGlint(ctx, x, y, size, color, { eightPoint, rotation, alpha })
    }
}

/**
 * Place procedural glints biased to the bright regions of `sourceCanvas`.
 * Used for the big "this is where the light catches" sparkles.
 */
export function scatterGlintsOnHighlights(ctx, sourceCanvas, w, h, count, opts = {}) {
    const {
        rng,
        colors,
        lumThresh = 130,
        minSize = 0.04,
        maxSize = 0.10,
        eightPointChance = 0.4,
        alpha = 1
    } = opts
    if (!colors || colors.length === 0) return

    const sampleW = 80
    const sampleH = Math.max(1, Math.round(80 * h / w))
    const sample = document.createElement('canvas')
    sample.width = sampleW
    sample.height = sampleH
    const sCtx = sample.getContext('2d')
    sCtx.drawImage(sourceCanvas, 0, 0, sampleW, sampleH)
    const sData = sCtx.getImageData(0, 0, sampleW, sampleH).data

    const bright = []
    for (let y = 0; y < sampleH; y++) {
        for (let x = 0; x < sampleW; x++) {
            const i = (y * sampleW + x) * 4
            if (sData[i + 3] < 32) continue
            const lum = 0.299 * sData[i] + 0.587 * sData[i + 1] + 0.114 * sData[i + 2]
            if (lum > lumThresh) bright.push(x, y)
        }
    }

    const minDim = Math.min(w, h)
    const cellW = w / sampleW
    const cellH = h / sampleH

    for (let i = 0; i < count; i++) {
        let x, y
        if (bright.length > 0) {
            const idx = Math.floor(rng() * (bright.length / 2)) * 2
            const bx = bright[idx], by = bright[idx + 1]
            x = (bx + 0.5) * cellW + (rng() - 0.5) * cellW * 2
            y = (by + 0.5) * cellH + (rng() - 0.5) * cellH * 2
        } else {
            x = rng() * w
            y = rng() * h
        }
        const sizeRel = minSize + rng() * (maxSize - minSize)
        const size = sizeRel * minDim
        const color = colors[Math.floor(rng() * colors.length)]
        const rotation = rng() * Math.PI * 2
        const eightPoint = rng() < eightPointChance
        drawGlint(ctx, x, y, size, color, { eightPoint, rotation, alpha })
    }
}

// ---------- Sprite scatter ----------

export function scatterSprites(ctx, sprites, w, h, count, opts = {}) {
    const {
        rng,
        minSize = 0.04,
        maxSize = 0.10,
        blend = 'screen',
        tints = null,
        rotate = true
    } = opts
    if (!sprites || sprites.length === 0) return
    ctx.save()
    ctx.globalCompositeOperation = blend
    const minDim = Math.min(w, h)
    for (let i = 0; i < count; i++) {
        const sprite = sprites[Math.floor(rng() * sprites.length)]
        const sizeRel = minSize + rng() * (maxSize - minSize)
        const size = sizeRel * minDim
        const x = rng() * w
        const y = rng() * h
        const rot = rotate ? rng() * Math.PI * 2 : 0
        const img = tints
            ? tintSprite(sprite, tints[Math.floor(rng() * tints.length)])
            : sprite

        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(rot)
        ctx.drawImage(img, -size / 2, -size / 2, size, size)
        ctx.restore()
    }
    ctx.restore()
}

/**
 * Place sparkles biased to bright regions of `sourceCanvas`.
 * Falls back to uniform scatter if the source has no bright pixels.
 */
export function scatterSparklesOnHighlights(ctx, sourceCanvas, sprites, w, h, count, opts = {}) {
    const {
        rng,
        lumThresh = 150,
        minSize = 0.045,
        maxSize = 0.11,
        tints = null,
        blend = 'screen'
    } = opts
    if (!sprites || sprites.length === 0) return

    // Sample a downscaled version for speed
    const sampleW = 80
    const sampleH = Math.max(1, Math.round(80 * h / w))
    const sample = document.createElement('canvas')
    sample.width = sampleW
    sample.height = sampleH
    const sCtx = sample.getContext('2d')
    sCtx.drawImage(sourceCanvas, 0, 0, sampleW, sampleH)
    const sData = sCtx.getImageData(0, 0, sampleW, sampleH).data

    const bright = []
    for (let y = 0; y < sampleH; y++) {
        for (let x = 0; x < sampleW; x++) {
            const i = (y * sampleW + x) * 4
            const a = sData[i + 3]
            if (a < 32) continue   // skip transparent (e.g., outside masked subject)
            const lum = 0.299 * sData[i] + 0.587 * sData[i + 1] + 0.114 * sData[i + 2]
            if (lum > lumThresh) bright.push(x, y)
        }
    }

    if (bright.length === 0) {
        return scatterSprites(ctx, sprites, w, h, count, { rng, minSize, maxSize, tints, blend })
    }

    ctx.save()
    ctx.globalCompositeOperation = blend
    const minDim = Math.min(w, h)
    const cellW = w / sampleW
    const cellH = h / sampleH
    for (let i = 0; i < count; i++) {
        const idx = Math.floor(rng() * (bright.length / 2)) * 2
        const bx = bright[idx], by = bright[idx + 1]
        const jx = (rng() - 0.5) * cellW * 2
        const jy = (rng() - 0.5) * cellH * 2
        const x = (bx + 0.5) * cellW + jx
        const y = (by + 0.5) * cellH + jy

        const sprite = sprites[Math.floor(rng() * sprites.length)]
        const sizeRel = minSize + rng() * (maxSize - minSize)
        const size = sizeRel * minDim
        const rot = rng() * Math.PI * 2
        const img = tints
            ? tintSprite(sprite, tints[Math.floor(rng() * tints.length)])
            : sprite

        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(rot)
        ctx.drawImage(img, -size / 2, -size / 2, size, size)
        ctx.restore()
    }
    ctx.restore()
}

// ---------- Internals ----------

function clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : v }

function snapshotCtx(ctx, w, h) {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    c.getContext('2d').drawImage(ctx.canvas, 0, 0, w, h)
    return c
}

function tintCanvas(src, w, h, rgb) {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const cx = c.getContext('2d')
    cx.drawImage(src, 0, 0, w, h)
    cx.globalCompositeOperation = 'multiply'
    cx.fillStyle = `rgb(${rgb})`
    cx.fillRect(0, 0, w, h)
    cx.globalCompositeOperation = 'destination-in'
    cx.drawImage(src, 0, 0, w, h)
    return c
}

const tintSpriteCache = new Map()
function tintSprite(img, rgb) {
    const key = `${img.src}|${rgb}`
    const cached = tintSpriteCache.get(key)
    if (cached) return cached
    const w = img.naturalWidth || img.width || 64
    const h = img.naturalHeight || img.height || 64
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const cx = c.getContext('2d')
    cx.drawImage(img, 0, 0, w, h)
    cx.globalCompositeOperation = 'source-in'
    cx.fillStyle = `rgb(${rgb})`
    cx.fillRect(0, 0, w, h)
    tintSpriteCache.set(key, c)
    return c
}
