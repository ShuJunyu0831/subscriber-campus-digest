/**
 * 信息分类引擎
 *
 * 目标：同一件事可能被多次发布、被不同来源转述、也可能在几天后被“延期/更正”通知推翻。
 * 这一层把原始条目整理成「一个事件一份最新结论」，并把过程留痕，方便核对：
 *
 *  1. 规范化：全角转半角、去标点、去版本差异词（关于/通知/延期……），得到事件指纹。
 *  2. 聚类：同一 eventKey 或标题字符二元组相似度 ≥ 阈值 → 视为同一事件。
 *  3. 版本：同一事件按发布时间升序，出现「延期/更正/补充」等变更词或截止时间变化 → 版本 +1；
 *          没有实质变化但标题高度相似 → 判为重复来源并自动合并。
 *  4. 分类：关键词加权打分给出内容类型与置信度，保留命中的词作为依据。
 *  5. 时效：按截止时间标记 有效 / 3 天内截止 / 已截止 / 待核对。
 *
 * 纯函数实现，不依赖网络与存储，便于单测与在桌面端离线运行。
 */
import type { Category, InfoItem } from './data'

export type ItemStatus = 'active' | 'expiring' | 'expired' | 'unconfirmed'

export const SAME_EVENT_THRESHOLD = 0.74
export const DUPLICATE_THRESHOLD = 0.92
const DAY = 86_400_000

/** 版本差异词：出现在标题里通常意味着“这是一次更新”，比对事件指纹时应剔除。 */
const VERSION_WORDS = /(关于|有关|通知|公告|补充|更正|修正|延期|推迟|延长|调整|变更|取消|恢复|重新|再次|最新|紧急|重要|启动|开始|的)/g
/**
 * 不含日期语义的变更词。
 * 「延期/延长」必须伴随截止时间变化才算新版本，否则只是同一版本的转述——
 * 这条规则挡掉了聚合号把「延长至11月10日」再转发一次就多出一个版本的情况。
 */
