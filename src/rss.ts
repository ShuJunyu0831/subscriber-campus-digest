/**
 * RSS / Atom 真实订阅源（P1 续）
 *
 * 微信公众号没有面向第三方应用的读取接口，所以这里不假装能「接入微信」：
 * 用户自己提供已获授权的 RSS 地址（自建 RSSHub、WeRSS 等），我们负责真实抓取、解析、归类与入库。
 *
 * 同一份代码跑在三个环境：
 *  - 浏览器：直接 fetch（订阅源需要允许跨域，否则给出明确提示，引导用桌面版）
 *  - Electron 主进程：Node fetch，无跨域限制（打包进 electron/live/collector.cjs）
 *  - 采集脚本：可选，用于把订阅源内容做成快照
 */
import { inferCategory } from './classify'
import type { NewItemInput } from './data'
import type { AccountArticle } from './accounts'

export interface FeedItem {
  title: string
  link: string
  summary: string
  /** 正文段落（RSS 的 content:encoded / Atom 的 content），用于全文阅读。 */
  paragraphs: string[]
  publishedIso?: string
}

export interface ParsedFeed {
  title?: string
  items: FeedItem[]
}

export interface RssSubscription {
  id: string
  name: string
  url: string
  addedAt: string
}

const STORAGE_KEY = 'subscriber-rss-subscriptions'

/* --------------------------------- 存储 --------------------------------- */

export function readSubscriptions(): RssSubscription[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is RssSubscription => Boolean(item && typeof item === 'object'
      && typeof (item as RssSubscription).url === 'string'
      && typeof (item as RssSubscription).name === 'string'))
  } catch {
    return []
  }
}

export function saveSubscriptions(subscriptions: RssSubscription[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(subscriptions))
}

