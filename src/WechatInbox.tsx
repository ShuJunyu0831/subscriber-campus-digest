import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleAlert,
  ClipboardPaste,
  Cpu,
  Eye,
  HardDrive,
  Info,
  Layers,
  LoaderCircle,
  Lock,
  MessagesSquare,
  Plus,
  Rss,
  Share2,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { type AddItemResult, type NewItemInput } from './data'
import { inferCategory, type LibraryClassification } from './classify'
import { officialAccounts, type AccountArticle } from './accounts'
import AccountFeed from './AccountFeed'
import FollowSources from './FollowSources'
import SplitText from './SplitText'
import { readCredentials, summarizeWithLlm } from './llmClient'
import type { FollowedSource } from './follows'
import { CHANNEL_LABELS, parseBatchText, type BatchEntry, type MessageChannel } from './shareImport'
import {
  clearLocalMessages,
  clearPendingShare,
  deleteLocalMessage,
  listLocalMessages,
  markMessagesAnalyzed,
  readPendingShare,
  readPreference,
  saveLocalMessage,
  saveLocalMessages,
  writePreference,
  type LocalWechatMessage,
} from './localStore'

interface EditableDraft {
  groupName: string
  content: string
  source: LocalWechatMessage['source']
  channel: MessageChannel
  fromShare?: boolean
}

interface BatchDraft {
  channel: MessageChannel
  raw: string
  entries: BatchEntry[]
}

interface WechatInboxProps {
  addItem: (input: NewItemInput) => AddItemResult
  notify: (message: string) => void
  modelName: string
  library: LibraryClassification
  onImportArticle: (article: AccountArticle, mode: 'new' | 'update') => void
  /** 关注源由 App 持有：信息库要按它过滤官网条目 */
  follows: FollowedSource[]
  onFollowsChange: (next: FollowedSource[]) => void
  /** 外部转发进来的内容（App 收到后切到本页并传进来），stamp 变化即重新导入一次 */
  incoming?: { text: string; stamp: number } | null
  /** 有内容正被拖到窗口上：由 App 的窗口级监听驱动，这里只用来高亮消息箱 */
  dragActive?: boolean
}

const SUBSCRIPTION_KEY = 'subscriber-account-subs'
const CHANNELS: MessageChannel[] = ['wechat', 'dingtalk', 'miniprogram']

const formatTime = (timestamp: number) => new Intl.DateTimeFormat('zh-CN', {
  month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
}).format(new Date(timestamp))

const redactText = (text: string) => text
  .replace(/1[3-9]\d{9}/g, '[手机号已隐藏]')
  .replace(/\b\d{17}[\dXx]\b/g, '[证件号已隐藏]')
  .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[邮箱已隐藏]')

const channelOf = (message: LocalWechatMessage): MessageChannel => message.channel ?? 'wechat'

function InlineModal({ title, eyebrow, children, onClose, wide = false }: {
  title: string
  eyebrow: string
  children: React.ReactNode
  onClose: () => void
  wide?: boolean
}) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} onMouseDown={event => event.stopPropagation()}>
        <div className="modal-header">
          <div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div>
          <button type="button" className="icon-button" aria-label="关闭" onClick={onClose}><X size={20} /></button>
        </div>
        {children}
      </section>
    </div>
  )
}