const CONTENT_CHANGE_WORDS = /更正|修正|补充|变更|调整|取消|恢复|重新/
const PUNCTUATION = /[“”‘’"'`【】[\]（）()《》〈〉·、，,。.；;：:！!？?…—\-_/\\|~]/g

/** 全角字母数字与半角对齐，避免「２０２６」与「2026」被当成两个事件。 */
function toHalfWidth(input: string): string {
  return input.replace(/[\uff01-\uff5e]/g, char => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
}

export function normalizeTitle(input: string): string {
  return toHalfWidth(input)
    .replace(PUNCTUATION, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** 事件指纹：去掉标点与「关于/通知/延期」这类版本差异词后的紧凑字符串。 */
export function entityKey(input: string): string {
  return normalizeTitle(input)
    .replace(VERSION_WORDS, ' ')
    .replace(/\s+/g, '')
}

function bigrams(input: string): Set<string> {
  const text = input.replace(/\s/g, '')
  const result = new Set<string>()
  if (text.length < 2) {
    if (text) result.add(text)
    return result
  }
  for (let index = 0; index < text.length - 1; index += 1) result.add(text.slice(index, index + 2))
  return result
}

/** Dice 系数，0—1。对中文短标题比编辑距离更稳，也不会因为多两个字就断崖式下降。 */
export function similarity(a: string, b: string): number {
  const left = bigrams(entityKey(a))
  const right = bigrams(entityKey(b))
  if (left.size === 0 || right.size === 0) return 0
  let shared = 0
  for (const gram of left) if (right.has(gram)) shared += 1
  return (2 * shared) / (left.size + right.size)
}

/* ---------------------------------- 分类打分 --------------------------------- */

const CATEGORY_RULES: Record<Category, [string, number][]> = {
  竞赛: [
    ['竞赛', 4], ['比赛', 4], ['大赛', 4], ['赛事', 3], ['挑战杯', 4], ['数学建模', 4],
    ['报名', 2], ['参赛', 3], ['选拔', 3], ['组队', 2], ['初赛', 3], ['决赛', 3],
    ['作品征集', 3], ['路演', 2], ['答辩', 2], ['获奖', 2], ['评审', 2], ['申报', 1],
  ],
  课程通知: [
    ['课程', 4], ['调课', 4], ['停课', 4], ['补课', 4], ['上课', 3], ['教室', 3],
    ['教学', 3], ['考试', 3], ['考场', 3], ['作业', 3], ['实验', 3], ['学分', 3],
    ['选课', 3], ['期中', 3], ['期末', 3], ['讲座', 2], ['培训', 2], ['班会', 3],
  ],
  新闻: [
    ['新闻', 3], ['动态', 3], ['报道', 3], ['回顾', 3], ['发布', 2], ['举行', 2],
    ['召开', 2], ['活动', 2], ['通知', 1], ['公告', 1], ['学院', 1], ['校园', 1],
  ],
}

export interface CategoryGuess {
  category: Category
  confidence: number
  matched: string[]
  scores: Record<Category, number>
}

/** 关键词加权投票；返回置信度与命中依据，方便界面解释「为什么这么分类」。 */
export function inferCategory(text: string): CategoryGuess {
  const haystack = normalizeTitle(text)
  const scores: Record<Category, number> = { 竞赛: 0, 新闻: 0, 课程通知: 0 }
  const hits: Record<Category, string[]> = { 竞赛: [], 新闻: [], 课程通知: [] }

  for (const category of Object.keys(CATEGORY_RULES) as Category[]) {
    for (const [keyword, weight] of CATEGORY_RULES[category]) {
      const occurrences = haystack.split(keyword).length - 1
      if (occurrences === 0) continue
      scores[category] += weight * Math.min(occurrences, 2)
      hits[category].push(keyword)
    }
  }

  // 完全没有任何信号时落到新闻，但置信度会很低，界面据此提示“待人工确认”。
  const ranked = (Object.keys(scores) as Category[]).sort((a, b) => scores[b] - scores[a])
  const total = ranked.reduce((sum, key) => sum + scores[key], 0)
  if (total === 0) {
    return { category: '新闻', confidence: 34, matched: [], scores }
  }
  const top = ranked[0]
  return {
    category: top,
    confidence: Math.round(Math.min(0.98, scores[top] / total) * 100),
    matched: hits[top].slice(0, 4),
    scores,
  }
}

/* ---------------------------------- 时间解析 --------------------------------- */

const FULL_DATE = /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日(?:\s*(\d{1,2})[:：](\d{2}))?/
const SHORT_DATE = /(\d{1,2})\s*月\s*(\d{1,2})\s*日(?:\s*(\d{1,2})[:：](\d{2}))?/
const SLASH_DATE = /(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s](\d{1,2}):(\d{2}))?/

function buildTimestamp(year: number, month: number, day: number, hour = 23, minute = 59): number | null {
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  const date = new Date(year, month - 1, day, hour, minute, 0, 0)
  // Date 会把 2 月 30 日滚到 3 月，必须回读校验，不能把非法日期当成有效截止。
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day
    || date.getHours() !== hour || date.getMinutes() !== minute) return null
  return date.getTime()
}

/**
 * 解析中文日期文本。没有年份时按“不早于当前月”推断：
 * 例如 1 月看到「12月20日」，说明是今年 12 月；12 月看到「1月5日」，说明是明年。
 */
export function parseDateText(raw: string | undefined, now = new Date()): number | null {
  if (!raw) return null
  const text = toHalfWidth(raw)
  const full = text.match(FULL_DATE)
  if (full) {
    return buildTimestamp(Number(full[1]), Number(full[2]), Number(full[3]), Number(full[4] ?? 23), Number(full[5] ?? 59))
  }
  const slash = text.match(SLASH_DATE)
  if (slash) {
    return buildTimestamp(Number(slash[1]), Number(slash[2]), Number(slash[3]), Number(slash[4] ?? 23), Number(slash[5] ?? 59))
  }
  const short = text.match(SHORT_DATE)
  if (short) {
    const month = Number(short[1])
    const day = Number(short[2])
    let year = now.getFullYear()
    // 差距超过半年视为跨年（12 月看到 1 月 → 明年；1 月看到 12 月 → 去年）
    if (month - (now.getMonth() + 1) > 6) year -= 1
    if (month - (now.getMonth() + 1) < -6) year += 1
    return buildTimestamp(year, month, day, Number(short[3] ?? 23), Number(short[4] ?? 59))
  }
  return null
}

function publishedTimestamp(item: InfoItem, now: Date): number {
  if (item.publishedTs) {
    const parsed = Date.parse(item.publishedTs)
    if (!Number.isNaN(parsed)) return parsed
  }
  const text = toHalfWidth(item.publishedAt || '')
  const time = text.match(/(\d{1,2})[:：](\d{2})/)
  if (/今天|刚刚/.test(text)) {
    const date = new Date(now)
    date.setHours(time ? Number(time[1]) : 9, time ? Number(time[2]) : 0, 0, 0)
    return date.getTime()
  }
  if (/昨天/.test(text)) {
    const date = new Date(now)
    date.setDate(date.getDate() - 1)
    date.setHours(time ? Number(time[1]) : 9, time ? Number(time[2]) : 0, 0, 0)
    return date.getTime()
  }
  // 发布时间未知时不能伪装成「刚刚」，否则旧公告会排到最新。
  return parseDateText(text, now) ?? 0
}

/* ---------------------------------- 版本与去重 --------------------------------- */

export interface VersionEntry {
  id: number
  version: number
  title: string
  source: string
  sources: string[]
  publishedAt: string
  publishedTs: number
  deadline?: string
  deadlineTs: number | null
  changeNote: string
  duplicateCount: number
}

export interface Classification {
  key: string
  /** 展示用的最新版本（或合并后字段最全的一条）。 */
  item: InfoItem
  /** 该事件所有版本；长度 > 1 表示发生过更新。 */
  versions: VersionEntry[]
  version: number
  duplicateCount: number
  status: ItemStatus
  confidence: number
  matched: string[]
  topics: string[]
  /** 原始数组中的首次出现位置，用来保持列表顺序稳定。 */
  order: number
  /** 归入同一事件的所有原始条目 id，用户操作要同步到整组。 */
  memberIds: number[]
}

export interface LibraryClassification {
  entries: Classification[]
  visible: Classification[]
  byId: Map<number, Classification>
  stats: {
    raw: number
    unique: number
    merged: number
    versionGroups: number
    expired: number
    expiring: number
    unconfirmed: number
  }
}

function deadlineTimestamp(item: InfoItem, now = new Date()): number | null {
  if (item.deadlineTs) {
    const parsed = Date.parse(item.deadlineTs)
    if (!Number.isNaN(parsed)) return parsed
  }
  return parseDateText(item.deadline, now)
}

function completeness(item: InfoItem): number {
  let score = 0
  if (item.summary) score += 2
  if (item.deadline) score += 2
  if (item.eventDate) score += 1
  if (item.location) score += 1
  if (item.eligibility) score += 1
  if (item.organizer) score += 1
  if (item.officialUrl) score += 1
  if (item.evidence) score += 1
  score += Math.min(item.keyPoints?.length ?? 0, 3) * 0.5
  // 同一版本有多个来源时，优先采用官方/原始来源，而不是转载聚合号
  if (/聚合|转载|搬运|非官方/.test(item.source)) score -= 3
  if (/官方|教务处|校团委|学院|新闻网/.test(item.source)) score += 1
  return score
}

function statusOf(item: InfoItem, now: Date): ItemStatus {
  const deadline = deadlineTimestamp(item, now)
  if (!deadline) return item.deadline ? 'unconfirmed' : 'active'
  if (now.getTime() > deadline) return 'expired'
  if (deadline - now.getTime() <= 3 * DAY) return 'expiring'
  return 'active'
}

function describeChange(previous: InfoItem, current: InfoItem, now: Date): string {
  const prevDeadline = deadlineTimestamp(previous, now)
  const nextDeadline = deadlineTimestamp(current, now)
  if (prevDeadline && nextDeadline && prevDeadline !== nextDeadline) {
    return `截止时间更新为 ${current.deadline ?? '待核对'}`
  }
  if (/延期|推迟|延长/.test(current.title)) return '官方发布延期说明'
  if (/更正|修正/.test(current.title)) return '官方更正了原文信息'
  if (/补充|调整|变更/.test(current.title)) return '官方补充或调整了要求'
  if (/取消/.test(current.title)) return '活动已取消'
  return '标题有实质变化'
}

function completedTimestampOf(item: InfoItem): number | null {
  if (!item.completedAt) return null
  const timestamp = Date.parse(item.completedAt)
  return Number.isNaN(timestamp) ? parseDateText(item.completedAt) : timestamp
}

function representativeOf(bucket: InfoItem[], now: Date): InfoItem {
  // 版本桶内已经是同一个结论；此时优先选字段更全、来源更可信的一条，
  // 避免较晚转发的聚合号覆盖官方原文。
  return [...bucket].sort(
    (a, b) => completeness(b) - completeness(a) || publishedTimestamp(b, now) - publishedTimestamp(a, now),
  )[0]
}

function cluster(items: InfoItem[]): InfoItem[][] {
  const parent = items.map((_, index) => index)
  const find = (index: number): number => {
    let current = index
    while (parent[current] !== current) {
      parent[current] = parent[parent[current]]
      current = parent[current]
    }
    return current
  }
  const union = (a: number, b: number) => {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) parent[rootB] = rootA
  }

  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const sameEventKey = Boolean(items[i].eventKey) && items[i].eventKey === items[j].eventKey
      if (sameEventKey || similarity(items[i].title, items[j].title) >= SAME_EVENT_THRESHOLD) union(i, j)
    }
  }

  const groups = new Map<number, InfoItem[]>()
  items.forEach((item, index) => {
    const root = find(index)
    groups.set(root, [...(groups.get(root) ?? []), item])
  })
  return [...groups.values()]
}