export function createSubscription(name: string, url: string): RssSubscription {
  return {
    id: `rss-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim(),
    url: url.trim(),
    addedAt: new Date().toISOString(),
  }
}

/* --------------------------------- 解析 --------------------------------- */

function unwrapCdata(raw: string): string {
  const cdata = raw.match(/<!\[CDATA\[([\s\S]*?)\]\]>/)
  return cdata ? cdata[1] : raw
}

export function decodeEntities(input: string): string {
  return input
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&hellip;/g, '…')
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”')
    .replace(/&lsquo;/g, '‘')
    .replace(/&rsquo;/g, '’')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

/** 去掉标签但保留段落边界，供全文阅读使用。 */
export function htmlToParagraphs(html: string): string[] {
  const normalized = unwrapCdata(html)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  return normalized
    .split(/<\/p>|<br\s*\/?>|<\/div>|\n{2,}/i)
    .map(chunk => decodeEntities(chunk.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim())
    .filter(chunk => chunk.length >= 8)
}

function plainText(html: string): string {
  return htmlToParagraphs(html).join(' ').trim()
}

/** 标题等短文本：只去标签与实体，不做「段落至少 8 字」的过滤。 */
export function bareText(html: string): string {
  return decodeEntities(unwrapCdata(html).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function pick(block: string, tags: string[]): string | undefined {
  for (const tag of tags) {
    const match = block.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i'))
    if (match) return unwrapCdata(match[1])
  }
  return undefined
}

function toIso(value: string | undefined): string | undefined {
  if (!value) return undefined
  const timestamp = Date.parse(value.trim())
  return Number.isNaN(timestamp) ? undefined : new Date(timestamp).toISOString()
}

/** 解析 RSS 2.0 / Atom；解析不出来就返回空数组，由调用方给出可读错误。 */
export function parseFeedXml(xml: string, baseUrl?: string): ParsedFeed {
  const feedTitle = parseFeedTitle(xml)
  const blocks = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map(match => match[0])
  const entries = blocks.length > 0 ? blocks : [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map(match => match[0])
  const items: FeedItem[] = []

  for (const block of entries) {
    const rawTitle = pick(block, ['title'])
    const title = bareText(rawTitle ?? '')
    if (!title) continue

    // Atom 的地址在 <link href="...">，RSS 在 <link>...</link>。
    // Atom 可能同时有 alternate / self 多个链接，优先取 rel="alternate"。
    const atomLinks = [...block.matchAll(/<link\b[^>]*>/gi)].map(match => match[0])
    const preferredAtom = atomLinks.find(tag => /rel=["']alternate["']/i.test(tag))
      ?? atomLinks.find(tag => !/rel=["']self["']/i.test(tag))
    const hrefAttr = preferredAtom?.match(/href=["']([^"']+)["']/i)?.[1]
    const hrefText = pick(block, ['link'])
    const rawLink = decodeEntities((hrefText && hrefText.trim()) || hrefAttr || '')
    let link = ''
    if (rawLink) {
      try {
        link = new URL(rawLink.trim(), baseUrl).href
      } catch {
        link = baseUrl ?? ''
      }
    }

    const description = pick(block, ['description', 'summary'])
    const content = pick(block, ['content:encoded', 'content'])
    const paragraphs = htmlToParagraphs(content ?? description ?? '')
    const summary = (paragraphs[0] ?? plainText(description ?? '')).slice(0, 160)
    const publishedIso = toIso(pick(block, ['pubDate', 'published', 'updated', 'dc:date']))

    items.push({ title: title.slice(0, 120), link, summary, paragraphs: paragraphs.slice(0, 12), publishedIso })
  }

  return { title: feedTitle, items }
}

function parseFeedTitle(xml: string): string | undefined {
  const channel = xml.match(/<channel\b[\s\S]*?<title\b[^>]*>([\s\S]*?)<\/title>/i)
    ?? xml.match(/<feed\b[^>]*>[\s\S]*?<title\b[^>]*>([\s\S]*?)<\/title>/i)
  if (!channel) return undefined
  const title = bareText(channel[1])
  return title ? title.slice(0, 60) : undefined
}

/* --------------------------------- 抓取 --------------------------------- */

export async function fetchFeed(url: string, timeoutMs = 12_000): Promise<ParsedFeed> {
  const target = url.trim()
  if (!/^https?:\/\//i.test(target)) throw new Error('请填写以 http:// 或 https:// 开头的 RSS 地址')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(target, {
      signal: controller.signal,
      headers: {
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) SubscriberPrototype/0.1',
      },
    })
    if (!response.ok) throw new Error(`订阅源返回 HTTP ${response.status}`)
    const buffer = await response.arrayBuffer()
    const head = new TextDecoder('utf-8', { fatal: false }).decode(buffer.slice(0, 2048))
    const decoder = /encoding=["']?gb/i.test(head) ? new TextDecoder('gbk') : new TextDecoder('utf-8')
    const xml = decoder.decode(buffer)
    const parsed = parseFeedXml(xml, target)
    if (parsed.items.length === 0) throw new Error('没有解析到条目，请确认这是 RSS / Atom 地址')
    return parsed
  } catch (error) {
    if (controller.signal.aborted) throw new Error('请求超时（12 秒），请检查地址或网络')
    if (error instanceof TypeError) {
      throw new Error('浏览器拦截了跨域请求（CORS）：请改用桌面版抓取，或换一个允许跨域的订阅源')
    }
    throw error instanceof Error ? error : new Error(String(error))
  } finally {
    clearTimeout(timer)
  }
}

/* --------------------------------- 映射 --------------------------------- */

/** 订阅源条目 → 公众号文章，复用账号分组、去重与入库能力。 */
export function feedItemToArticle(subscription: RssSubscription, item: FeedItem, index: number): AccountArticle {
  const guess = inferCategory(`${item.title} ${item.summary}`)
  const paragraphs = item.paragraphs.length > 0 ? item.paragraphs : item.summary ? [item.summary] : []
  return {
    id: `${subscription.id}-${item.link || index}`,
    accountId: `rss:${subscription.id}`,
    title: item.title,
    digest: item.summary || '订阅源未提供摘要，点击阅读全文。',
    publishedAt: item.publishedIso ?? new Date().toISOString(),
    category: guess.category,
    keywords: guess.matched.length > 0 ? guess.matched.slice(0, 3) : ['订阅源'],
    readMinutes: Math.max(1, Math.round(paragraphs.join(' ').length / 400)),
    officialUrl: item.link || subscription.url,
    fullText: paragraphs.length > 0 ? paragraphs : undefined,
    fullTextOrigin: 'rss',
    sourceName: subscription.name,
  }
}

/** 订阅源条目 → 信息库新条目（沿用官网直采的诚实字段：摘要来自原文，不编造截止时间）。 */
export function feedItemToInput(subscription: RssSubscription, item: FeedItem): NewItemInput {
  const guess = inferCategory(`${item.title} ${item.summary}`)
  return {
    title: item.title,
    category: guess.category,
    source: `${subscription.name} · RSS 订阅`,
    sourceType: '公众号订阅',
    summary: item.summary || '订阅源未提供摘要，请打开原文查看。',
    publishedAt: item.publishedIso
      ? new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(item.publishedIso))
      : '日期待核对',
    publishedTs: item.publishedIso,
    officialUrl: item.link || subscription.url,
    evidence: item.summary || '订阅源未提供正文摘要。',
    keyPoints: [],
    tags: guess.matched.length > 0 ? guess.matched.slice(0, 3) : ['RSS 订阅'],
  }
}
