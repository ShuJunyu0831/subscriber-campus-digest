/**
 * 官网直采（P0 真实数据链路）
 *
 * 从竞赛官网抓取真实公告，交给分类引擎归一成 NewItemInput。
 * 这份代码同时在三个环境运行：
 *  - Node 构建期：`npm run collect` 生成 src/live/competitions.json 快照
 *  - Electron 主进程：ipcMain.handle('live:fetch') 实时抓取
 *  - 浏览器端：只消费快照（跨域限制，不做直连）
 *
 * 诚实边界：抓到的标题、链接、发布日期、正文摘句都是官网原文；
 * 摘要与截止时间是从正文文本机械提取的，提取不到就留空标「待核对」，绝不编造。
 */
import { inferCategory, parseDateText } from './classify'
import type { NewItemInput } from './data'

export interface LiveSource {
  id: string
  name: string
  /** 官网首页，作为 officialUrl 与「查看官网」入口。 */
  homepage: string
  /** 公告列表页。 */
  listUrl: string
  /** 列表页链接前缀（相对路径时补全用）。 */
  origin: string
  /** 列表条目链接的路径特征。 */
  linkPattern: RegExp
  /** 最多采几条，控制对官网的请求量。 */
  limit: number
  /** 详情页完整标题优先取这里的 meta（列表页标题常被截断）。 */
  titleMeta?: string
  /** 详情页正文摘要优先取这里的 meta。 */
  summaryMeta?: string
}

export const LIVE_SOURCES: LiveSource[] = [
  {
    // P1：先服务温州医科大学的学生。首页列表即教务通知流（info/1034 学业管理、info/1035 教学建设）。
    id: 'wmu',
    name: '温州医科大学教务处',
    homepage: 'https://jwc.wmu.edu.cn/',
    listUrl: 'https://jwc.wmu.edu.cn/',
    origin: 'https://jwc.wmu.edu.cn',
    linkPattern: /^info\/(?:1034|1035)\/\d+\.htm/,
    limit: 8,
    titleMeta: 'pageTitle',
    summaryMeta: 'description',
  },
  {
    // 学生处：通知公告列（info/1210），日期在标题前的 <dd>十月</dd><dd>28</dd> 块里
    id: 'wmu-xsc',
    name: '温州医科大学学生处',
    homepage: 'https://xsc.wmu.edu.cn/',
    listUrl: 'https://xsc.wmu.edu.cn/',
    origin: 'https://xsc.wmu.edu.cn',
    linkPattern: /^info\/1210\/\d+\.htm/,
    limit: 6,
    titleMeta: 'pageTitle',
    summaryMeta: 'description',
  },
  {
    id: 'mcm',
    name: '全国大学生数学建模竞赛官网',
    homepage: 'https://www.mcm.edu.cn/',
    listUrl: 'https://www.mcm.edu.cn/html_cn/block/20ead73cbcf5a1c24b91947f98d7aac2.html',
    origin: 'https://www.mcm.edu.cn',
    linkPattern: /\/html_cn\/node\/[0-9a-f]+\.html/,
    limit: 5,
  },
  {
    id: 'tiaozhanbei',
    name: '“挑战杯”中国大学生创业计划竞赛官网',
    homepage: 'https://www.tiaozhanbei.net/',
    listUrl: 'https://www.tiaozhanbei.net/tzb',
    origin: 'https://www.tiaozhanbei.net',
    linkPattern: /\/article\/\d+\//,
    limit: 5,
  },
]

export interface LiveFetchReport {
  fetchedAt: string
  items: NewItemInput[]
  /** 每个源的抓取结果，失败也要如实记录，界面能解释「为什么没有数据」。 */
  logs: { source: string; ok: boolean; count: number; message: string }[]
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) SubscriberPrototype/0.1'