/**
 * 把一个原始条目集合整理为「每件事一条」的结果。
 * 被合并掉的重复来源不会丢失：它们记录在 versions[].sources 里，详情页可查。
 */
export function classifyLibrary(items: InfoItem[], now = new Date()): LibraryClassification {
  const groups = cluster(items)
  const orderById = new Map(items.map((item, index) => [item.id, index]))
  const entries: Classification[] = []
  const byId = new Map<number, Classification>()

  for (const group of groups) {
    const sorted = [...group].sort((a, b) => publishedTimestamp(a, now) - publishedTimestamp(b, now))
    const buckets: InfoItem[][] = []
    const notes: string[] = []

    for (const item of sorted) {
      const previous = buckets.at(-1)?.[0]
      if (!previous) {
        buckets.push([item])
        notes.push('首次收录')
        continue
      }
      const deadlineChanged = deadlineTimestamp(previous, now) !== deadlineTimestamp(item, now)
      const hasContentChange = CONTENT_CHANGE_WORDS.test(item.title)
      const previousHasChange = CONTENT_CHANGE_WORDS.test(previous.title)
      const similarEnough = similarity(previous.title, item.title) >= DUPLICATE_THRESHOLD
      // 两篇同标题、同截止的「更正」转载不应各造一个版本；只有真正的更新才开新版本。
      const repeatedCorrection = hasContentChange && previousHasChange && similarEnough && !deadlineChanged
      if (deadlineChanged || (hasContentChange && !repeatedCorrection)) {
        buckets.push([item])
        notes.push(describeChange(previous, item, now))
      } else {
        buckets[buckets.length - 1].push(item)
      }
    }

    const versions: VersionEntry[] = buckets.map((bucket, index) => {
      const representative = representativeOf(bucket, now)
      const deadlineTs = deadlineTimestamp(representative, now)
      return {
        id: representative.id,
        version: index + 1,
        title: representative.title,
        source: representative.source,
        sources: bucket.map(item => item.source),
        publishedAt: representative.publishedAt,
        publishedTs: publishedTimestamp(representative, now),
        deadline: representative.deadline,
        deadlineTs,
        changeNote: notes[index] ?? '首次收录',
        duplicateCount: bucket.length - 1,
      }
    })

    const latestBucket = buckets[buckets.length - 1]
    const latest = representativeOf(latestBucket, now)
    // 版本合并的是“同一件事”的多个来源；收藏、完成、今日精选、官网入口属于事件级状态，
    // 不能因为最新转载没填这些字段就从界面上消失。
    const richest = [...group].sort((a, b) => completeness(b) - completeness(a))[0]
    const completedSource = [...group]
      .filter(item => item.completed)
      .sort((a, b) => (completedTimestampOf(b) ?? 0) - (completedTimestampOf(a) ?? 0))[0]
    const canonical: InfoItem = {
      ...richest,
      ...latest,
      eventDate: latest.eventDate ?? richest.eventDate,
      location: latest.location ?? richest.location,
      eligibility: latest.eligibility ?? richest.eligibility,
      organizer: latest.organizer ?? richest.organizer,
      officialUrl: latest.officialUrl ?? richest.officialUrl,
      officialHome: latest.officialHome ?? richest.officialHome,
      favorite: group.some(item => item.favorite),
      liked: group.some(item => item.liked),
      completed: group.some(item => item.completed),
      completedAt: completedSource?.completedAt ?? latest.completedAt,
      daily: group.some(item => item.daily),
    }
    const guess = inferCategory(`${canonical.title} ${canonical.summary ?? ''} ${(canonical.tags ?? []).join(' ')}`)
    const topics = [...new Set([...(canonical.tags ?? []), ...guess.matched])].slice(0, 4)
    const duplicateCount = group.length - buckets.length
    const order = Math.min(...group.map(item => orderById.get(item.id) ?? 0))
    const memberIds = group.map(item => item.id)

    const entry: Classification = {
      key: entityKey(canonical.title) || `item-${canonical.id}`,
      item: canonical,
      versions: versions.map(version => ({
        ...version,
        sources: [...new Set(version.sources)],
      })),
      version: versions.length,
      duplicateCount,
      status: statusOf(canonical, now),
      confidence: guess.confidence,
      matched: guess.matched,
      topics,
      order,
      memberIds,
    }
    entries.push(entry)
    // 被合并进同一版本的每个原始 id 都要能打开事件详情，而不只是代表条目。
    for (const original of group) byId.set(original.id, entry)
  }

  entries.sort((a, b) => a.order - b.order)

  const visible = [...entries].sort((a, b) => a.order - b.order)
  return {
    entries,
    visible,
    byId,
    stats: {
      raw: items.length,
      unique: entries.length,
      merged: items.length - entries.length,
      versionGroups: entries.filter(entry => entry.versions.length > 1).length,
      expired: visible.filter(entry => entry.status === 'expired').length,
      expiring: visible.filter(entry => entry.status === 'expiring').length,
      unconfirmed: visible.filter(entry => entry.status === 'unconfirmed').length,
    },
  }
}

