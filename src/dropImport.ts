/**
 * 拖放导入：把「拖进窗口」的东西读成一段纯文本。
 *
 * 为什么单独成文件：
 * 1. 拖放必须在**整个窗口**接收，而不是只绑在消息箱那个区块上。HTML5 规定
 *    `dragover` 必须 preventDefault 才允许 drop，只在一个小区域里 preventDefault，
 *    拖到页面其他地方时浏览器认为那里不是合法放置目标，`drop` 根本不会触发
 *    （Electron 里还会顺势去导航到那个文件，被主进程 will-navigate 拦掉，表现就是「什么都没发生」）。
 * 2. `DataTransfer.getData()` 只能在事件回调的**同步阶段**读取，handler 一旦 await，
 *    DataTransfer 会被置为保护模式并清空。所以这里先把纯文本、File 列表、目录句柄
 *    同步取出来，再去读文件内容。
 * 3. 微信导出的聊天记录有三种形态：单文件 .txt、.html、以及「.zip 压缩包」或整个文件夹，
 *    三种都要能直接拖进来，不能让用户先手动解压再一个个拖。
 */

import { looksLikeZip, readZipTextEntries } from './zipImport'
import { decodeTextBytes } from './textDecode'

/** 一次最多接收多少个文件 */
export const MAX_DROP_FILES = 10
/** 单个文件大小上限（超过就跳过，避免整个聊天记录把内存吃满） */
export const MAX_DROP_FILE_BYTES = 2 * 1024 * 1024
/** 合并后的文本上限 */
export const MAX_DROP_TEXT = 200_000
/** 拖文件夹时最多往下钻几层 */
const MAX_FOLDER_DEPTH = 3
/** 拖文件夹时最多读多少个文件 */
const MAX_FOLDER_FILES = 60

const TEXT_FILE = /\.(txt|md|markdown|log|html?|json|csv)$/i
const HTML_FILE = /\.html?$/i

/**
 * 微信/钉钉导出的「聊天记录」经常是 .html，直接当纯文本喂给拆分函数会把整页标签当正文。
 * 这里只做最小清洗：去掉 script/style、块级标签转换行、剥掉其余标签、解码常见实体。
 * 不做 DOM 解析（拖放进来的内容不该被渲染），纯字符串处理足够。
 */
