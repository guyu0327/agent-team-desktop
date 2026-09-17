#!/usr/bin/env node
/**
 * 从 build/icon.png（≥512x512 RGBA）重新生成 build/icon.ico。
 * 无第三方依赖：PNG 解码、盒滤波缩放、PNG 编码全部内置（压缩用 Node 自带 zlib）。
 * 产物为 16/24/32/48/64/128/256 全尺寸 PNG 帧的 ico，各尺寸均由原图高质量重采样，
 * 桌面/任务栏任意 DPI 下都清晰（旧的 ico 各帧由外部工具低质量转换，小尺寸发糊）。
 * 用法：node scripts/build-icon.js
 */
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const SIZES = [16, 24, 32, 48, 64, 128, 256]

// ---------- PNG 解码（8bit 非隔行，支持灰度/RGB/RGBA/调色板） ----------
function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(PNG_SIG)) throw new Error('不是 PNG 文件')
  let pos = 8
  const idat = []
  let width = 0, height = 0, colorType = 0, interlace = 0, palette = null, trns = null
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString('ascii', pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      if (data[8] !== 8) throw new Error('仅支持 8bit 位深')
      colorType = data[9]
      interlace = data[12]
    } else if (type === 'PLTE') palette = Buffer.from(data)
    else if (type === 'tRNS') trns = Buffer.from(data)
    else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    pos += 12 + len
  }
  if (interlace !== 0) throw new Error('不支持隔行 PNG')
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType]
  if (!channels) throw new Error('不支持的颜色类型 ' + colorType)

  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const out = Buffer.alloc(width * height * 4)
  let prev = Buffer.alloc(stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const cur = Buffer.alloc(stride)
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels] : 0
      const b = prev[i]
      const c = i >= channels ? prev[i - channels] : 0
      let v = line[i]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      cur[i] = v & 0xff
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4
      if (colorType === 6) cur.copy(out, o, x * 4, x * 4 + 4)
      else if (colorType === 2) {
        out[o] = cur[x * 3]; out[o + 1] = cur[x * 3 + 1]; out[o + 2] = cur[x * 3 + 2]; out[o + 3] = 255
      } else if (colorType === 0) {
        out[o] = out[o + 1] = out[o + 2] = cur[x]; out[o + 3] = 255
      } else if (colorType === 4) {
        out[o] = out[o + 1] = out[o + 2] = cur[x * 2]; out[o + 3] = cur[x * 2 + 1]
      } else if (colorType === 3) {
        const idx = cur[x]
        out[o] = palette[idx * 3]; out[o + 1] = palette[idx * 3 + 1]; out[o + 2] = palette[idx * 3 + 2]
        out[o + 3] = trns && idx < trns.length ? trns[idx] : 255
      }
    }
    prev = cur
  }
  return { width, height, data: out }
}

// ---------- 盒滤波缩小（area average，预乘 alpha 避免透明边缘出现黑晕） ----------
function resize(src, sw, sh, dw, dh) {
  const out = Buffer.alloc(dw * dh * 4)
  for (let y = 0; y < dh; y++) {
    const sy0 = Math.floor(y * sh / dh)
    const sy1 = Math.max(sy0 + 1, Math.floor((y + 1) * sh / dh))
    for (let x = 0; x < dw; x++) {
      const sx0 = Math.floor(x * sw / dw)
      const sx1 = Math.max(sx0 + 1, Math.floor((x + 1) * sw / dw))
      let r = 0, g = 0, b = 0, a = 0, n = 0
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const o = (sy * sw + sx) * 4
          const al = src[o + 3] / 255
          r += src[o] * al; g += src[o + 1] * al; b += src[o + 2] * al; a += src[o + 3]
          n++
        }
      }
      const o = (y * dw + x) * 4
      const avgA = a / n
      out[o + 3] = Math.round(avgA)
      if (avgA > 0) {
        const k = 255 / avgA
        out[o] = Math.min(255, Math.round((r / n) * k))
        out[o + 1] = Math.min(255, Math.round((g / n) * k))
        out[o + 2] = Math.min(255, Math.round((b / n) * k))
      }
    }
  }
  return out
}

// ---------- PNG 编码（RGBA，filter 0） ----------
const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const head = Buffer.alloc(4)
  head.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([head, body, crc])
}

function encodePng(w, h, rgba) {
  const stride = w * 4
  const raw = Buffer.alloc((stride + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    PNG_SIG,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---------- 组装 ico（全部 PNG 帧，Vista 起支持） ----------
function buildIco(frames) {
  const count = frames.length
  const header = Buffer.alloc(6)
  header.writeUInt16LE(1, 2) // ICONDIR 的 wType：1 = 图标（缺了它 electron-builder 会判定非法 ico）
  header.writeUInt16LE(count, 4)
  const dirs = []
  const blobs = []
  let offset = 6 + count * 16
  for (const { size, png } of frames) {
    const dir = Buffer.alloc(16)
    dir[0] = size >= 256 ? 0 : size
    dir[1] = size >= 256 ? 0 : size
    dir.writeUInt16LE(1, 4)
    dir.writeUInt16LE(32, 6)
    dir.writeUInt32LE(png.length, 8)
    dir.writeUInt32LE(offset, 12)
    dirs.push(dir)
    blobs.push(png)
    offset += png.length
  }
  return Buffer.concat([header, ...dirs, ...blobs])
}

function main() {
  const root = path.join(__dirname, '..')
  const srcPath = path.join(root, 'build', 'icon.png')
  const outPath = path.join(root, 'build', 'icon.ico')
  const { width, height, data } = decodePng(fs.readFileSync(srcPath))
  const frames = SIZES.map((size) => ({
    size,
    png: encodePng(size, size, resize(data, width, height, size, size)),
  }))
  fs.writeFileSync(outPath, buildIco(frames))
  console.log(`icon.ico 已生成：${SIZES.join('/')} 共 ${frames.length} 帧（源 ${width}x${height}）`)
}

main()
