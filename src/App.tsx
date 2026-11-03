import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Bookmark,
  BookOpen,
  CalendarDays,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  Cloud,
  Compass,
  Copy,
  Cpu,
  FileText,
  GitBranch,
  Globe2,
  GraduationCap,
  Heart,
  Inbox,
  Layers3,
  Library,
  Link2,
  LoaderCircle,
  MessagesSquare,
  Newspaper,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Trophy,
  Upload,
  X,
  Globe,
} from 'lucide-react'
import { categoryMeta, initialItems, type AddItemResult, type Category, type InfoItem, type NewItemInput, type View } from './data'
import { buildLiveItems, currentFetchedAt, formatFetchedAt, liveSnapshot, setLiveFetchedAt } from './liveSnapshot'
import { classifyLibrary, deadlineDays, deadlineLabel, findExistingItem, inferCategory, parseDateText, STATUS_LABEL, type Classification } from './classify'
import { officialAccounts, type AccountArticle } from './accounts'
import GradientASCII from './GradientASCII'
import SplitText from './SplitText'
import WechatInbox from './WechatInbox'
import LlmPicker from './LlmPicker'
import TaxonomyModal from './TaxonomyModal'
import { DEFAULT_MODEL_ID, resolveModel } from './llmModels'
import { readCredentials, summarizeWithLlm } from './llmClient'
import { readPreference, writePreference } from './localStore'
import { enabledLiveSourceIds, readFollows, saveFollows, type FollowedSource } from './follows'
import { isImportableDrag, readDroppedContent } from './dropImport'

const navItems: { id: View; label: string; icon: typeof Inbox }[] = [
  { id: 'today', label: '今日精选', icon: Inbox },
  { id: 'library', label: '全部信息', icon: Library },
  { id: 'wechat', label: '消息与订阅', icon: MessagesSquare },
  { id: 'favorites', label: '我的收藏', icon: Bookmark },
  { id: 'review', label: '完成回顾', icon: CheckCircle2 },
]

const categoryIcons = { 竞赛: Trophy, 新闻: Newspaper, 课程通知: GraduationCap }
const subscriptionKey = (title: string) => title.trim().toLowerCase().replace(/[\s\-—_·，。、“”‘’（）()《》]/g, '')
const MODEL_KEY = 'subscriber-llm-model'

function todayEyebrow(): string {
  const now = new Date()
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(now).toUpperCase()
  const rest = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' }).format(now).toUpperCase()
  return `${weekday} · ${rest}`
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand">
      <span className="brand-mark"><Layers3 size={20} strokeWidth={2.2} /></span>
      {!compact && <><span className="brand-name">Subscriber</span><span className="brand-beta">BETA</span></>}
    </div>
  )
}

function Tag({ category }: { category: Category }) {
  const Icon = categoryIcons[category]
  return <span className={`category-tag ${categoryMeta[category].className}`}><Icon size={12} />{category}</span>
}

function IconButton({ label, children, active = false, onClick, className = '' }: {
  label: string
  children: React.ReactNode
  active?: boolean
  onClick?: () => void
  className?: string
}) {
  return <button type="button" aria-label={label} title={label} className={`icon-button ${active ? 'active' : ''} ${className}`} onClick={onClick}>{children}</button>
}

function ItemCard({ entry, onOpen, onFavorite, onComplete }: {
  entry: Classification
  onOpen: () => void
  onFavorite: () => void
  onComplete: () => void
}) {
  const { item, version, duplicateCount, status } = entry
  const showExtras = Boolean(item.officialUrl) || item.category === '竞赛' || version > 1 || duplicateCount > 0 || status === 'expired'
  return (
    <article className={`info-card ${item.completed ? 'is-completed' : ''}`}>
      <button className="card-main" onClick={onOpen} aria-label={`查看${item.title}`}>
        <div className="card-meta">
          <Tag category={item.category} />
          <span className="source-type">{item.sourceType}</span>
          {item.priority === 'high' && !item.completed && <span className="priority-dot">重点关注</span>}
          {version > 1 && <span className="version-chip"><GitBranch size={11} />V{version}</span>}
          {status === 'expired' && <span className="status-chip expired">已截止</span>}
          {status === 'unconfirmed' && <span className="status-chip pending">日期待核对</span>}
        </div>
        <h3>{item.title}</h3>
        <p>{item.summary}</p>
        <div className="card-footer">
          <span className="source-name">{item.source}</span>
          <span className="meta-separator" />
          <span>{item.publishedAt}</span>
          {item.deadline && (status === 'expired'
            ? <span className="deadline expired"><Clock3 size={13} />已截止</span>
            : <span className={`deadline ${deadlineDays(item) === 0 ? 'urgent' : ''}`}><Clock3 size={13} />{deadlineLabel(item)}</span>)}
        </div>
      </button>
      <div className="card-actions">
        <IconButton label={item.favorite ? '取消收藏' : '收藏'} active={item.favorite} onClick={onFavorite}><Bookmark size={18} fill={item.favorite ? 'currentColor' : 'none'} /></IconButton>
        <IconButton label={item.completed ? '取消完成' : '标记完成'} active={item.completed} onClick={onComplete}><CheckCircle2 size={18} /></IconButton>
      </div>
      {showExtras && (
        <div className="card-extras">
          {item.officialUrl
            ? <a className="official-link" href={item.officialUrl} target="_blank" rel="noopener noreferrer" aria-label={`打开${item.title}的赛事官网`}>赛事官网<ArrowUpRight size={12} /></a>
            : item.category === '竞赛' ? <span className="official-missing"><Globe2 size={12} />官网待核对</span> : null}
          {version > 1 && <button type="button" className="extra-note" onClick={onOpen}><GitBranch size={12} />V{version} · 已合并 {entry.versions.length} 个版本</button>}
          {duplicateCount > 0 && <span className="extra-note"><Layers3 size={12} />已自动合并 {duplicateCount} 条重复</span>}
          {status === 'expired' && <span className="extra-note danger">报名已结束，保留留档</span>}
        </div>
      )}
    </article>
  )
}

function EmptyState({ type, onReset }: { type: 'search' | 'favorite' | 'review'; onReset?: () => void }) {
  const content = {
    search: { icon: Search, title: '没有找到匹配的信息', text: '试试更换关键词或切换信息分类。' },
    favorite: { icon: Bookmark, title: '收藏夹还是空的', text: '遇到想稍后阅读的内容，点击收藏就能在这里找到。' },
    review: { icon: CheckCircle2, title: '还没有完成记录', text: '读完通知或参加活动后，手动标记完成即可生成回顾。' },
  }[type]
  const Icon = content.icon
  return (
    <div className="empty-state">
      <span className="empty-icon"><Icon size={24} /></span>
      <h3>{content.title}</h3><p>{content.text}</p>
      {onReset && <button className="text-button" onClick={onReset}>清除筛选<ArrowRight size={15} /></button>}
    </div>
  )
}

function ModalShell({ title, eyebrow, onClose, children, wide = false, className = '' }: {
  title: string
  eyebrow?: string
  onClose: () => void
  children: React.ReactNode
  wide?: boolean
  className?: string
}) {
  const containerRef = useRef<HTMLElement | null>(null)
  const closeRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section ref={containerRef} className={`modal ${wide ? 'modal-wide' : ''} ${className}`} role="dialog" aria-modal="true" aria-label={title} onMouseDown={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div>
          <button ref={closeRef} type="button" className="icon-button" aria-label="关闭" onClick={onClose}><X size={20} /></button>
        </div>
        {children}
      </section>
    </div>
  )
}

