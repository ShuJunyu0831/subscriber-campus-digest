import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, ExternalLink, KeyRound, Cpu, Sparkles, X } from 'lucide-react'
import { groupModels, llmModels, resolveModel, VENDOR_ENDPOINTS } from './llmModels'
import { clearCredentials, readCredentials, saveCredentials, type LlmCredentials } from './llmClient'

/** 厂商下拉选项，按 llmModels 里出现的先后排序。 */
const vendorOptions: { key: string; label: string }[] = []
for (const model of llmModels) {
  if (VENDOR_ENDPOINTS[model.vendorKey] && !vendorOptions.some(option => option.key === model.vendorKey)) {
    vendorOptions.push({ key: model.vendorKey, label: model.vendor })
  }
}

function vendorLabel(key: string): string {
  return vendorOptions.find(option => option.key === key)?.label ?? key
}

/**
 * 右下角模型选择器。
 * 未接入时只改变界面标签；在面板里保存 API Key 后，导入粘贴文字会真实调用所选厂商接口。
 * Key 只存本机 localStorage，不会同步或上传。
 */
export default function LlmPicker({ value, onChange }: {
  value: string
  onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [credentials, setCredentials] = useState<LlmCredentials | null>(() => readCredentials())
  const [vendorKey, setVendorKey] = useState(() => readCredentials()?.vendorKey ?? 'deepseek')
  const [apiKey, setApiKey] = useState(() => readCredentials()?.apiKey ?? '')
  const [baseUrl, setBaseUrl] = useState(() => readCredentials()?.baseUrl ?? VENDOR_ENDPOINTS.deepseek.baseUrl)
  const [apiModel, setApiModel] = useState(() => readCredentials()?.apiModel ?? VENDOR_ENDPOINTS.deepseek.apiModel)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const current = resolveModel(value)
  const groups = groupModels()
  const activeCredentials = credentials?.vendorKey === current.vendorKey ? credentials : null

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const pickVendor = (key: string) => {
    setVendorKey(key)
    const preset = VENDOR_ENDPOINTS[key]
    if (preset) {
      setBaseUrl(preset.baseUrl)
      setApiModel(preset.apiModel)
    }
  }

  const connect = () => {
    if (!apiKey.trim()) return
    saveCredentials({
      vendorKey,
      apiKey: apiKey.trim(),
      baseUrl: baseUrl.trim() || VENDOR_ENDPOINTS[vendorKey]?.baseUrl || '',
      apiModel: apiModel.trim() || VENDOR_ENDPOINTS[vendorKey]?.apiModel || '',
    })
    setCredentials(readCredentials())
  }

  const disconnect = () => {
    clearCredentials()
    setCredentials(null)
    setApiKey('')
  }

  return (
    <div className="llm-dock" ref={rootRef}>
      {open && (
        <section className="llm-panel" role="dialog" aria-label="选择分析模型">
          <header className="llm-panel-head">
            <div>
              <span className="eyebrow">{activeCredentials ? '已接入真实模型' : '演示模式'}</span>
              <h3>选择用哪个模型分析</h3>
            </div>
            <button type="button" className="icon-button" aria-label="收起模型列表" onClick={() => setOpen(false)}><X size={17} /></button>
          </header>
          <p className="llm-panel-note">
            {activeCredentials
              ? <>已接入 {vendorLabel(activeCredentials.vendorKey)}：导入粘贴文字时将真实调用 {current.name}。</>
              : <><Sparkles size={13} />{credentials ? `当前选的是${current.vendor}，已保存的是${vendorLabel(credentials.vendorKey)} Key；请为当前厂商保存 Key。` : '演示模式仅切换界面标签；保存 API Key 后，导入粘贴文字会真实调用所选模型。'}</>}
          </p>
          <div className="llm-groups">
            {groups.map(group => (
              <div className="llm-group" key={group.vendorKey}>
                <span className="llm-vendor">{group.vendor}</span>
                {group.models.map(model => {
                  const active = model.id === current.id
                  return (
                    <button
                      type="button"
                      key={model.id}
                      className={`llm-option ${active ? 'selected' : ''}`}
                      aria-pressed={active}
                      onClick={() => {
                        onChange(model.id)
                        setVendorKey(model.vendorKey)
                        const preset = VENDOR_ENDPOINTS[model.vendorKey]
                        if (preset) {
                          setBaseUrl(preset.baseUrl)
                          setApiModel(model.apiModel)
                        }
                        setOpen(false)
                      }}
                    >
                      <span className="llm-dot" style={{ background: model.accent }} aria-hidden="true" />
                      <span className="llm-option-copy">
                        <strong>{model.name}{model.badge && <em>{model.badge}</em>}</strong>
                        <small>{model.note}</small>
                      </span>
                      <span className="llm-option-meta">{model.kind}<i>{model.context}</i></span>
                      {active ? <Check size={15} className="llm-check" /> : null}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
          <div className="llm-connect">
            <button
              type="button"
              className="llm-connect-toggle"
              aria-expanded={settingsOpen}
              onClick={() => setSettingsOpen(state => !state)}
            >
              <KeyRound size={13} />
              {activeCredentials ? `已接入 ${vendorLabel(activeCredentials.vendorKey)} · 真实调用` : credentials ? `已保存 ${vendorLabel(credentials.vendorKey)} Key，当前模型未接入` : '接入真实模型（可选）'}
              <ChevronDown size={13} className={settingsOpen ? 'up' : ''} />
            </button>
            {settingsOpen && (
              <div className="llm-connect-form">
                <label className="llm-connect-row">
                  <span>厂商</span>
                  <select value={vendorKey} onChange={event => pickVendor(event.target.value)}>
                    {vendorOptions.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
                  </select>
                  {VENDOR_ENDPOINTS[vendorKey] && (
                    <a href={VENDOR_ENDPOINTS[vendorKey].keyUrl} target="_blank" rel="noreferrer">获取 Key<ExternalLink size={11} /></a>
                  )}
                </label>
                <label className="llm-connect-row">
                  <span>API Key</span>
                  <input type="password" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder="sk-…" autoComplete="off" />
                </label>
                <label className="llm-connect-row">
                  <span>接口地址</span>
                  <input value={baseUrl} onChange={event => setBaseUrl(event.target.value)} placeholder="https://…/v1" />
                </label>
                <label className="llm-connect-row">
                  <span>模型名</span>
                  <input value={apiModel} onChange={event => setApiModel(event.target.value)} placeholder="deepseek-chat" />
                </label>
                <div className="llm-connect-actions">
                  <button type="button" className="llm-connect-save" onClick={connect} disabled={!apiKey.trim()}>保存并接入</button>
                  <button type="button" className="llm-connect-clear" onClick={disconnect} disabled={!credentials}>清除接入</button>
                </div>
                <small>Key 只保存在本机浏览器，仅在你导入粘贴文字时调用所选厂商接口，不会随数据同步。</small>
              </div>
            )}
          </div>
          <footer className="llm-panel-foot">
            <span><Cpu size={13} />当前：{current.vendor} · {current.name}</span>
            {activeCredentials ? <span className="connected-label">已接入</span> : <span className="demo-label">演示选择</span>}
          </footer>
        </section>
      )}
      <button
        type="button"
        className={`llm-trigger ${open ? 'open' : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(state => !state)}
      >
        <span className="llm-trigger-mark" style={{ background: current.accent }} aria-hidden="true">{current.name.slice(0, 1)}</span>
        <span className="llm-trigger-copy">
          <small>分析模型</small>
          <strong>{current.name}</strong>
        </span>
        <ChevronDown size={15} className="llm-trigger-caret" />
      </button>
    </div>
  )
}