async function fetchText(url: string, timeoutMs = 15_000): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9' },
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const buffer = await response.arrayBuffer()
    // 官网页面多为 utf-8；挑战杯个别页是 gbk，按 meta 粗判
    const head = new TextDecoder('utf-8', { fatal: false }).decode(buffer.slice(0, 1024))
    const decoder = /charset=["']?gb/i.test(head) ? new TextDecoder('gbk') : new TextDecoder('utf-8')
    return decoder.decode(buffer)
  } finally {
    clearTimeout(timer)
  }
}

function decodeEntities(input: string): string {
  return input
    .replace(/&nbsp;/g, ' ')
    .replace(/&emsp;/g, '　')
    .replace(/&ensp;/g, '　')
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”')
    .replace(/&lsquo;/g, '‘')
    .replace(/&rsquo;/g, '’')
    .replace(/&mdash;/g, '—')
    .replace(/&hellip;/g, '…')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x?[0-9a-f]+;/gi, ' ')
}

function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim()
}

/** 中文月份（十月 / 10月）→ 数字；用于学生处这类「月份在标题前」的列表。 */
function chineseMonth(raw: string): number | null {
  const digits: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
  const text = raw.replace(/\s|月/g, '')
  if (/^\d{1,2}$/.test(text)) return Number(text)
  if (text === '十一') return 11
  if (text === '十二') return 12
  return digits[text] ?? null
}

/** 标题前的日期块：<dd class="mm">十月</dd><dd class="dd">28</dd>（无年份，按当前年份推断）。 */
function parseLeadingDate(context: string): string | null {
  const match = context.match(
    /<dd[^>]*class=["'][^"']*\bmm\b[^"']*["'][^>]*>\s*([一二三四五六七八九十]{1,3}|\d{1,2})\s*月?\s*<\/dd>[\s\S]{0,120}?<dd[^>]*class=["'][^"']*\bdd\b[^"']*["'][^>]*>\s*(\d{1,2})\s*<\/dd>/i,
  )
  if (!match) return null
  const month = chineseMonth(match[1])
  const day = Number(match[2])
  if (!month || !day) return null
  const now = new Date()
  // 列表里出现「比当前月更靠后的月份」通常意味着跨年（12 月看到 1 月 → 去年）
  const year = month - (now.getMonth() + 1) > 1 ? now.getFullYear() - 1 : now.getFullYear()
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** 从列表页 HTML 里抽「链接 + 标题 + 列表日期」，按 linkPattern 过滤、去重、保序。
 * 温医大等门户的条目是 <li><a href>标题</a><span>2026-10-28</span></li>，列表日期比详情页更可靠；
 * 学生处则把日期放在标题前（<dd>十月</dd><dd>28</dd>），两种都支持。 */
export function extractListLinks(html: string, source: LiveSource): { url: string; title: string; listDate: string | null }[] {
  const results: { url: string; title: string; listDate: string | null }[] = []
  const seen = new Set<string>()
  const anchor = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]{0,200}?)<\/a>((?:(?!<a\b)[\s\S]){0,200})/gi
  let match: RegExpExecArray | null
  while ((match = anchor.exec(html)) && results.length < source.limit * 3) {
    const href = match[1]
    if (!source.linkPattern.test(href)) continue
    const title = stripTags(match[2])
    if (title.length < 8) continue
    // 同一块里的日期：<span>2026-10-28</span> 或 <p>11/02 </p><span>2026</span>
    const tail = match[3] ?? ''
    let listDate: string | null = null
    const iso = tail.match(/(\d{4}-\d{1,2}-\d{1,2})/)
    const slash = tail.match(/(\d{1,2})\/(\d{1,2})\s*<\/p>\s*<span>\s*(\d{4})/)
    if (iso) listDate = iso[1]
    else if (slash) listDate = `${slash[3]}-${slash[1]}-${slash[2]}`
    if (!listDate && match.index >= 0) {
      const before = html.slice(Math.max(0, match.index - 400), match.index)
      listDate = parseLeadingDate(before)
    }
    // 用标准 URL 解析补全链接：兼容 info/1034/x.htm、../info/1083/x.htm 与绝对地址
    let url: string
    try {
      url = new URL(href, source.listUrl).href
    } catch {
      continue
    }
    if (seen.has(url)) continue
    seen.add(url)
    results.push({ url, title, listDate })
    if (results.length >= source.limit) break
  }
  return results
}