function ImportModal({ onClose, onAdd, notify, modelName }: {
  onClose: () => void
  onAdd: (input: NewItemInput) => AddItemResult
  notify: (message: string) => void
  modelName: string
}) {
  const [tab, setTab] = useState<'text' | 'file' | 'link'>('text')
  const [text, setText] = useState('')
  const [link, setLink] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [category, setCategory] = useState<Category>('竞赛')
  const [error, setError] = useState('')
  const [processing, setProcessing] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
    abortRef.current?.abort()
  }, [])

  // 输入内容一变就给出分类建议，让「系统怎么判断的」在导入时也可见
  const guess = useMemo(() => {
    const source = tab === 'text' ? text : tab === 'link' ? link : file?.name ?? ''
    return source.trim() ? inferCategory(source) : null
  }, [tab, text, link, file])

  const chooseFile = (selected?: File) => {
    setError('')
    if (!selected) return
    const allowed = ['txt', 'doc', 'docx', 'pdf', 'png', 'jpg', 'jpeg', 'ppt', 'pptx']
    const extension = selected.name.split('.').pop()?.toLowerCase() || ''
    if (!allowed.includes(extension)) { setError('首版仅支持文字、Word、PDF、图片和普通 PPT。'); return }
    if (selected.size > 30 * 1024 * 1024) { setError('原型演示单个文件上限为 30 MB。'); return }
    setFile(selected)
  }

  const submit = async () => {
    if (tab === 'text' && !text.trim()) { setError('请先粘贴需要整理的文字。'); return }
    if (tab === 'link' && !/^https?:\/\/.+/.test(link.trim())) { setError('请输入以 http:// 或 https:// 开头的公开链接。'); return }
    if (tab === 'file' && !file) { setError('请选择一个需要解析的文件。'); return }
    setError('')
    setProcessing(true)

    // P2：粘贴文字且已保存凭据时，真实调用所选厂商的 OpenAI 兼容接口
    const credentials = tab === 'text' ? readCredentials() : null
    if (credentials) {
      const controller = new AbortController()
      abortRef.current = controller
      try {
        const summary = await summarizeWithLlm(text, credentials, controller.signal)
        const title = text.trim().split(/[\n。！？]/)[0].slice(0, 38) || '新导入的信息'
        const result = onAdd({
          title,
          category,
          source: '手动粘贴 · 真实模型整理',
          summary: summary.summary,
          evidence: summary.evidence ?? '模型未返回原文摘录，请对照原文人工核对。',
          keyPoints: summary.keyPoints.length > 0 ? summary.keyPoints : ['核对原始来源与发布时间', '确认关键日期与参与要求'],
          deadline: summary.deadline ?? (category === '竞赛' ? '日期待核对' : undefined),
          tags: [category, '模型整理'],
        })
        if (!result.ok) { setProcessing(false); return }
        notify(`已通过 ${modelName} 完成真实整理`)
        onClose()
        return
      } catch (requestError) {
        if (controller.signal.aborted) { setProcessing(false); return }
        const message = requestError instanceof Error ? requestError.message : String(requestError)
        notify(`真实模型调用失败，已用演示整理兜底：${message}`)
      }
    }

    timer.current = setTimeout(() => {
      const title = tab === 'file' && file ? file.name.replace(/\.[^.]+$/, '') : tab === 'link' ? '公开链接导入的竞赛信息' : text.trim().split(/[\n。！？]/)[0].slice(0, 38) || '新导入的信息'
      const source = tab === 'file' ? '本地上传 · 按需解析' : tab === 'link' ? '公开链接 · 用户导入' : '手动粘贴 · 用户导入'
      const result = onAdd({
        title,
        category,
        source,
        summary: '这是原型生成的模拟摘要。正式版将在这里呈现 AI 从原始内容中提取的重点与待办。',
        evidence: '原型未读取真实内容。正式版会在此展示与关键字段对应的原文段落，方便核对。',
        keyPoints: ['核对原始来源与发布时间', '确认关键日期与参与要求', '补充个人待办或标记完成'],
        deadline: category === '竞赛' ? '日期待核对' : undefined,
        tags: [category, '待核对'],
      })
      if (!result.ok) {
        setProcessing(false)
        return
      }
      notify('已加入信息库，原型已生成模拟整理结果')
      onClose()
    }, 1200)
  }

  return (
    <ModalShell title="导入一条信息" eyebrow="MANUAL IMPORT" onClose={processing ? () => {} : onClose}>
      <div className="import-tabs" role="tablist">
        {([['text', FileText, '粘贴文字'], ['file', Upload, '上传文件'], ['link', Link2, '公开链接']] as const).map(([id, Icon, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => { setTab(id); setError('') }}><Icon size={17} />{label}</button>
        ))}
      </div>
      <div className="modal-body">
        {tab === 'text' && <label className="field"><span>信息内容</span><textarea value={text} onChange={e => setText(e.target.value)} placeholder="粘贴竞赛通知、课程安排或新闻正文……" rows={7} autoFocus /></label>}
        {tab === 'link' && <label className="field"><span>公开网页链接</span><div className="input-with-icon"><Link2 size={18} /><input value={link} onChange={e => setLink(e.target.value)} placeholder="https:// 公开且允许访问的页面" autoFocus /></div><small>正式版仅读取无需登录且允许使用的公开内容。</small></label>}
        {tab === 'file' && <div className={`file-drop ${file ? 'has-file' : ''}`}>
          <input id="file-input" type="file" accept=".txt,.doc,.docx,.pdf,.png,.jpg,.jpeg,.ppt,.pptx" onChange={e => chooseFile(e.target.files?.[0])} />
          <label htmlFor="file-input">
            {file ? <><span className="file-icon"><FileText size={23} /></span><strong>{file.name}</strong><span>{(file.size / 1024 / 1024).toFixed(2)} MB · 点击重新选择</span></> : <><span className="upload-icon"><Upload size={23} /></span><strong>选择需要整理的文件</strong><span>Word、PDF、图片或普通 PPT，最大 30 MB</span></>}
          </label>
        </div>}
        <label className="field"><span>信息分类</span><div className="category-options">{(['竞赛', '新闻', '课程通知'] as Category[]).map(item => <button type="button" key={item} className={category === item ? 'selected' : ''} onClick={() => setCategory(item)}>{item}{category === item && <Check size={14} />}</button>)}</div></label>
        {guess && guess.confidence >= 55 && (
          <div className="category-suggestion">
            <Sparkles size={13} />
            <span>分类引擎建议 <strong>{guess.category}</strong> · 置信度 {guess.confidence}%{guess.matched.length > 0 ? `（命中「${guess.matched.slice(0, 3).join('、')}」）` : ''}</span>
            {category !== guess.category && <button type="button" onClick={() => setCategory(guess.category)}>采用</button>}
          </div>
        )}
        <div className="privacy-note"><ShieldCheck size={18} /><p><strong>原文件按需上传</strong><span>原型不会读取或上传你的文件；正式版会在处理前明确提示。</span></p></div>
        {error && <p className="form-error"><CircleAlert size={15} />{error}</p>}
      </div>
      <div className="modal-actions">
        <span className="ai-note"><Cpu size={14} />将由 {modelName} 整理 · {tab === 'text' && readCredentials() ? '真实调用' : '演示'}</span>
        <button className="button secondary" onClick={onClose} disabled={processing}>取消</button>
        <button className="button primary" onClick={submit} disabled={processing}>{processing ? <><LoaderCircle className="spin" size={17} />{tab === 'text' && readCredentials() ? '正在调用模型' : '正在模拟整理'}</> : <><Sparkles size={17} />开始整理</>}</button>
      </div>
    </ModalShell>
  )
}

