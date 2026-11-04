import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowUpRight,
  BellRing,
  BookOpen,
  Check,
  CircleAlert,
  Clock3,
  Info,
  LoaderCircle,
  MailOpen,
  MessageSquare,
  Plus,
  RefreshCw,
  Rss,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import {
  accountArticles,
  accountById,
  formatArticleTime,
  incomingArticles,
  officialAccounts,
  trustWeight,
  type AccountArticle,
  type OfficialAccount,
} from './accounts'
import {
  createSubscription,
  feedItemToArticle,
  fetchFeed,
  readSubscriptions,
  saveSubscriptions,
  type ParsedFeed,
  type RssSubscription,
} from './rss'
import { findExistingItem, parseDateText, similarity, type Classification, type LibraryClassification } from './classify'
import type { InfoItem } from './data'
import { readPreference, writePreference } from './localStore'
import {
  fetchWechatArticle,
  isWechatArticleUrl,
  mergeWechatArticle,
  readWechatSubs,
  removeWechatAccount,
  saveWechatSubs,
  wechatRecordToArticle,
  type ParsedWechatArticle,
  type WechatAccountSub,
} from './wechatArticle'

type Relation = 'new' | 'duplicate' | 'update' | 'outdated'

interface FeedEntry {
  article: AccountArticle
  account: OfficialAccount
  mirrors: { article: AccountArticle; account: OfficialAccount }[]
  relation: Relation
  existing?: InfoItem
}

interface AccountFeedProps {
  /** 已归并后的信息库，用于查重与版本比对 */
  library: LibraryClassification
  subscribed: string[]
  onToggleSubscribe: (accountId: string) => void
  onImportArticle: (article: AccountArticle, mode: 'new' | 'update') => void
  notify: (message: string) => void
}

const READ_KEY = 'subscriber-account-read'
const SYNC_KEY = 'subscriber-account-synced'
const CATEGORY_FILTERS = ['全部', '竞赛', '课程通知', '新闻'] as const

/** 用户粘贴文章链接订阅来的公众号账号前缀。 */
const WECHAT_PREFIX = 'wx:'

function relationOf(article: AccountArticle, library: Classification[]): { relation: Relation; existing?: InfoItem } {
  const match = findExistingItem(library.map(entry => entry.item), article)
  if (!match) return { relation: 'new' }
  const articleDeadline = article.deadlineTs ? Date.parse(article.deadlineTs) : parseDateText(article.deadline)
  const libraryDeadline = match.item.deadlineTs ? Date.parse(match.item.deadlineTs) : parseDateText(match.item.deadline)
  let relation: Relation = 'duplicate'
  if (articleDeadline && libraryDeadline) {
    if (articleDeadline > libraryDeadline) relation = 'update'
    else if (articleDeadline < libraryDeadline) relation = 'outdated'
  }
  return { relation, existing: match.item }
}

const RELATION_LABEL: Record<Relation, string> = {
  new: '未入库',
  duplicate: '已自动去重',
  update: '有新版本',
  outdated: '旧版本',
}

/** 订阅源在界面上表现为形如 rss:<id> 的账号。 */
function isRssGroup(account: OfficialAccount): boolean {
  return account.id.startsWith('rss:')
}

/** 用户粘贴文章链接订阅的公众号，表现为 wx:<biz> 的账号。 */
function isWechatGroup(account: OfficialAccount): boolean {
  return account.id.startsWith(WECHAT_PREFIX)
}