/** 详情页 meta 里的干净字段（温医大：pageTitle / description）。 */
function extractMeta(html: string, name: string): string | null {
  const pattern = new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']{4,400})["']`, 'i')
  const match = html.match(pattern)
    ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']{4,400})["'][^>]+name=["']${name}["']`, 'i'))
  return match ? decodeEntities(match[1]).trim() : null
}

/** 详情页正文里的发布日期：mcm 是「2026-03-24 02:42」，挑战杯是「2026/05/28」。 */
function extractPublishedAt(html: string): string | null {
  const patterns = [
    /(?:发布时间|时间)[：:]\s*(\d{4}-\d{1,2}-\d{1,2})/,
    /(\d{4}-\d{1,2}-\d{1,2})\s+\d{1,2}:\d{2}/,
    /(\d{4}\/\d{1,2}\/\d{1,2})/,
  ]
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match) return match[1].replace(/\//g, '-')
  }
  return null
}

/** 从正文里找与「报名/截止/提交」相邻的日期句，作为截止时间候选。
 * 「X月X日以前/之前」是资格界限不是截止时间；日期等于发布日期的也不算（那多半是行文里的自指）。 */
function extractDeadline(text: string, publishedIso?: string | null): { raw: string; sentence: string } | null {
  const keywords = /截止|报名|提交|申报|答辩|预报名/
  const dateLike = /\d{1,2}\s*月\s*\d{1,2}\s*日|\d{4}-\d{1,2}-\d{1,2}|\d{4}\/\d{1,2}\/\d{1,2}/
  const sentences = text.split(/(?<=[。；;！!？?\n])/)
  for (const sentence of sentences) {
    if (!keywords.test(sentence)) continue
    const match = sentence.match(dateLike)
    if (!match || match.index === undefined) continue
    const start = match.index
    const after = sentence.slice(start + match[0].length, start + match[0].length + 6)
    if (/^\s*(以|之)?[前早]/.test(after)) continue
    if (publishedIso && normalizeDate(match[0]) === normalizeDate(publishedIso)) continue
    return { raw: match[0], sentence: sentence.trim().slice(0, 160) }
  }
  return null
}

/** 把「2026-10-16」「2026/10/16」「10月16日」统一成可比较的月-日数字串。 */
function normalizeDate(raw: string): string {
  const numbers = raw.match(/\d+/g) ?? []
  return numbers.slice(-3).map(n => String(Number(n))).join('-')
}

/** 把一条真实公告整理成引擎能吃的新条目；evidence 保留官网原句。
 * listDate 是列表页自带的发布日期（温医大等门户），比详情页里的日期更可靠。 */
