/**
 * What Women Want — Auction & Photobooth kiosk server
 */

import express from 'express'
import multer from 'multer'
import sharp from 'sharp'
import { createServer as createViteServer } from 'vite'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import {
    initDatabase,
    addPhoto,
    getPhotos,
    getPhoto,
    updatePhotoStatus,
    deletePhoto,
    deleteAllPhotos,
    log,
    getLogs,
    getLogStats,
    clearLogs,
    listAuctionItems,
    getAuctionItem,
    createAuctionItem,
    updateAuctionItem,
    deleteAuctionItem,
    addAuctionImage,
    removeAuctionImageAtSlot,
    getAuctionImage
} from './db.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3000
const isDev = process.env.NODE_ENV !== 'production'

// Railway (and most PaaS) front our process with a reverse proxy. Trust it so
// req.ip and req.protocol reflect the real client, not the proxy hop.
app.set('trust proxy', true)

// Lightweight healthcheck for Railway and uptime probes.
app.get('/healthz', (_req, res) => res.json({ ok: true }))

// The MODNet segmentation model is fetched by @huggingface/transformers
// directly from huggingface.co in the browser — we never cache it on disk.

// ------------------------------------------------------------------
// Middleware
// ------------------------------------------------------------------
app.use(express.json({ limit: '50mb' }))

function getClientIP(req) {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
           req.headers['x-real-ip'] ||
           req.connection?.remoteAddress ||
           req.ip ||
           'unknown'
}

// Log page visits
app.use(async (req, res, next) => {
    const pagePaths = ['/', '/photobooth', '/gallery', '/admin']
    const isPhotoPage = /^\/photo\/[\w-]+$/.test(req.path)
    if ((pagePaths.includes(req.path) || isPhotoPage) && req.method === 'GET') {
        try {
            await log('visit', {
                ip: getClientIP(req),
                path: req.path,
                userAgent: req.headers['user-agent']
            })
        } catch {}
    }
    next()
})

// Multer in-memory so we can resize with sharp before storing in the DB.
// (Railway's filesystem is ephemeral; auction images go into the DB so they
// survive redeploys alongside the PG service.)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 }
})

// ------------------------------------------------------------------
// PHOTOS API
// ------------------------------------------------------------------
app.post('/api/photos', async (req, res) => {
    try {
        const { image, settings } = req.body
        if (!image) return res.status(400).json({ error: 'No image provided' })

        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
        await addPhoto(id, image, settings || {})
        await log('post', {
            ip: getClientIP(req),
            photoId: id,
            userAgent: req.headers['user-agent']
        })

        console.log(`Saved photo ${id}`)
        res.json({ success: true, id })
    } catch (error) {
        console.error('Error saving photo:', error)
        res.status(500).json({ error: 'Failed to save photo' })
    }
})

app.get('/api/photos', async (req, res) => {
    try {
        const photos = await getPhotos()
        res.json({
            total: photos.length,
            items: photos.map(p => ({
                id: p.id,
                createdAt: p.created_at,
                status: p.status
            }))
        })
    } catch (error) {
        res.status(500).json({ error: 'Failed to list photos' })
    }
})

app.get('/api/photos/:id', async (req, res) => {
    try {
        const photo = await getPhoto(req.params.id)
        if (!photo) return res.status(404).json({ error: 'Photo not found' })

        await log('view', {
            ip: getClientIP(req),
            photoId: photo.id,
            userAgent: req.headers['user-agent']
        })

        res.json({
            id: photo.id,
            image: photo.image,
            createdAt: photo.created_at
        })
    } catch (error) {
        res.status(500).json({ error: 'Failed to get photo' })
    }
})

app.post('/api/photos/:id/log-download', async (req, res) => {
    try {
        await log('download', {
            ip: getClientIP(req),
            photoId: req.params.id,
            userAgent: req.headers['user-agent']
        })
        res.json({ success: true })
    } catch {
        res.status(500).json({ error: 'Failed to log download' })
    }
})

app.patch('/api/photos/:id', async (req, res) => {
    try {
        const photo = await getPhoto(req.params.id)
        if (!photo) return res.status(404).json({ error: 'Photo not found' })
        const { status } = req.body
        if (status && ['pending', 'printing', 'completed', 'cancelled'].includes(status)) {
            await updatePhotoStatus(req.params.id, status)
        }
        res.json({ success: true })
    } catch (error) {
        res.status(500).json({ error: 'Failed to update photo' })
    }
})

app.delete('/api/photos/:id', async (req, res) => {
    try {
        await deletePhoto(req.params.id)
        res.json({ success: true })
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete photo' })
    }
})

app.delete('/api/photos', async (req, res) => {
    try {
        await deleteAllPhotos()
        res.json({ success: true })
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete photos' })
    }
})

// ------------------------------------------------------------------
// AUCTION ITEMS API
// ------------------------------------------------------------------
function slugify(s) {
    return String(s).toLowerCase().trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 48) || 'item'
}

app.get('/api/auction-items', async (req, res) => {
    try {
        res.json(await listAuctionItems())
    } catch (error) {
        console.error(error)
        res.status(500).json({ error: 'Failed to list auction items' })
    }
})

app.post('/api/admin/auction-items', async (req, res) => {
    try {
        const { title = 'Untitled', tagline = '', description = '', position } = req.body || {}
        const items = await listAuctionItems()
        const nextPosition = position ?? items.length
        const baseSlug = slugify(title)
        const taken = new Set(items.map(i => i.id))
        let id = baseSlug
        let n = 2
        while (taken.has(id)) { id = `${baseSlug}-${n++}` }

        await createAuctionItem({ id, title, tagline, description, position: nextPosition })
        res.json(await getAuctionItem(id))
    } catch (error) {
        console.error(error)
        res.status(500).json({ error: 'Failed to create auction item' })
    }
})

