import { useMemo, useState } from 'react'
import {
  CircleAlert,
  Cloud,
  Globe2,
  LoaderCircle,
  MessageSquareShare,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react'
import { LIVE_SOURCES } from './liveSource'
import {
  customSiteFollowId,
  customSiteLiveSourceId,
  miniprogramFollowId,
  type FollowedSource,
} from './follows'
import type { AddItemResult, NewItemInput } from './data'

interface FollowSourcesProps {
  follows: FollowedSource[]
  onChange: (next: FollowedSource[]) => void
  notify: (message: string) => void
  addItem: (input: NewItemInput) => AddItemResult
  /** 从小程序卡片导入：切到「群消息」并预填来源 */
  onImportFromMiniProgram: (name: string) => void
}

const formatWhen = (timestamp?: number) => timestamp
  ? new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp))
  : ''

export default function FollowSources({ follows, onChange, notify, addItem, onImportFromMiniProgram }: FollowSourcesProps) {
  const isDesktopShell = Boolean(window.subscriberDesktop?.isDesktop)
  const sites = follows.filter(follow => follow.kind === 'competition-site')
  const minis = follows.filter(follow => follow.kind === 'miniprogram')

  const [siteName, setSiteName] = useState('')
  const [siteUrl, setSiteUrl] = useState('')
  const [siteError, setSiteError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [miniName, setMiniName] = useState('')
  const [miniNote, setMiniNote] = useState('')
  const [miniOpen, setMiniOpen] = useState(false)

  const builtinById = useMemo(() => new Map(LIVE_SOURCES.map(source => [source.id, source])), [])

  const patch = (id: string, update: Partial<FollowedSource>) => {
    onChange(follows.map(follow => follow.id === id ? { ...follow, ...update } : follow))
  }

  const remove = (id: string) => {
    onChange(follows.filter(follow => follow.id !== id))
    notify('已取消关注，已入库的信息会保留')
  }

  /** 内置源：桌面版整批抓一次，只收这个源的条目（成本最低，也不会串源）。 */
  const refreshBuiltin = async (follow: FollowedSource) => {
    const bridge = window.subscriberDesktop?.fetchLive
    if (!bridge) {
      setSiteError('浏览器版受跨域限制，抓取内置官网需要桌面版；Web 版可以用下方的 RSS 订阅。')
      return
    }
    setBusyId(follow.id)
    setSiteError('')
    try {
      const result = await bridge()
      const items = (result.report?.items ?? []).filter(item => item.liveSourceId === follow.liveSourceId)
      const added = items.filter(item => addItem(item).ok).length
      patch(follow.id, {
        lastFetchedAt: Date.now(),
        lastStatus: items.length > 0 ? `抓取 ${items.length} 条，新增 ${added} 条` : '本次没有新条目',
      })
      notify(items.length > 0 ? `已抓取 ${follow.name} ${items.length} 条，新增 ${added} 条` : `${follow.name} 本次没有新条目`)
    } catch (error) {
      const message = error instanceof Error ? error.message : '抓取失败'
      patch(follow.id, { lastFetchedAt: Date.now(), lastStatus: message })
      setSiteError(message)
    } finally {
      setBusyId('')
    }
  }

  /** 自定义官网：通用识别 + 前几条详情，逐条入库。 */
  const refreshCustom = async (follow: FollowedSource) => {
    const bridge = window.subscriberDesktop?.fetchCustomLive
    if (!bridge) {
      setSiteError('浏览器版受跨域限制，抓取自定义官网需要桌面版；也可以改用 RSS 订阅地址。')
      return
    }
    if (!follow.url) return
    setBusyId(follow.id)
    setSiteError('')
    try {
      const result = await bridge(follow.name, follow.url)
      const added = result.items.filter(item => addItem(item).ok).length
      patch(follow.id, { lastFetchedAt: Date.now(), lastStatus: result.message })
      notify(result.ok ? `${follow.name}：${result.message}，新增 ${added} 条` : `${follow.name}：${result.message}`)
      if (!result.ok) setSiteError(result.message)
    } catch (error) {
      const message = error instanceof Error ? error.message : '抓取失败'
      patch(follow.id, { lastFetchedAt: Date.now(), lastStatus: message })
      setSiteError(message)
    } finally {
      setBusyId('')
    }
  }

  const addCustomSite = async () => {
    const name = siteName.trim()
    const url = siteUrl.trim()
    if (!name) { setSiteError('请填写这个官网的名称'); return }
    if (!/^https?:\/\//i.test(url)) { setSiteError('请填写以 http:// 或 https:// 开头的列表页地址'); return }
    const id = customSiteFollowId(url, name)
    if (follows.some(follow => follow.id === id)) { setSiteError('这个官网已经在关注列表里了'); return }

    const follow: FollowedSource = {
      id,
      kind: 'competition-site',
      name,
      url,
      liveSourceId: customSiteLiveSourceId(url),
      enabled: true,
      addedAt: Date.now(),
    }
    // 先登记再抓：即便这次抓不到，用户也不用重新填一遍
    onChange([...follows, follow])
    setSiteName('')
    setSiteUrl('')
    setSiteError('')
    await refreshCustom(follow)
  }

  const addMini = () => {
    const name = miniName.trim()
    if (!name) return
    const follow: FollowedSource = {
      id: miniprogramFollowId(),
      kind: 'miniprogram',
      name,
      note: miniNote.trim() || undefined,
      enabled: true,
      addedAt: Date.now(),
    }
    onChange([...follows, follow])
    setMiniName('')
    setMiniNote('')
    setMiniOpen(false)
    notify(`已关注小程序「${name}」，它的内容需要你从卡片转发导入`)
  }

  return (
    <div className="follow-page">
      <section className="follow-hero">
        <div>
          <span className="briefing-label"><Globe2 size={15} />关注源</span>
          <h2>只留下你真的会看的官网与小程序。</h2>
          <p>官网能被程序真实抓取；小程序没有公开读取接口，只能登记关注，再靠你转发卡片进来分析。两者都不需要账号授权。</p>
        </div>
        <div className="follow-hero-stats">
          <div><strong>{sites.filter(item => item.enabled).length}</strong><span>官网在关注</span></div>
          <div><strong>{minis.length}</strong><span>小程序</span></div>
        </div>
      </section>

      <section className="follow-section">
        <div className="section-heading">
          <div><h2>竞赛官网</h2><span>{sites.length} 个</span></div>
          <span className="local-only-chip">{isDesktopShell ? '桌面版可实时抓取' : '浏览器版只读快照'}</span>
        </div>

        <div className="follow-list">
          {sites.map(follow => {
            const builtin = follow.id.startsWith('builtin:')
            const source = follow.liveSourceId ? builtinById.get(follow.liveSourceId) : undefined
            return <article key={follow.id} className={`follow-card ${follow.enabled ? '' : 'muted'}`}>
              <label className="follow-toggle">
                <input
                  type="checkbox"
                  checked={follow.enabled}
                  aria-label={`${follow.enabled ? '取消关注' : '关注'}${follow.name}`}
                  onChange={event => patch(follow.id, { enabled: event.target.checked })}
                />
                <span>
                  <strong>{follow.name}{builtin && <em className="follow-tag">内置</em>}</strong>
                  <small>{follow.url ?? source?.listUrl}</small>
                </span>
              </label>
              <div className="follow-card-side">
                {follow.lastStatus && <span className={`follow-status ${follow.lastStatus.includes('失败') || follow.lastStatus.includes('没有') ? 'warn' : ''}`}>{follow.lastStatus}{follow.lastFetchedAt ? ` · ${formatWhen(follow.lastFetchedAt)}` : ''}</span>}
                <button
                  type="button"
                  className="text-button"
                  disabled={busyId === follow.id}
                  onClick={() => (builtin ? refreshBuiltin(follow) : refreshCustom(follow))}
                >
                  {busyId === follow.id ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}抓取
                </button>
                {!builtin && <button type="button" className="icon-button" aria-label={`取消关注${follow.name}`} onClick={() => remove(follow.id)}><Trash2 size={15} /></button>}
              </div>
            </article>
          })}
        </div>

        <div className="follow-add">
          <div className="follow-add-fields">
            <label className="field"><span>官网名称</span><input value={siteName} onChange={event => setSiteName(event.target.value)} placeholder="例如：全国大学生广告艺术大赛" /></label>
            <label className="field"><span>公告列表页地址</span><input value={siteUrl} onChange={event => setSiteUrl(event.target.value)} placeholder="https://…/news/" /></label>
          </div>
          <button className="button primary" onClick={addCustomSite}><Plus size={16} />添加并抓取</button>
        </div>
        {siteError && <p className="form-error"><CircleAlert size={15} />{siteError}</p>}
        <p className="follow-hint"><Search size={14} />通用识别只看「同域名 + 链接带编号 + 标题不像导航」的条目，识别不到会直接说明，不会把首页导航当公告。</p>
      </section>

      <section className="follow-section">
        <div className="section-heading">
          <div><h2>微信小程序</h2><span>{minis.length} 个</span></div>
          <button className="text-button" onClick={() => setMiniOpen(value => !value)}><Plus size={15} />关注小程序</button>
        </div>

        <div className="follow-mini-note">
          <CircleAlert size={16} />
          <p><strong>小程序内容无法被第三方直接读取。</strong><span>这里登记的是「我在关注它」，抓取仍然要靠你从小程序里转发卡片，再在「群消息」里导入与分析。</span></p>
        </div>

        {miniOpen && <div className="follow-add mini">
          <div className="follow-add-fields">
            <label className="field"><span>小程序名称</span><input value={miniName} onChange={event => setMiniName(event.target.value)} placeholder="例如：挑战杯赛事助手" autoFocus /></label>
            <label className="field"><span>备注（可选）</span><input value={miniNote} onChange={event => setMiniNote(event.target.value)} placeholder="例如：只发报名通知" /></label>
          </div>
          <button className="button primary" onClick={addMini}><Plus size={16} />关注</button>
        </div>}

        {minis.length === 0
          ? <div className="empty-state follow-empty">
            <span className="empty-icon"><Cloud size={24} /></span>
            <h3>还没有关注小程序</h3>
            <p>关注后，它出现在这里的意义是提醒你：这些小程序的通知需要你主动转发进来。</p>
          </div>
          : <div className="follow-list">
            {minis.map(follow => <article key={follow.id} className="follow-card">
              <div className="follow-toggle static">
                <span>
                  <strong>{follow.name}<em className="follow-tag mini">小程序</em></strong>
                  <small>{follow.note ?? '内容需从小程序转发卡片导入'}</small>
                </span>
              </div>
              <div className="follow-card-side">
                <button type="button" className="text-button" onClick={() => onImportFromMiniProgram(follow.name)}><MessageSquareShare size={14} />导入卡片</button>
                <button type="button" className="icon-button" aria-label={`取消关注${follow.name}`} onClick={() => remove(follow.id)}><Trash2 size={15} /></button>
              </div>
            </article>)}
          </div>}
      </section>
    </div>
  )
}