function DiscoverModal({ onClose, onAdd, notify, subscribedKeys }: {
  onClose: () => void
  onAdd: (input: NewItemInput) => AddItemResult
  notify: (message: string) => void
  subscribedKeys: string[]
}) {
  const [query, setQuery] = useState('大学生 人工智能 创新竞赛')
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  const results = [
    { title: '大学生人工智能创新应用竞赛作品征集', source: '高校创新实践中心 · 公开网页', deadline: '11月12日截止', text: '面向在校学生征集人工智能创新应用方案，需提交项目计划书与作品原型。' },
    { title: '生成式人工智能应用设计校园赛通知', source: '计算机学院 · 公开公告', deadline: '11月18日截止', text: '鼓励围绕学习、公益与校园服务设计生成式人工智能应用，支持跨专业组队。' },
  ]
  const search = () => {
    if (!query.trim()) return
    setLoading(true); setSearched(false)
    timer.current = setTimeout(() => { setLoading(false); setSearched(true) }, 1000)
  }
  return (
    <ModalShell title="从公开网页发现" eyebrow="PUBLIC WEB DISCOVERY" onClose={onClose} wide>
      <div className="modal-body">
        <div className="search-disclosure"><Globe2 size={17} /><span>仅检索公开且允许使用的内容，结果保留来源供你核对。</span><span className="demo-label">模拟结果</span></div>
        <form className="discover-search" onSubmit={e => { e.preventDefault(); search() }}><Search size={19} /><input aria-label="公开检索关键词" value={query} onChange={e => setQuery(e.target.value)} placeholder="输入竞赛名称、学校或关键词" /><button className="button primary" disabled={loading || !query.trim()}>{loading ? <LoaderCircle className="spin" size={17} /> : '检索'}</button></form>
        {!searched && !loading && <div className="discover-placeholder"><span><Compass size={27} /></span><h3>从一个关键词开始</h3><p>正式版将搜索公开网页，提取日期和参赛要求，并让每条结论都能回到原文。</p><div className="suggestion-row"><button onClick={() => setQuery('大学生 数学建模 竞赛')}>数学建模</button><button onClick={() => setQuery('大学生 创新创业 项目申报')}>创新创业</button><button onClick={() => setQuery('大学生 英语 竞赛')}>英语竞赛</button></div></div>}
        {loading && <div className="result-skeletons">{[1, 2].map(i => <div className="result-skeleton" key={i}><span /><span /><span /></div>)}</div>}
        {searched && !loading && <div className="discover-results">
          <div className="result-count">找到 2 条模拟信息 · 检索时间 刚刚</div>
          {results.map(result => {
            const subscribed = subscribedKeys.includes(subscriptionKey(result.title))
            return <article className="discover-result" key={result.title}>
              <div><div className="card-meta"><Tag category="竞赛" /><span className="deadline"><Clock3 size={13} />{result.deadline}</span></div><h3>{result.title}</h3><p>{result.text}</p><span className="result-source"><Globe2 size={13} />{result.source}</span></div>
              <button className={`button ${subscribed ? 'collected' : 'secondary'}`} disabled={subscribed} onClick={() => {
                const added = onAdd({ title: result.title, category: '竞赛', source: result.source, summary: result.text, sourceType: '公开检索', deadline: result.deadline.replace('截止', ''), tags: ['人工智能', '公开检索'] })
                if (added.ok) notify('已订阅并加入竞赛信息库')
              }}>{subscribed ? <><Check size={16} />已订阅</> : <><Plus size={16} />订阅</>}</button>
            </article>
          })}
        </div>}
      </div>
    </ModalShell>
  )
}

