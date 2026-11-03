import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Cpu, Sparkles, X } from 'lucide-react'
import { groupModels, resolveModel } from './llmModels'

/**
 * 右下角模型选择器。
 * 只改变界面上的“将使用哪个模型”标签，不会发起任何真实请求；选择结果存在 localStorage。
 */
export default function LlmPicker({ value, onChange }: {
  value: string
  onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const current = resolveModel(value)
  const groups = groupModels()

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

  return (
    <div className="llm-dock" ref={rootRef}>
      {open && (
        <section className="llm-panel" role="dialog" aria-label="选择分析模型">
          <header className="llm-panel-head">
            <div>
              <span className="eyebrow">MODEL ROUTER · 演示</span>
              <h3>选择用哪个模型分析</h3>
            </div>
            <button type="button" className="icon-button" aria-label="收起模型列表" onClick={() => setOpen(false)}><X size={17} /></button>
          </header>
          <p className="llm-panel-note"><Sparkles size={13} />仅切换界面标签，本原型不会向任何厂商发送请求。</p>
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
                      onClick={() => { onChange(model.id); setOpen(false) }}
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
          <footer className="llm-panel-foot">
            <span><Cpu size={13} />当前：{current.vendor} · {current.name}</span>
            <span className="demo-label">演示选择</span>
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
