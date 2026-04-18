/**
 * Database abstraction layer.
 *   Dev  → SQLite at data/wwww.db
 *   Prod → PostgreSQL via DATABASE_URL (hard failure if missing)
 *
 * Production mode must never touch the local filesystem for DB state — the
 * Railway filesystem is ephemeral and silently falling back to SQLite would
 * wipe live auction data on every redeploy.
 */

import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { mkdirSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const isProduction = process.env.NODE_ENV === 'production'

let db = null

export async function initDatabase() {
    if (isProduction) {
        if (!process.env.DATABASE_URL) {
            throw new Error(
                'DATABASE_URL is required in production. Attach a Postgres service (e.g. on Railway) and set DATABASE_URL.'
            )
        }
        const pg = await import('pg')
        const pool = new pg.default.Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false }
        })

        db = {
            type: 'postgres',
            pool,
            run: async (sql, params = []) => { await pool.query(sql, params) },
            get: async (sql, params = []) => (await pool.query(sql, params)).rows[0],
            all: async (sql, params = []) => (await pool.query(sql, params)).rows
        }

        await pool.query(`
            CREATE TABLE IF NOT EXISTS photos (
                id TEXT PRIMARY KEY,
                image TEXT NOT NULL,
                settings JSONB,
                status TEXT DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP
            )
        `)

        await pool.query(`
            CREATE TABLE IF NOT EXISTS logs (
                id SERIAL PRIMARY KEY,
                type TEXT NOT NULL,
                ip TEXT,
                photo_id TEXT,
                user_agent TEXT,
                path TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `)

        await pool.query(`
            CREATE TABLE IF NOT EXISTS auction_items (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                tagline TEXT,
                description TEXT NOT NULL DEFAULT '',
                position INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `)

        await pool.query(`
            CREATE TABLE IF NOT EXISTS auction_images (
                id TEXT PRIMARY KEY,
                item_id TEXT NOT NULL REFERENCES auction_items(id) ON DELETE CASCADE,
                image_data TEXT NOT NULL,
                mime TEXT NOT NULL DEFAULT 'image/jpeg',
                position INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `)

        await pool.query(`CREATE INDEX IF NOT EXISTS idx_auction_images_item ON auction_images(item_id)`)

        console.log('Connected to PostgreSQL database')
    } else {
        const Database = (await import('better-sqlite3')).default

        const dataDir = join(__dirname, 'data')
        mkdirSync(dataDir, { recursive: true })

        const sqliteDb = new Database(join(dataDir, 'wwww.db'))
        sqliteDb.pragma('journal_mode = WAL')
        sqliteDb.pragma('foreign_keys = ON')

        db = {
            type: 'sqlite',
            sqlite: sqliteDb,
            run: async (sql, params = []) => {
                const s = sql.replace(/\$(\d+)/g, '?')
                sqliteDb.prepare(s).run(...params)
            },
            get: async (sql, params = []) => {
                const s = sql.replace(/\$(\d+)/g, '?')
                return sqliteDb.prepare(s).get(...params)
            },
            all: async (sql, params = []) => {
                const s = sql.replace(/\$(\d+)/g, '?')
                return sqliteDb.prepare(s).all(...params)
            }
        }

        sqliteDb.exec(`
            CREATE TABLE IF NOT EXISTS photos (
                id TEXT PRIMARY KEY,
                image TEXT NOT NULL,
                settings TEXT,
                status TEXT DEFAULT 'pending',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT
            );

            CREATE TABLE IF NOT EXISTS logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL,
                ip TEXT,
                photo_id TEXT,
                user_agent TEXT,
                path TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS auction_items (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                tagline TEXT,
                description TEXT NOT NULL DEFAULT '',
                position INTEGER NOT NULL DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS auction_images (
                id TEXT PRIMARY KEY,
                item_id TEXT NOT NULL REFERENCES auction_items(id) ON DELETE CASCADE,
                image_data TEXT NOT NULL,
                mime TEXT NOT NULL DEFAULT 'image/jpeg',
                position INTEGER NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_auction_images_item ON auction_images(item_id);
        `)

        console.log('Connected to SQLite database at data/wwww.db')
    }

    return db
}

// ---- Photo operations ----
export async function addPhoto(id, image, settings) {
    const settingsJson = db.type === 'postgres' ? settings : JSON.stringify(settings)
    await db.run(
        `INSERT INTO photos (id, image, settings, created_at) VALUES ($1, $2, $3, $4)`,
        [id, image, settingsJson, new Date().toISOString()]
    )
}

export async function getPhotos() {
    const rows = await db.all(`SELECT id, image, settings, status, created_at, updated_at FROM photos ORDER BY created_at DESC`)
    return rows.map(row => ({
        ...row,
        settings: typeof row.settings === 'string' ? safeParse(row.settings) : row.settings
    }))
}

export async function getPhoto(id) {
    const row = await db.get(`SELECT * FROM photos WHERE id = $1`, [id])
    if (row && typeof row.settings === 'string') row.settings = safeParse(row.settings)
    return row
}

