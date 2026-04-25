/**
 * Photobooth filters.
 *
 * Each filter has:
 *   - css:  a `ctx.filter` string applied to the photo layer (color treatment).
 *   - post: optional async callback that paints additional effects on top
 *           (sparkles, scanlines, halftone, bloom, etc.) using helpers from
 *           effects.js. `post(ctx, w, h, fx)` where fx = { sourceCanvas, scale,
 *           seed, makeRng(salt), sprites }. `scale = w / EXPORT_WIDTH` so
 *           per-pixel constants auto-tune between preview and export.
 *
 * Conventions inside post callbacks:
 *   - Use a fresh `fx.makeRng(salt)` per effect so per-pixel passes (grain,
 *     halftone) don't disturb placement decisions in other effects.
 *   - Effects render BEFORE frames + stickers, after photo+css filter.
 */

import {
    applyGrain,
    applyVignette,
    applyScanlines,
    applyLaserBurst,
    applyChromaticAberration,
    applyHalftone,
    applyBloom,
    applyMetallicSheen,
    scatterSprites,
    scatterGlints,
    scatterGlintsOnHighlights
} from './effects.js'

// Brand color triplets used for tinting sparkles / overlays.
const HOT       = '255, 63, 164'
const HIGHLIGHT = '255, 230, 109'
const CYAN      = '94, 200, 255'
const WHITE     = '255, 255, 255'