export function buildLiveItem(
  source: LiveSource,
  url: string,
  listTitle: string,
  html: string,
  listDate?: string | null,
): NewItemInput {
  // 详情页 meta 里通常有完整标题（列表页标题常被截断成「…」）
  const metaTitle = source.titleMeta ? extractMeta(html, source.titleMeta) : null
  const title = metaTitle && metaTitle.length >= listTitle.length ? metaTitle : listTitle
  const metaSummary = source.summaryMeta ? extractMeta(html, source.summaryMeta) : null

  const fullText = stripTags(html)
  // 正文起点：跳过页头导航（首页/登录/主办单位…），从标题首次出现之后算起
  const titlePos = fullText.indexOf(title)
  const bodyText = titlePos >= 0 ? fullText.slice(titlePos + title.length).trim() : fullText
  const publishedIso = listDate ?? extractPublishedAt(html)
  const publishedTs = parseDateText(publishedIso ?? undefined)
  const deadlineHit = extractDeadline(bodyText, publishedIso)
  const deadlineTs = deadlineHit ? parseDateText(deadlineHit.raw) : null
  // 分类只看标题 + 摘要：整页正文里的「学院/活动/通知」会把行政通知误判成新闻
  const guess = inferCategory(`${title} ${(metaSummary ?? '').slice(0, 120)}`)

  // 摘要：优先 meta description，其次正文第一句有信息量的话（跳过「见附件」「点击」这类）
  const filler = /^(见附件|附件|点击|请|各|为|根据|关于|作者|时间|位置)/
  const summaryCandidate =
    (metaSummary && metaSummary.length >= 16 ? metaSummary.slice(0, 140) : null) ??
    bodyText
      .split(/(?<=[。！?；;])\s*/)
      .map(sentence => sentence.trim())
      .find(sentence => sentence.length >= 16 && sentence.length <= 120 && !filler.test(sentence) && !/前一篇|相关文章|首页/.test(sentence))

  return {
    title,
    category: guess.category,
    source: source.name,
    sourceType: '官网直采',
    summary: summaryCandidate ?? `来自${source.name}的公告，正文以官网页面为准。`,
    publishedAt: publishedIso ?? '日期待核对',
    publishedTs: publishedTs ? new Date(publishedTs).toISOString() : undefined,
    deadline: deadlineHit ? deadlineHit.raw : undefined,
    deadlineTs: deadlineTs ? new Date(deadlineTs).toISOString() : undefined,
    officialUrl: url,
    officialHome: source.homepage,
    evidence: deadlineHit ? deadlineHit.sentence : (metaSummary && metaSummary.length >= 20 ? metaSummary.slice(0, 140) : bodyText.slice(0, 140)),
    keyPoints: deadlineHit ? [`截止时间候选：${deadlineHit.raw}（请以官网原文为准）`] : [],
    tags: guess.matched.slice(0, 3),
    liveSourceId: source.id,
  }
}

