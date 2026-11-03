/**
 * 接收外部转发进来的内容（微信 / 钉钉「转发到其他应用」、命令行、协议链接）
 *
 * 现实前提：应用能否出现在微信的「转发到其他应用」列表里，由微信和 Windows 决定，
 * 我们控制不了。可控的是「被选中之后怎么办」——所以这里把入口做全：
 *   subscriber://share?text=...        协议链接（任何能打开链接的地方都能用）
 *   Subscriber.exe --share-text "..."  命令行传文本
 *   Subscriber.exe --share-file a.txt  命令行传文件（转发出来的聊天记录）
 * 解析结果统一成 { title, text } 队列，由渲染进程拉取后直接进批量导入。
 *
 * 独立成文件是为了能单测：desktop:verify 会直接 require 它跑几条断言。
 */
const fs = require('node:fs')
const path = require('node:path')

/** 单条内容上限：再长就不是「转发的几条消息」，而是整份聊天记录了。 */
const MAX_TEXT = 200_000
const MAX_FILE_BYTES = 2 * 1024 * 1024
const TEXT_FILE = /\.(txt|md|markdown|log|html?|json|csv)$/i

/** subscriber://share?text=xxx&title=xxx */
function decodeProtocolArg(raw) {
  if (!/^subscriber:\/\//i.test(raw)) return null
  try {
    const url = new URL(raw)
    const text = url.searchParams.get('text') ?? url.searchParams.get('content') ?? url.searchParams.get('url') ?? ''
    const title = url.searchParams.get('title') ?? url.searchParams.get('from') ?? ''
    if (!text.trim() && !title.trim()) return null
    return { title: title.slice(0, 120), text: text.slice(0, MAX_TEXT) }
  } catch {
    return null
  }
}

function readTextFile(target) {
  try {
    const stat = fs.statSync(target)
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return null
    if (!TEXT_FILE.test(target)) return null
    return fs.readFileSync(target, 'utf8').slice(0, MAX_TEXT)
  } catch {
    return null
  }
}

/**
 * 从启动参数里挑出转发内容。Electron 在 Windows 上会把协议链接和普通参数
 * 一起塞进 argv，所以这里逐项判断，遇到未知参数直接忽略。
 */
function parseShareArgs(argv) {
  const items = []
  if (!Array.isArray(argv)) return items
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (typeof arg !== 'string') continue

    const fromProtocol = decodeProtocolArg(arg)
    if (fromProtocol) {
      items.push(fromProtocol)
      continue
    }
    if (arg === '--share-text' && typeof argv[index + 1] === 'string') {
      index += 1
      const text = argv[index]
      if (text.trim()) items.push({ title: '', text: text.slice(0, MAX_TEXT) })
      continue
    }
    if (arg === '--share-file' && typeof argv[index + 1] === 'string') {
      index += 1
      const file = argv[index]
      const text = readTextFile(file)
      if (text) items.push({ title: path.basename(file), text })
    }
  }
  return items
}

module.exports = { parseShareArgs, decodeProtocolArg, readTextFile, MAX_TEXT }