export default function WechatInbox({ addItem, notify, modelName, library, onImportArticle, follows, onFollowsChange, incoming, dragActive = false }: WechatInboxProps) {
  const isDesktopShell = Boolean(window.subscriberDesktop?.isDesktop)
  const canReadClipboard = Boolean(window.subscriberDesktop?.readClipboard)

  const [tab, setTab] = useState<'share' | 'accounts' | 'follows'>('share')
  const [subscribed, setSubscribed] = useState<string[]>(() => readPreference<string[]>(
    SUBSCRIPTION_KEY,
    officialAccounts.filter(account => account.defaultSubscribed).map(account => account.id),
  ))
  const [messages, setMessages] = useState<LocalWechatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string[]>([])
  const [channelFilter, setChannelFilter] = useState<'all' | MessageChannel>('all')
  const [draft, setDraft] = useState<EditableDraft | null>(null)
  const [batch, setBatch] = useState<BatchDraft | null>(null)
  const [draftError, setDraftError] = useState('')
  const [saving, setSaving] = useState(false)
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const [analysisConsent, setAnalysisConsent] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [analysisNote, setAnalysisNote] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { writePreference(SUBSCRIPTION_KEY, subscribed) }, [subscribed])

  const toggleSubscribe = (accountId: string) => {
    const active = subscribed.includes(accountId)
    setSubscribed(current => active ? current.filter(id => id !== accountId) : [...current, accountId])
    notify(active ? '已取消订阅，已入库的信息会保留' : '已订阅，可在公众号标签查看')
  }

  useEffect(() => {
    let active = true
    Promise.all([listLocalMessages(), readPendingShare()])
      .then(([stored, pending]) => {
        if (!active) return
        setMessages(stored)
        if (pending) {
          setDraft({
            groupName: pending.title || '微信分享',
            content: [pending.text, pending.url].filter(Boolean).join('\n'),
            source: 'wechat-share',
            channel: 'wechat',
            fromShare: true,
          })
        }
      })
      .catch(() => notify('无法读取本机消息，请检查浏览器是否允许本地存储'))
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false; if (timer.current) clearTimeout(timer.current) }
  }, [notify])

  const selectedMessages = useMemo(
    () => messages.filter(message => selected.includes(message.id)),
    [messages, selected],
  )
  const filteredMessages = useMemo(
    () => channelFilter === 'all' ? messages : messages.filter(message => channelOf(message) === channelFilter),
    [messages, channelFilter],
  )
  const channelCounts = useMemo(() => {
    const counts: Record<MessageChannel, number> = { wechat: 0, dingtalk: 0, miniprogram: 0 }
    for (const message of messages) counts[channelOf(message)] += 1
    return counts
  }, [messages])

  const outboundText = selectedMessages
    .map(message => `【${message.groupName}】\n${message.content}`)
    .join('\n\n')
  const redactedOutboundText = redactText(outboundText)
  const hiddenCount = Math.max(0, outboundText.length - redactedOutboundText.length)
  const credentials = readCredentials()
  const realCall = Boolean(credentials)

  const openBlankDraft = () => {
    setDraftError('')
    setDraft({ groupName: '', content: '', source: 'wechat-share', channel: 'wechat' })
  }

  const openDemoDraft = () => {
    setDraftError('')
    setDraft({
      groupName: '2026 软件创新竞赛通知群',
      content: '【竞赛通知】全国大学生软件创新大赛报名开始，三人组队，10月12日23:59前由队长提交报名表。联系人：13800138000。',
      source: 'demo',
      channel: 'wechat',
    })
  }

  const openBatch = useCallback((channel: MessageChannel = 'wechat', raw = '', defaultName = '') => {
    setDraftError('')
    setTab('share')
    setBatch({ channel, raw, entries: parseBatchText(raw, defaultName || CHANNEL_LABELS[channel]) })
  }, [])

  const updateBatchRaw = (raw: string, channel = batch?.channel ?? 'wechat', defaultName = '') => {
    setBatch(current => current ? {
      ...current,
      channel,
      raw,
      entries: parseBatchText(raw, defaultName || CHANNEL_LABELS[channel]),
    } : current)
  }

  const closeDraft = () => {
    if (saving) return
    if (draft?.fromShare) {
      clearPendingShare().catch(() => notify('分享草稿未能清理，请稍后重试'))
    }
    setDraft(null)
  }

  const closeBatch = () => { if (!saving) setBatch(null) }

  const saveDraft = async () => {
    if (!draft?.groupName.trim()) { setDraftError('请填写消息所属的群或来源名称。'); return }
    if (!draft.content.trim()) { setDraftError('没有可保存的分享内容。'); return }
    setSaving(true)
    setDraftError('')
    try {
      const message: LocalWechatMessage = {
        id: crypto.randomUUID(),
        groupName: draft.groupName.trim().slice(0, 80),
        content: draft.content.trim().slice(0, 100000),
        sharedAt: Date.now(),
        source: draft.source,
        channel: draft.channel,
      }
      await saveLocalMessage(message)
      if (draft.fromShare) await clearPendingShare()
      setMessages(current => [message, ...current])
      setDraft(null)
      notify('已保存到本机，尚未上传云端')
    } catch {
      setDraftError('保存失败，本机存储空间可能已满或被浏览器禁用。')
    } finally {
      setSaving(false)
    }
  }

  const saveBatch = async () => {
    if (!batch || batch.entries.length === 0) return
    setSaving(true)
    setDraftError('')
    try {
      const now = Date.now()
      const created: LocalWechatMessage[] = batch.entries.map((entry, index) => ({
        id: crypto.randomUUID(),
        groupName: entry.groupName,
        content: entry.content,
        // 逐条错开时间戳，列表排序才稳定
        sharedAt: now - index,
        source: 'batch-paste',
        channel: batch.channel,
      }))
      await saveLocalMessages(created)
      setMessages(current => [...created, ...current])
      setBatch(null)
      notify(`已保存 ${created.length} 条到本机，尚未上传云端`)
    } catch {
      setDraftError('保存失败，本机存储空间可能已满或被浏览器禁用。')
    } finally {
      setSaving(false)
    }
  }

  const importFromClipboard = async () => {
    const bridge = window.subscriberDesktop?.readClipboard
    if (!bridge) { notify('浏览器版无法读取剪贴板，请手动粘贴'); return }
    const result = await bridge()
    if (!result.ok) { notify(result.message || '剪贴板里没有文字'); return }
    openBatch('wechat', result.text)
  }

  const importFromMiniProgram = (name: string) => {
    openBatch('miniprogram', '', name)
    notify(`已切到批量导入：把「${name}」里转发出来的卡片内容粘贴进来`)
  }

  /**
   * 外部转发接收：App 抓到队列内容后会切到本页并把文本传进来，
   * 这里直接按批量导入拆好给用户确认（不再需要复制粘贴）。
   */
  useEffect(() => {
    if (!incoming?.text.trim()) return
    openBatch('wechat', incoming.text)
    notify('已接收外部转发的内容，确认拆分后再保存到本机')
  }, [incoming?.stamp, incoming?.text, openBatch, notify])

  /**
   * 拖进来的内容由 App 的窗口级监听读取并走 incoming 通道送进来，
   * 这里不再自己绑 drop —— 只绑在消息箱区块上时，拖到页面其他地方 drop 根本不会触发。
   */
  const removeMessage = async (id: string) => {
    try {
      await deleteLocalMessage(id)
      setMessages(current => current.filter(message => message.id !== id))
      setSelected(current => current.filter(item => item !== id))
      notify('已从本机删除')
    } catch {
      notify('删除失败，请稍后重试')
    }
  }

  const clearMessages = async () => {
    try {
      await clearLocalMessages()
      setMessages([])
      setSelected([])
      setConfirmClear(false)
      notify('本机消息已全部清空')
    } catch {
      notify('清空失败，请稍后重试')
    }
  }

  const toggleSelect = (id: string) => setSelected(current =>
    current.includes(id) ? current.filter(item => item !== id) : [...current, id])

  const toggleSelectFiltered = () => {
    const ids = filteredMessages.map(message => message.id)
    const allSelected = ids.every(id => selected.includes(id))
    setSelected(current => allSelected
      ? current.filter(id => !ids.includes(id))
      : Array.from(new Set([...current, ...ids])))
  }

  const startAnalysis = () => {
    if (selectedMessages.length === 0) { notify('请先选择需要分析的消息'); return }
    setAnalysisConsent(false)
    setAnalysisNote('')
    setProgress(null)
    setAnalysisOpen(true)
  }

  /**
   * 勾选的消息逐条交给模型：一条消息对应一条信息库条目。
   * 没有接入凭据时走本地规则整理（不产生任何网络请求），并在界面标明「本地整理」。
   */
  const analyze = async () => {
    if (!analysisConsent || selectedMessages.length === 0 || analyzing) return
    setAnalyzing(true)
    setAnalysisNote('')
    const total = selectedMessages.length
    setProgress({ done: 0, total })
    const failures: string[] = []
    const analyzedIds: string[] = []
    let llmUsed = 0

    for (let index = 0; index < total; index += 1) {
      const message = selectedMessages[index]
      const channel = CHANNEL_LABELS[channelOf(message)]
      const text = redactText(message.content)
      let llm = null
      if (credentials) {
        try {
          llm = await summarizeWithLlm(text, credentials)
          llmUsed += 1
        } catch (error) {
          failures.push(`${message.groupName}：${error instanceof Error ? error.message : '调用失败'}`)
        }
      } else {
        // 本地整理也留一点节奏，让用户看得见逐条进度
        await new Promise(resolve => setTimeout(resolve, 160))
      }

      const guess = inferCategory(text)
      const firstLine = text.split(/[\n。！？]/).find(Boolean)?.trim() || '消息摘要'
      const result = addItem({
        title: firstLine.slice(0, 40),
        category: guess.category,
        source: `${message.groupName} · ${channel}${llm ? 'AI 分析' : '本地整理'}`,
        sourceType: '用户导入',
        summary: llm?.summary ?? text.replace(/\s+/g, ' ').slice(0, 96),
        evidence: llm?.evidence ?? text.slice(0, 240),
        keyPoints: llm?.keyPoints,
        tags: guess.matched.length > 0 ? guess.matched : [guess.category, channel],
        deadline: llm?.deadline ?? (guess.category === '竞赛' ? '日期待核对' : undefined),
      })
      if (result.ok) analyzedIds.push(message.id)
      setProgress({ done: index + 1, total })
    }

    if (analyzedIds.length > 0) {
      await markMessagesAnalyzed(analyzedIds).catch(() => undefined)
      const stamp = Date.now()
      setMessages(current => current.map(message =>
        analyzedIds.includes(message.id) ? { ...message, analyzedAt: stamp } : message))
      setSelected(current => current.filter(id => !analyzedIds.includes(id)))
    }

    setAnalyzing(false)
    setAnalysisOpen(false)
    const mode = llmUsed > 0 ? `已用 ${modelName} 真实分析 ${llmUsed} 条` : `已按本地规则整理 ${analyzedIds.length} 条`
    const failedText = failures.length > 0 ? `，${failures.length} 条调用失败（${failures[0]}）` : ''
    setAnalysisNote(mode + failedText)
    notify(mode + failedText)
  }

  const shareTabLabel = '消息箱'

  return (
    <div className="wechat-page">
      <section className="page-heading wechat-heading">
        <div>
          <span className="eyebrow">
            {tab === 'share' ? 'LOCAL-FIRST MESSAGE INBOX' : tab === 'accounts' ? 'OFFICIAL ACCOUNTS · DEMO FEED' : 'FOLLOWED SOURCES'}
          </span>
          <SplitText tag="h1" text="消息与订阅" effect="rise" splitType="chars" delay={58} duration={0.8} staggerFrom="start" trigger="load" textAlign="left" className="split-heading" />
          <p>{tab === 'share'
            ? '微信、钉钉、小程序的片段都能批量收进来，先留在本机，再决定哪几条值得交给模型。'
            : tab === 'accounts'
              ? '订阅的公众号文章按账号、分类与版本摊平，一条一条看清。'
              : '只留下你真的会看的竞赛官网与小程序，多余的源可以随时取消关注。'}</p>
        </div>
        <div className="wechat-heading-actions">
          {tab === 'share'
            ? <>
              <span className="local-only-chip"><HardDrive size={14} />仅本机</span>
              <button className="button secondary" onClick={() => openBatch('wechat')}><Layers size={16} />批量导入</button>
              <button className="button primary" onClick={openBlankDraft}><Plus size={17} />导入单条</button>
            </>
            : tab === 'accounts'
              ? <span className="local-only-chip"><Rss size={14} />{subscribed.length} 个订阅</span>
              : <span className="local-only-chip"><GlobeIcon />{follows.filter(item => item.enabled).length} 个在关注</span>}
        </div>
      </section>

      <div className="wechat-tabs" role="tablist" aria-label="消息与订阅分区">
        <button type="button" role="tab" aria-selected={tab === 'share'} className={tab === 'share' ? 'active' : ''} onClick={() => setTab('share')}>
          <MessagesSquare size={16} />{shareTabLabel}<span>{messages.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={tab === 'accounts'} className={tab === 'accounts' ? 'active' : ''} onClick={() => setTab('accounts')}>
          <Rss size={16} />公众号订阅<span>{subscribed.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={tab === 'follows'} className={tab === 'follows' ? 'active' : ''} onClick={() => setTab('follows')}>
          <GlobeIcon />关注源<span>{follows.length}</span>
        </button>
      </div>

      {tab === 'share' && <>

      <section className="share-privacy-hero">
        <div className="share-privacy-copy">
          <span className="briefing-label"><ShieldCheck size={15} />本地优先</span>
          <h2>不读你的聊天记录，<br />只收你主动贴过来的那几段。</h2>
          <p>微信和钉钉都没有面向第三方应用的消息读取接口。Subscriber 用系统分享入口、转发到 Subscriber、粘贴或拖放来接住你主动选择的内容，不接入协议机器人，也不会在后台扫描聊天。</p>
          <div className="wechat-hero-actions">
            <button className="light-button" onClick={() => openBatch('wechat')}><Layers size={16} />批量粘贴导入</button>
            {canReadClipboard && <button className="wechat-demo-button" onClick={importFromClipboard}><ClipboardPaste size={15} />从剪贴板读取</button>}
            <button className="wechat-demo-button" onClick={openDemoDraft}>载入演示分享</button>
          </div>
        </div>
        <div className="privacy-flow" aria-label="隐私处理流程">
          <div><span>01</span><p><strong>多选后转发</strong><small>转发到其他应用，或复制粘贴</small></p><MessagesSquare size={18} /></div>
          <ChevronRight size={15} className="flow-arrow" />
          <div><span>02</span><p><strong>保存到本机</strong><small>IndexedDB 本地消息箱</small></p><HardDrive size={18} /></div>
          <ChevronRight size={15} className="flow-arrow" />
          <div><span>03</span><p><strong>勾选后分析</strong><small>每次展示外发内容</small></p><CloudIcon /></div>
        </div>
      </section>

      <p className="share-compat-note"><Info size={14} />{isDesktopShell
        ? '桌面版没有系统分享面板可用：在微信或钉钉里复制消息，回到这里点“从剪贴板读取”或“批量粘贴导入”，内容依旧只存在本机。'
        : '系统分享入口是否出现在微信面板，取决于手机系统、微信版本和是否已安装 Subscriber。找不到时，请复制消息后点击“批量粘贴导入”。'}</p>

      <div className="share-entry-ways">
        <div>
          <strong>① 转发到其他应用</strong>
          <span>微信 / 钉钉里多选群消息 → 转发 → 转发到其他应用 → 在列表里选 Subscriber，内容会直接进入批量导入。{isDesktopShell
            ? '这个列表由微信和 Windows 决定，如果没看到 Subscriber，用下面两种方式。'
            : '手机上还需要把 Subscriber 装成 PWA，桌面版请用下面两种方式。'}</span>
        </div>
        <div>
          <strong>② 从剪贴板读取</strong>
          <span>{canReadClipboard ? '在微信里复制后点一下“从剪贴板读取”，只在你点击时读一次，不监听剪贴板。' : '复制消息后回到这里点“批量粘贴导入”，粘贴一次就能拆成多条。'}</span>
        </div>
        <div>
          <strong>③ 拖进来 / 批量粘贴</strong>
          <span>把聊天记录文件（.txt / .html）、导出的 .zip 压缩包，或整个文件夹直接拖到窗口任意位置，出现「松手就导入」提示后松开即可；也可以点“批量导入”粘贴多段文字。</span>
        </div>
      </div>

      <section
        className={`local-inbox-section ${dragActive ? 'dropping' : ''}`}
        aria-label="本机消息箱"
      >
        <div className="section-heading local-inbox-heading">
          <div><h2>本机消息箱</h2><span>{messages.length} 条</span>{analysisNote && <span className="analysis-note">{analysisNote}</span>}</div>
          <div className="inbox-heading-tools">
            <button className="text-button" onClick={() => setRulesOpen(true)}><Eye size={15} />数据规则</button>
            {messages.length > 0 && (confirmClear
              ? <span className="clear-confirm"><span>清空全部？</span><button onClick={clearMessages}>确认清空</button><button onClick={() => setConfirmClear(false)}>取消</button></span>
              : <button className="text-button danger-text" onClick={() => setConfirmClear(true)}><Trash2 size={14} />清空本机</button>)}
          </div>
        </div>

        {messages.length > 0 && <div className="channel-filter" role="group" aria-label="按渠道筛选">
          <button type="button" className={channelFilter === 'all' ? 'active' : ''} aria-pressed={channelFilter === 'all'} onClick={() => setChannelFilter('all')}>全部 {messages.length}</button>
          {CHANNELS.map(channel => <button
            key={channel}
            type="button"
            className={channelFilter === channel ? 'active' : ''}
            aria-pressed={channelFilter === channel}
            onClick={() => setChannelFilter(channel)}
          >{CHANNEL_LABELS[channel]} {channelCounts[channel]}</button>)}
          <button type="button" className="channel-select-all" onClick={toggleSelectFiltered}>全选当前 {filteredMessages.length} 条</button>
        </div>}

        {loading && <div className="local-message-skeletons">{[1, 2].map(index => <div key={index}><span /><span /><span /></div>)}</div>}

        {!loading && messages.length === 0 && <div className="empty-state wechat-empty">
          <span className="empty-icon"><MessagesSquare size={26} /></span>
          <h3>本机消息箱还是空的</h3>
          <p>{isDesktopShell ? '在微信或钉钉里复制消息，回到这里点“从剪贴板读取”，一次可以带进很多条。' : '安装 Subscriber 后，可从微信分享面板选择它；也可以先粘贴一段消息体验本地导入。'}</p>
          <div className="empty-actions"><button className="button primary" onClick={() => openBatch('wechat')}><Layers size={16} />批量粘贴导入</button><button className="button secondary" onClick={openDemoDraft}>使用演示消息</button></div>
        </div>}

        {!loading && messages.length > 0 && <div className="local-message-list">
          {filteredMessages.map(message => {
            const checked = selected.includes(message.id)
            const channel = channelOf(message)
            return <article key={message.id} className={`local-message ${checked ? 'selected' : ''}`}>
              <button
                type="button"
                className="message-select"
                aria-label={checked ? `取消选择${message.groupName}` : `选择${message.groupName}`}
                aria-pressed={checked}
                onClick={() => toggleSelect(message.id)}
              >{checked && <Check size={14} />}</button>
              <span className="message-avatar">{message.groupName.slice(0, 1)}</span>
              <div className="message-content">
                <div className="message-meta">
                  <span className={`channel-badge ${channel}`}>{CHANNEL_LABELS[channel]}</span>
                  <strong>{message.groupName}</strong>
                  <span>{formatTime(message.sharedAt)}</span>
                  {message.source === 'demo' && <span className="demo-label">演示</span>}
                  {message.analyzedAt && <span className="analyzed-label"><Sparkles size={10} />已分析</span>}
                  <span className="local-badge"><Lock size={10} />本机</span>
                </div>
                <p>{redactText(message.content)}</p>
                <small>预览已自动隐藏手机号、证件号和邮箱</small>
              </div>
              <button type="button" className="icon-button message-delete" aria-label={`删除来自${message.groupName}的本地消息`} onClick={() => removeMessage(message.id)}><Trash2 size={17} /></button>
            </article>
          })}
          {filteredMessages.length === 0 && <p className="channel-empty">这个渠道下还没有消息，切换筛选看看别的。</p>}
        </div>}

        {selectedMessages.length > 0 && <div className="message-selection-bar" role="region" aria-label="消息分析操作">
          <div><Check size={16} /><span>已选 {selectedMessages.length} 条消息</span><small>尚未离开本机</small></div>
          <button className="button primary" onClick={startAnalysis}><Sparkles size={16} />用 AI 分析</button>
        </div>}
      </section>

      <section className="privacy-rules-card">
        <div className="privacy-rules-icon"><Lock size={20} /></div>
        <div><h3>每一次上云，都需要你再次确认</h3><p>分析前会展示确切发送内容并隐藏手机号、证件号和邮箱。拒绝发送不会影响本地消息，AI 结果是否保存到云端也由你决定。</p></div>
        <button className="button secondary" onClick={() => setRulesOpen(true)}>查看规则<ArrowUpRight size={15} /></button>
      </section>

      </>}

      {tab === 'accounts' && <AccountFeed
        library={library}
        subscribed={subscribed}
        onToggleSubscribe={toggleSubscribe}
        onImportArticle={onImportArticle}
        notify={notify}
      />}

      {tab === 'follows' && <FollowSources
        follows={follows}
        onChange={onFollowsChange}
        notify={notify}
        addItem={addItem}
        onImportFromMiniProgram={importFromMiniProgram}
      />}

      {draft && <InlineModal title="导入微信分享" eyebrow={draft.source === 'demo' ? 'DEMO SHARE · 演示数据' : 'SHARED FROM WECHAT'} onClose={closeDraft}>
        <div className="modal-body">
          <div className="local-save-notice"><HardDrive size={18} /><p><strong>这一步只会保存到本机</strong><span>不会上传云端，也不会自动调用 AI 分析。</span></p></div>
          <div className="field"><span>来源渠道</span>
            <div className="channel-picker" role="group" aria-label="来源渠道">
              {CHANNELS.map(channel => <button
                key={channel}
                type="button"
                className={draft.channel === channel ? 'active' : ''}
                aria-pressed={draft.channel === channel}
                onClick={() => setDraft({ ...draft, channel })}
              >{CHANNEL_LABELS[channel]}</button>)}
            </div>
          </div>
          <label className="field"><span>微信群名称</span><input value={draft.groupName} onChange={event => setDraft({ ...draft, groupName: event.target.value })} placeholder="例如：软件创新竞赛通知群" autoFocus /></label>
          <label className="field"><span>分享的消息内容</span><textarea value={draft.content} onChange={event => setDraft({ ...draft, content: event.target.value })} rows={7} placeholder="粘贴你在微信或钉钉中主动复制或分享的消息……" /><small>保存前可删除任何不愿留下的内容。</small></label>
          <div className="privacy-note"><ShieldCheck size={18} /><p><strong>仅保存在当前浏览器</strong><span>清除浏览器站点数据或点击删除后不可恢复。</span></p></div>
          {draftError && <p className="form-error"><CircleAlert size={15} />{draftError}</p>}
        </div>
        <div className="modal-actions"><button className="button secondary" onClick={closeDraft} disabled={saving}>取消</button><button className="button primary" onClick={saveDraft} disabled={saving}>{saving ? <><LoaderCircle className="spin" size={16} />保存中</> : <><HardDrive size={16} />仅保存到本机</>}</button></div>
      </InlineModal>}

      {batch && <InlineModal title="批量导入消息" eyebrow="BATCH IMPORT · 本地优先" onClose={closeBatch} wide>
        <div className="modal-body">
          <div className="local-save-notice"><HardDrive size={18} /><p><strong>先拆分，再整批落到本机</strong><span>拆分结果可以逐条删掉，保存的只是你留下来的部分。</span></p></div>
          <div className="field"><span>来源渠道</span>
            <div className="channel-picker" role="group" aria-label="来源渠道">
              {CHANNELS.map(channel => <button
                key={channel}
                type="button"
                className={batch.channel === channel ? 'active' : ''}
                aria-pressed={batch.channel === channel}
                onClick={() => updateBatchRaw(batch.raw, channel)}
              >{CHANNEL_LABELS[channel]}</button>)}
            </div>
          </div>
          <label className="field"><span>粘贴内容</span>
            <textarea
              value={batch.raw}
              onChange={event => updateBatchRaw(event.target.value)}
              rows={8}
              placeholder={'把复制的多条消息直接粘进来。每条前面单独一行写群名，或用空行分隔：\n\n数学建模交流群\n国赛报名截止 11 月 3 日……'}
              autoFocus
            />
            <small>每条前面单独一行写群名（如“数学建模交流群”）；识别不到群名时按空行切分。</small>
          </label>
          <div className="batch-preview">
            <div className="batch-preview-head"><strong>拆分结果</strong><span>{batch.entries.length} 条</span></div>
            {batch.entries.length === 0 && <p className="batch-empty">还没有可保存的内容，先贴点文字进来。</p>}
            {batch.entries.map((entry, index) => <div className="batch-row" key={`${entry.groupName}-${index}`}>
              <span className="batch-row-index">{index + 1}</span>
              <div><strong>{entry.groupName}</strong><p>{redactText(entry.content).slice(0, 90)}</p></div>
              <button
                type="button"
                className="icon-button"
                aria-label={`移除第${index + 1}条`}
                onClick={() => setBatch({ ...batch, entries: batch.entries.filter((_, i) => i !== index) })}
              ><X size={15} /></button>
            </div>)}
          </div>
          {draftError && <p className="form-error"><CircleAlert size={15} />{draftError}</p>}
        </div>
        <div className="modal-actions">
          <button className="button secondary" onClick={closeBatch} disabled={saving}>取消</button>
          <button className="button primary" onClick={saveBatch} disabled={saving || batch.entries.length === 0}>
            {saving ? <><LoaderCircle className="spin" size={16} />保存中</> : <><HardDrive size={16} />仅保存到本机（{batch.entries.length} 条）</>}
          </button>
        </div>
      </InlineModal>}

      {analysisOpen && <InlineModal title="确认发送给 AI" eyebrow="EXPLICIT CLOUD CONSENT" onClose={() => !analyzing && setAnalysisOpen(false)} wide>
        <div className="modal-body">
          <div className="outbound-warning"><Info size={18} /><p><strong>以下文本将离开本机</strong><span>{realCall
            ? `会逐条发送给你配置的接口（${credentials?.apiModel || modelName}），每次分析仍需在这里确认。`
            : '当前没有接入真实模型凭据，这一步只在本地按规则整理，不会发出任何网络请求。'}</span></p></div>
          <div className="outbound-scope">
            <div><span>来源</span><strong>{selectedMessages.length} 条{channelFilter === 'all' ? '本地消息' : `${CHANNEL_LABELS[channelFilter]}消息`}</strong></div>
            <div><span>隐私清理</span><strong>{hiddenCount > 0 ? `已隐藏 ${selectedMessages.length} 条消息中的敏感片段` : '未发现手机号、证件号或邮箱'}</strong></div>
            <div><span>分析模型</span><strong><Cpu size={12} />{modelName} · {realCall ? '真实调用' : '本地整理'}</strong></div>
          </div>
          <div className="outbound-preview"><div className="outbound-preview-title"><Eye size={15} />将发送的内容</div><pre>{redactedOutboundText}</pre></div>
          <label className="consent-checkbox"><input type="checkbox" checked={analysisConsent} onChange={event => setAnalysisConsent(event.target.checked)} /><span><strong>我确认将上述内容发送给 {modelName} 进行分析</strong><small>每次分析都需要重新确认，不会记住本次授权。</small></span></label>
          {progress && <div className="analysis-progress" role="status"><div><LoaderCircle className="spin" size={15} />正在逐条整理 {progress.done}/{progress.total}</div><span style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }} /></div>}
        </div>
        <div className="modal-actions"><button className="button secondary" onClick={() => setAnalysisOpen(false)} disabled={analyzing}>取消</button><button className="button primary" onClick={analyze} disabled={!analysisConsent || analyzing}>{analyzing ? <><LoaderCircle className="spin" size={16} />正在整理</> : <><Sparkles size={16} />确认并分析</>}</button></div>
      </InlineModal>}

      {rulesOpen && <InlineModal title="本机数据规则" eyebrow="PRIVACY BY DESIGN" onClose={() => setRulesOpen(false)}>
        <div className="modal-body privacy-rule-list">
          <div><strong>不自动读取微信和钉钉</strong><p>Subscriber 没有连接个人账号协议，也不会扫描聊天记录或监听剪贴板。只有你主动分享、粘贴或点“从剪贴板读取”的内容才会进入本机消息箱。</p></div>
          <div><strong>本机存储</strong><p>消息保存在当前浏览器的 IndexedDB 中，不上传云端。清除站点数据、单条删除或清空消息箱都会永久移除记录。</p></div>
          <div><strong>AI 分析按次确认</strong><p>每次点击分析都会展示全部外发文字，并隐藏手机号、证件号和邮箱。未勾选确认不会发送。</p></div>
          <div><strong>逐条整理，不做批量偷跑</strong><p>勾选几条就整理几条，一条消息对应一条信息库条目，进度会实时显示。</p></div>
          <div><strong>可随时退出</strong><p>你可以清空消息、移除已安装应用或停止分享，不需要联系客服。</p></div>
        </div>
        <div className="modal-actions"><button className="button primary" onClick={() => setRulesOpen(false)}>我知道了</button></div>
      </InlineModal>}
    </div>
  )
}

function CloudIcon() {
  return <Share2 size={18} />
}

function GlobeIcon() {
  return <Layers size={15} />
}