app.patch('/api/admin/auction-items/:id', async (req, res) => {
    try {
        const item = await getAuctionItem(req.params.id)
        if (!item) return res.status(404).json({ error: 'Not found' })
        const { title, tagline, description, position } = req.body || {}
        const fields = {}
        if (title !== undefined) fields.title = title
        if (tagline !== undefined) fields.tagline = tagline
        if (description !== undefined) fields.description = description
        if (position !== undefined) fields.position = position
        await updateAuctionItem(req.params.id, fields)
        res.json(await getAuctionItem(req.params.id))
    } catch (error) {
        console.error(error)
        res.status(500).json({ error: 'Failed to update auction item' })
    }
})

app.delete('/api/admin/auction-items/:id', async (req, res) => {
    try {
        await deleteAuctionItem(req.params.id)
        res.json({ success: true })
    } catch (error) {
        console.error(error)
        res.status(500).json({ error: 'Failed to delete auction item' })
    }
})

app.post('/api/admin/auction-items/:id/images', upload.single('image'), async (req, res) => {
    try {
        const item = await getAuctionItem(req.params.id)
        if (!item) return res.status(404).json({ error: 'Item not found' })
        const slot = parseInt(req.body.position, 10)
        if (!Number.isFinite(slot) || slot < 1 || slot > 4) {
            return res.status(400).json({ error: 'position must be 1-4' })
        }
        if (!req.file) return res.status(400).json({ error: 'No image uploaded' })

        await removeAuctionImageAtSlot(req.params.id, slot)

        const buffer = await sharp(req.file.buffer)
            .rotate()
            .resize({ width: 1800, height: 2400, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 88, mozjpeg: true })
            .toBuffer()

        const imageId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
        await addAuctionImage({
            id: imageId,
            itemId: req.params.id,
            imageData: buffer.toString('base64'),
            mime: 'image/jpeg',
            position: slot
        })

        res.json({ id: imageId, url: `/api/auction-images/${imageId}`, position: slot })
    } catch (error) {
        console.error(error)
        res.status(500).json({ error: 'Failed to upload image' })
    }
})

app.delete('/api/admin/auction-items/:id/images/:position', async (req, res) => {
    try {
        const slot = parseInt(req.params.position, 10)
        await removeAuctionImageAtSlot(req.params.id, slot)
        res.json({ success: true })
    } catch (error) {
        console.error(error)
        res.status(500).json({ error: 'Failed to delete image' })
    }
})

// Serve auction image bytes from the DB.
app.get('/api/auction-images/:id', async (req, res) => {
    try {
        const row = await getAuctionImage(req.params.id)
        if (!row) return res.status(404).end()
        const buf = Buffer.from(row.image_data, 'base64')
        res.setHeader('Content-Type', row.mime || 'image/jpeg')
        res.setHeader('Cache-Control', 'public, max-age=3600')
        res.send(buf)
    } catch (error) {
        console.error(error)
        res.status(500).end()
    }
})

// ------------------------------------------------------------------
// ADMIN / LOGS API
// ------------------------------------------------------------------
app.get('/api/admin/stats', async (req, res) => {
    try {
        const photos = await getPhotos()
        const items = await listAuctionItems()
        res.json({
            photos: { total: photos.length },
            auctionItems: { total: items.length },
            logs: await getLogStats()
        })
    } catch (error) {
        res.status(500).json({ error: 'Failed to get stats' })
    }
})

app.get('/api/admin/logs', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100
        const offset = parseInt(req.query.offset) || 0
        const type = req.query.type || null
        res.json(await getLogs(limit, offset, type))
    } catch (error) {
        res.status(500).json({ error: 'Failed to get logs' })
    }
})

app.delete('/api/admin/logs', async (req, res) => {
    try { await clearLogs(); res.json({ success: true }) }
    catch { res.status(500).json({ error: 'Failed to clear logs' }) }
})

// ------------------------------------------------------------------
// Page routes
// ------------------------------------------------------------------
// /photo/:id is rewritten to photo.html; the client reads id from location.
function rewritePhotoPath(req, _res, next) {
    if (/^\/photo\/[\w-]+$/.test(req.path) && req.method === 'GET') {
        req.url = '/photo.html' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '')
    }
    next()
}

async function startServer() {
    await initDatabase()

    if (isDev) {
        app.use(rewritePhotoPath)
        const vite = await createViteServer({
            server: { middlewareMode: true },
            appType: 'mpa'
        })
        app.use(vite.middlewares)
        console.log('Vite dev server integrated')
    } else {
        app.use(rewritePhotoPath)
        app.use(express.static(join(__dirname, 'dist')))
        const pages = ['index.html', 'photobooth.html', 'photo.html', 'gallery.html', 'admin.html']
        pages.forEach(page => {
            const route = page === 'index.html' ? '/' : `/${page.replace('.html', '')}`
            app.get(route, (_req, res) => {
                res.sendFile(join(__dirname, 'dist', page))
            })
        })
    }

    app.listen(PORT, () => {
        console.log(`
╔════════════════════════════════════════════════════════════╗
║  What Women Want — Auction & Photobooth                     ║
║  http://localhost:${PORT}                                        ║
║                                                             ║
║  Pages:                                                     ║
║   /             Auction carousel                            ║
║   /photobooth   Photobooth                                  ║
║   /photo/:id    Download page (QR target)                   ║
║   /admin        Admin                                       ║
║                                                             ║
║  Mode: ${isDev ? 'Development (Vite HMR)          ' : 'Production                       '}                    ║
╚════════════════════════════════════════════════════════════╝
        `)
    })
}

startServer().catch(err => {
    console.error('Server failed to start:', err)
    process.exit(1)
})
