/**
 * 批量导入的文本拆分（纯净函数，不碰 DOM / 存储，方便直接单测与推理）
 *
 * 场景：用户在微信或钉钉里连续转发多段消息，粘贴进来是一大片文字。
 * 我们要把它拆成「一条来源 + 一段内容」的列表，让用户逐条确认后再落到本机。
 *
 * 诚实边界：拆分是**机械规则**，识别不准时由用户在预览里手动删改，
 * 不会悄悄合并或丢弃用户贴进来的文字。
 */

export type MessageChannel = 'wechat' | 'dingtalk' | 'miniprogram'

export const CHANNEL_LABELS: Record<MessageChannel, string> = {
  wechat: '微信',
  dingtalk: '钉钉',
  miniprogram: '小程序',
}

/** 来源名后缀：只在「整行就是一个名字」时才认，避免把正文里的词当群名。 */
const GROUP_SUFFIX = /(群|群聊|频道|公众号|小程序|团队|部门|班级|学院|学生会|协会|社团|组委会|研会|号)$/

export interface BatchEntry {
  groupName: string
  content: string
}

const clean = (line: string) => line.replace(/[ \t\u3000]+/g, ' ').trim()

interface Header {
  name: string
  rest: string
}

/** 判断某一行是不是「来源名」行；是则返回来源名与同一行剩余内容。 */
export function readHeader(line: string): Header | null {
  const text = clean(line)
  if (!text) return null

  // 【群名】 / [群名]，整行只有括号内容（后面可跟冒号）
  const bracket = text.match(/^[【\[]([^】\]]{1,24})[】\]]\s*[：:]?\s*(.*)$/)
  if (bracket) {
    const rest = bracket[2].trim()
    // 【竞赛通知】后面直接跟正文的是「标签」，不是来源名
    if (!rest || /[：:]$/.test(text)) return { name: bracket[1].trim(), rest }
    return null
  }

  // 群名：内容（同一行内）
  const inline = text.match(/^([^：:]{1,20}(?:群|群聊|频道|公众号|小程序|团队|部门|班级|学院|学生会|协会|社团|组委会|研会|号))[：:]\s*(.+)$/)
  if (inline) return { name: inline[1].trim(), rest: inline[2].trim() }

  // 群名：（换行后才是内容）
  const colonOnly = text.match(/^([^：:]{1,24})[：:]\s*$/)
  if (colonOnly) return { name: colonOnly[1].trim(), rest: '' }

  // 单独一行、以「群/频道/公众号…」结尾，且不含句末标点
  if (text.length <= 20 && GROUP_SUFFIX.test(text) && !/[。！？!?，,；;]/.test(text)) {
    return { name: text, rest: '' }
  }

  return null
}

function finalize(name: string, lines: string[], defaultName: string): BatchEntry {
  const content = lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return { groupName: (name || defaultName).slice(0, 80), content }
}

/**
 * 把一整段粘贴文本拆成多条。
 *
 * 规则（按优先级）：
 * 1. 遇到「来源名」行就另起一条（已有内容的条目才算结束，避免正文里的短行被误判）
 * 2. 全文一个来源名都没识别到时，退回按空行拆分，保证不会把几十条消息并成一条
 * 3. 少于 6 个字的碎片直接丢弃（多半是「收到」「好的」这类无信息量消息）
 */
export function parseBatchText(raw: string, defaultName = '未命名来源'): BatchEntry[] {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n')
  const entries: { name: string; lines: string[] }[] = []
  let current: { name: string; lines: string[] } | null = null
  let headed = 0

  for (const line of lines) {
    const header = readHeader(line)
    if (header && current && current.lines.some(item => item.trim())) {
      entries.push(current)
      current = { name: header.name, lines: header.rest ? [header.rest] : [] }
      headed += 1
      continue
    }
    if (header && !current) {
      current = { name: header.name, lines: header.rest ? [header.rest] : [] }
      headed += 1
      continue
    }
    if (!current) current = { name: '', lines: [] }
    current.lines.push(line)
  }
  if (current) entries.push(current)

  // 一个来源名都没识别到：按空行切，别把整段当一条
  let result: BatchEntry[]
  const blocks = headed === 0
    ? raw.replace(/\r\n?/g, '\n').split(/\n\s*\n+/).map(block => block.trim()).filter(Boolean)
    : []
  if (blocks.length > 1) {
    result = blocks.map(block => finalize('', block.split('\n'), defaultName))
  } else {
    result = entries.map(entry => finalize(entry.name, entry.lines, defaultName))
  }
  result = result.filter(entry => entry.content.length >= 6)

  // 都用了默认名时补序号，否则列表里会出现一堆同名条目
  let unnamed = 0
  return result.map(entry => {
    if (entry.groupName !== defaultName) return entry
    unnamed += 1
    return { ...entry, groupName: result.length > 1 ? `${defaultName} ${unnamed}` : defaultName }
  })
}
