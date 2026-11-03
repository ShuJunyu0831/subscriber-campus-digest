/**
 * 订阅微信公众号（文章链接订阅）
 *
 * 现实前提：微信没有面向第三方应用的「读取某个公众号全部历史文章」接口，
 * 也没有可供第三方搜索/订阅账号的开放能力。所以这里不做「一键关注账号」这种假功能，
 * 而是走一条真实可行、且完全由用户主导的路：
 *
 *   你粘贴一篇公众号文章链接 → 我们抓这一页 → 识别出属于哪个公众号 + 拿到标题正文 →
 *   把这个公众号建成一个订阅项，文章归到它下面
 *
 * 之后的更新有两种方式（都在界面上说清楚）：
 *   1. 继续粘贴同一公众号的新文章链接（手动，但一定能用）
 *   2. 改用 RSS 地址（自建 RSSHub / WeRSS 等），由订阅源自动更新
 *
 * 诚实边界：只抓用户给出的那一个 URL，不遍历、不猜测其他文章；
 * 解析不到正文时保留标题与链接，标注「只拿到标题」，绝不编造内容。
 */
import { htmlToParagraphs, bareText, decodeEntities } from './rss'
import { inferCategory } from './classify'
import type { AccountArticle } from './accounts'

export interface ParsedWechatArticle {
  /** 同一公众号的稳定标识：biz > gh_ 号 > 名称散列 */
  accountKey: string
  accountName: string
  accountHandle?: string
  title: string
  digest: string
  paragraphs: string[]
  publishedTs?: string
  url: string
}

export interface WechatArticleRecord extends ParsedWechatArticle {
  addedAt: number
}

export interface WechatAccountSub {
  id: string
  name: string
  handle?: string
  addedAt: number
  lastFetchedAt?: number
  articles: WechatArticleRecord[]
}

const STORAGE_KEY = 'subscriber-wechat-account-subs'

export function isWechatArticleUrl(url: string): boolean {
  return /^https?:\/\/mp\.weixin\.qq\.com\/s(\/|\?|$)/i.test(url.trim())
}

/* ------------------------------ 解析 ------------------------------ */

/** 从内联 JS 变量取值：`var nickname = "xxx";`；兼容单引号与 \xNN 转义。 */
function readJsVar(html: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const patterns = [
    new RegExp(`var\\s+${escaped}\\s*=\\s*"([^"]*)"`),
    new RegExp(`var\\s+${escaped}\\s*=\\s*'([^']*)'`),
    new RegExp(`["']?${escaped}["']?\\s*[:=]\\s*"([^"]*)"`),
  ]
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match) return decodeJsString(match[1]).trim()
  }
  return ''
}

function decodeJsString(value: string): string {
  return value
    .replace(/\\x([0-9a-f]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\u([0-9a-f]{4})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\\//g, '/')
}

function metaContent(html: string, property: string): string {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']{1,400})["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']{1,400})["'][^>]+property=["']${property}["']`, 'i'),
    new RegExp(`<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']{1,400})["']`, 'i'),
  ]
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match) return decodeEntities(match[1]).trim()
  }
  return ''
}

/** 按 id 取一段元素的纯文本（js_name / activity-name 这类）。 */
function textById(html: string, id: string): string {
  const match = html.match(new RegExp(`id=["']${id}["'][^>]*>([\\s\\S]{0,400}?)<`, 'i'))
  return match ? bareText(match[1]) : ''
}

/** 正文区域：从 js_content 开始，截到二维码 / 评论区之前，避免把页脚导航当成正文。 */
function bodyRegion(html: string): string {
  const startMatch = html.match(/id=["']js_content["'][^>]*>/i)
  if (!startMatch || startMatch.index === undefined) return ''
  const start = startMatch.index + startMatch[0].length
  const tails = [
    html.indexOf('id="js_pc_qr_code"', start),
    html.indexOf('class="rich_media_tool"', start),
    html.indexOf('id="js_cmt_area"', start),
    html.indexOf('class="qr_code_pc"', start),
    html.indexOf('id="js_article_comment"', start),
  ].filter(index => index > start)
  const end = tails.length > 0 ? Math.min(...tails) : Math.min(html.length, start + 60_000)
  return html.slice(start, end)
}

function hashKey(input: string): string {
  let hash = 0
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) % 0xffffffff
  }
  return `wx-${hash.toString(36)}`
}

/** 解析一篇公众号文章页。解析不出标题就返回 null（宁可不加，也不塞一条空条目）。 */
export function parseWechatArticle(html: string, url: string): ParsedWechatArticle | null {
  const title = metaContent(html, 'og:title') || textById(html, 'activity-name') || bareText(html.match(/<title[^>]*>([\s\S]{0,200}?)<\/title>/i)?.[1] ?? '')
  if (!title) return null

  const accountName = readJsVar(html, 'nickname') || textById(html, 'js_name') || metaContent(html, 'og:site_name')
  const handle = readJsVar(html, 'user_name')
  let safeUrl: URL | null = null
  try {
    safeUrl = new URL(url)
  } catch {
    safeUrl = null
  }
  const biz = readJsVar(html, 'biz') || readJsVar(html, '__biz') || safeUrl?.searchParams.get('__biz') || ''
  const ct = readJsVar(html, 'ct') || readJsVar(html, 'create_time')

  const body = bodyRegion(html)
  // 公众号正文大量使用 <section> 包裹段落，先转成段落边界再抽文字
  const paragraphs = body ? htmlToParagraphs(body.replace(/<\/section>/gi, '</p>')) : []
  const description = metaContent(html, 'og:description')
  const digest = description
    || paragraphs.find(paragraph => paragraph.length >= 16)?.slice(0, 140)
    || '公众号页没有提供摘要，点开原文查看正文。'

  const publishedTs = /^\d{10}$/.test(ct) ? new Date(Number(ct) * 1000).toISOString() : undefined

  return {
    accountKey: biz || handle || hashKey(accountName || safeUrl?.host || url),
    accountName: accountName || '未识别公众号',
    accountHandle: handle || undefined,
    title,
    digest,
    paragraphs,
    publishedTs,
    url,
  }
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) SubscriberPrototype/0.1'

