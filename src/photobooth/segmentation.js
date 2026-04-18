/**
 * MODNet-based subject segmentation — lazy-loaded the first time a user
 * picks a backdrop, so the base capture flow has no ML startup cost.
 */

import { AutoModel, AutoProcessor, RawImage } from '@huggingface/transformers'
import { createSoftMaskFromConfidence } from './mask.js'

let modelPromise = null

async function loadModel() {
    if (!modelPromise) {
        modelPromise = (async () => {
            const model = await AutoModel.from_pretrained('Xenova/modnet', {
                dtype: 'fp32',
                device: 'webgpu'
            }).catch(async () => {
                // WebGPU not available — fall back to WASM
                return AutoModel.from_pretrained('Xenova/modnet', { dtype: 'fp32' })
            })
            const processor = await AutoProcessor.from_pretrained('Xenova/modnet')
            return { model, processor }
        })()
    }
    return modelPromise
}

export async function segment(sourceCanvas) {
    const { model, processor } = await loadModel()

    const width = sourceCanvas.width
    const height = sourceCanvas.height
    const image = await RawImage.fromURL(sourceCanvas.toDataURL('image/png'))

    const { pixel_values } = await processor(image)
    const { output } = await model({ input: pixel_values })

    const maskTensor = output[0]
    const outputData = maskTensor.data

    let mH, mW
    if (maskTensor.dims.length === 4) {
        mH = maskTensor.dims[2]; mW = maskTensor.dims[3]
    } else {
        mH = maskTensor.dims[1]; mW = maskTensor.dims[2]
    }

    // Bilinear resize to source dims
    const mask = new Float32Array(width * height)
    const scaleX = mW / width
    const scaleY = mH / height
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const sx = x * scaleX, sy = y * scaleY
            const x0 = Math.floor(sx), y0 = Math.floor(sy)
            const x1 = Math.min(x0 + 1, mW - 1), y1 = Math.min(y0 + 1, mH - 1)
            const xf = sx - x0, yf = sy - y0
            const v00 = outputData[y0 * mW + x0]
            const v10 = outputData[y0 * mW + x1]
            const v01 = outputData[y1 * mW + x0]
            const v11 = outputData[y1 * mW + x1]
            const v0 = v00 * (1 - xf) + v10 * xf
            const v1 = v01 * (1 - xf) + v11 * xf
            mask[y * width + x] = v0 * (1 - yf) + v1 * yf
        }
    }

    return createSoftMaskFromConfidence(mask, width, height)
}

/**
 * Composite the subject (defined by mask) over a background canvas.
 * Returns a new canvas the same size as sourceCanvas.
 */
export function compositeOnBackground(sourceCanvas, mask, bgCanvas) {
    const w = sourceCanvas.width
    const h = sourceCanvas.height
    const out = document.createElement('canvas')
    out.width = w
    out.height = h
    const ctx = out.getContext('2d')

    // Draw background scaled to cover
    drawCover(ctx, bgCanvas, w, h)
    const bgData = ctx.getImageData(0, 0, w, h)
    const bg = bgData.data

    // Read source
    const srcCtx = sourceCanvas.getContext('2d')
    const srcData = srcCtx.getImageData(0, 0, w, h)
    const src = srcData.data

    // Alpha-blend subject over background using mask
    for (let i = 0, m = 0; i < src.length; i += 4, m++) {
        const a = Math.min(1, Math.max(0, mask[m]))
        bg[i]     = src[i]     * a + bg[i]     * (1 - a)
        bg[i + 1] = src[i + 1] * a + bg[i + 1] * (1 - a)
        bg[i + 2] = src[i + 2] * a + bg[i + 2] * (1 - a)
        bg[i + 3] = 255
    }
    ctx.putImageData(bgData, 0, 0)
    return out
}

function drawCover(ctx, image, targetW, targetH) {
    const iw = image.width, ih = image.height
    const ta = targetW / targetH, ia = iw / ih
    let dw, dh, dx, dy
    if (ia > ta) {
        dh = targetH
        dw = dh * ia
        dx = (targetW - dw) / 2
        dy = 0
    } else {
        dw = targetW
        dh = dw / ia
        dx = 0
        dy = (targetH - dh) / 2
    }
    ctx.drawImage(image, dx, dy, dw, dh)
}
