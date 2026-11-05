import type { Category, InfoItem } from './data'

/**
 * 回顾页的偏好统计（纯函数，不联网）。
 *
 * 统计口径刻意写死为「完成 + 收藏 + 喜欢」去重后的集合：
 * 只看完成记录的话，一周没结束就可能一条都没有，面板会是空的；
 * 加上收藏与喜欢才看得出「更关注什么」，而这两类数据也都存在本机。
 */
export interface InsightSlice {
  key: string
  label: string
  count: number
  /** 占参与统计条目的比例，用于画条，0–1。 */
  ratio: number
}

export interface ReviewInsights {
  /** 当前回顾区间内已完成的条数。 */
  completedCount: number
  /** 参与偏好统计的条数（完成 / 收藏 / 喜欢去重）。 */
  consideredCount: number
  categories: InsightSlice[]
  themes: InsightSlice[]
  sources: InsightSlice[]
  summary: string
}

/** 这些标签描述的是状态或来源方式，不构成「兴趣主题」。 */
const STOP_TAGS = new Set([
  '竞赛', '新闻', '课程通知', '已完成', '即将截止',
  '转载', '官方', '通知', '报名截止', '延期通知', '即将开始',
])

const CATEGORY_ORDER: Category[] = ['竞赛', '新闻', '课程通知']

/** 按出现次数排序，次数相同按中文拼音序，保证同一份数据每次渲染顺序一致。 */
function rank(counter: Map<string, number>, total: number, limit: number): InsightSlice[] {
  return [...counter.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hans-CN'))
    .slice(0, limit)
    .map(([label, count]) => ({ key: label, label, count, ratio: total > 0 ? count / total : 0 }))
}

function bump(counter: Map<string, number>, key: string): void {
  const trimmed = key.trim()
  if (!trimmed) return
  counter.set(trimmed, (counter.get(trimmed) ?? 0) + 1)
}

/** 来源只取「·」前的机构名，后面的栏目名对偏好判断没意义。 */
function sourceOf(item: InfoItem): string {
  return item.source.split('·')[0] ?? item.source
}

export function buildReviewInsights(input: {
  completed: InfoItem[]
  favorites: InfoItem[]
  liked: InfoItem[]
}): ReviewInsights {
  const considered = new Map<number, InfoItem>()
  for (const item of [...input.completed, ...input.favorites, ...input.liked]) considered.set(item.id, item)
  const pool = [...considered.values()]
  const total = pool.length

  const categoryCounter = new Map<string, number>()
  const themeCounter = new Map<string, number>()
  const sourceCounter = new Map<string, number>()
  const competitionThemes = new Map<string, number>()
  const courseThemes = new Map<string, number>()

  for (const item of pool) {
    bump(categoryCounter, item.category)
    bump(sourceCounter, sourceOf(item))
    for (const tag of item.tags) {
      if (STOP_TAGS.has(tag)) continue
      bump(themeCounter, tag)
      if (item.category === '竞赛') bump(competitionThemes, tag)
      if (item.category === '课程通知') bump(courseThemes, tag)
    }
  }

  const categories = CATEGORY_ORDER.map(category => {
    const count = categoryCounter.get(category) ?? 0
    return { key: category, label: category, count, ratio: total > 0 ? count / total : 0 }
  })
  const themes = rank(themeCounter, total, 6)
  const sources = rank(sourceCounter, total, 3)

  return {
    completedCount: input.completed.length,
    consideredCount: total,
    categories,
    themes,
    sources,
    summary: describe(categories, competitionThemes, courseThemes, sources, total, input.completed.length),
  }
}

function describe(
  categories: InsightSlice[],
  competitionThemes: Map<string, number>,
  courseThemes: Map<string, number>,
  sources: InsightSlice[],
  total: number,
  completedCount: number,
): string {
  if (total === 0) return '还没有可统计的记录。标记几条完成，或收藏几条信息，这里就会开始总结你的偏好。'

  const top = [...categories].sort((a, b) => b.count - a.count)[0]
  const percent = Math.round((top.count / total) * 100)
  const parts = [`你更常关注${top.label}（${top.count} 条，占 ${percent}%）`]

  const topCompetition = [...competitionThemes.entries()].sort((a, b) => b[1] - a[1])[0]
  if (topCompetition) parts.push(`竞赛里「${topCompetition[0]}」出现最多`)

  const topCourse = [...courseThemes.entries()].sort((a, b) => b[1] - a[1])[0]
  if (topCourse) parts.push(`课程与活动方面主要留意「${topCourse[0]}」`)

  if (sources[0]) parts.push(`信息多来自${sources[0].label}`)

  const doneNote = completedCount > 0 ? `这段时间完成了 ${completedCount} 项，` : ''
  return `${doneNote}${parts.join('；')}。`
}

/** 交给模型的摘要：只有标题、分类、标签与来源，不含正文原文。 */
export function describeInsightsForModel(insights: ReviewInsights, items: InfoItem[], rangeLabel: string): string {
  const lines = [
    `回顾范围：${rangeLabel}`,
    `已完成：${insights.completedCount} 项`,
    `参与统计：${insights.consideredCount} 项（完成、收藏、喜欢去重）`,
    `分类：${insights.categories.map(slice => `${slice.label} ${slice.count}`).join('，')}`,
    `主题：${insights.themes.map(slice => `${slice.label} ${slice.count}`).join('，') || '无'}`,
    `来源：${insights.sources.map(slice => `${slice.label} ${slice.count}`).join('，') || '无'}`,
    '条目（标题 · 分类 · 是否完成）：',
    ...items.slice(0, 30).map(item => `- ${item.title} · ${item.category} · ${item.completed ? '已完成' : '未完成'}`),
  ]
  return lines.join('\n')
}
