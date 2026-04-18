/**
 * One-tap color filters implemented via ctx.filter strings.
 * Fast, zero ML, instant feedback.
 */

export const FILTERS = [
    { id: 'none',     label: 'Original', css: 'none' },
    { id: 'glam',     label: 'Glam',     css: 'contrast(1.12) saturate(1.18) brightness(1.04)' },
    { id: 'rose',     label: 'Rosé',     css: 'contrast(1.06) saturate(1.1) sepia(0.18) hue-rotate(-6deg) brightness(1.02)' },
    { id: 'noir',     label: 'Noir',     css: 'grayscale(1) contrast(1.25) brightness(0.96)' },
    { id: 'golden',   label: 'Golden',   css: 'contrast(1.08) saturate(1.15) sepia(0.22) brightness(1.06)' },
    { id: 'polaroid', label: 'Polaroid', css: 'contrast(0.95) saturate(1.25) sepia(0.12) brightness(1.08)' },
    { id: 'cool',     label: 'Cool',     css: 'contrast(1.05) saturate(1.0) hue-rotate(6deg) brightness(1.02)' }
]

export function getFilterCss(id) {
    return FILTERS.find(f => f.id === id)?.css || 'none'
}
