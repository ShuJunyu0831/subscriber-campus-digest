/**
 * 最小 ZIP 读取器：只做一件事 —— 从压缩包里取出文本类条目。
 *
 * 为什么自己写而不用库：
 * 只为了「拖一个 .zip 聊天记录进来」这种场景装一个 jszip 不划算。ZIP 结构很稳定，
 * 读中央目录 + `DecompressionStream('deflate-raw')` 解压就够，浏览器/Electron 原生支持。
 *
 * 刻意不支持：
 * - Zip64（>4GB 或 >65535 个条目）：聊天记录碰不到，遇到就明说跳过；
 * - 加密条目；
 * - 递归嵌套的 zip。
 */

/** 压缩包里最多取多少个文本条目 */
export const MAX_ZIP_TEXT_ENTRIES = 40
/** 单个条目解压后的大小上限 */
export const MAX_ZIP_ENTRY_BYTES = 4 * 1024 * 1024
/** 所有条目解压后的总大小上限 */
export const MAX_ZIP_TOTAL_BYTES = 12 * 1024 * 1024
/** 压缩包本身的大小上限（避免把几百 MB 的包整个读进内存） */
export const MAX_ZIP_FILE_BYTES = 24 * 1024 * 1024

import { decodeTextBytes } from './textDecode'

const TEXT_ENTRY = /\.(txt|md|markdown|log|html?|json|csv)$/i
const HTML_ENTRY = /\.html?$/i

export interface ZipTextEntry {
  name: string
  text: string
  /** 内容是不是 HTML（调用方决定要不要剥标签） */
  html: boolean
}

export interface ZipReadResult {
  entries: ZipTextEntry[]
  /** 被跳过的条目或整包问题，用来给用户一句可读的说明 */
  skipped: string[]
}

/** 按文件名/类型判断是不是压缩包。 */
export function looksLikeZip(file: File): boolean {
  return /\.zip$/i.test(file.name) || file.type === 'application/zip' || file.type === 'application/x-zip-compressed'
}

/** 扩展名是否值得尝试解成文本。乱码文件名里的 ASCII 后缀仍然可用，所以先看后缀。 */
export function isTextEntryName(name: string): boolean {
  return TEXT_ENTRY.test(name)
}

export function isHtmlEntryName(name: string): boolean {
  return HTML_ENTRY.test(name)
}

function findEndOfCentralDirectory(view: DataView): number {
  const length = view.byteLength
  // EOCD 之后最多跟 65535 字节注释，所以从尾部往前最多扫 65557 字节
  const stop = Math.max(0, length - 65_557)
  for (let offset = length - 22; offset >= stop; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset
  }
  return -1
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array | null> {
  const Ctor = (globalThis as { DecompressionStream?: typeof DecompressionStream }).DecompressionStream
  if (!Ctor) return null
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new Ctor('deflate-raw'))
    const buffer = await new Response(stream).arrayBuffer()
    return new Uint8Array(buffer)
  } catch {
    return null
  }
}

/**
 * 从 zip 里取出文本条目。读不出来就返回空列表 + 原因，绝不返回半截乱码。
 */
export async function readZipTextEntries(file: File): Promise<ZipReadResult> {
  const skipped: string[] = []
  if (file.size > MAX_ZIP_FILE_BYTES) {
    return { entries: [], skipped: [`${file.name}（压缩包超过 24 MB，先解压再拖里面的文本文件）`] }
  }

  const buffer = await file.arrayBuffer()
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)

  if (view.byteLength < 22) return { entries: [], skipped: [`${file.name}（不是有效的 zip）`] }
  const eocd = findEndOfCentralDirectory(view)
  if (eocd < 0) return { entries: [], skipped: [`${file.name}（不是有效的 zip：找不到目录区）`] }

  const totalEntries = view.getUint16(eocd + 10, true)
  let cursor = view.getUint32(eocd + 16, true)
  if (cursor === 0xffffffff) return { entries: [], skipped: [`${file.name}（Zip64 暂不支持，请先解压）`] }

  const entries: ZipTextEntry[] = []
  const seen: string[] = []
  let totalBytes = 0

  for (let index = 0; index < totalEntries; index += 1) {
    if (cursor + 46 > view.byteLength) break
    if (view.getUint32(cursor, true) !== 0x02014b50) break

    const method = view.getUint16(cursor + 10, true)
    const compressedSize = view.getUint32(cursor + 20, true)
    const uncompressedSize = view.getUint32(cursor + 24, true)
    const nameLength = view.getUint16(cursor + 28, true)
    const extraLength = view.getUint16(cursor + 30, true)
    const commentLength = view.getUint16(cursor + 32, true)
    const localOffset = view.getUint32(cursor + 42, true)
    const name = decodeTextBytes(bytes.subarray(cursor + 46, cursor + 46 + nameLength))

    cursor += 46 + nameLength + extraLength + commentLength

    if (name.endsWith('/')) continue                       // 目录
    if (!isTextEntryName(name)) { seen.push(name); continue }
    if (compressedSize === 0xffffffff || localOffset === 0xffffffff) {
      skipped.push(`${name}（Zip64 条目，跳过）`)
      continue
    }
    if (uncompressedSize > MAX_ZIP_ENTRY_BYTES) {
      skipped.push(`${name}（解压后超过 4 MB）`)
      continue
    }
    if (entries.length >= MAX_ZIP_TEXT_ENTRIES) {
      skipped.push(`（压缩包里文本条目太多，只取了前 ${MAX_ZIP_TEXT_ENTRIES} 个）`)
      break
    }

    // 本地文件头才是真实数据起点：中央目录里的 offset 指向它
    if (localOffset + 30 > view.byteLength) { skipped.push(`${name}（本地头越界）`); continue }
    if (view.getUint32(localOffset, true) !== 0x04034b50) { skipped.push(`${name}（本地头签名不对）`); continue }
    const localNameLength = view.getUint16(localOffset + 26, true)
    const localExtraLength = view.getUint16(localOffset + 28, true)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    const dataEnd = dataStart + compressedSize
    if (dataEnd > bytes.byteLength) { skipped.push(`${name}（数据越界）`); continue }

    if (totalBytes + uncompressedSize > MAX_ZIP_TOTAL_BYTES) {
      skipped.push(`（压缩包解压后过大，后面的条目没有读）`)
      break
    }

    const raw = bytes.subarray(dataStart, dataEnd)
    let payload: Uint8Array | null = null
    if (method === 0) payload = raw
    else if (method === 8) payload = await inflateRaw(raw)
    if (!payload) { skipped.push(`${name}（不支持的压缩方式 ${method}）`); continue }

    totalBytes += payload.byteLength
    const text = decodeTextBytes(payload)
    if (!text.trim()) continue
    entries.push({ name, text, html: isHtmlEntryName(name) })
  }

  if (entries.length === 0 && skipped.length === 0) {
    return { entries, skipped: [`${file.name}（压缩包里没有 .txt / .html 之类的文本文件，共 ${seen.length} 个其他文件）`] }
  }
  return { entries, skipped }
}
