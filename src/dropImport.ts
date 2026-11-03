/**
 * 拖放导入：把「拖进窗口」的聊天记录文件或选中文字读成一段纯文本。
 *
 * 为什么单独成文件：
 * 1. 拖放必须在**整个窗口**接收，而不是只绑在消息箱那个区块上。HTML5 规定
 *    `dragover` 必须 preventDefault 才允许 drop，只在一个小区域里 preventDefault，
 *    拖到页面其他地方时浏览器认为那里不是合法放置目标，`drop` 根本不会触发
 *    （Electron 里还会顺势去导航到那个文件，被主进程 will-navigate 拦掉，表现就是「什么都没发生」）。
 * 2. `DataTransfer.getData()` 只能在事件回调的**同步阶段**读取，handler 一旦 await，
 *    DataTransfer 会被置为保护模式并清空。所以这里先把纯文本同步取出来，再去读文件内容。
 */

/** 一次最多接收多少个文件 */
export const MAX_DROP_FILES = 10
/** 单个文件大小上限（超过就跳过，避免整个聊天记录把内存吃满） */
export const MAX_DROP_FILE_BYTES = 2 * 1024 * 1024
/** 合并后的文本上限 */
export const MAX_DROP_TEXT = 200_000

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
  /** 实际读进来的文件数 */
  fileCount: number
  /** 被跳过的文件（类型不支持 / 太大 / 读取失败），用于给用户一句明确的提示 */
  skipped: string[]
}

/** 判断这次拖拽带的东西值不值得接（避免抢走页面内部的拖拽）。 */
export function isImportableDrag(data: DataTransfer | null): boolean {
  if (!data) return false
  const types = Array.from(data.types ?? [])
  return types.includes('Files') || types.includes('text/plain')
}

export async function readDroppedContent(data: DataTransfer | null): Promise<DropReadResult> {
  const empty: DropReadResult = { text: '', fileCount: 0, skipped: [] }
  if (!data) return empty

  // 1. 同步阶段：纯文本必须现在就取，await 之后 DataTransfer 就空了
  let plain = ''
  try {
    plain = data.getData('text/plain') ?? ''
  } catch {
    plain = ''
  }

  // 2. 同步阶段：把 File 列表也取出来（File 本身在异步阶段仍然可读）
  let files: File[] = []
  try {
    files = Array.from(data.files ?? [])
  } catch {
    files = []
  }

  const chunks: string[] = []
  const skipped: string[] = []
  if (plain.trim()) chunks.push(plain)

  for (const file of files.slice(0, MAX_DROP_FILES)) {
    if (file.size === 0) {
      skipped.push(`${file.name || '空文件'}（是个文件夹或是空文件）`)
      continue
    }
    const textLike = file.type.startsWith('text/') || TEXT_FILE.test(file.name)
    if (!textLike) {
      skipped.push(`${file.name}（不是文本文件）`)
      continue
    }
    if (file.size > MAX_DROP_FILE_BYTES) {
      skipped.push(`${file.name}（超过 2 MB）`)
      continue
    }
    try {
      const content = await file.text()
      const text = HTML_FILE.test(file.name) ? htmlFileToText(content) : content
      if (text.trim()) chunks.push(text)
    } catch {
      skipped.push(`${file.name}（读取失败）`)
    }
  }

  const text = chunks.join('\n\n').slice(0, MAX_DROP_TEXT).trim()
  return { text, fileCount: files.length, skipped }
}