function DetailDrawer({ entry, onClose, onFavorite, onLike, onComplete, onCompare, notify }: {
  entry: Classification
  onClose: () => void
  onFavorite: () => void
  onLike: () => void
  onComplete: () => void
  onCompare: () => void
  notify: (message: string) => void
}) {
  const { item, versions, status, confidence, matched, duplicateCount, topics } = entry
  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside className="detail-drawer" role="dialog" aria-modal="true" aria-label="信息详情" onMouseDown={e => e.stopPropagation()}>
        <div className="drawer-top"><button className="back-button" onClick={onClose}><ArrowLeft size={18} />返回</button><span className="demo-label">演示信息</span></div>
        <div className="drawer-content">
          <div className="card-meta">
            <Tag category={item.category} />
            <span className="source-type">{item.sourceType}</span>
            {versions.length > 1 && <span className="version-chip"><GitBranch size={11} />V{versions.length}</span>}
            <span className={`status-chip ${status === 'expired' ? 'expired' : status === 'unconfirmed' ? 'pending' : 'live'}`}>{STATUS_LABEL[status]}</span>
          </div>
          <h2>{item.title}</h2>
          <p className="detail-summary">{item.summary}</p>
          <div className="detail-actions"><button className={`button ${item.completed ? 'completed' : 'primary'}`} onClick={onComplete}>{item.completed ? <><CheckCheck size={17} />已完成</> : <><Check size={17} />标记完成</>}</button><IconButton label={item.favorite ? '取消收藏' : '收藏'} active={item.favorite} onClick={onFavorite}><Bookmark size={19} fill={item.favorite ? 'currentColor' : 'none'} /></IconButton><IconButton label={item.liked ? '取消喜欢' : '喜欢'} active={item.liked} onClick={onLike}><Heart size={19} fill={item.liked ? 'currentColor' : 'none'} /></IconButton></div>
          <section className="detail-section"><h3>关键信息</h3><dl className="key-info">
            {item.deadline && <><dt>报名截止</dt><dd className="accent-text">{item.deadline}</dd></>}
            {item.eventDate && <><dt>活动时间</dt><dd>{item.eventDate}</dd></>}
            {item.location && <><dt>地点 / 方式</dt><dd>{item.location}</dd></>}
            {item.eligibility && <><dt>参与对象</dt><dd>{item.eligibility}</dd></>}
            {item.organizer && <><dt>主办方</dt><dd>{item.organizer}</dd></>}
          </dl></section>
          <section className="detail-section"><h3>需要留意</h3><ul className="key-points">{item.keyPoints.map(point => <li key={point}><Check size={15} />{point}</li>)}</ul></section>

          {versions.length > 1 && <section className="detail-section version-section">
            <h3>版本记录<span className="section-badge">{versions.length} 个版本</span><button type="button" className="text-button version-compare-trigger" onClick={onCompare}><GitBranch size={13} />并排对比</button></h3>
            <ol className="version-timeline">
              {versions.map(version => (
                <li key={version.id} className={version.version === versions.length ? 'current' : 'past'}>
                  <span className="version-tag">V{version.version}</span>
                  <div>
                    <strong>{version.title}</strong>
                    <small>{version.source} · {version.publishedAt}{version.deadline ? ` · 截止 ${version.deadline}` : ''}</small>
                    <em>{version.changeNote}{version.version === versions.length ? ' · 当前版本' : ' · 已被后续版本取代'}</em>
                  </div>
                </li>
              ))}
            </ol>
          </section>}

          <section className="detail-section">
            <h3>分类与去重</h3>
            <dl className="key-info classify-facts">
              <dt>内容类型</dt><dd>{item.category} · 匹配度 {confidence}%{matched.length > 0 ? `（${matched.join('、')}）` : ''}</dd>
              <dt>时效状态</dt><dd>{STATUS_LABEL[status]}</dd>
              <dt>主题标签</dt><dd>{topics.length > 0 ? topics.join(' · ') : '待补充'}</dd>
              <dt>重复来源</dt><dd>{duplicateCount > 0 ? `已自动合并 ${duplicateCount} 条重复` : '未发现重复来源'}</dd>
              {versions.length > 1 && <><dt>最新版本</dt><dd className="accent-text">V{versions.length} · {versions[versions.length - 1].changeNote}</dd></>}
            </dl>
          </section>

          <section className="evidence-section"><div className="evidence-title"><BookOpen size={16} /><h3>原文依据</h3></div><blockquote>{item.evidence}</blockquote><p>重要日期请以原始通知为准{item.liveSourceId ? <>，本条来自官网自动采集（{formatFetchedAt(currentFetchedAt())}）</> : ''}</p></section>
          <div className="tag-list">{item.tags.map(tag => <span key={tag}>#{tag}</span>)}</div>
        </div>
        <div className="drawer-footer">
          <div><strong>{item.source}</strong><span>{item.publishedAt}</span></div>
          <div className="drawer-footer-actions">
            {item.officialUrl
              ? <a className="button secondary" href={item.officialUrl} target="_blank" rel="noopener noreferrer">查看原文<ArrowUpRight size={15} /></a>
              : <button className="button secondary" onClick={() => notify('原型保留原文入口，正式版将跳转到原始页面')}>查看原文</button>}
            {(item.officialHome ?? item.officialUrl)
              ? <a className="button primary" href={item.officialHome ?? item.officialUrl} target="_blank" rel="noopener noreferrer">赛事官网<ArrowUpRight size={15} /></a>
              : item.category === '竞赛' ? <button className="button secondary" disabled title="尚未核实到官网入口">官网待核对</button> : null}
          </div>
        </div>
      </aside>
    </div>
  )
}

function DigestModal({ items, stats, modelName, onClose, onOpenItem, notify }: {
  items: InfoItem[]
  stats: { expiring: number; versionGroups: number; raw: number }
  modelName: string
  onClose: () => void
  onOpenItem: (item: InfoItem) => void
  notify: (message: string) => void
}) {
  const now = new Date()
  const day = String(now.getDate())
  const monthShort = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(now).toUpperCase()
  const copyDigest = async () => {
    const text = `Subscriber · 今日精选\n${items.map((item, index) => `${index + 1}. ${item.title}${item.deadline ? `（${item.deadline}截止）` : ''}`).join('\n')}`
    try { await navigator.clipboard.writeText(text); notify('今日摘要已复制') } catch { notify('当前浏览器未允许复制，请稍后重试') }
  }
  return (
    <ModalShell title="今天，值得关注这些" eyebrow={`DAILY BRIEFING · ${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`} onClose={onClose} wide className="digest-modal">
      <div className="digest-cover" aria-hidden="true">
        <div>
          <span className="eyebrow">TODAY&apos;S PICKS</span>
          <h2>{stats.expiring} 项临近截止，<br />{stats.versionGroups} 组信息有过更新。</h2>
        </div>
        <span className="digest-date">{day}<small>{monthShort}</small></span>
      </div>
      <div className="digest-intro"><p>从 {stats.raw} 条原始信息中去重、合并版本后，为你留下 <strong>{items.length} 条重点</strong>。优先处理临近截止的竞赛，再留意课程变化。</p></div>
      <div className="digest-list">{items.map((item, index) => <button key={item.id} style={{ '--digest-index': index } as React.CSSProperties} onClick={() => { onClose(); onOpenItem(item) }}><span className="digest-index">0{index + 1}</span><div><Tag category={item.category} /><h3>{item.title}</h3><p>{item.summary}</p></div><ChevronRight size={19} /></button>)}</div>
      <div className="modal-actions digest-actions">
        <span className="ai-note"><Sparkles size={15} />摘要由 {modelName} 生成 · 演示数据</span>
        <button className="button secondary" onClick={copyDigest}><Copy size={16} />复制摘要</button>
        <button className="button primary" onClick={onClose}>开始浏览<ArrowRight size={16} /></button>
      </div>
    </ModalShell>
  )
}

/* ------------------------- P4：版本对比与回顾分期工具 ------------------------- */

const DAY_MS = 86_400_000
const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
type ReviewPeriod = 'week' | 'month' | 'all'

const REVIEW_PERIOD_LABEL: Record<ReviewPeriod, string> = { week: '本周', month: '本月', all: '全部' }
const REVIEW_PERIOD_PHRASE: Record<ReviewPeriod, string> = { week: '本周', month: '本月', all: '这段时间' }

/** 周一为一周起点，与「本周完成」的直觉一致。 */
function startOfWeek(date: Date): number {
  const copy = new Date(date)
  const offset = (copy.getDay() + 6) % 7
  copy.setDate(copy.getDate() - offset)
  copy.setHours(0, 0, 0, 0)
  return copy.getTime()
}

/** 完成时间目前是「今天 / 10月28日」这类文本，统一换算成时间戳供分期使用。 */
function completedTimestamp(item: InfoItem): number | null {
  if (!item.completedAt) return null
  if (/今天|刚刚/.test(item.completedAt)) return Date.now()
  return parseDateText(item.completedAt)
}

function inReviewPeriod(timestamp: number | null, period: ReviewPeriod, now = new Date()): boolean {
  if (period === 'all') return true
  if (timestamp === null) return false
  if (period === 'month') {
    const date = new Date(timestamp)
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
  }
  const weekStart = startOfWeek(now)
  return timestamp >= weekStart && timestamp < weekStart + 7 * DAY_MS
}

function reviewGroupOf(timestamp: number | null, period: ReviewPeriod): { key: string; label: string } {
  if (timestamp === null) return { key: 'unknown', label: '完成日期待核对' }
  const date = new Date(timestamp)
  const month = date.getMonth() + 1
  const day = date.getDate()
  if (period === 'all') return { key: `${date.getFullYear()}-${month}`, label: `${date.getFullYear()} 年 ${month} 月` }
  return { key: `${date.getFullYear()}-${month}-${day}`, label: `${month}月${day}日 · ${WEEKDAY_LABELS[date.getDay()]}` }
}

/** 临近截止排序：未截止的按时间正序，无日期的居中，已截止的按时间倒序垫底。 */
function deadlineRank(item: InfoItem): { group: number; value: number } {
  const parsed = item.deadlineTs ? Date.parse(item.deadlineTs) : parseDateText(item.deadline)
  if (parsed === null || Number.isNaN(parsed)) return { group: 1, value: 0 }
  return parsed >= Date.now() ? { group: 0, value: parsed } : { group: 2, value: -parsed }
}

function VersionCompareModal({ entry, resolveItem, onClose }: {
  entry: Classification
  resolveItem: (id: number) => InfoItem | undefined
  onClose: () => void
}) {
  const versions = entry.versions
  const [leftId, setLeftId] = useState(versions[0].id)
  const [rightId, setRightId] = useState(versions[versions.length - 1].id)
  const left = versions.find(version => version.id === leftId) ?? versions[0]
  const right = versions.find(version => version.id === rightId) ?? versions[versions.length - 1]
  const leftItem = resolveItem(left.id)
  const rightItem = resolveItem(right.id)
  const rows = [
    { label: '标题', left: left.title, right: right.title },
    { label: '摘要', left: leftItem?.summary ?? '未提供', right: rightItem?.summary ?? '未提供' },
    { label: '报名截止', left: left.deadline ?? '未标注', right: right.deadline ?? '未标注' },
    { label: '发布时间', left: left.publishedAt, right: right.publishedAt },
    { label: '来源', left: left.source, right: right.source },
    { label: '版本说明', left: left.changeNote, right: right.changeNote },
  ]
  const changedCount = rows.filter(row => row.left !== row.right).length

  const picker = (value: number, onChange: (id: number) => void, label: string) => (
    <label className="compare-picker-field">
      <span>{label}</span>
      <select value={value} onChange={event => onChange(Number(event.target.value))}>
        {versions.map(version => <option key={version.id} value={version.id}>V{version.version} · {version.publishedAt}</option>)}
      </select>
    </label>
  )

  return (
    <ModalShell title="版本对比" eyebrow={`VERSION DIFF · ${changedCount} 处变化`} onClose={onClose} wide className="compare-modal">
      <div className="modal-body">
        <div className="compare-picker">
          {picker(left.id, setLeftId, '旧版本')}
          <ArrowRight size={16} />
          {picker(right.id, setRightId, '新版本')}
          <button type="button" className="text-button" onClick={() => { setLeftId(versions[0].id); setRightId(versions[versions.length - 1].id) }}>最早 → 最新</button>
        </div>
        <div className="compare-table">
          <div className="compare-head"><span>字段</span><span>V{left.version}</span><span>V{right.version}</span><span>变化</span></div>
          {rows.map(row => {
            const changed = row.left !== row.right
            return (
              <div className={`compare-row ${changed ? 'changed' : ''}`} key={row.label}>
                <span className="compare-label">{row.label}</span>
                <span className="compare-value old">{row.left}</span>
                <span className="compare-value new">{row.right}</span>
                <span className={`compare-flag ${changed ? 'changed' : 'same'}`}>{changed ? '已变更' : '一致'}</span>
              </div>
            )
          })}
        </div>
        <p className="compare-note">差异来自官方原文与转载的不同表述；重要日期请以最新版本的原文依据为准，旧版本仅作留档。</p>
      </div>
      <div className="modal-actions">
        <span className="ai-note"><GitBranch size={14} />共 {versions.length} 个版本，本事件已折叠 {entry.duplicateCount} 条重复来源</span>
        <button className="button primary" onClick={onClose}>关闭</button>
      </div>
    </ModalShell>
  )
}

export default function App() {
  const [view, setView] = useState<View>('today')
  const [items, setItems] = useState<InfoItem[]>(() => [...initialItems, ...buildLiveItems()])
  const itemsRef = useRef<InfoItem[]>(items)
  const idRef = useRef(Date.now())
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [discoverOpen, setDiscoverOpen] = useState(false)
  const [taxonomyOpen, setTaxonomyOpen] = useState(false)
  const [digestOpen, setDigestOpen] = useState(() => !new URLSearchParams(window.location.search).get('share'))
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'全部' | Category>('全部')
  const [sortMode, setSortMode] = useState<'default' | 'deadline'>('default')
  const [compareId, setCompareId] = useState<number | null>(null)
  const [reviewPeriod, setReviewPeriod] = useState<ReviewPeriod>('all')
  const [toast, setToast] = useState('')
  const [modelId, setModelId] = useState(() => readPreference<string>(MODEL_KEY, DEFAULT_MODEL_ID))
  const [follows, setFollows] = useState<FollowedSource[]>(() => readFollows())
  /** 外部转发进来的内容：收到就切到消息页并打开批量导入 */
  const [incomingShare, setIncomingShare] = useState<{ text: string; stamp: number } | null>(null)
  /** 有东西正被拖到窗口上：用来显示整窗提示并高亮消息箱 */
  const [dragActive, setDragActive] = useState(false)
  const [isMobileViewport, setIsMobileViewport] = useState(() => window.innerWidth < 560)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const model = resolveModel(modelId)

  const library = useMemo(() => classifyLibrary(items), [items])
  /**
   * 用户取消关注的官网源，其条目不再出现在信息库与摘要里（数据仍保留，重新关注就回来）。
   * 没有 liveSourceId 的条目（手动导入、公众号、演示数据）不受影响。
   */
  const followedLiveIds = useMemo(() => enabledLiveSourceIds(follows), [follows])
  const visibleItems = useMemo(
    () => library.visible
      .map(entry => entry.item)
      .filter(item => !item.liveSourceId || followedLiveIds.has(item.liveSourceId)),
    [library, followedLiveIds],
  )
  const selectedEntry = selectedId ? library.byId.get(selectedId) ?? null : null
  const compareEntry = compareId ? library.byId.get(compareId) ?? null : null

  /** 完成回顾：本周 / 本月 / 全部，按天或按月分组，默认全部（看到完整记录）。 */
  const completedWithTime = useMemo(
    () => visibleItems.filter(item => item.completed).map(item => ({ item, timestamp: completedTimestamp(item) })),
    [visibleItems],
  )
  const reviewCounts = useMemo(() => ({
    week: completedWithTime.filter(entry => inReviewPeriod(entry.timestamp, 'week')).length,
    month: completedWithTime.filter(entry => inReviewPeriod(entry.timestamp, 'month')).length,
    all: completedWithTime.length,
  }), [completedWithTime])
  const reviewEntries = useMemo(
    () => completedWithTime.filter(entry => inReviewPeriod(entry.timestamp, reviewPeriod)),
    [completedWithTime, reviewPeriod],
  )
  const reviewItems = reviewEntries.map(entry => entry.item)
  const reviewGroups = useMemo(() => {
    const groups: { key: string; label: string; items: InfoItem[] }[] = []
    for (const entry of reviewEntries) {
      const group = reviewGroupOf(entry.timestamp, reviewPeriod)
      const existing = groups.find(candidate => candidate.key === group.key)
      if (existing) existing.items.push(entry.item)
      else groups.push({ key: group.key, label: group.label, items: [entry.item] })
    }
    return groups
  }, [reviewEntries, reviewPeriod])
  const reviewRange = useMemo(() => {
    if (reviewPeriod === 'all') return '全部记录'
    if (reviewPeriod === 'month') {
      const now = new Date()
      return `${now.getFullYear()} 年 ${now.getMonth() + 1} 月`
    }
    const start = new Date(startOfWeek(new Date()))
    const end = new Date(start.getTime() + 6 * DAY_MS)
    return `${start.getMonth() + 1}月${start.getDate()}日 — ${end.getMonth() + 1}月${end.getDate()}日`
  }, [reviewPeriod])
  const dailyItems = visibleItems.filter(item => item.daily && !item.completed)
  const upcoming = useMemo(() => visibleItems
    .map(item => ({ item, days: deadlineDays(item) }))
    .filter((entry): entry is { item: InfoItem; days: number } => entry.days !== null && entry.days >= 0)
    .sort((a, b) => a.days - b.days)
    .slice(0, 3), [visibleItems])
  const hour = new Date().getHours()
  const greeting = hour < 11 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好'

  const notify = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(message)
    toastTimer.current = setTimeout(() => setToast(''), 2800)
  }, [])
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])
  useEffect(() => { writePreference(MODEL_KEY, modelId) }, [modelId])
  useEffect(() => { saveFollows(follows) }, [follows])
  /**
   * 桌面版：接住外部转发进来的内容（「转发到其他应用」选 Subscriber、
   * subscriber:// 链接、--share-text 启动参数）。队列由主进程持有，这里取走即清空，
   * 所以不会重复处理同一条。
   */
  useEffect(() => {
    const bridge = window.subscriberDesktop
    if (!bridge?.pullIncomingShares) return
    let active = true
    const take = async () => {
      const items = await bridge.pullIncomingShares?.().catch(() => []) ?? []
      if (!active || items.length === 0) return
      const text = items.map(item => item.text).filter(Boolean).join('\n\n')
      if (!text.trim()) return
      setView('wechat')
      setIncomingShare({ text, stamp: Date.now() })
    }
    void take()
    const off = bridge.onIncomingShare?.(() => { void take() })
    return () => { active = false; off?.() }
  }, [])
  /**
   * 整个窗口都能接住拖放。
   * 只把 drop 绑在消息箱那个区块上是不够的：HTML5 要求 dragover 被 preventDefault
   * 才算合法放置目标，拖到页面其他地方时 drop 压根不会触发（Electron 还会顺手去
   * 导航到那个文件，被 will-navigate 拦掉，用户看到的就是「拖了没反应」）。
   * 所以这里在 window 上用捕获阶段统一拦，再走和外部转发同一条通道交给消息箱。
   */
  useEffect(() => {
    let depth = 0
    const reset = () => { depth = 0; setDragActive(false) }

    const onDragEnter = (event: DragEvent) => {
      if (!isImportableDrag(event.dataTransfer)) return
      event.preventDefault()
      depth += 1
      setDragActive(true)
    }
    const onDragOver = (event: DragEvent) => {
      if (!isImportableDrag(event.dataTransfer)) return
      // 不 preventDefault 就没有 drop；dropEffect 决定光标显示「复制」还是禁止符号
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
      // 已经是 true 时 React 会跳过更新，不会因为拖拽移动而反复渲染
      setDragActive(true)
    }
    // 拖过子元素时 dragleave 会连续触发，用计数判断是不是真的离开了窗口
    const onDragLeave = (event: DragEvent) => {
      if (!isImportableDrag(event.dataTransfer)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragActive(false)
    }
    const onDrop = (event: DragEvent) => {
      if (!isImportableDrag(event.dataTransfer)) return
      event.preventDefault()
      reset()
      const data = event.dataTransfer
      void readDroppedContent(data).then(result => {
        if (!result.text) {
          notify(result.skipped.length > 0
            ? `没有读到可导入的文字：${result.skipped.slice(0, 2).join('、')}`
            : '没有读到可导入的文字：拖进来的请是 .txt / .md / .html 聊天记录，或直接拖选中的文字')
          return
        }
        setView('wechat')
        setIncomingShare({ text: result.text, stamp: Date.now() })
        notify(result.skipped.length > 0
          ? `已接收${result.fileCount > 0 ? ` ${result.fileCount} 个文件` : ''}，${result.skipped.length} 个被跳过`
          : '已接收拖入的内容，确认拆分后再保存到本机')
      })
    }
    // 拖到窗口外松手会触发 dragend，这里兜底清掉高亮，避免一直亮着
    const onDragEnd = () => reset()

    window.addEventListener('dragenter', onDragEnter, true)
    window.addEventListener('dragover', onDragOver, true)
    window.addEventListener('dragleave', onDragLeave, true)
    window.addEventListener('drop', onDrop, true)
    window.addEventListener('dragend', onDragEnd, true)
    return () => {
      window.removeEventListener('dragenter', onDragEnter, true)
      window.removeEventListener('dragover', onDragOver, true)
      window.removeEventListener('dragleave', onDragLeave, true)
      window.removeEventListener('drop', onDrop, true)
      window.removeEventListener('dragend', onDragEnd, true)
    }
  }, [notify])
  useEffect(() => {
    const shareState = new URLSearchParams(window.location.search).get('share')
    if (!shareState) return
    window.history.replaceState({}, '', window.location.pathname)
    if (shareState === 'received') setView('wechat')
    else if (shareState === 'empty') notify('这次分享没有可导入的文字')
    else if (shareState === 'error') notify('分享内容读取失败，请返回微信重试')
  }, [notify])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setSelectedId(null); setCompareId(null); setImportOpen(false); setDiscoverOpen(false); setTaxonomyOpen(false); setDigestOpen(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => { itemsRef.current = items }, [items])
  useEffect(() => {
    const updateViewport = () => setIsMobileViewport(window.innerWidth < 560)
    window.addEventListener('resize', updateViewport)
    return () => window.removeEventListener('resize', updateViewport)
  }, [])

  const updateItem = (id: number, update: Partial<InfoItem>) => setItems(current => current.map(item => item.id === id ? { ...item, ...update } : item))
  const toggleFavorite = (id: number) => { const item = items.find(i => i.id === id); if (item) updateItem(id, { favorite: !item.favorite }) }
  const toggleComplete = (id: number) => {
    const item = items.find(i => i.id === id)
    if (!item) return
    updateItem(id, { completed: !item.completed, completedAt: !item.completed ? '今天' : undefined })
    notify(!item.completed ? '已记入完成回顾' : '已取消完成标记')
  }

  /**
   * 所有入口（手动导入 / 公开检索 / 公众号 / 微信）共用的写入通道：
   * 先查重，再决定是新增还是作为新版本挂到已有事件上。
   */
  const addItem = useCallback((input: NewItemInput, options?: { mode?: 'new' | 'version' }): AddItemResult => {
    const mode = options?.mode ?? 'new'
    const existing = findExistingItem(itemsRef.current, { title: input.title, eventKey: input.eventKey })
    if (existing && mode !== 'version') {
      notify(`已与信息库中的《${existing.item.title}》自动去重`)
      return { ok: false, duplicate: existing.item }
    }
    const base = mode === 'version' ? existing?.item : undefined
    idRef.current += 1
    const newItem: InfoItem = {
      id: idRef.current,
      title: input.title,
      category: input.category,
      summary: input.summary ?? base?.summary ?? '等待补充摘要。',
      source: input.source,
      sourceType: input.sourceType ?? '用户导入',
      publishedAt: input.publishedAt ?? '刚刚',
      publishedTs: input.publishedTs ?? new Date().toISOString(),
      deadline: input.deadline ?? base?.deadline,
      deadlineTs: input.deadlineTs ?? base?.deadlineTs,
      eventDate: input.eventDate ?? base?.eventDate,
      location: input.location ?? base?.location,
      eligibility: input.eligibility ?? base?.eligibility,
      organizer: input.organizer ?? base?.organizer,
      officialUrl: input.officialUrl ?? base?.officialUrl,
      officialHome: input.officialHome ?? base?.officialHome,
      eventKey: input.eventKey ?? base?.eventKey,
      liveSourceId: input.liveSourceId ?? base?.liveSourceId,
      tags: input.tags ?? base?.tags ?? [input.category, '待核对'],
      favorite: base?.favorite ?? false,
      liked: false,
      completed: false,
      priority: base?.priority ?? 'normal',
      evidence: input.evidence ?? base?.evidence ?? '原型未读取真实内容。正式版会在此展示与关键字段对应的原文段落，方便核对。',
      keyPoints: input.keyPoints ?? base?.keyPoints ?? ['核对原始来源与发布时间', '确认关键日期与参与要求', '补充个人待办或标记完成'],
      daily: input.daily ?? base?.daily,
    }
    const nextItems = [newItem, ...itemsRef.current]
    itemsRef.current = nextItems
    setItems(nextItems)
    return { ok: true, item: newItem }
  }, [notify])

  /** 公众号文章入库：新事件直接新增，同一事件的延期/更正作为新版本追加。 */
  const importArticle = useCallback((article: AccountArticle, mode: 'new' | 'update') => {
    const account = officialAccounts.find(item => item.id === article.accountId)
    const result = addItem({
      title: article.title,
      category: article.category,
      source: `${article.sourceName ?? account?.name ?? '公众号'} · 公众号`,
      sourceType: '公众号订阅',
      summary: article.digest,
      publishedAt: new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(article.publishedAt)),
      publishedTs: article.publishedAt,
      deadline: article.deadline,
      deadlineTs: article.deadlineTs,
      officialUrl: article.officialUrl,
      eventKey: article.eventKey,
      tags: article.keywords,
      evidence: article.digest,
      keyPoints: article.keywords.map(keyword => `核对「${keyword}」相关的原文表述`),
      daily: article.category === '竞赛',
    }, { mode: mode === 'update' ? 'version' : 'new' })
    if (result.ok) notify(mode === 'update' ? '已合并为最新版本，旧版本保留在版本记录中' : '已加入信息库')
  }, [addItem, notify])

  /** 桌面版：主进程实时抓取竞赛官网并合并入库（Web 端受跨域限制，提示改用快照）。 */
  const canRefreshLive = typeof window !== 'undefined' && Boolean(window.subscriberDesktop?.fetchLive)
  const [liveRefreshing, setLiveRefreshing] = useState(false)
  const refreshLive = useCallback(async () => {
    const fetchLive = window.subscriberDesktop?.fetchLive
    if (!fetchLive || liveRefreshing) return
    setLiveRefreshing(true)
    try {
      const result = await fetchLive()
      if (!result.ok || !result.report) {
        notify(result.message)
        return
      }
      let added = 0
      for (const input of result.report.items) {
        if (addItem(input, { mode: 'new' }).ok) added += 1
      }
      setLiveFetchedAt(result.report.fetchedAt)
      notify(added > 0 ? `${result.message}，其中 ${added} 条新入库` : `${result.message}，均已在库`)
    } finally {
      setLiveRefreshing(false)
    }
  }, [addItem, notify, liveRefreshing])

  const filteredItems = useMemo(() => {
    const matched = visibleItems.filter(item => {
      const matchView = view === 'favorites' ? item.favorite : view === 'review' ? item.completed : true
      const matchFilter = filter === '全部' || item.category === filter
      const keyword = search.trim().toLowerCase()
      const matchSearch = !keyword || `${item.title}${item.summary}${item.source}${item.tags.join('')}`.toLowerCase().includes(keyword)
      return matchView && matchFilter && matchSearch
    })
    if (sortMode === 'default') return matched
    return [...matched].sort((a, b) => {
      const left = deadlineRank(a)
      const right = deadlineRank(b)
      return left.group - right.group || left.value - right.value
    })
  }, [visibleItems, view, filter, search, sortMode])

  const navigate = (next: View) => { setView(next); setSearch(''); setFilter('全部'); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const openItem = (item: InfoItem) => setSelectedId(item.id)
  const pageTitle = { today: '今日精选', library: '全部信息', wechat: '消息与订阅', favorites: '我的收藏', review: '完成回顾' }[view]
  const subscribedKeys = visibleItems.map(item => subscriptionKey(item.title))

  return (
    <div className="app-shell">
      <div className="app-backdrop" aria-hidden="true">
        <GradientASCII
          colors={['#12291F', '#274C3B', '#4F7B67', '#8FAF9B', '#A5633D']}
          shape="horizon"
          characters=" .:-=+*xX#"
          cellSize={isMobileViewport ? 15 : 17}
          density={isMobileViewport ? 0.32 : 0.4}
          glyphOpacity={isMobileViewport ? 0.4 : 0.6}
          gradientOpacity={0.16}
          glow={0.1}
          depthOfField={0}
          flicker={0.05}
          softness={0.8}
          scale={1.25}
          flow={0.32}
          speed={digestOpen ? 0 : 0.18}
          grain={0.03}
          variation={1}
          mouseInteraction
          scrambleRadius={0.07}
          clickEffect="none"
          intro={!digestOpen}
          lightMode
          dpr={1}
          fontFamily="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
        />
      </div>
      <div className="app-veil" aria-hidden="true" />

      <header className="topnav">
        <div className="topnav-inner">
          <div className="topnav-brand"><Brand /><span className="workspace-label">我的信息空间</span></div>
          <nav className="main-nav" aria-label="主要导航">
            {navItems.map(item => {
              const Icon = item.icon
              return (
                <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => navigate(item.id)}>
                  <Icon size={17} /><span>{item.label}</span>
                  {item.id === 'today' && <span className="nav-count">{dailyItems.length}</span>}
                  {item.id === 'favorites' && <span className="nav-count muted">{visibleItems.filter(i => i.favorite).length}</span>}
                </button>
              )
            })}
          </nav>
          <div className="topbar-actions">
            <form className="global-search" onSubmit={e => { e.preventDefault(); navigate('library') }}><Search size={17} /><input aria-label="搜索全部信息" value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索竞赛、课程或来源……" /><kbd>Enter</kbd></form>
            <button className="discover-button" onClick={() => setDiscoverOpen(true)}><Globe2 size={16} /><span className="discover-text">公开检索</span><span className="new-badge">NEW</span></button>
            <button className="button primary topnav-import" onClick={() => setImportOpen(true)}><Plus size={17} />导入新信息</button>
            <IconButton label="通知" onClick={() => notify(`你有 ${library.stats.expiring} 条信息即将截止`)}><Bell size={19} /><span className="notification-dot" /></IconButton>
            <button className="mobile-add icon-button" aria-label="导入新信息" onClick={() => setImportOpen(true)}><Plus size={20} /></button>
            <button className="topnav-profile" onClick={() => notify('账号设置将在正式版接入')} aria-label="林同学 · 个人空间"><span className="avatar">林</span></button>
          </div>
        </div>
      </header>

      <main className="main-area">

        <div className="page-content">
          {view === 'today' && <>
            <section className="page-heading today-heading"><div><span className="eyebrow">{todayEyebrow()}</span><SplitText tag="h1" text={`${greeting}，林同学`} effect="rise" splitType="chars" delay={52} duration={0.85} staggerFrom="start" trigger="load" textAlign="center" className="split-heading" /><p>今天不必看完所有消息，先处理真正重要的事。</p></div><span className="demo-chip"><span />演示原型</span></section>
            <div className="today-grid">
              <div className="today-main">
                <section className="hero-panel">
                  <span className="briefing-label"><Sparkles size={15} />今日知单</span>
                  <h2>{library.stats.raw} 条新信息里，<br />这 <em>{dailyItems.length}</em> 件值得你看。</h2>
                  <p>{library.stats.expiring} 项临近截止，{library.stats.versionGroups} 组信息有过更新。</p>
                  <div className="hero-actions">
                    <button className="button primary" onClick={() => setDigestOpen(true)}>阅读完整摘要<ArrowRight size={17} /></button>
                    <span className="hero-privacy"><ShieldCheck size={14} />原文件仅按需上传</span>
                  </div>
                </section>
                <section className="section-block today-section"><div className="section-heading"><div><h2>今日精选</h2><span>{dailyItems.length} 条</span></div><button className="text-button" onClick={() => navigate('library')}>查看全部<ArrowRight size={15} /></button></div><div className="info-list">{dailyItems.map(entry => { const classification = library.byId.get(entry.id); return classification ? <ItemCard key={entry.id} entry={classification} onOpen={() => openItem(entry)} onFavorite={() => toggleFavorite(entry.id)} onComplete={() => toggleComplete(entry.id)} /> : null })}</div></section>
              </div>
              <aside className="right-rail today-rail">
                <section className="rail-section deadline-section"><div className="section-heading"><h2>接下来</h2><CalendarDays size={18} /></div><div className="timeline">{upcoming.map(({ item, days }) => { const date = item.deadlineTs ? new Date(item.deadlineTs) : null; return <button key={item.id} onClick={() => openItem(item)}><span className={`timeline-date ${days <= 1 ? 'urgent' : ''}`}><strong>{date ? String(date.getDate()).padStart(2, '0') : '--'}</strong><small>{date ? `${date.getMonth() + 1}月` : ''}</small></span><span><strong>{item.title}</strong><small>{days === 0 ? '今天截止' : `${days}天后截止`}</small></span></button> })}</div><button className="rail-link" onClick={() => { navigate('library'); setFilter('竞赛') }}>全部竞赛安排<ChevronRight size={15} /></button></section>
                <section className="rail-section review-preview"><div className="section-heading"><h2>本周完成</h2><CheckCircle2 size={18} /></div><div className="review-number"><strong>{reviewCounts.week}</strong><span>项已完成<small>每一步都有迹可循</small></span></div><div className="completion-track"><span style={{ width: `${Math.min(reviewCounts.week * 12 + 20, 100)}%` }} /></div><p>还可以在完成回顾里按月查看</p><button className="rail-link" onClick={() => navigate('review')}>查看完成回顾<ChevronRight size={15} /></button></section>
                <section className="rail-section source-status"><div className="source-status-icon"><Cloud size={20} /></div><div><strong>云端同步 · 设计预览</strong><span>正式版将保存收藏与完成记录</span></div><span className="sync-dot" /></section>
              </aside>
            </div>
          </>}

          {view === 'wechat' && <WechatInbox addItem={addItem} notify={notify} modelName={model.name} library={library} onImportArticle={importArticle} follows={follows} onFollowsChange={setFollows} incoming={incomingShare} dragActive={dragActive} />}

          {(view === 'library' || view === 'favorites') && <>
            <section className="page-heading library-heading"><div><span className="eyebrow">{view === 'library' ? 'INFORMATION LIBRARY' : 'SAVED FOR LATER'}</span><SplitText tag="h1" text={pageTitle} effect="rise" splitType="chars" delay={58} duration={0.8} staggerFrom="start" trigger="load" textAlign="left" className="split-heading" /><p>{view === 'library' ? '所有导入与发现的信息，已按事件归并、去重并标注版本。' : '把值得关注的内容留给合适的时间。'}</p></div><button className="button primary desktop-page-action" onClick={() => setImportOpen(true)}><Plus size={17} />导入信息</button></section>
            <div className="library-toolbar">
              <div className="filter-tabs">{(['全部', '竞赛', '新闻', '课程通知'] as const).map(item => <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item}<span>{item === '全部' ? visibleItems.filter(i => view === 'library' || i.favorite).length : visibleItems.filter(i => (view === 'library' || i.favorite) && i.category === item).length}</span></button>)}</div>
              <div className="toolbar-insights">
                <button type="button" className="insight-chip" onClick={() => setTaxonomyOpen(true)}><Layers3 size={13} />{library.stats.merged > 0 ? `已自动合并 ${library.stats.merged} 条` : '未发现重复'}{library.stats.versionGroups > 0 ? ` · ${library.stats.versionGroups} 组版本` : ''}</button>
                <span className="insight-chip live-chip" title="数据来自竞赛官网真实抓取，明细见各条目的「查看原文」"><Globe size={13} />官网直采 {liveSnapshot.items.length} 条 · 抓取于 {formatFetchedAt(currentFetchedAt())}</span>
                {canRefreshLive && <button type="button" className="text-button" onClick={refreshLive} disabled={liveRefreshing}>{liveRefreshing ? <LoaderCircle className="spin" size={13} /> : <Globe size={13} />}{liveRefreshing ? '抓取中…' : '实时抓取官网'}<ArrowUpRight size={13} /></button>}
                <button type="button" className="text-button" onClick={() => setTaxonomyOpen(true)}>分类规则<ArrowUpRight size={13} /></button>
              </div>
              <span className="result-total">{filteredItems.length} 条结果</span>
            </div>
            <div className="library-searchbar">
              <label className="inline-search">
                <Search size={14} />
                <input aria-label="在信息库中搜索" value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索标题、摘要、来源或标签" />
                {search && <button type="button" aria-label="清除搜索" onClick={() => setSearch('')}><X size={12} /></button>}
              </label>
              <div className="sort-switch" role="group" aria-label="排序方式">
                <button type="button" className={sortMode === 'default' ? 'active' : ''} aria-pressed={sortMode === 'default'} onClick={() => setSortMode('default')}>默认排序</button>
                <button type="button" className={sortMode === 'deadline' ? 'active' : ''} aria-pressed={sortMode === 'deadline'} onClick={() => setSortMode('deadline')}>临近截止</button>
              </div>
              <span className="searchbar-hint">{search
                ? `“${search}” 匹配 ${filteredItems.length} 条`
                : view === 'favorites'
                  ? `已收藏 ${visibleItems.filter(item => item.favorite).length} 条，可按分类筛选`
                  : '按事件归并 · 支持标题、摘要、来源与标签'}</span>
            </div>
            <div className="info-list library-list">{filteredItems.map(item => { const classification = library.byId.get(item.id); return classification ? <ItemCard key={item.id} entry={classification} onOpen={() => openItem(item)} onFavorite={() => toggleFavorite(item.id)} onComplete={() => toggleComplete(item.id)} /> : null })}</div>
            {filteredItems.length === 0 && <EmptyState type={view === 'favorites' && !search && filter === '全部' ? 'favorite' : 'search'} onReset={() => { setSearch(''); setFilter('全部') }} />}
          </>}

          {view === 'review' && <>
            <section className="page-heading"><div><span className="eyebrow">PROGRESS, NOT PRESSURE</span><SplitText tag="h1" text="完成回顾" effect="rise" splitType="chars" delay={58} duration={0.8} staggerFrom="start" trigger="load" textAlign="left" className="split-heading" /><p>不只看还有多少要做，也看看你已经走了多远。</p></div><span className="date-range"><CalendarDays size={16} />{reviewRange}</span></section>
            <section className="review-hero"><div><span className="briefing-label"><Sparkles size={15} />{REVIEW_PERIOD_LABEL[reviewPeriod]}回顾</span><h2>你完成了 <em>{reviewItems.length}</em> 件事，<br />也为下一次出发留出了空间。</h2><p>{REVIEW_PERIOD_PHRASE[reviewPeriod]}你参与了 {reviewItems.filter(i => i.category === '课程通知').length} 项课程与活动，关注了 {reviewItems.filter(i => i.category === '竞赛').length} 项竞赛。完成记录均由你手动勾选，Subscriber只做整理。</p><button className="light-button" onClick={() => notify('已根据最新完成记录刷新摘要')}><Sparkles size={16} />刷新回顾摘要</button></div><div className="review-stats"><div><strong>{reviewItems.length}</strong><span>完成项目</span></div><div><strong>{visibleItems.filter(i => i.liked).length}</strong><span>喜欢内容</span></div><div><strong>{visibleItems.filter(i => i.favorite).length}</strong><span>收藏信息</span></div></div></section>
            <section className="section-block completed-section">
              <div className="section-heading">
                <div><h2>已完成的项目</h2><span>{reviewItems.length} 条</span></div>
                <div className="review-periods" role="group" aria-label="回顾时间范围">
                  {(['week', 'month', 'all'] as const).map(period => (
                    <button key={period} type="button" className={reviewPeriod === period ? 'active' : ''} aria-pressed={reviewPeriod === period} onClick={() => setReviewPeriod(period)}>
                      {REVIEW_PERIOD_LABEL[period]}<span>{reviewCounts[period]}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="completed-list">
                {reviewGroups.map(group => (
                  <Fragment key={group.key}>
                    <div className="completed-group-head"><span>{group.label}</span><small>{group.items.length} 项</small></div>
                    {group.items.map(item => <article key={item.id}><span className="completed-check"><Check size={17} /></span><button className="completed-copy" onClick={() => openItem(item)}><span><Tag category={item.category} /><small>{item.completedAt}完成</small></span><h3>{item.title}</h3><p>{item.summary}</p></button><IconButton label="取消完成" onClick={() => toggleComplete(item.id)}><RotateCcwIcon /></IconButton></article>)}
                  </Fragment>
                ))}
              </div>
              {reviewItems.length === 0 && <EmptyState type="review" />}
              {reviewItems.length > 0 && <p className="review-footnote"><CheckCheck size={14} />完成记录只保存在本机；切换本周 / 本月 / 全部，可以按天或按月回看。</p>}
            </section>
          </>}
        </div>
      </main>

      <nav className="mobile-nav" aria-label="移动端导航">{navItems.map(item => { const Icon = item.icon; return <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => navigate(item.id)}><Icon size={20} /><span>{item.label.replace('我的', '').replace('全部信息', '信息库')}</span></button> })}</nav>

      <LlmPicker value={modelId} onChange={setModelId} />

      {importOpen && <ImportModal onClose={() => setImportOpen(false)} onAdd={addItem} notify={notify} modelName={model.name} />}
      {discoverOpen && <DiscoverModal onClose={() => setDiscoverOpen(false)} onAdd={addItem} notify={notify} subscribedKeys={subscribedKeys} />}
      {selectedEntry && <DetailDrawer entry={selectedEntry} onClose={() => setSelectedId(null)} onFavorite={() => toggleFavorite(selectedEntry.item.id)} onLike={() => updateItem(selectedEntry.item.id, { liked: !selectedEntry.item.liked })} onComplete={() => toggleComplete(selectedEntry.item.id)} onCompare={() => setCompareId(selectedEntry.item.id)} notify={notify} />}
      {compareEntry && <VersionCompareModal entry={compareEntry} resolveItem={id => items.find(item => item.id === id)} onClose={() => setCompareId(null)} />}
      {digestOpen && <DigestModal items={dailyItems} stats={library.stats} modelName={model.name} onClose={() => setDigestOpen(false)} onOpenItem={openItem} notify={notify} />}
      {taxonomyOpen && <TaxonomyModal library={library} onClose={() => setTaxonomyOpen(false)} onOpenGroup={id => setSelectedId(id)} />}
      {toast && <div className="toast" role="status"><CheckCircle2 size={18} />{toast}</div>}
      {dragActive && <div className="drop-overlay" aria-hidden="true">
        <div className="drop-overlay-card">
          <Upload size={30} />
          <strong>松手就导入消息箱</strong>
          <span>聊天记录 .txt / .md / .html、导出的 .zip 压缩包、或整个文件夹</span>
        </div>
      </div>}
    </div>
  )
}

function RotateCcwIcon() {
  return <ArrowLeft size={18} />
}
