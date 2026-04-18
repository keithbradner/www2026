/**
 * Frame picker — overlays a full-image PNG/SVG on top of the photo.
 */

export const FRAME_LIBRARY = [
    { id: 'none',      label: 'None',     src: null },
    { id: 'classic',   label: 'Classic',  src: '/frames/www-classic.svg' },
    { id: 'floral',    label: 'Floral',   src: '/frames/www-floral.svg' },
    { id: 'polaroid',  label: 'Polaroid', src: '/frames/polaroid.svg' }
]

export function renderFramePicker(panelEl, onSelect, currentId) {
    panelEl.innerHTML = ''
    for (const f of FRAME_LIBRARY) {
        const tile = document.createElement('button')
        tile.className = 'tool-item' + (f.id === currentId ? ' active' : '')
        tile.dataset.id = f.id
        tile.innerHTML = `
          <div class="swatch">${f.src ? `<img src="${f.src}" alt="" />` : '<div style="color: var(--cream); opacity: 0.6; font-size: 22px;">∅</div>'}</div>
          <div class="label">${f.label}</div>
        `
        tile.addEventListener('click', () => {
            panelEl.querySelectorAll('.tool-item').forEach(el => el.classList.toggle('active', el === tile))
            onSelect(f)
        })
        panelEl.appendChild(tile)
    }
}
