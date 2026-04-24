/**
 * One-tap color filters implemented via ctx.filter strings.
 * Fast, zero ML, instant feedback.
 */

export const FILTERS = [
    { id: 'none',        label: 'No Filter',     css: 'none', icon: true },
    { id: 'glam',        label: 'Spotlight ⭐',  css: 'contrast(1.25) saturate(1.4) brightness(1.12)' },
    { id: 'airbrush',    label: 'Airbrush',      css: 'contrast(0.85) saturate(1.55) brightness(1.18) blur(0.7px)' },
    { id: 'glitter',     label: 'Glitter Bomb',  css: 'contrast(1.4) saturate(2) brightness(1.15) hue-rotate(-10deg)' },
    { id: 'rose',        label: 'Bubblegum',     css: 'contrast(1.2) saturate(2.2) sepia(0.25) hue-rotate(-14deg) brightness(1.1)' },
    { id: 'electric',    label: 'Electric',      css: 'contrast(1.5) saturate(2.3) hue-rotate(60deg) brightness(1.1)' },
    { id: 'acid',        label: 'Acid Wash',     css: 'saturate(2.4) hue-rotate(-40deg) contrast(1.35) brightness(1.06)' },
    { id: 'laser',       label: 'Laser Show',    css: 'contrast(1.35) saturate(2) hue-rotate(180deg) brightness(1.05)' },
    { id: 'neon',        label: 'Neon Ice',      css: 'contrast(1.25) saturate(1.6) hue-rotate(25deg) brightness(1.1)' },
    { id: 'chrome',      label: 'Chrome',        css: 'grayscale(0.55) contrast(1.4) saturate(0.8) hue-rotate(200deg) brightness(1.08)' },
    { id: 'vhs',         label: 'VHS Tape',      css: 'contrast(1.2) saturate(0.75) brightness(0.95) sepia(0.18) hue-rotate(-8deg)' },
    { id: 'golden',      label: 'Solid Gold',    css: 'contrast(1.2) saturate(1.6) sepia(0.5) brightness(1.12)' },
    { id: 'xerox',       label: 'Xerox',         css: 'grayscale(1) contrast(2.4) brightness(1.06)' },
    { id: 'noir',        label: 'MTV Unplugged', css: 'grayscale(1) contrast(1.35) brightness(0.94)' },
    { id: 'polaroid',    label: "Polaroid '99",  css: 'contrast(0.9) saturate(1.45) sepia(0.22) brightness(1.12)' },
    { id: 'dream',       label: 'Dream Seq',     css: 'brightness(1.22) saturate(1.6) blur(1.2px) contrast(0.85) hue-rotate(-12deg)' }
]

export function getFilterCss(id) {
    return FILTERS.find(f => f.id === id)?.css || 'none'
}