export const FILTERS = [
    {
        id: 'none',
        label: 'No Filter',
        css: 'none',
        icon: true
    },

    {
        id: 'glam',
        label: 'Spotlight ⭐',
        css: 'contrast(1.25) saturate(1.4) brightness(1.12)',
        async post(ctx, w, h) {
            // Brighten the center via radial highlight, dim the corners.
            ctx.save()
            const r = Math.hypot(w, h) / 2
            const high = ctx.createRadialGradient(w / 2, h * 0.42, r * 0.05, w / 2, h * 0.42, r * 0.55)
            high.addColorStop(0, `rgba(${HIGHLIGHT}, 0.22)`)
            high.addColorStop(1, `rgba(${HIGHLIGHT}, 0)`)
            ctx.globalCompositeOperation = 'screen'
            ctx.fillStyle = high
            ctx.fillRect(0, 0, w, h)
            ctx.restore()
            applyVignette(ctx, w, h, 0.55)
        }
    },

    {
        id: 'airbrush',
        label: 'Airbrush',
        css: 'contrast(0.85) saturate(1.55) brightness(1.18) blur(0.7px)'
    },

    {
        id: 'sparkles',
        label: 'Sparkles',
        css: 'contrast(1.30) saturate(1.85) brightness(1.10) hue-rotate(-8deg)',
        async post(ctx, w, h, fx) {
            const sparkleColors = [HIGHLIGHT, HOT, CYAN, WHITE, WHITE]

            // 1. Disco-ball anchors (under the sparkles)
            scatterSprites(ctx, fx.sprites.discoBalls, w, h, 2 + Math.floor(fx.makeRng(11)() * 2), {
                rng: fx.makeRng(12),
                minSize: 0.10,
                maxSize: 0.18,
                blend: 'screen'
            })

            // 2. Big hero glints — 8-point star bursts on the brightest catchlights
            scatterGlintsOnHighlights(ctx, fx.sourceCanvas, w, h, Math.max(8, Math.round(14 * fx.scale + 4)), {
                rng: fx.makeRng(13),
                colors: sparkleColors,
                lumThresh: 165,
                minSize: 0.10,
                maxSize: 0.20,
                eightPointChance: 1.0
            })

            // 3. Medium glints — 4-point crosses biased to bright areas
            scatterGlintsOnHighlights(ctx, fx.sourceCanvas, w, h, Math.max(40, Math.round(120 * fx.scale + 35)), {
                rng: fx.makeRng(14),
                colors: sparkleColors,
                lumThresh: 110,
                minSize: 0.04,
                maxSize: 0.085,
                eightPointChance: 0.35
            })

            // 4. All-over twinkles — uniform scatter so dark areas sparkle too
            scatterGlints(ctx, w, h, Math.round(110 * fx.scale + 40), {
                rng: fx.makeRng(15),
                colors: sparkleColors,
                minSize: 0.018,
                maxSize: 0.045,
                eightPointChance: 0.15
            })

            // 5. Pinpoint stardust — tiny crisp glints everywhere
            scatterGlints(ctx, w, h, Math.round(180 * fx.scale + 60), {
                rng: fx.makeRng(16),
                colors: [WHITE, HIGHLIGHT, WHITE, CYAN],
                minSize: 0.008,
                maxSize: 0.020,
                eightPointChance: 0
            })

            // 6. Holographic shimmer — diagonal iridescent gradient
            ctx.save()
            ctx.globalCompositeOperation = 'overlay'
            const shimmer = ctx.createLinearGradient(0, 0, w, h)
            shimmer.addColorStop(0.0,  `rgba(${CYAN}, 0.10)`)
            shimmer.addColorStop(0.33, `rgba(${HOT}, 0.10)`)
            shimmer.addColorStop(0.66, `rgba(${HIGHLIGHT}, 0.10)`)
            shimmer.addColorStop(1.0,  `rgba(${CYAN}, 0.10)`)
            ctx.fillStyle = shimmer
            ctx.fillRect(0, 0, w, h)
            ctx.restore()
        }
    },

    {
        id: 'rose',
        label: 'Bubblegum',
        css: 'contrast(1.18) saturate(2.0) sepia(0.18) hue-rotate(-12deg) brightness(1.10)',
        async post(ctx, w, h, fx) {
            // Soft pink wash
            ctx.save()
            ctx.fillStyle = `rgba(${HOT}, 0.10)`
            ctx.fillRect(0, 0, w, h)
            ctx.restore()
            // Heart confetti, low count, soft
            scatterSprites(ctx, fx.sprites.hearts, w, h, Math.round(14 * fx.scale + 6), {
                rng: fx.makeRng(21),
                minSize: 0.045,
                maxSize: 0.10,
                blend: 'source-over',
                tints: [HOT, '255, 120, 200', WHITE]
            })
        }
    },

    {
        id: 'alien',
        label: 'Alien',
        css: 'contrast(1.45) saturate(2.4) hue-rotate(95deg) brightness(1.05)',
        async post(ctx, w, h) {
            const baseScale = Math.min(w, h) / 2000
            applyChromaticAberration(ctx, w, h, Math.max(1, Math.round(4 * baseScale + 1)))
            applyBloom(ctx, w, h, Math.round(12 * baseScale + 4), 0.55)
            // Toxic-green rim glow — pushes the photo into "captured by something" territory
            ctx.save()
            ctx.globalCompositeOperation = 'screen'
            const r = Math.hypot(w, h) / 2
            const rim = ctx.createRadialGradient(w / 2, h / 2, r * 0.5, w / 2, h / 2, r)
            rim.addColorStop(0, 'rgba(50, 255, 140, 0)')
            rim.addColorStop(1, 'rgba(50, 255, 140, 0.32)')
            ctx.fillStyle = rim
            ctx.fillRect(0, 0, w, h)
            ctx.restore()
            // Deep-cyan vignette so the corners feel claustrophobic
            applyVignette(ctx, w, h, 0.40, '20, 40, 60')
        }
    },

    {
        id: 'laser',
        label: 'Laser Show',
        css: 'contrast(1.3) saturate(1.95) hue-rotate(180deg) brightness(1.05)',
        async post(ctx, w, h, fx) {
            const baseScale = Math.min(w, h) / 2000
            // Gentle bloom haze first so the beams have something to glow into
            applyBloom(ctx, w, h, Math.round(8 * baseScale + 3), 0.30)

            const ox = w * 0.85
            const oy = h * 0.18

            // Radial laser burst from upper-right
            applyLaserBurst(ctx, w, h, ox, oy, 18, {
                rng: fx.makeRng(61),
                length: Math.hypot(w, h) * 1.6,
                beamWidth: Math.max(3, Math.round(7 * baseScale + 2)),
                colors: [HOT, CYAN, HIGHLIGHT, WHITE],
                opacity: 0.55
            })

            // Lens flare anchor at the laser source
            ctx.save()
            ctx.globalCompositeOperation = 'screen'
            const flareSize = Math.min(w, h) * 0.22
            // Bright white core
            const core = ctx.createRadialGradient(ox, oy, 0, ox, oy, flareSize * 0.35)
            core.addColorStop(0, 'rgba(255, 255, 255, 1)')
            core.addColorStop(1, 'rgba(255, 255, 255, 0)')
            ctx.fillStyle = core
            ctx.fillRect(ox - flareSize, oy - flareSize, flareSize * 2, flareSize * 2)
            // Hot/yellow halo
            const halo = ctx.createRadialGradient(ox, oy, flareSize * 0.2, ox, oy, flareSize)
            halo.addColorStop(0, `rgba(${HIGHLIGHT}, 0.65)`)
            halo.addColorStop(0.5, `rgba(${HOT}, 0.35)`)
            halo.addColorStop(1, `rgba(${HOT}, 0)`)
            ctx.fillStyle = halo
            ctx.fillRect(ox - flareSize, oy - flareSize, flareSize * 2, flareSize * 2)
            ctx.restore()

            // Final bloom to fuse beams + flare into a glowy haze
            applyBloom(ctx, w, h, Math.round(6 * baseScale + 2), 0.25)
        }
    },

    {
        id: 'chrome',
        label: 'Chrome',
        css: 'grayscale(0.5) contrast(1.45) saturate(0.85) hue-rotate(200deg) brightness(1.06)',
        async post(ctx, w, h) {
            applyMetallicSheen(ctx, w, h)
        }
    },

    {
        id: 'vhs',
        label: 'VHS Tape',
        css: 'contrast(1.18) saturate(0.78) brightness(0.95) sepia(0.15) hue-rotate(-8deg)',
        async post(ctx, w, h, fx) {
            const baseScale = Math.min(w, h) / 2000
            applyChromaticAberration(ctx, w, h, Math.max(1, Math.round(3 * baseScale + 1.5)))
            applyScanlines(ctx, w, h, Math.max(2, Math.round(3 * baseScale + 1)), 0.20)
            // Faint dark roll-bar at a stable position
            const rollRng = fx.makeRng(31)
            const rollY = Math.round((0.25 + rollRng() * 0.5) * h)
            const rollH = Math.max(8, Math.round(22 * baseScale + 5))
            ctx.save()
            ctx.fillStyle = 'rgba(0, 0, 0, 0.22)'
            ctx.fillRect(0, rollY, w, rollH)
            // Bright leading edge — that classic VHS trail
            ctx.fillStyle = `rgba(${WHITE}, 0.10)`
            ctx.fillRect(0, rollY, w, Math.max(1, Math.round(rollH * 0.15)))
            ctx.restore()
            applyGrain(ctx, w, h, 0.07, fx.makeRng(32))
            applyVignette(ctx, w, h, 0.45)
        }
    },

    {
        id: 'golden',
        label: 'Solid Gold',
        css: 'contrast(1.22) saturate(1.65) sepia(0.55) brightness(1.12)'
    },

    {
        id: 'xerox',
        label: 'Xerox',
        css: 'grayscale(1) contrast(2.4) brightness(1.06)',
        async post(ctx, w, h) {
            const dotPx = Math.max(3, Math.round(7 * Math.min(w, h) / 2000 + 2))
            applyHalftone(ctx, w, h, dotPx)
        }
    },

    {
        id: 'noir',
        label: 'MTV Unplugged',
        css: 'grayscale(1) contrast(1.4) brightness(0.92)',
        async post(ctx, w, h, fx) {
            applyGrain(ctx, w, h, 0.10, fx.makeRng(41))
            applyVignette(ctx, w, h, 0.70)
        }
    },

    {
        id: 'polaroid',
        label: "Polaroid '99",
        css: 'contrast(0.92) saturate(1.4) sepia(0.20) brightness(1.10)',
        async post(ctx, w, h, fx) {
            // Warm wash
            ctx.save()
            ctx.fillStyle = 'rgba(255, 200, 130, 0.08)'
            ctx.fillRect(0, 0, w, h)
            ctx.restore()
            applyGrain(ctx, w, h, 0.05, fx.makeRng(51))
            applyVignette(ctx, w, h, 0.45, '40, 20, 10')
        }
    },

    {
        id: 'dream',
        label: 'Dream Seq',
        css: 'brightness(1.20) saturate(1.55) blur(0.6px) contrast(0.88) hue-rotate(-10deg)',
        async post(ctx, w, h) {
            // Hazy bloom — blur the photo and screen-blend back over.
            const blurPx = Math.max(4, Math.round(14 * Math.min(w, h) / 2000 + 4))
            applyBloom(ctx, w, h, blurPx, 0.55)
            // Pink edge halo
            ctx.save()
            const r = Math.hypot(w, h) / 2
            const g = ctx.createRadialGradient(w / 2, h / 2, r * 0.5, w / 2, h / 2, r)
            g.addColorStop(0, `rgba(${HOT}, 0)`)
            g.addColorStop(1, `rgba(${HOT}, 0.18)`)
            ctx.fillStyle = g
            ctx.globalCompositeOperation = 'screen'
            ctx.fillRect(0, 0, w, h)
            ctx.restore()
        }
    }
]

export function getFilterCss(id) {
    return FILTERS.find(f => f.id === id)?.css || 'none'
}

export function getFilter(id) {
    return FILTERS.find(f => f.id === id) || null
}
