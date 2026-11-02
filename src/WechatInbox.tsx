import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleAlert,
  Eye,
  HardDrive,
  Info,
  LoaderCircle,
  Lock,
  MessagesSquare,
  Plus,
  Share2,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { type Category } from './data'
import SplitText from './SplitText'
import {
  clearLocalMessages,
  clearPendingShare,
  deleteLocalMessage,
  listLocalMessages,
  readPendingShare,
  saveLocalMessage,
  type LocalWechatMessage,
} from './localStore'

interface EditableDraft {
  groupName: string
  content: string
  source: 'wechat-share' | 'demo'
  fromShare?: boolean
}

interface WechatInboxProps {
  addItem: (title: string, category: Category, source: string) => boolean
  notify: (message: string) => void
}

const formatTime = (timestamp: number) => new Intl.DateTimeFormat('zh-CN', {
  month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
}).format(new Date(timestamp))

const redactText = (text: string) => text
  .replace(/1[3-9]\d{9}/g, '[手机号已隐藏]')
  .replace(/\b\d{17}[\dXx]\b/g, '[证件号已隐藏]')
  .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[邮箱已隐藏]')

const inferCategory = (text: string): Category => {
  if (/竞赛|比赛|报名|参赛|选拔/.test(text)) return '竞赛'
  if (/课程|调课|上课|讲座|考试|作业/.test(text)) return '课程通知'
  return '新闻'
}

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

