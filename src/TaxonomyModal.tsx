import { ArrowUpRight, Boxes, Fingerprint, GitBranch, Layers3, ShieldCheck, Tag, Timer, X } from 'lucide-react'
import type { LibraryClassification } from './classify'
import { DUPLICATE_THRESHOLD, SAME_EVENT_THRESHOLD } from './classify'

/**
 * 分类规则说明：把引擎实际做了什么摊开给用户看，而不是只给一个“AI 已整理”的结论。
 */
export default function TaxonomyModal({ library, onClose, onOpenGroup }: {
  library: LibraryClassification
  onClose: () => void
  onOpenGroup: (id: number) => void
}) {
  const { stats } = library
  const versionGroups = library.entries.filter(entry => entry.versions.length > 1)

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="modal modal-wide taxonomy-modal" role="dialog" aria-modal="true" aria-label="分类与版本规则" onMouseDown={event => event.stopPropagation()}>
        <div className="modal-header">
          <div><span className="eyebrow">CLASSIFICATION ENGINE</span><h2>信息是怎么被归类的</h2></div>
          <button type="button" className="icon-button" aria-label="关闭" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="modal-body">
          <div className="taxonomy-stats">
            <div><span>原始条目</span><strong>{stats.raw}</strong><small>来自导入、检索与订阅</small></div>
            <div><span>归并后</span><strong>{stats.unique}</strong><small>同一件事只留一份</small></div>
            <div><span>自动合并</span><strong>{stats.merged}</strong><small>重复与旧版本</small></div>
            <div><span>版本组</span><strong>{stats.versionGroups}</strong><small>发生过更新的事件</small></div>
          </div>

          <div className="taxonomy-dimensions">
            <div><span className="taxonomy-icon"><Tag size={16} /></span><strong>内容类型</strong><p>关键词加权打分，给出分类与置信度，保留命中的词作为依据。</p></div>
            <div><span className="taxonomy-icon"><Fingerprint size={16} /></span><strong>事件指纹</strong><p>去掉标点与「关于 / 通知 / 延期」等版本词，再做字符二元组比对。</p></div>
            <div><span className="taxonomy-icon"><GitBranch size={16} /></span><strong>版本</strong><p>同一事件按发布时间排序，截止时间变化或出现变更词即视为新版本。</p></div>
            <div><span className="taxonomy-icon"><Timer size={16} /></span><strong>时效</strong><p>按截止时间标记「3 天内截止 / 进行中 / 已截止 / 待核对」。</p></div>
          </div>

          <section className="taxonomy-rules">
            <h3><Boxes size={15} />去重与版本规则</h3>
            <ul>
              <li><strong>同一事件</strong>事件标识相同，或标题指纹相似度 ≥ {Math.round(SAME_EVENT_THRESHOLD * 100)}%。</li>
              <li><strong>重复来源</strong>同一事件、同一版本且相似度 ≥ {Math.round(DUPLICATE_THRESHOLD * 100)}%，只保留可信度最高的来源。</li>
              <li><strong>新版本</strong>截止时间发生改动，或标题出现「延期 / 更正 / 补充 / 取消」等词。</li>
              <li><strong>官方优先</strong>多个来源同时转发时，优先采用标注为学校、学院或赛事官方的来源。</li>
            </ul>
          </section>

          <section className="taxonomy-versions">
            <h3><Layers3 size={15} />版本记录</h3>
            {versionGroups.length === 0 && <p className="taxonomy-empty">当前还没有发生更新的事件。订阅公众号后点「同步更新」，新到的延期通知会自动并入对应事件。</p>}
            {versionGroups.map(entry => (
              <article className="taxonomy-group" key={entry.key}>
                <button type="button" onClick={() => { onClose(); onOpenGroup(entry.item.id) }}>
                  <strong>{entry.item.title}</strong><ArrowUpRight size={14} />
                </button>
                <ol className="taxonomy-timeline">
                  {entry.versions.map(version => (
                    <li key={version.id} className={version.version === entry.version ? 'current' : ''}>
                      <span className="taxonomy-version">V{version.version}</span>
                      <div>
                        <p>{version.title}</p>
                        <small>{version.source} · {version.publishedAt}{version.deadline ? ` · 截止 ${version.deadline}` : ''}</small>
                        <em>{version.changeNote}{version.duplicateCount > 0 ? ` · 已合并 ${version.duplicateCount} 条重复来源` : ''}</em>
                      </div>
                    </li>
                  ))}
                </ol>
              </article>
            ))}
          </section>

          <p className="taxonomy-foot"><ShieldCheck size={13} />全部在本地计算，不会把条目内容发送到任何模型或服务器。</p>
        </div>
        <div className="modal-actions"><button className="button primary" onClick={onClose}>知道了</button></div>
      </section>
    </div>
  )
}