export function htmlFileToText(raw: string): string {
  return raw
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export interface DropReadResult {
  /** 合并后的文本，已 trim；为空表示没读到可用内容 */
  text: string
  /** 实际读进来的文件数（压缩包/文件夹里取出的文本也算） */
  fileCount: number
  /** 被跳过的东西及原因，用于给用户一句可读的提示 */
  skipped: string[]
}

/** 判断这次拖拽带的东西值不值得接（避免抢走页面内部的拖拽）。 */
export function isImportableDrag(data: DataTransfer | null): boolean {
  if (!data) return false
  const types = Array.from(data.types ?? [])
  return types.includes('Files') || types.includes('text/plain')
}

interface FileTextResult {
  /** 读到的正文；null 表示这个文件没贡献内容 */
  text: string | null
  /** 没读到时给用户看的原因 */
  skip?: string
  /** 读到了但有附带说明（例如压缩包里有几个条目跳过） */
  note?: string
}

/** 单个文件 → 文本。压缩包会展开成多个文本条目再拼接。 */
async function fileToText(file: File): Promise<FileTextResult> {
  if (looksLikeZip(file)) {
    let result
    try {
      result = await readZipTextEntries(file)
    } catch {
      return { text: null, skip: `${file.name}（压缩包读取失败）` }
    }
    if (result.entries.length === 0) {
      return { text: null, skip: result.skipped[0] ?? `${file.name}（压缩包里没有文本文件）` }
    }
    const parts = result.entries
      .map(entry => (entry.html ? htmlFileToText(entry.text) : entry.text).trim())
      .filter(Boolean)
    if (parts.length === 0) return { text: null, skip: `${file.name}（压缩包里的文本是空的）` }
    const note = result.skipped.length > 0
      ? `${file.name} 里有 ${result.skipped.length} 个条目被跳过（${result.skipped[0]}）`
      : undefined
    return { text: parts.join('\n\n'), note }
  }

  if (!(file.type.startsWith('text/') || TEXT_FILE.test(file.name))) {
    return { text: null, skip: `${file.name}（不是文本文件）` }
  }
  if (file.size > MAX_DROP_FILE_BYTES) {
    return { text: null, skip: `${file.name}（超过 2 MB）` }
  }
  try {
    const content = decodeTextBytes(new Uint8Array(await file.arrayBuffer()))
    const text = (HTML_FILE.test(file.name) ? htmlFileToText(content) : content).trim()
    return { text: text || null, skip: text ? undefined : `${file.name}（内容是空的）` }
  } catch {
    return { text: null, skip: `${file.name}（读取失败）` }
  }
}

interface DirWalk {
  files: File[]
  skipped: string[]
  count: number
}

/** 递归读目录（拖进来的整个文件夹）。Chromium 的 readEntries 一次只给一批，要读到空为止。 */
async function walkDirectory(entry: any, depth: number, state: DirWalk): Promise<void> {
  if (depth > MAX_FOLDER_DEPTH || state.count >= MAX_FOLDER_FILES) return
  if (entry.isFile) {
    const file: File | null = await new Promise(resolve => {
      try { entry.file((f: File) => resolve(f), () => resolve(null)) } catch { resolve(null) }
    })
    if (!file) { state.skipped.push(`${entry.name}（读取失败）`); return }
    if (file.size === 0) return
    state.files.push(file)
    state.count += 1
    return
  }
  if (!entry.isDirectory) return

  const reader = entry.createReader()
  for (;;) {
    const batch: any[] = await new Promise(resolve => {
      try { reader.readEntries((items: any[]) => resolve(items ?? []), () => resolve([])) } catch { resolve([]) }
    })
    if (batch.length === 0) break
    for (const child of batch) {
      if (state.count >= MAX_FOLDER_FILES) {
        state.skipped.push(`（文件夹里文件太多，只读了前 ${MAX_FOLDER_FILES} 个）`)
        return
      }
      await walkDirectory(child, depth + 1, state)
    }
  }
}

export async function readDroppedContent(data: DataTransfer | null): Promise<DropReadResult> {
  const empty: DropReadResult = { text: '', fileCount: 0, skipped: [] }
  if (!data) return empty

  // —— 同步阶段：这三样东西过一会儿就读不到了 ——
  let plain = ''
  try {
    plain = data.getData('text/plain') ?? ''
  } catch {
    plain = ''
  }

  let files: File[] = []
  try {
    files = Array.from(data.files ?? [])
  } catch {
    files = []
  }

  // 目录句柄必须在这里同步拿，异步之后就取不到了
  const dirEntries: any[] = []
  try {
    for (const item of Array.from(data.items ?? [])) {
      if (item.kind !== 'file') continue
      const entry = (item as unknown as { webkitGetAsEntry?: () => any }).webkitGetAsEntry?.()
      if (entry?.isDirectory) dirEntries.push(entry)
    }
  } catch {
    // 没有 webkitGetAsEntry 就算了，按普通文件处理
  }

  const chunks: string[] = []
  const skipped: string[] = []
  let fileCount = 0
  if (plain.trim()) chunks.push(plain)

  // 1. 整个文件夹：展开里面的文本文件（微信导出的很多是「一个 html + 一个文件目录」）
  for (const entry of dirEntries) {
    const state: DirWalk = { files: [], skipped: [], count: 0 }
    await walkDirectory(entry, 0, state)
    skipped.push(...state.skipped)
    for (const file of state.files) {
      const result = await fileToText(file)
      if (result.text) { chunks.push(result.text); fileCount += 1 }
      if (result.skip) skipped.push(result.skip)
      if (result.note) skipped.push(result.note)
    }
    if (state.files.length === 0 && state.skipped.length === 0) {
      skipped.push(`文件夹「${entry.name}」里没有可导入的文本文件`)
    }
  }

  // 2. 普通文件 / 压缩包
  for (const file of files.slice(0, MAX_DROP_FILES)) {
    // 目录在 files 里会表现为 0 字节的占位项，已经由上面处理过了
    if (file.size === 0 && dirEntries.length > 0) continue
    if (file.size === 0) {
      skipped.push(`${file.name || '空文件'}（是个空文件）`)
      continue
    }
    const result = await fileToText(file)
    if (result.text) { chunks.push(result.text); fileCount += 1 }
    if (result.skip) skipped.push(result.skip)
    if (result.note) skipped.push(result.note)
  }

  const text = chunks.join('\n\n').slice(0, MAX_DROP_TEXT).trim()
  return { text, fileCount, skipped }
}