export async function updatePhotoStatus(id, status) {
    await db.run(
        `UPDATE photos SET status = $1, updated_at = $2 WHERE id = $3`,
        [status, new Date().toISOString(), id]
    )
}

export async function deletePhoto(id) {
    await db.run(`DELETE FROM photos WHERE id = $1`, [id])
}

export async function deleteAllPhotos() {
    await db.run(`DELETE FROM photos`)
}

// ---- Log operations ----
export async function log(type, data = {}) {
    await db.run(
        `INSERT INTO logs (type, ip, photo_id, user_agent, path) VALUES ($1, $2, $3, $4, $5)`,
        [type, data.ip || null, data.photoId || null, data.userAgent || null, data.path || null]
    )
}

export async function getLogs(limit = 100, offset = 0, type = null) {
    let sql = `SELECT * FROM logs`
    const params = []
    if (type) {
        sql += ` WHERE type = $1`
        params.push(type)
    }
    sql += ` ORDER BY created_at DESC`

    if (db.type === 'postgres') {
        sql += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
    } else {
        sql += ` LIMIT ? OFFSET ?`
    }
    params.push(limit, offset)
    return await db.all(sql, params)
}

export async function getLogStats() {
    const visits = await db.get(`SELECT COUNT(*) as count FROM logs WHERE type = 'visit'`)
    const views = await db.get(`SELECT COUNT(*) as count FROM logs WHERE type = 'view'`)
    const downloads = await db.get(`SELECT COUNT(*) as count FROM logs WHERE type = 'download'`)
    const posts = await db.get(`SELECT COUNT(*) as count FROM logs WHERE type = 'post'`)
    return {
        visits: visits?.count || 0,
        views: views?.count || 0,
        downloads: downloads?.count || 0,
        posts: posts?.count || 0
    }
}

export async function clearLogs() {
    await db.run(`DELETE FROM logs`)
}

// ---- Auction items ----
// Image rows return a `url` field pointing at /api/auction-images/:id so the
// carousel/admin never have to ingest the full base64 blob in list responses.
export async function listAuctionItems() {
    const items = await db.all(`SELECT id, title, tagline, description, position, created_at, updated_at FROM auction_items ORDER BY position ASC, created_at ASC`)
    const images = await db.all(`SELECT id, item_id, position FROM auction_images ORDER BY position ASC`)
    const imagesByItem = new Map()
    for (const img of images) {
        if (!imagesByItem.has(img.item_id)) imagesByItem.set(img.item_id, [])
        imagesByItem.get(img.item_id).push({ id: img.id, url: `/api/auction-images/${img.id}`, position: img.position })
    }
    return items.map(it => ({ ...it, images: imagesByItem.get(it.id) || [] }))
}

export async function getAuctionItem(id) {
    const item = await db.get(`SELECT * FROM auction_items WHERE id = $1`, [id])
    if (!item) return null
    const rows = await db.all(`SELECT id, position FROM auction_images WHERE item_id = $1 ORDER BY position ASC`, [id])
    const images = rows.map(r => ({ id: r.id, url: `/api/auction-images/${r.id}`, position: r.position }))
    return { ...item, images }
}

export async function getAuctionImage(id) {
    return await db.get(`SELECT id, item_id, image_data, mime, position FROM auction_images WHERE id = $1`, [id])
}

export async function createAuctionItem({ id, title, tagline, description, position }) {
    await db.run(
        `INSERT INTO auction_items (id, title, tagline, description, position) VALUES ($1, $2, $3, $4, $5)`,
        [id, title, tagline || '', description || '', position ?? 0]
    )
}

export async function updateAuctionItem(id, fields) {
    const sets = []
    const params = []
    let i = 1
    for (const key of ['title', 'tagline', 'description', 'position']) {
        if (key in fields) {
            sets.push(`${key} = $${i++}`)
            params.push(fields[key])
        }
    }
    if (!sets.length) return
    sets.push(`updated_at = $${i++}`)
    params.push(new Date().toISOString())
    params.push(id)
    await db.run(`UPDATE auction_items SET ${sets.join(', ')} WHERE id = $${i}`, params)
}

export async function deleteAuctionItem(id) {
    // ON DELETE CASCADE handles images.
    await db.run(`DELETE FROM auction_items WHERE id = $1`, [id])
}

export async function addAuctionImage({ id, itemId, imageData, mime = 'image/jpeg', position }) {
    await db.run(
        `INSERT INTO auction_images (id, item_id, image_data, mime, position) VALUES ($1, $2, $3, $4, $5)`,
        [id, itemId, imageData, mime, position]
    )
}

export async function removeAuctionImageAtSlot(itemId, position) {
    const row = await db.get(`SELECT id FROM auction_images WHERE item_id = $1 AND position = $2`, [itemId, position])
    if (row) await db.run(`DELETE FROM auction_images WHERE id = $1`, [row.id])
    return row?.id || null
}

function safeParse(s) {
    try { return JSON.parse(s) } catch { return null }
}