/** 抓一个源：列表页 → 前 N 条详情页。单条失败不影响整批。 */
export async function collectSource(source: LiveSource): Promise<{ items: NewItemInput[]; message: string }> {
  const listHtml = await fetchText(source.listUrl)
  const links = extractListLinks(listHtml, source)
  if (links.length === 0) return { items: [], message: '列表页未解析出条目（页面结构可能变化）' }

  const items: NewItemInput[] = []
  const failures: string[] = []
  for (const link of links) {
    try {
      const html = await fetchText(link.url)
      items.push(buildLiveItem(source, link.url, link.title, html, link.listDate))
    } catch (error) {
      failures.push(`${link.title.slice(0, 20)}: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }
  const message = failures.length ? `成功 ${items.length} 条，失败 ${failures.length} 条（${failures[0]}）` : `成功 ${items.length} 条`
  return { items, message }
}

/** 抓全部源。逐源容错，日志如实返回。 */
export async function fetchLiveCompetitions(): Promise<LiveFetchReport> {
  const items: NewItemInput[] = []
  const logs: LiveFetchReport['logs'] = []
  for (const source of LIVE_SOURCES) {
    try {
      const { items: sourceItems, message } = await collectSource(source)
      items.push(...sourceItems)
      logs.push({ source: source.name, ok: sourceItems.length > 0, count: sourceItems.length, message })
    } catch (error) {
      logs.push({
        source: source.name,
        ok: false,
        count: 0,
        message: error instanceof Error ? error.message : '抓取失败',
      })
    }
  }
  return { fetchedAt: new Date().toISOString(), items, logs }
}

/* ------------------------------------------------------------------ *
 * 用户自选竞赛官网（通用识别）
 *
 * 内置源能写得精确，是因为逐个看过页面结构。用户随手贴一个官网地址时
 * 我们不可能为每个站点写规则，只能退一步做「启发式识别」：
 * 同域 + 带数字 id 的链接 + 标题不像导航词 → 当成公告候选。
 *
 * 诚实边界：识别不出来就说识别不出来，并建议改用 RSS，
 * 绝不拿首页导航当公告塞进信息库。
 * ------------------------------------------------------------------ */

const NAV_TITLES = /^(首页|主页|登录|注册|联系我们|关于我们|更多|查看更多|返回|上一页|下一页|下载|下载中心|网站地图|English|English Version|旧版入口|友情链接|设为首页|加入收藏)$/

/** 从任意列表页里挑出「像公告详情」的链接。 */
export function extractGenericLinks(
  html: string,
  listUrl: string,
  limit = 5,
): { url: string; title: string; listDate: string | null }[] {
  const base = new URL(listUrl)
  const results: { url: string; title: string; listDate: string | null }[] = []
  const seen = new Set<string>()
  const anchor = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]{0,240}?)<\/a>((?:(?!<a\b)[\s\S]){0,160})/gi
  let match: RegExpExecArray | null

  while ((match = anchor.exec(html)) && results.length < limit) {
    const href = match[1].trim()
    if (!href || /^(javascript:|#|mailto:|tel:)/i.test(href)) continue

    let url: URL
    try {
      url = new URL(href, listUrl)
    } catch {
      continue
    }
    if (url.origin !== base.origin) continue
    if (url.href.split('#')[0] === base.href.split('#')[0]) continue

    const title = stripTags(match[2])
    if (title.length < 10 || NAV_TITLES.test(title)) continue
    // 详情页一般带数字编号；纯栏目页（/news/）没有，正好挡掉
    if (!/\d{2,}/.test(url.pathname + url.search)) continue
    if (seen.has(url.href)) continue
    seen.add(url.href)

    const tail = match[3] ?? ''
    const iso = tail.match(/(\d{4}-\d{1,2}-\d{1,2})/)
    const slash = tail.match(/(\d{1,2})\/(\d{1,2})\s*<\/p>\s*<span>\s*(\d{4})/)
    let listDate: string | null = null
    if (iso) listDate = iso[1]
    else if (slash) listDate = `${slash[3]}-${slash[1]}-${slash[2]}`

    results.push({ url: url.href, title, listDate })
  }
  return results
}

export function makeCustomSource(name: string, listUrl: string): LiveSource {
  const base = new URL(listUrl)
  return {
    id: `custom:${base.host}`,
    name,
    homepage: base.origin,
    listUrl,
    origin: base.origin,
    // 通用识别走 extractGenericLinks，这里的 pattern 只用于类型完整性
    linkPattern: /./,
    limit: 5,
  }
}

export interface CustomSourceResult {
  ok: boolean
  message: string
  items: NewItemInput[]
}

/** 抓一个用户自己添加的官网：列表页 → 前几条详情页。 */
export async function fetchCustomSource(name: string, listUrl: string): Promise<CustomSourceResult> {
  const source = makeCustomSource(name || '自定义官网', listUrl)
  const listHtml = await fetchText(listUrl)
  const links = extractGenericLinks(listHtml, listUrl, source.limit)
  if (links.length === 0) {
    return {
      ok: false,
      message: '没有识别出公告列表：这家站点可能是前端渲染，或列表结构比较特殊，建议改用 RSS 地址',
      items: [],
    }
  }

  const items: NewItemInput[] = []
  const titles = new Set<string>()
  const failures: string[] = []
  for (const link of links) {
    try {
      const html = await fetchText(link.url)
      const item = buildLiveItem(source, link.url, link.title, html, link.listDate)
      if (titles.has(item.title)) continue
      titles.add(item.title)
      items.push(item)
    } catch (error) {
      failures.push(`${link.title.slice(0, 16)}: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }
  return {
    ok: items.length > 0,
    message: items.length > 0
      ? `抓取 ${items.length} 条${failures.length ? `，${failures.length} 条失败` : ''}`
      : `识别到 ${links.length} 个链接但都抓取失败（${failures[0] ?? '未知原因'}）`,
    items,
  }
}
