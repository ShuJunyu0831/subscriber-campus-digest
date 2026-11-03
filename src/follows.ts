/**
 * 关注源（用户自选）
 *
 * 两类东西放在一起管理：
 *  1. 竞赛官网 —— 能被程序真正抓取，抓到的条目进信息库
 *  2. 微信小程序 —— 没有公开读取接口，只能登记「我在关注它」，
 *     内容要靠用户从小程序里转发卡片再导入（与批量导入打通）
 *
 * 存 localStorage：这份配置只对当前设备有意义，不值得单开一张表。
 */
import { LIVE_SOURCES } from './liveSource'
import { readPreference, writePreference } from './localStore'

export type FollowKind = 'competition-site' | 'miniprogram'

export interface FollowedSource {
  id: string
  kind: FollowKind
  name: string
  /** 官网列表页地址（竞赛官网）/ 小程序为可选说明页 */
  url?: string
  /** 官网首页 */
  home?: string
  /** 对应条目上的 liveSourceId，用于过滤信息库 */
  liveSourceId?: string
  note?: string
  enabled: boolean
  addedAt: number
  lastFetchedAt?: number
  lastStatus?: string
}

const FOLLOW_KEY = 'subscriber-followed-sources'

/** 内置竞赛官网默认全部关注，保证首次打开看到的是完整信息库。 */
export function defaultFollows(): FollowedSource[] {
  return LIVE_SOURCES.map(source => ({
    id: `builtin:${source.id}`,
    kind: 'competition-site' as const,
    name: source.name,
    url: source.listUrl,
    home: source.homepage,
    liveSourceId: source.id,
    enabled: true,
    addedAt: 0,
  }))
}

/**
 * 读取关注配置，并补齐新版本新增的内置源。
 * 老配置里没有的内置源按「关注」处理，避免升级后信息库突然少一半。
 */
export function readFollows(): FollowedSource[] {
  const stored = readPreference<FollowedSource[]>(FOLLOW_KEY, [])
  const builtin = defaultFollows()
  if (!Array.isArray(stored) || stored.length === 0) return builtin
  const known = new Set(stored.map(item => item.id))
  const merged = [...stored]
  for (const item of builtin) {
    if (!known.has(item.id)) merged.unshift(item)
  }
  return merged
}

export function saveFollows(list: FollowedSource[]): void {
  writePreference(FOLLOW_KEY, list)
}

export function customSiteFollowId(listUrl: string, fallbackName: string): string {
  try {
    const url = new URL(listUrl)
    return `site:${url.host}`
  } catch {
    return `site:${fallbackName || 'manual'}`
  }
}

export function customSiteLiveSourceId(listUrl: string): string | undefined {
  try {
    return `custom:${new URL(listUrl).host}`
  } catch {
    return undefined
  }
}

export function miniprogramFollowId(): string {
  return `mini:${crypto.randomUUID()}`
}

/** 关注的官网 liveSourceId 集合；信息库按它过滤官网直采条目。 */
export function enabledLiveSourceIds(follows: FollowedSource[]): Set<string> {
  const ids = new Set<string>()
  for (const follow of follows) {
    if (follow.enabled && follow.liveSourceId) ids.add(follow.liveSourceId)
  }
  return ids
}