export default function WechatInbox({ addItem, notify }: WechatInboxProps) {
  const isDesktopShell = Boolean(window.subscriberDesktop?.isDesktop)

  const [messages, setMessages] = useState<LocalWechatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string[]>([])
  const [draft, setDraft] = useState<EditableDraft | null>(null)
  const [draftError, setDraftError] = useState('')
  const [saving, setSaving] = useState(false)
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const [analysisConsent, setAnalysisConsent] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
  const outboundText = selectedMessages
    .map(message => `【${message.groupName}】\n${message.content}`)
    .join('\n\n')
  const redactedOutboundText = redactText(outboundText)
  const hiddenCount = Math.max(0, outboundText.length - redactedOutboundText.length)

  const openBlankDraft = () => {
    setDraftError('')
    setDraft({ groupName: '', content: '', source: 'wechat-share' })
  }

  const openDemoDraft = () => {
    setDraftError('')
    setDraft({
      groupName: '2026 软件创新竞赛通知群',
      content: '【竞赛通知】全国大学生软件创新大赛报名开始，三人组队，10月12日23:59前由队长提交报名表。联系人：13800138000。',
      source: 'demo',
    })
  }

  const closeDraft = () => {
    if (saving) return
    if (draft?.fromShare) {
      clearPendingShare().catch(() => notify('分享草稿未能清理，请稍后重试'))
    }
    setDraft(null)
  }

  const saveDraft = async () => {
    if (!draft?.groupName.trim()) { setDraftError('请填写消息所属的微信群名称。'); return }
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

  const startAnalysis = () => {
    if (selectedMessages.length === 0) { notify('请先选择需要分析的消息'); return }
    setAnalysisConsent(false)
    setAnalysisOpen(true)
  }

  const analyze = () => {
    if (!analysisConsent || selectedMessages.length === 0) return
    setAnalyzing(true)
    timer.current = setTimeout(() => {
      const combined = selectedMessages.map(message => message.content).join('\n')
      const firstLine = combined.split(/[\n。！？]/).find(Boolean)?.trim() || '微信群分享摘要'
      const category = inferCategory(combined)
      const added = addItem(
        firstLine.slice(0, 40),
        category,
        `${selectedMessages[0].groupName} · 按需分析`,
      )
      setAnalyzing(false)
      setAnalysisOpen(false)
      if (added) {
        notify('已生成模拟分析结果；正式版此时才会上传你确认的文本')
        setSelected([])
      }
    }, 1100)
  }

  return (
    <div className="wechat-page">
      <section className="page-heading wechat-heading">
        <div><span className="eyebrow">LOCAL-FIRST WECHAT INBOX</span><SplitText tag="h1" text="微信消息" effect="rise" splitType="chars" delay={58} duration={0.8} staggerFrom="start" trigger="load" textAlign="left" className="split-heading" /><p>你不必把整群消息交出去。只分享需要整理的片段，先留在本机。</p></div>
        <div className="wechat-heading-actions"><span className="local-only-chip"><HardDrive size={14} />仅本机</span><button className="button primary" onClick={openBlankDraft}><Plus size={17} />导入分享</button></div>
      </section>

      <section className="share-privacy-hero">
        <div className="share-privacy-copy">
          <span className="briefing-label"><ShieldCheck size={15} />本地优先</span>
          <h2>微信消息不自动读取，<br />由你决定分享哪一段。</h2>
          <p>个人微信群没有面向第三方应用的官方消息读取接口。Subscriber 使用系统分享入口接收你主动选择的内容，不接入协议机器人，也不会在后台扫描聊天。</p>
          <div className="wechat-hero-actions"><button className="light-button" onClick={openBlankDraft}><Share2 size={16} />导入分享内容</button><button className="wechat-demo-button" onClick={openDemoDraft}>载入演示分享</button></div>
        </div>
        <div className="privacy-flow" aria-label="隐私处理流程">
          <div><span>01</span><p><strong>在微信中分享</strong><small>你主动选择消息或复制文本</small></p><MessagesSquare size={18} /></div>
          <ChevronRight size={15} className="flow-arrow" />
          <div><span>02</span><p><strong>保存到本机</strong><small>IndexedDB 本地消息箱</small></p><HardDrive size={18} /></div>
          <ChevronRight size={15} className="flow-arrow" />
          <div><span>03</span><p><strong>确认后分析</strong><small>每次展示外发内容</small></p><CloudIcon /></div>
        </div>
      </section>

      <p className="share-compat-note"><Info size={14} />{isDesktopShell
        ? '桌面版没有系统分享面板可用：在微信里复制消息，回到这里点击“导入分享”粘贴即可，内容依旧只存在本机。'
        : '系统分享入口是否出现在微信面板，取决于手机系统、微信版本和是否已安装 Subscriber。找不到时，请复制消息后点击“导入分享”粘贴。'}</p>

      <section className="local-inbox-section">
        <div className="section-heading local-inbox-heading">
          <div><h2>本机消息箱</h2><span>{messages.length} 条</span></div>
          <div className="inbox-heading-tools">
            <button className="text-button" onClick={() => setRulesOpen(true)}><Eye size={15} />数据规则</button>
            {messages.length > 0 && (confirmClear
              ? <span className="clear-confirm"><span>清空全部？</span><button onClick={clearMessages}>确认清空</button><button onClick={() => setConfirmClear(false)}>取消</button></span>
              : <button className="text-button danger-text" onClick={() => setConfirmClear(true)}><Trash2 size={14} />清空本机</button>)}
          </div>
        </div>

        {loading && <div className="local-message-skeletons">{[1, 2].map(index => <div key={index}><span /><span /><span /></div>)}</div>}

        {!loading && messages.length === 0 && <div className="empty-state wechat-empty">
          <span className="empty-icon"><MessagesSquare size={26} /></span>
          <h3>本机消息箱还是空的</h3>
          <p>{isDesktopShell ? '桌面版请直接粘贴消息：在微信中复制后回到这里点击“导入分享”。' : '安装 Subscriber 后，可从微信分享面板选择它；也可以先粘贴一段消息体验本地导入。'}</p>
          <div className="empty-actions"><button className="button primary" onClick={openBlankDraft}><Share2 size={16} />导入分享内容</button><button className="button secondary" onClick={openDemoDraft}>使用演示消息</button></div>
        </div>}

        {!loading && messages.length > 0 && <div className="local-message-list">
          {messages.map(message => {
            const checked = selected.includes(message.id)
            return <article key={message.id} className={`local-message ${checked ? 'selected' : ''}`}>
              <button
                type="button"
                className="message-select"
                aria-label={checked ? `取消选择${message.groupName}` : `选择${message.groupName}`}
                aria-pressed={checked}
                onClick={() => setSelected(current => checked ? current.filter(id => id !== message.id) : [...current, message.id])}
              >{checked && <Check size={14} />}</button>
              <span className="message-avatar">{message.groupName.slice(0, 1)}</span>
              <div className="message-content">
                <div className="message-meta"><strong>{message.groupName}</strong><span>{formatTime(message.sharedAt)}</span>{message.source === 'demo' && <span className="demo-label">演示</span>}<span className="local-badge"><Lock size={10} />本机</span></div>
                <p>{redactText(message.content)}</p>
                <small>预览已自动隐藏手机号、证件号和邮箱</small>
              </div>
              <button type="button" className="icon-button message-delete" aria-label={`删除来自${message.groupName}的本地消息`} onClick={() => removeMessage(message.id)}><Trash2 size={17} /></button>
            </article>
          })}
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

      {draft && <InlineModal title="导入微信分享" eyebrow={draft.source === 'demo' ? 'DEMO SHARE · 演示数据' : 'SHARED FROM WECHAT'} onClose={closeDraft}>
        <div className="modal-body">
          <div className="local-save-notice"><HardDrive size={18} /><p><strong>这一步只会保存到本机</strong><span>不会上传云端，也不会自动调用 AI 分析。</span></p></div>
          <label className="field"><span>微信群名称</span><input value={draft.groupName} onChange={event => setDraft({ ...draft, groupName: event.target.value })} placeholder="例如：软件创新竞赛通知群" autoFocus /></label>
          <label className="field"><span>分享的消息内容</span><textarea value={draft.content} onChange={event => setDraft({ ...draft, content: event.target.value })} rows={7} placeholder="粘贴你在微信中主动复制或分享的消息……" /><small>保存前可删除任何不愿留下的内容。</small></label>
          <div className="privacy-note"><ShieldCheck size={18} /><p><strong>仅保存在当前浏览器</strong><span>清除浏览器站点数据或点击删除后不可恢复。</span></p></div>
          {draftError && <p className="form-error"><CircleAlert size={15} />{draftError}</p>}
        </div>
        <div className="modal-actions"><button className="button secondary" onClick={closeDraft} disabled={saving}>取消</button><button className="button primary" onClick={saveDraft} disabled={saving}>{saving ? <><LoaderCircle className="spin" size={16} />保存中</> : <><HardDrive size={16} />仅保存到本机</>}</button></div>
      </InlineModal>}

      {analysisOpen && <InlineModal title="确认发送给 AI" eyebrow="EXPLICIT CLOUD CONSENT" onClose={() => !analyzing && setAnalysisOpen(false)} wide>
        <div className="modal-body">
          <div className="outbound-warning"><Info size={18} /><p><strong>以下文本将离开本机</strong><span>当前为原型演示，不会真实上传。正式版只会发送你在这个窗口中确认的内容。</span></p></div>
          <div className="outbound-scope"><div><span>来源</span><strong>{selectedMessages.length} 条微信消息</strong></div><div><span>隐私清理</span><strong>{hiddenCount > 0 ? `已隐藏 ${selectedMessages.length} 条消息中的敏感片段` : '未发现手机号、证件号或邮箱'}</strong></div></div>
          <div className="outbound-preview"><div className="outbound-preview-title"><Eye size={15} />将发送的内容</div><pre>{redactedOutboundText}</pre></div>
          <label className="consent-checkbox"><input type="checkbox" checked={analysisConsent} onChange={event => setAnalysisConsent(event.target.checked)} /><span><strong>我确认将上述内容发送给云端模型进行分析</strong><small>每次分析都需要重新确认，不会记住本次授权。</small></span></label>
        </div>
        <div className="modal-actions"><button className="button secondary" onClick={() => setAnalysisOpen(false)} disabled={analyzing}>取消</button><button className="button primary" onClick={analyze} disabled={!analysisConsent || analyzing}>{analyzing ? <><LoaderCircle className="spin" size={16} />正在模拟分析</> : <><Sparkles size={16} />确认并分析</>}</button></div>
      </InlineModal>}

      {rulesOpen && <InlineModal title="本机数据规则" eyebrow="PRIVACY BY DESIGN" onClose={() => setRulesOpen(false)}>
        <div className="modal-body privacy-rule-list">
          <div><strong>不自动读取微信</strong><p>Subscriber 没有连接个人微信协议，也不会扫描聊天记录。只有你主动分享或粘贴的内容才会进入本机消息箱。</p></div>
          <div><strong>本机存储</strong><p>分享内容保存在当前浏览器的 IndexedDB 中，不上传云端。清除站点数据、单条删除或清空消息箱都会永久移除记录。</p></div>
          <div><strong>AI 分析按次确认</strong><p>每次点击分析都会展示全部外发文字，并隐藏手机号、证件号和邮箱。未勾选确认不会发送。</p></div>
          <div><strong>不替你做云端决定</strong><p>正式版中，分析结果是否保存到云端会单独询问；拒绝保存不会删除本机原始消息。</p></div>
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
