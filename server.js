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
import { buildZip } from './zip.js'

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
    if (pagePaths.includes(req.path) && req.method === 'GET') {
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

// HTTP Basic Auth gate for admin surfaces. When ADMIN_PASSWORD is unset or
// blank, the gate opens for everyone — convenient for local dev. The browser
// caches the credential for the origin once the user logs in, so subsequent
// fetch() calls from the admin page automatically carry it.
function requireAdminAuth(req, res, next) {
    const required = process.env.ADMIN_PASSWORD || ''
    if (!required) return next()

    const challenge = () => {
        res.setHeader('WWW-Authenticate', 'Basic realm="admin", charset="UTF-8"')
        res.status(401).send('Authentication required')
    }

    const header = req.headers.authorization || ''
    if (!header.startsWith('Basic ')) return challenge()

    let decoded = ''
    try { decoded = Buffer.from(header.slice(6), 'base64').toString('utf8') }
    catch { return challenge() }

    // Username can be anything; we only check the password (everything after
    // the first colon, so passwords containing colons survive).
    const idx = decoded.indexOf(':')
    const submitted = idx >= 0 ? decoded.slice(idx + 1) : decoded
    if (submitted !== required) return challenge()
    next()
}

// Gate the admin HTML page in both dev (Vite middleware) and prod (explicit
// static route). Place this before any HTML-serving middleware.
app.use((req, res, next) => {
    if (req.method === 'GET' && (req.path === '/admin' || req.path === '/admin.html')) {
        return requireAdminAuth(req, res, next)
    }
    next()
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

        res.json({
            id: photo.id,
            image: photo.image,
            createdAt: photo.created_at
        })
    } catch (error) {
        res.status(500).json({ error: 'Failed to get photo' })
    }
})

// Binary image bytes for gallery tiles + lightbox. Decodes the stored
// data URL once and returns raw bytes so <img src=".../image"> can use the
// browser's HTTP cache instead of JSON-wrapping a multi-MB base64 string on
// every render.
app.get('/api/photos/:id/image', async (req, res) => {
    try {
        const photo = await getPhoto(req.params.id)
        if (!photo) return res.status(404).end()
        const match = /^data:([^;]+);base64,(.+)$/.exec(photo.image || '')
        if (!match) return res.status(500).end()
        const [, mime, b64] = match
        res.setHeader('Content-Type', mime)
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        res.send(Buffer.from(b64, 'base64'))
    } catch (error) {
        console.error(error)
        res.status(500).end()
    }
})

app.post('/api/photos/:id/log-view', async (req, res) => {
    try {
        await log('view', {
            ip: getClientIP(req),
            photoId: req.params.id,
            userAgent: req.headers['user-agent']
        })
        res.json({ success: true })
    } catch {
        res.status(500).json({ error: 'Failed to log view' })
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

app.patch('/api/photos/:id', requireAdminAuth, async (req, res) => {
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

app.delete('/api/photos/:id', requireAdminAuth, async (req, res) => {
    try {
        await deletePhoto(req.params.id)
        res.json({ success: true })
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete photo' })
    }
})

app.delete('/api/photos', requireAdminAuth, async (req, res) => {
    try {
        await deleteAllPhotos()
        res.json({ success: true })
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete photos' })
    }
})

// Admin-only: bundle every photo into a single zip download.
app.get('/api/admin/photos/zip', requireAdminAuth, async (_req, res) => {
    try {
        const list = await getPhotos()
        const entries = []
        for (const meta of list) {
            const photo = await getPhoto(meta.id)
            if (!photo) continue
            const m = /^data:([^;]+);base64,(.+)$/.exec(photo.image || '')
            if (!m) continue
            const [, mime, b64] = m
            const ext = mime === 'image/png' ? 'png' : 'jpg'
            entries.push({
                name: `wwww-${meta.id}.${ext}`,
                data: Buffer.from(b64, 'base64')
            })
        }
        const zip = buildZip(entries)
        const stamp = new Date().toISOString().slice(0, 10)
        res.setHeader('Content-Type', 'application/zip')
        res.setHeader('Content-Disposition', `attachment; filename="wwww-photos-${stamp}.zip"`)
        res.setHeader('Content-Length', zip.length)
        res.send(zip)
    } catch (error) {
        console.error('Photo zip failed:', error)
        res.status(500).json({ error: 'Failed to build zip' })
    }
})

// All `/api/admin/*` routes below are gated by Basic Auth.
app.use('/api/admin', requireAdminAuth)

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
async function startServer() {
    await initDatabase()

    if (isDev) {
        const vite = await createViteServer({
            server: { middlewareMode: true },
            appType: 'mpa'
        })
        app.use(vite.middlewares)
        console.log('Vite dev server integrated')
    } else {
        app.use(express.static(join(__dirname, 'dist')))
        const pages = ['index.html', 'photobooth.html', 'gallery.html', 'admin.html']
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
║   /gallery      Photo wall (QR target)                      ║
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
