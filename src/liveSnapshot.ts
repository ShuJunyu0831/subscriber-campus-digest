/**
 * 官网直采快照（P0 真实数据链路）
 *
 * src/live/competitions.json 由 `npm run collect` 从竞赛官网真实抓取生成，
 * 提交入库后 Web 版离线也能展示真实数据；桌面版还能通过主进程实时刷新。
 * 这里只做「快照 → InfoItem」的转换，不做任何内容加工。
 */
import competitions from './live/competitions.json'
import type { InfoItem, NewItemInput } from './data'

export interface LiveSnapshot {
  fetchedAt: string
  items: NewItemInput[]
  logs: { source: string; ok: boolean; count: number; message: string }[]
}

export const liveSnapshot = competitions as LiveSnapshot

/** 桌面版实时刷新后覆盖快照时间，界面各处统一从这里取「抓取时间」。 */
let fetchedAtOverride: string | null = null
export function setLiveFetchedAt(iso: string | null): void {
  fetchedAtOverride = iso
}
export function currentFetchedAt(): string {
  return fetchedAtOverride ?? liveSnapshot.fetchedAt
}

/** 快照条目 id 从 1001 起，避免与演示数据（1—10）和运行时自增 id 冲突。 */
const LIVE_ID_BASE = 1000

/** 把一条官网直采输入转成完整 InfoItem（快照与桌面实时抓取共用）。 */
export function liveInputToItem(input: NewItemInput, id: number): InfoItem {
  return {
    id,
    title: input.title,
    category: input.category,
    summary: input.summary ?? '正文以官网页面为准。',
    source: input.source,
    sourceType: input.sourceType ?? '官网直采',
    publishedAt: input.publishedAt ?? '日期待核对',
    publishedTs: input.publishedTs,
    deadline: input.deadline,
    deadlineTs: input.deadlineTs,
    officialUrl: input.officialUrl,
    officialHome: input.officialHome,
    liveSourceId: input.liveSourceId,
    eventKey: input.eventKey,
    tags: input.tags?.length ? input.tags : [input.category, '官网直采'],
    favorite: false,
    liked: false,
    completed: false,
    priority: 'normal',
    evidence: input.evidence ?? '来源为竞赛官网页面原文。',
    keyPoints: input.keyPoints?.length ? input.keyPoints : ['数据来自官网自动采集，请以官网原文为准'],
  }
}

export function buildLiveItems(): InfoItem[] {
  return liveSnapshot.items.map((input, index) => liveInputToItem(input, LIVE_ID_BASE + index + 1))
}

/** 给界面展示用：如「11月03日 18:05 抓取」。 */
export function formatFetchedAt(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${month}月${day}日 ${hour}:${minute}`
}