/** 给公众号文章用的查重：优先 eventKey，其次标题相似度。 */
export function findExistingItem(
  items: InfoItem[],
  candidate: { title: string; eventKey?: string },
): { item: InfoItem; score: number; via: 'eventKey' | 'title' } | null {
  let best: { item: InfoItem; score: number; via: 'eventKey' | 'title' } | null = null
  for (const item of items) {
    if (candidate.eventKey && item.eventKey === candidate.eventKey) {
      const score = 1
      if (!best || score > best.score) best = { item, score, via: 'eventKey' }
      continue
    }
    const score = similarity(item.title, candidate.title)
    if (score >= SAME_EVENT_THRESHOLD && (!best || score > best.score)) best = { item, score, via: 'title' }
  }
  return best
}

/** 距离截止还有几天（向上取整）。已截止为负数，日期缺失为 null。 */
export function deadlineDays(item: InfoItem, now = new Date()): number | null {
  const timestamp = deadlineTimestamp(item, now)
  if (!timestamp) return null
  const difference = timestamp - now.getTime()
  // 刚过期不足一天也必须返回负数，不能显示成「今天截止」。
  return difference >= 0
    ? Math.ceil(difference / DAY)
    : -Math.ceil(Math.abs(difference) / DAY)
}

/** 截止日的中文短标签：今天截止 / 3 天后截止 / 已截止。 */
export function deadlineLabel(item: InfoItem, now = new Date()): string {
  const days = deadlineDays(item, now)
  if (days === null) return item.deadline ?? '日期待核对'
  if (days < 0) return '已截止'
  if (days === 0) return '今天截止'
  return `${days} 天后截止`
}

export const STATUS_LABEL: Record<ItemStatus, string> = {
  active: '进行中',
  expiring: '临近截止',
  expired: '已截止',
  unconfirmed: '日期待核对',
}

/** 把时间戳写成「11月03日 16:20」，与演示数据的写法保持一致。 */
export function formatMoment(timestamp: number): string {
  const date = new Date(timestamp)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${month}月${day}日 ${hour}:${minute}`
}
