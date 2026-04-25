/**
 * Minimal ZIP encoder (store mode, no compression). Used by the admin
 * "Download all photos" endpoint — JPEGs are already compressed so DEFLATE
 * gains little, and store mode avoids pulling in a zip library.
 */

let crcTable

function buildCrcTable() {
    const t = new Uint32Array(256)
    for (let i = 0; i < 256; i++) {
        let c = i
        for (let j = 0; j < 8; j++) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
        }
        t[i] = c
    }
    return t
}

function crc32(buf) {
    if (!crcTable) crcTable = buildCrcTable()
    let c = 0xFFFFFFFF
    for (let i = 0; i < buf.length; i++) {
        c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8)
    }
    return (c ^ 0xFFFFFFFF) >>> 0
}

/**
 * Build a zip Buffer from [{ name, data: Buffer }] entries.
 * Filenames must be unique; caller is responsible.
 */
export function buildZip(entries) {
    const localChunks = []
    const cdChunks = []
    let offset = 0

    for (const { name, data } of entries) {
        const nameBuf = Buffer.from(name, 'utf8')
        const crc = crc32(data)
        const size = data.length

        const lfh = Buffer.alloc(30)
        lfh.writeUInt32LE(0x04034b50, 0)
        lfh.writeUInt16LE(20, 4)
        lfh.writeUInt16LE(0, 6)
        lfh.writeUInt16LE(0, 8)
        lfh.writeUInt16LE(0, 10)
        lfh.writeUInt16LE(0, 12)
        lfh.writeUInt32LE(crc, 14)
        lfh.writeUInt32LE(size, 18)
        lfh.writeUInt32LE(size, 22)
        lfh.writeUInt16LE(nameBuf.length, 26)
        lfh.writeUInt16LE(0, 28)
        localChunks.push(lfh, nameBuf, data)

        const cdh = Buffer.alloc(46)
        cdh.writeUInt32LE(0x02014b50, 0)
        cdh.writeUInt16LE(20, 4)
        cdh.writeUInt16LE(20, 6)
        cdh.writeUInt16LE(0, 8)
        cdh.writeUInt16LE(0, 10)
        cdh.writeUInt16LE(0, 12)
        cdh.writeUInt16LE(0, 14)
        cdh.writeUInt32LE(crc, 16)
        cdh.writeUInt32LE(size, 20)
        cdh.writeUInt32LE(size, 24)
        cdh.writeUInt16LE(nameBuf.length, 28)
        cdh.writeUInt16LE(0, 30)
        cdh.writeUInt16LE(0, 32)
        cdh.writeUInt16LE(0, 34)
        cdh.writeUInt16LE(0, 36)
        cdh.writeUInt32LE(0, 38)
        cdh.writeUInt32LE(offset, 42)
        cdChunks.push(cdh, nameBuf)

        offset += lfh.length + nameBuf.length + size
    }

    const cd = Buffer.concat(cdChunks)
    const cdSize = cd.length
    const cdOffset = offset

    const eocd = Buffer.alloc(22)
    eocd.writeUInt32LE(0x06054b50, 0)
    eocd.writeUInt16LE(0, 4)
    eocd.writeUInt16LE(0, 6)
    eocd.writeUInt16LE(entries.length, 8)
    eocd.writeUInt16LE(entries.length, 10)
    eocd.writeUInt32LE(cdSize, 12)
    eocd.writeUInt32LE(cdOffset, 16)
    eocd.writeUInt16LE(0, 20)

    return Buffer.concat([...localChunks, cd, eocd])
}
