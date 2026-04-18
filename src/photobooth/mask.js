/**
 * Soft-mask helpers for MODNet segmentation output.
 * Ported from timmons/src/photobooth/mask.js — just the pieces we need.
 */

export function createSoftMaskFromConfidence(confidenceData, width, height) {
    const mask = new Float32Array(confidenceData.length)
    for (let i = 0; i < confidenceData.length; i++) mask[i] = confidenceData[i]

    let soft = 0
    for (let i = 0; i < mask.length; i++) {
        if (mask[i] > 0.05 && mask[i] < 0.95) soft++
    }
    const pct = (soft / mask.length) * 100
    if (pct > 0.1) return gaussianBlurMask(mask, width, height, 2)
    return gaussianBlurMask(dilateMask(mask, width, height, 2), width, height, 6)
}

export function dilateMask(mask, width, height, radius) {
    const result = new Float32Array(mask.length)
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = y * width + x
            let maxVal = mask[i]
            for (let dy = -radius; dy <= radius; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    const ny = y + dy, nx = x + dx
                    if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
                        const v = mask[ny * width + nx]
                        if (v > maxVal) maxVal = v
                    }
                }
            }
            result[i] = maxVal
        }
    }
    return result
}

export function gaussianBlurMask(mask, width, height, radius) {
    const kSize = radius * 2 + 1
    const kernel = new Float32Array(kSize)
    const sigma = Math.max(radius / 3, 0.5)
    let sum = 0
    for (let i = 0; i < kSize; i++) {
        const x = i - radius
        kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma))
        sum += kernel[i]
    }
    for (let i = 0; i < kSize; i++) kernel[i] /= sum

    const tmp = new Float32Array(mask.length)
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let s = 0
            for (let k = -radius; k <= radius; k++) {
                const nx = Math.min(Math.max(x + k, 0), width - 1)
                s += mask[y * width + nx] * kernel[k + radius]
            }
            tmp[y * width + x] = s
        }
    }
    const out = new Float32Array(mask.length)
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let s = 0
            for (let k = -radius; k <= radius; k++) {
                const ny = Math.min(Math.max(y + k, 0), height - 1)
                s += tmp[ny * width + x] * kernel[k + radius]
            }
            out[y * width + x] = s
        }
    }
    return out
}