export async function fetchWechatArticle(url: string, timeoutMs = 15_000): Promise<ParsedWechatArticle> {
  const target = url.trim()
  if (!isWechatArticleUrl(target)) throw new Error('请填写 mp.weixin.qq.com 的公众号文章链接')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(target, {
      signal: controller.signal,
      headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9', Accept: 'text/html,application/xhtml+xml' },
    })
    if (!response.ok) throw new Error(`文章页返回 HTTP ${response.status}`)
    const html = await response.text()
    const parsed = parseWechatArticle(html, target)
    if (!parsed) throw new Error('这个页面没解析出公众号文章（可能被拦截、需要验证，或链接已失效）')
    return parsed
  } catch (error) {
    if (controller.signal.aborted) throw new Error('请求超时（15 秒），请检查网络或稍后再试')
    if (error instanceof TypeError) {
      throw new Error('浏览器拦截了跨域请求：公众号文章请在桌面版里订阅，桌面版由主进程直接抓取')
    }
    throw error instanceof Error ? error : new Error(String(error))
  } finally {
    clearTimeout(timer)
  }
}

/* ------------------------------ 存储 ------------------------------ */

export function readWechatSubs(): WechatAccountSub[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is WechatAccountSub => Boolean(item && typeof item === 'object'
      && typeof (item as WechatAccountSub).id === 'string'
      && Array.isArray((item as WechatAccountSub).articles)))
  } catch {
    return []
  }
}

export function saveWechatSubs(list: WechatAccountSub[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // 隐私模式或配额用尽时静默失败，调用方会看到订阅没有增加
  }
}

/** 把一篇解析结果并入订阅列表：已有账号就追加文章，没有就新建账号。 */
export function mergeWechatArticle(
  list: WechatAccountSub[],
  parsed: ParsedWechatArticle,
  addedAt = Date.now(),
): { list: WechatAccountSub[]; account: WechatAccountSub; duplicated: boolean } {
  const record: WechatArticleRecord = { ...parsed, addedAt }
  const index = list.findIndex(sub => sub.id === parsed.accountKey)
  if (index === -1) {
    const account: WechatAccountSub = {
      id: parsed.accountKey,
      name: parsed.accountName,
      handle: parsed.accountHandle,
      addedAt,
      lastFetchedAt: addedAt,
      articles: [record],
    }
    return { list: [...list, account], account, duplicated: false }
  }
  const existing = list[index]
  const duplicated = existing.articles.some(item => item.url === parsed.url)
  const articles = duplicated
    ? existing.articles
    : [...existing.articles, record].slice(-30)
  const account: WechatAccountSub = {
    ...existing,
    name: existing.name === '未识别公众号' && parsed.accountName !== '未识别公众号' ? parsed.accountName : existing.name,
    handle: existing.handle ?? parsed.accountHandle,
    lastFetchedAt: addedAt,
    articles,
  }
  const next = [...list]
  next[index] = account
  return { list: next, account, duplicated }
}

export function removeWechatArticle(list: WechatAccountSub[], accountId: string, url: string): WechatAccountSub[] {
  return list
    .map(sub => sub.id === accountId ? { ...sub, articles: sub.articles.filter(item => item.url !== url) } : sub)
    .filter(sub => sub.articles.length > 0)
}

export function removeWechatAccount(list: WechatAccountSub[], accountId: string): WechatAccountSub[] {
  return list.filter(sub => sub.id !== accountId)
}

/* ------------------------------ 转成文章条目 ------------------------------ */

/** 订阅项里的文章 → 供订阅页渲染与入库的 AccountArticle。
 * 极少数页面没有 ct（发布时间），此时退回抓取时间，只是排序用，不代表真实发布时间。 */
export function wechatRecordToArticle(sub: WechatAccountSub, record: WechatArticleRecord, index: number): AccountArticle {
  const guess = inferCategory(`${record.title} ${record.digest}`)
  return {
    id: `wx:${sub.id}:${index}:${record.url}`,
    accountId: `wx:${sub.id}`,
    title: record.title,
    digest: record.digest,
    publishedAt: record.publishedTs ?? new Date(record.addedAt).toISOString(),
    category: guess.category,
    keywords: guess.matched.length > 0 ? guess.matched.slice(0, 3) : ['公众号'],
    readMinutes: Math.max(1, Math.round(record.paragraphs.join(' ').length / 400)),
    officialUrl: record.url,
    fullText: record.paragraphs.length > 0 ? record.paragraphs : undefined,
    fullTextOrigin: 'wechat',
    sourceName: sub.name,
  }
}