export default function AccountFeed({ library, subscribed, onToggleSubscribe, onImportArticle, notify }: AccountFeedProps) {
  const [readIds, setReadIds] = useState<string[]>(() => readPreference<string[]>(READ_KEY, []))
  const [synced, setSynced] = useState<boolean>(() => readPreference<boolean>(SYNC_KEY, false))
  const [syncing, setSyncing] = useState(false)
  const [activeAccount, setActiveAccount] = useState<string>('all')
  const [filter, setFilter] = useState<(typeof CATEGORY_FILTERS)[number]>('全部')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [reader, setReader] = useState<FeedEntry | null>(null)
  const [managerOpen, setManagerOpen] = useState(false)
  const [subscriptions, setSubscriptions] = useState<RssSubscription[]>(() => readSubscriptions())
  const [rssArticles, setRssArticles] = useState<AccountArticle[]>([])
  const [rssLoading, setRssLoading] = useState(false)
  const [rssError, setRssError] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftUrl, setDraftUrl] = useState('')
  const [draftBusy, setDraftBusy] = useState(false)
  const [wechatSubs, setWechatSubs] = useState<WechatAccountSub[]>(() => readWechatSubs())
  const [wxOpen, setWxOpen] = useState(false)
  const [wxInput, setWxInput] = useState('')
  const [wxBusy, setWxBusy] = useState(false)
  const [wxError, setWxError] = useState('')

  useEffect(() => { writePreference(READ_KEY, readIds) }, [readIds])
  useEffect(() => { writePreference(SYNC_KEY, synced) }, [synced])

  /* ------------------------------ RSS 订阅源 ------------------------------ */

  /** 桌面版走主进程抓取（无跨域限制）；浏览器版直接 fetch，失败时给出跨域提示。 */
  const loadFeed = useCallback(async (url: string): Promise<ParsedFeed> => {
    const bridge = window.subscriberDesktop?.fetchRss
    if (bridge) {
      const result = await bridge(url)
      if (!result.ok || !result.parsed) throw new Error(result.message || '抓取失败')
      return { title: result.parsed.title ?? undefined, items: result.parsed.items }
    }
    return fetchFeed(url)
  }, [])

  const refreshRss = useCallback(async (list: RssSubscription[], announce = false) => {
    if (list.length === 0) { setRssArticles([]); setRssError(''); return }
    setRssLoading(true)
    setRssError('')
    const collected: AccountArticle[] = []
    const failures: string[] = []
    for (const subscription of list) {
      try {
        const parsed = await loadFeed(subscription.url)
        parsed.items.slice(0, 6).forEach((item, index) => collected.push(feedItemToArticle(subscription, item, index)))
      } catch (error) {
        failures.push(`${subscription.name}：${error instanceof Error ? error.message : '抓取失败'}`)
      }
    }
    setRssArticles(collected)
    setRssLoading(false)
    if (failures.length > 0) setRssError(failures.join('；'))
    if (announce) notify(failures.length > 0 ? `部分订阅源抓取失败：${failures[0]}` : `已抓取 ${collected.length} 篇真实文章`)
  }, [loadFeed, notify])

  useEffect(() => { void refreshRss(readSubscriptions()) }, [refreshRss])

  /** 订阅源在界面上表现为一个「账号」，复用分组、去重与入库逻辑。 */
  const rssAccounts = useMemo<OfficialAccount[]>(() => subscriptions.map(subscription => ({
    id: `rss:${subscription.id}`,
    name: subscription.name,
    handle: subscription.url,
    org: '我的订阅源',
    description: '你自己添加的 RSS / Atom 订阅源，内容真实抓取。',
    trust: 'media',
    trustLabel: 'RSS 订阅',
    topics: [],
    avatar: subscription.name.slice(0, 1),
    accent: '#8a653f',
    subscribers: '—',
    cadence: '手动刷新',
    defaultSubscribed: true,
  })), [subscriptions])

  /* --------------------------- 公众号链接订阅 --------------------------- */

  /** 用户粘贴链接订阅来的公众号，同样映射成「账号」，复用分组与入库。 */
  const wechatAccounts = useMemo<OfficialAccount[]>(() => wechatSubs.map(sub => ({
    id: `${WECHAT_PREFIX}${sub.id}`,
    name: sub.name,
    handle: sub.handle ?? `${sub.articles.length} 篇文章`,
    org: '公众号 · 链接订阅',
    description: '你粘贴文章链接后识别出的公众号，正文来自原文页面。',
    trust: 'official',
    trustLabel: '公众号订阅',
    topics: [],
    avatar: sub.name.slice(0, 1),
    accent: '#3c7a4f',
    subscribers: '—',
    cadence: '按链接更新',
    defaultSubscribed: true,
  })), [wechatSubs])

  const wechatArticles = useMemo<AccountArticle[]>(
    () => wechatSubs.flatMap(sub => sub.articles.map((record, index) => wechatRecordToArticle(sub, record, index))),
    [wechatSubs],
  )

  const activeIds = useMemo(
    () => [...subscribed, ...rssAccounts.map(account => account.id), ...wechatAccounts.map(account => account.id)],
    [subscribed, rssAccounts, wechatAccounts],
  )
  const accountLookup = useMemo(
    () => new Map([
      ...accountById,
      ...rssAccounts.map(account => [account.id, account] as const),
      ...wechatAccounts.map(account => [account.id, account] as const),
    ]),
    [rssAccounts, wechatAccounts],
  )

  /** 桌面版走主进程抓取；浏览器版直接 fetch，跨域失败时给明确提示。 */
  const loadWechatArticle = useCallback(async (url: string): Promise<ParsedWechatArticle> => {
    const bridge = window.subscriberDesktop?.fetchWechatArticle
    if (bridge) {
      const result = await bridge(url)
      if (!result.ok || !result.article) throw new Error(result.message || '抓取失败')
      return result.article
    }
    return fetchWechatArticle(url)
  }, [])

  const addWechatArticles = async () => {
    const urls = Array.from(new Set(
      wxInput.split(/[\s，,；;]+/).map(item => item.trim()).filter(Boolean),
    ))
    if (urls.length === 0) { setWxError('请先粘贴至少一个公众号文章链接'); return }
    const invalid = urls.filter(url => !isWechatArticleUrl(url))
    if (invalid.length > 0) {
      setWxError(`这 ${invalid.length} 个不是公众号文章链接（需要 mp.weixin.qq.com 开头）：${invalid[0].slice(0, 60)}`)
      return
    }

    setWxBusy(true)
    setWxError('')
    let next = wechatSubs
    let added = 0
    let skipped = 0
    const failures: string[] = []
    for (const url of urls) {
      try {
        const parsed = await loadWechatArticle(url)
        const result = mergeWechatArticle(next, parsed)
        next = result.list
        if (result.duplicated) skipped += 1
        else added += 1
      } catch (error) {
        failures.push(error instanceof Error ? error.message : '抓取失败')
      }
    }
    setWechatSubs(next)
    saveWechatSubs(next)
    setWxBusy(false)

    if (added + skipped > 0) {
      setWxOpen(false)
      setWxInput('')
    }
    const parts = [`新增 ${added} 篇`]
    if (skipped > 0) parts.push(`${skipped} 篇已在列表里`)
    if (failures.length > 0) { parts.push(`${failures.length} 篇失败`); setWxError(failures[0]) }
    notify(parts.join('，'))
  }

  const removeWechatAccountById = (accountId: string) => {
    const next = removeWechatAccount(wechatSubs, accountId.replace(WECHAT_PREFIX, ''))
    setWechatSubs(next)
    saveWechatSubs(next)
    notify('已取消这个公众号的订阅，已入库的信息会保留')
  }

  const addSubscription = async () => {
    const url = draftUrl.trim()
    if (!/^https?:\/\/.+/i.test(url)) { notify('请填写以 http:// 或 https:// 开头的 RSS 地址'); return }
    if (subscriptions.some(item => item.url === url)) { notify('这个地址已经订阅过了'); return }
    setDraftBusy(true)
    try {
      // 先抓一次：抓不到就不写入，避免留下一个永远失败的订阅源
      const parsed = await loadFeed(url)
      const subscription = createSubscription(draftName.trim() || parsed.title || '我的订阅源', url)
      const next = [...subscriptions, subscription]
      setSubscriptions(next)
      saveSubscriptions(next)
      setAddOpen(false)
      setDraftName('')
      setDraftUrl('')
      await refreshRss(next, true)
    } catch (error) {
      notify(error instanceof Error ? error.message : '抓取失败')
    } finally {
      setDraftBusy(false)
    }
  }

  const removeSubscription = (id: string) => {
    const next = subscriptions.filter(item => item.id !== id)
    setSubscriptions(next)
    saveSubscriptions(next)
    void refreshRss(next)
    notify('已移除订阅源，已入库的信息会保留')
  }

  const articles = useMemo(
    () => [...wechatArticles, ...rssArticles, ...(synced ? incomingArticles : []), ...accountArticles],
    [wechatArticles, rssArticles, synced],
  )

  const subscribedAccounts = useMemo(
    () => [...officialAccounts, ...wechatAccounts, ...rssAccounts].filter(account => activeIds.includes(account.id)),
    [activeIds, wechatAccounts, rssAccounts],
  )

  const visibleArticles = useMemo(() => articles.filter(article => {
    if (!activeIds.includes(article.accountId)) return false
    if (activeAccount !== 'all' && article.accountId !== activeAccount) return false
    if (filter !== '全部' && article.category !== filter) return false
    if (unreadOnly && readIds.includes(article.id)) return false
    const keyword = query.trim().toLowerCase()
    if (keyword && !`${article.title}${article.digest}${article.keywords.join('')}`.toLowerCase().includes(keyword)) return false
    return true
  }), [articles, activeIds, activeAccount, filter, unreadOnly, readIds, query])

  /** 同事件 + 同截止时间 → 视为转载重复，只保留可信度最高的来源，其余折叠为 mirrors。 */
  const libraryEntries = library.visible

  const entries = useMemo<FeedEntry[]>(() => {
    const clusters: AccountArticle[][] = []
    for (const article of visibleArticles) {
      const cluster = clusters.find(group => {
        const head = group[0]
        if ((head.deadlineTs ?? '') !== (article.deadlineTs ?? '')) return false
        if (head.eventKey && article.eventKey) return head.eventKey === article.eventKey
        return similarity(head.title, article.title) >= 0.92
      })
      if (cluster) cluster.push(article)
      else clusters.push([article])
    }

    return clusters.map(group => {
      const sorted = [...group].sort((a, b) => {
        const accountA = accountLookup.get(a.accountId)
        const accountB = accountLookup.get(b.accountId)
        return (trustWeight[accountB?.trust ?? 'aggregator'] - trustWeight[accountA?.trust ?? 'aggregator'])
          // 可信度相同时保留先发布的那条，把后发的“转发”折叠成镜像来源
          || (Date.parse(a.publishedAt) - Date.parse(b.publishedAt))
      })
      const primary = sorted[0]
      const account = accountLookup.get(primary.accountId) ?? officialAccounts[0]
      return {
        article: primary,
        account,
        mirrors: sorted.slice(1).map(article => ({ article, account: accountLookup.get(article.accountId) ?? officialAccounts[0] })),
        ...relationOf(primary, libraryEntries),
      }
    }).sort((a, b) => Date.parse(b.article.publishedAt) - Date.parse(a.article.publishedAt))
  }, [visibleArticles, libraryEntries, accountLookup])

  const grouped = useMemo(() => {
    const groups: { account: OfficialAccount; entries: FeedEntry[] }[] = []
    for (const entry of entries) {
      const existing = groups.find(group => group.account.id === entry.account.id)
      if (existing) existing.entries.push(entry)
      else groups.push({ account: entry.account, entries: [entry] })
    }
    return groups
  }, [entries])

  const unreadCount = articles.filter(article => activeIds.includes(article.accountId) && !readIds.includes(article.id)).length
  const duplicates = useMemo(
    () => entries.reduce((total, entry) => total + entry.mirrors.length, 0),
    [entries],
  )

  const markRead = (id: string) => setReadIds(current => current.includes(id) ? current : [...current, id])

  const sync = () => {
    if (syncing) return
    if (synced) { notify('已是最新：上次同步后没有新消息'); return }
    setSyncing(true)
    window.setTimeout(() => {
      setSynced(true)
      setSyncing(false)
      const fresh = incomingArticles.filter(article => activeIds.includes(article.accountId))
      notify(`已拉取 ${fresh.length} 条新消息（演示数据，不会访问微信服务器）`)
    }, 900)
  }

  const importEntry = (entry: FeedEntry) => {
    if (entry.relation === 'duplicate' || entry.relation === 'outdated') {
      notify(entry.relation === 'outdated'
        ? '这是同一事件的旧版本，信息库中已有更新的截止时间'
        : '信息库中已有同一内容，已自动去重')
      return
    }
    onImportArticle(entry.article, entry.relation === 'update' ? 'update' : 'new')
    markRead(entry.article.id)
  }

  return (
    <div className="account-page">
      <section className="account-overview">
        <div className="account-overview-main">
          <span className="briefing-label"><Rss size={15} />订阅源</span>
          <h2>{subscribedAccounts.length} 个订阅源，<br />今日 <em>{unreadCount}</em> 条待看。</h2>
          <p>按账号分组、按条归档；同一篇文章被多个号转载时只留一条，标注其余来源。</p>
        </div>
        <div className="account-overview-stats">
          <div><strong>{articles.filter(article => activeIds.includes(article.accountId)).length}</strong><span>已订阅文章</span></div>
          <div><strong>{unreadCount}</strong><span>未读</span></div>
          <div><strong>{duplicates}</strong><span>已去重转载</span></div>
        </div>
      </section>

      <div className="account-layout">
        <aside className="account-rail">
          <div className="account-rail-head">
            <h3>我的订阅</h3>
            <button type="button" className="text-button" onClick={() => setManagerOpen(true)}><Plus size={14} />管理</button>
          </div>
          <button type="button" className={`account-pill ${activeAccount === 'all' ? 'active' : ''}`} onClick={() => setActiveAccount('all')}>
            <span className="account-pill-all"><Rss size={15} /></span>
            <span className="account-pill-copy"><strong>全部账号</strong><small>{subscribedAccounts.length} 个来源</small></span>
            <span className="account-pill-count">{articles.filter(article => activeIds.includes(article.accountId) && !readIds.includes(article.id)).length}</span>
          </button>
          {subscribedAccounts.map(account => {
            const accountUnread = articles.filter(article => article.accountId === account.id && !readIds.includes(article.id)).length
            return (
              <button type="button" key={account.id} className={`account-pill ${activeAccount === account.id ? 'active' : ''}`} onClick={() => setActiveAccount(account.id)}>
                <span className="account-avatar" style={{ background: account.accent }}>{account.avatar}</span>
                <span className="account-pill-copy"><strong>{account.name}</strong><small>{account.trustLabel} · {account.cadence}</small></span>
                {accountUnread > 0 && <span className="account-pill-count">{accountUnread}</span>}
              </button>
            )
          })}
          <button type="button" className="account-discover" onClick={() => setManagerOpen(true)}><Plus size={15} />发现更多公众号</button>

          <div className="account-rss wechat-subs">
            <div className="account-rss-head">
              <h3>公众号链接订阅</h3>
              <button type="button" className="text-button" onClick={() => { setWxError(''); setWxOpen(true) }}><Plus size={13} />订阅</button>
            </div>
            {wechatSubs.length === 0 && (
              <p className="account-rss-empty">把任意一篇公众号文章链接粘进来，就能识别出是哪个公众号并保留正文。公众号没有开放历史文章接口，更新靠你继续贴链接，或用下面的 RSS。</p>
            )}
            {wechatSubs.map(sub => (
              <div className="account-rss-row" key={sub.id}>
                <span className="account-rss-dot wechat" aria-hidden="true" />
                <div>
                  <strong>{sub.name}</strong>
                  <small>{sub.articles.length} 篇 · 链接抓取</small>
                </div>
                <button type="button" aria-label={`取消订阅${sub.name}`} onClick={() => removeWechatAccountById(`${WECHAT_PREFIX}${sub.id}`)}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>

          <div className="account-rss">
            <div className="account-rss-head">
              <h3>我的 RSS 订阅</h3>
              <button type="button" className="text-button" onClick={() => setAddOpen(true)}><Plus size={13} />添加</button>
            </div>
            {subscriptions.length === 0 && (
              <p className="account-rss-empty">粘贴任意 RSS / Atom 地址（自建 RSSHub、WeRSS 或学校订阅源），文章会按来源分组出现在这里。</p>
            )}
            {subscriptions.map(subscription => (
              <div className="account-rss-row" key={subscription.id}>
                <span className="account-rss-dot" aria-hidden="true" />
                <div>
                  <strong>{subscription.name}</strong>
                  <small>{rssArticles.filter(article => article.accountId === `rss:${subscription.id}`).length} 篇 · 真实抓取</small>
                </div>
                <button type="button" aria-label={`移除${subscription.name}`} onClick={() => removeSubscription(subscription.id)}><Trash2 size={13} /></button>
              </div>
            ))}
            {subscriptions.length > 0 && (
              <button type="button" className="account-rss-refresh" onClick={() => void refreshRss(subscriptions, true)} disabled={rssLoading}>
                {rssLoading ? <><LoaderCircle className="spin" size={12} />抓取中…</> : <><RefreshCw size={12} />立即刷新</>}
              </button>
            )}
            {rssError && <p className="account-rss-error" role="status"><CircleAlert size={12} />{rssError}</p>}
          </div>

          <div className="account-sync-card">
            <div className="account-sync-line"><RefreshCw size={14} className={syncing ? 'spin' : ''} /><strong>{syncing ? '正在同步…' : synced ? '已同步最新' : '尚未同步'}</strong></div>
            <p>{synced ? '演示数据已全部载入，包含 2 条新消息。' : '点击右上角同步，模拟拉取订阅号的最新文章。'}</p>
            <button type="button" className="button secondary" onClick={sync} disabled={syncing}>
              {syncing ? <><LoaderCircle size={14} className="spin" />同步中</> : <><RefreshCw size={14} />同步更新</>}
            </button>
          </div>
        </aside>

        <div className="account-feed">
          <div className="feed-toolbar">
            <div className="feed-filters">
              {CATEGORY_FILTERS.map(item => (
                <button type="button" key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>
                  {item}
                  {item !== '全部' && <span>{articles.filter(article => activeIds.includes(article.accountId) && article.category === item).length}</span>}
                </button>
              ))}
            </div>
            <div className="feed-tools">
              <label className="feed-search"><Search size={14} /><input aria-label="搜索公众号文章" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索标题或关键词" />{query && <button type="button" aria-label="清除搜索" onClick={() => setQuery('')}><X size={12} /></button>}</label>
              <button type="button" className={`unread-toggle ${unreadOnly ? 'active' : ''}`} aria-pressed={unreadOnly} onClick={() => setUnreadOnly(state => !state)}>
                <MailOpen size={14} />只看未读
              </button>
            </div>
          </div>

          <p className="feed-note"><ShieldCheck size={13} />内置账号是演示数据，不会访问微信服务器；粘贴文章链接订阅的公众号与 RSS 源是真实抓取，转载重复已按标题与事件指纹自动合并。</p>

          {grouped.length === 0 && (
            <div className="empty-state account-empty">
              <span className="empty-icon"><Rss size={24} /></span>
              <h3>没有符合条件的文章</h3>
              <p>试试切换分类、关闭“只看未读”，或订阅更多公众号。</p>
              <button type="button" className="button secondary" onClick={() => { setFilter('全部'); setUnreadOnly(false); setQuery(''); setActiveAccount('all') }}>清除筛选</button>
            </div>
          )}

          {grouped.map(group => (
            <section className="feed-group" key={group.account.id}>
              <header className="feed-group-head">
                <span className="account-avatar" style={{ background: group.account.accent }}>{group.account.avatar}</span>
                <div>
                  <strong>{group.account.name}</strong>
                  <small>{group.account.trustLabel} · {group.entries.length} 条{isRssGroup(group.account) ? ' · 来自你添加的订阅源' : isWechatGroup(group.account) ? ' · 来自你粘贴的文章链接' : ''}</small>
                </div>
                {isRssGroup(group.account)
                  ? <span className="trust-chip rss"><Rss size={11} />真实抓取</span>
                  : isWechatGroup(group.account)
                    ? <span className="trust-chip wechat"><MessageSquare size={11} />链接抓取</span>
                    : <span className={`trust-chip ${group.account.trust}`}>{group.account.trust === 'official' ? '官方' : group.account.trust === 'media' ? '媒体' : '非官方'}</span>}
              </header>
              <div className="feed-articles">
                {group.entries.map(entry => {
                  const read = readIds.includes(entry.article.id)
                  const open = expanded === entry.article.id
                  return (
                    <article key={entry.article.id} className={`feed-article ${read ? 'is-read' : ''} ${open ? 'is-open' : ''}`}>
                      <span className={`unread-dot ${read ? 'hidden' : ''}`} aria-hidden="true" />
                      <div className="feed-article-main">
                        <button type="button" className="feed-title" aria-expanded={open} onClick={() => { markRead(entry.article.id); setExpanded(current => current === entry.article.id ? null : entry.article.id) }}>
                          <span>{entry.article.title}</span>
                          {entry.relation === 'update' && <em className="feed-badge update">版本更新</em>}
                          {entry.relation === 'duplicate' && <em className="feed-badge merged">已去重</em>}
                          {entry.relation === 'outdated' && <em className="feed-badge outdated">旧版本</em>}
                        </button>
                        <p>{entry.article.digest}</p>
                        <div className="feed-meta">
                          <span>{formatArticleTime(entry.article.publishedAt)}</span>
                          <span className="feed-dot" />
                          <span>{entry.article.readMinutes} 分钟</span>
                          <span className="feed-dot" />
                          <span className={`category-tag ${entry.article.category === '竞赛' ? 'competition' : entry.article.category === '新闻' ? 'news' : 'course'}`}>{entry.article.category}</span>
                          {entry.article.deadline && <span className="feed-deadline"><Clock3 size={12} />{entry.article.deadline} 截止</span>}
                        </div>
                        {entry.mirrors.length > 0 && (
                          <p className="feed-mirrors"><Info size={12} />另有 {entry.mirrors.map(mirror => mirror.account.name).join('、')} 转载同一内容，已合并</p>
                        )}
                        {entry.existing && entry.relation !== 'new' && (
                          <p className={`feed-library-link ${entry.relation}`}>
                            {entry.relation === 'update' ? <BellRing size={12} /> : entry.relation === 'outdated' ? <CircleAlert size={12} /> : <Check size={12} />}
                            {entry.relation === 'update'
                              ? `信息库当前版本截止 ${entry.existing.deadline ?? '待核对'}，可合并为更新版本`
                              : entry.relation === 'outdated'
                                ? `信息库中已是更新版本（截止 ${entry.existing.deadline ?? '待核对'}），此条仅留档`
                                : `信息库中已有《${entry.existing.title}》，无需重复入库`}
                          </p>
                        )}
                        {open && (
                          <div className="feed-detail">
                            <div className="feed-keywords">{entry.article.keywords.map(keyword => <span key={keyword}>#{keyword}</span>)}</div>
                            <div className="feed-detail-actions">
                              <button type="button" className="text-button" onClick={() => setReader(entry)}><BookOpen size={13} />阅读全文</button>
                              {entry.article.officialUrl && <a href={entry.article.officialUrl} target="_blank" rel="noopener noreferrer">查看原文<ArrowUpRight size={13} /></a>}
                              <button type="button" className="text-button" onClick={() => setReadIds(current => current.filter(id => id !== entry.article.id))}>标记为未读</button>
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="feed-article-actions">
                        <button
                          type="button"
                          className={`button ${entry.relation === 'new' ? 'secondary' : entry.relation === 'update' ? 'primary' : 'collected'}`}
                          disabled={entry.relation === 'duplicate' || entry.relation === 'outdated'}
                          onClick={() => importEntry(entry)}
                          title={entry.relation === 'duplicate' ? '信息库中已有同一内容' : entry.relation === 'outdated' ? '信息库中已有更新版本' : undefined}
                        >
                          {entry.relation === 'new' ? <><Plus size={14} />入库</> : entry.relation === 'update' ? <><Sparkles size={14} />合并更新</> : <><Check size={14} />已入库</>}
                        </button>
                        <span className={`relation-label ${entry.relation}`}>{RELATION_LABEL[entry.relation]}</span>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      </div>

      {managerOpen && (
        <div className="modal-backdrop" onMouseDown={() => setManagerOpen(false)}>
          <section className="modal modal-wide" role="dialog" aria-modal="true" aria-label="公众号订阅管理" onMouseDown={event => event.stopPropagation()}>
            <div className="modal-header">
              <div><h2>公众号订阅管理</h2></div>
              <button type="button" className="icon-button" aria-label="关闭" onClick={() => setManagerOpen(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="search-disclosure"><ShieldCheck size={16} /><span>微信没有开放第三方读取个人订阅号的接口，下面这些内置账号是演示数据；真实内容请用左侧「公众号链接订阅」粘贴文章链接，或添加 RSS 订阅源。</span></div>
              <div className="account-manager-list">
                {officialAccounts.map(account => {
                  const active = subscribed.includes(account.id)
                  return (
                    <div className={`account-manager-row ${active ? 'active' : ''}`} key={account.id}>
                      <span className="account-avatar" style={{ background: account.accent }}>{account.avatar}</span>
                      <div className="account-manager-copy">
                        <div><strong>{account.name}</strong><span className={`trust-chip ${account.trust}`}>{account.trustLabel}</span></div>
                        <p>{account.description}</p>
                        <small>{account.subscribers} 关注 · {account.cadence} · {account.topics.join(' / ')}</small>
                      </div>
                      <button type="button" className={`button ${active ? 'collected' : 'secondary'}`} onClick={() => onToggleSubscribe(account.id)} aria-pressed={active}>
                        {active ? <><Check size={14} />已订阅</> : <><Plus size={14} />订阅</>}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="modal-actions"><span className="ai-note"><Info size={14} />取消订阅不会删除已入库的信息</span><button className="button primary" onClick={() => setManagerOpen(false)}>完成</button></div>
          </section>
        </div>
      )}

      {addOpen && (
        <div className="modal-backdrop" onMouseDown={() => { if (!draftBusy) setAddOpen(false) }}>
          <section className="modal" role="dialog" aria-modal="true" aria-label="添加订阅源" onMouseDown={event => event.stopPropagation()}>
            <div className="modal-header">
              <div><h2>添加订阅源</h2></div>
              <button type="button" className="icon-button" aria-label="关闭" onClick={() => setAddOpen(false)} disabled={draftBusy}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="search-disclosure"><ShieldCheck size={16} /><span>微信没有开放第三方读取个人订阅号的接口，请填写你已获授权的 RSS 地址（自建 RSSHub、WeRSS，或学校 / 竞赛官网的订阅源）。桌面版可直连抓取，浏览器需要订阅源允许跨域。</span></div>
              <label className="field"><span>订阅源名称</span><input value={draftName} onChange={event => setDraftName(event.target.value)} placeholder="留空则使用订阅源自带名称" autoFocus /></label>
              <label className="field"><span>RSS / Atom 地址</span><input value={draftUrl} onChange={event => setDraftUrl(event.target.value)} placeholder="https://example.com/feed.xml" /><small>抓取失败不会保存，避免留下永远失败的订阅源。</small></label>
            </div>
            <div className="modal-actions">
              <span className="ai-note"><Info size={14} />只保存地址，不上传你的账号</span>
              <button className="button secondary" onClick={() => setAddOpen(false)} disabled={draftBusy}>取消</button>
              <button className="button primary" onClick={addSubscription} disabled={draftBusy}>{draftBusy ? <><LoaderCircle className="spin" size={15} />正在抓取</> : <><Plus size={15} />添加并抓取</>}</button>
            </div>
          </section>
        </div>
      )}

      {wxOpen && (
        <div className="modal-backdrop" onMouseDown={() => { if (!wxBusy) setWxOpen(false) }}>
          <section className="modal" role="dialog" aria-modal="true" aria-label="订阅公众号" onMouseDown={event => event.stopPropagation()}>
            <div className="modal-header">
              <div><h2>订阅公众号</h2></div>
              <button type="button" className="icon-button" aria-label="关闭" onClick={() => setWxOpen(false)} disabled={wxBusy}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="search-disclosure"><ShieldCheck size={16} /><span>微信没有开放「按账号拉取历史文章」的接口，所以订阅从一篇具体文章开始：你给出链接，我们只抓这一页，识别公众号并保留标题与正文。可以一次粘多条，同一公众号会自动归到一起。</span></div>
              <label className="field"><span>公众号文章链接</span>
                <textarea
                  aria-label="公众号文章链接"
                  value={wxInput}
                  onChange={event => setWxInput(event.target.value)}
                  rows={6}
                  placeholder={'https://mp.weixin.qq.com/s/xxxxxxxx\n每行一条，可以一次多个'}
                  autoFocus
                />
                <small>必须是 mp.weixin.qq.com 的文章链接；桌面版可直接抓取，浏览器版需要该页面允许跨域。</small>
              </label>
              {wxError && <p className="form-error"><CircleAlert size={15} />{wxError}</p>}
              <div className="privacy-note"><Info size={17} /><p><strong>只抓你给出的链接</strong><span>不会遍历该公众号的其他文章，也不会请求你的微信账号。</span></p></div>
            </div>
            <div className="modal-actions">
              <span className="ai-note"><Info size={14} />识别失败不会留下空订阅</span>
              <button className="button secondary" onClick={() => setWxOpen(false)} disabled={wxBusy}>取消</button>
              <button className="button primary" onClick={addWechatArticles} disabled={wxBusy}>{wxBusy ? <><LoaderCircle className="spin" size={15} />正在抓取</> : <><Plus size={15} />抓取并订阅</>}</button>
            </div>
          </section>
        </div>
      )}

      {reader && (
        <div className="modal-backdrop" onMouseDown={() => setReader(null)}>
          <section className="modal modal-wide article-reader" role="dialog" aria-modal="true" aria-label="文章全文预览" onMouseDown={event => event.stopPropagation()}>
            <div className="modal-header">
              <div><span className="eyebrow">{reader.article.fullTextOrigin === 'rss' ? 'RSS 全文 · 真实抓取' : reader.article.fullTextOrigin === 'wechat' ? '公众号原文 · 链接抓取' : '演示全文'}</span><h2>{reader.article.title}</h2></div>
              <button type="button" className="icon-button" aria-label="关闭" onClick={() => setReader(null)}><X size={20} /></button>
            </div>
            <div className="modal-body reader-body">
              <div className="reader-meta">
                <span className="account-avatar" style={{ background: reader.account.accent }}>{reader.account.avatar}</span>
                <div>
                  <strong>{reader.account.name}</strong>
                  <small>{formatArticleTime(reader.article.publishedAt)} · 约 {reader.article.readMinutes} 分钟 · {reader.account.trustLabel}</small>
                </div>
                {reader.article.deadline && <span className="reader-deadline"><Clock3 size={12} />{reader.article.deadline} 截止</span>}
              </div>
              {reader.article.fullText
                ? <div className="reader-text">{reader.article.fullText.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
                : <div className="reader-empty"><Info size={17} /><p><strong>{reader.article.fullTextOrigin === 'wechat' ? '这篇只拿到了标题与摘要' : '这篇只有摘要'}</strong><span>{reader.article.fullTextOrigin === 'wechat'
                  ? '可能是页面被拦截或正文结构与预期不同，点击下方「原文链接」可以看到完整内容。'
                  : '演示数据未收录本篇全文，正式版会在获得授权后读取公众号原文。'}</span></p></div>}
              <div className="feed-keywords">{reader.article.keywords.map(keyword => <span key={keyword}>#{keyword}</span>)}</div>
              <p className="reader-note"><ShieldCheck size={13} />{reader.article.fullTextOrigin === 'rss'
                ? '正文由你添加的订阅源提供，抓取后未经改写；如需核对请打开原文链接。'
                : reader.article.fullTextOrigin === 'wechat'
                  ? '正文由你粘贴的文章链接抓取，未经改写；公众号页面结构变化时会退化为只保留标题与摘要。'
                  : '演示全文仅用于展示阅读体验，不代表真实公众号内容；正文以原文链接为准。'}</p>
            </div>
            <div className="modal-actions">
              {reader.article.officialUrl && <a className="button secondary" href={reader.article.officialUrl} target="_blank" rel="noopener noreferrer">原文链接<ArrowUpRight size={14} /></a>}
              <button className="button secondary" onClick={() => setReader(null)}>关闭</button>
              <button
                className="button primary"
                disabled={reader.relation === 'duplicate' || reader.relation === 'outdated'}
                onClick={() => { importEntry(reader); setReader(null) }}
              >{reader.relation === 'new' ? <><Plus size={14} />加入信息库</> : reader.relation === 'update' ? <><Sparkles size={14} />合并为最新版本</> : <><Check size={14} />已在信息库</>}</button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
