import { resolveModel, VENDOR_ENDPOINTS } from './llmModels'

/**
 * 真实模型接入（P2）。
 * 凭据只保存在本机浏览器的 localStorage，仅当用户主动保存后才会向所选厂商发起请求。
 * 采用 OpenAI 兼容的 chat/completions 协议，兼容国内主流厂商的开放平台。
 */

export interface LlmCredentials {
  vendorKey: string
  apiKey: string
  baseUrl: string
  apiModel: string
}

const STORAGE_KEY = 'subscriber-llm-credentials'

export function readCredentials(): LlmCredentials | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<LlmCredentials>
    if (!parsed || typeof parsed.apiKey !== 'string' || !parsed.apiKey.trim()) return null
    const vendorKey = typeof parsed.vendorKey === 'string' && parsed.vendorKey ? parsed.vendorKey : 'custom'
    const preset = VENDOR_ENDPOINTS[vendorKey]
    return {
      vendorKey,
      apiKey: parsed.apiKey,
      baseUrl: typeof parsed.baseUrl === 'string' && parsed.baseUrl ? parsed.baseUrl : preset?.baseUrl ?? '',
      apiModel: typeof parsed.apiModel === 'string' && parsed.apiModel ? parsed.apiModel : preset?.apiModel ?? '',
    }
  } catch {
    return null
  }
}

export function saveCredentials(credentials: LlmCredentials): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(credentials))
}

/**
 * 取「当前选中模型」真正可用的凭据。
 * 只有已保存凭据的厂商与模型厂商一致时才允许真实调用，避免拿 DeepSeek 的 Key
 * 去请求 Kimi，也避免界面显示 Kimi 而实际仍请求 DeepSeek。
 */
export function credentialsForModel(modelId: string): LlmCredentials | null {
  const saved = readCredentials()
  if (!saved) return null
  const model = resolveModel(modelId)
  if (saved.vendorKey !== model.vendorKey) return null
  const preset = VENDOR_ENDPOINTS[model.vendorKey]
  return {
    ...saved,
    baseUrl: saved.baseUrl || preset?.baseUrl || '',
    apiModel: model.apiModel || saved.apiModel,
  }
}

export function clearCredentials(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export interface LlmSummary {
  summary: string
  keyPoints: string[]
  deadline?: string
  evidence?: string
  /** 模型原始返回文本，用于「原文依据」兜底展示。 */
  raw: string
}

const SYSTEM_PROMPT = [
  '你是大学生信息订阅应用的整理助手。阅读用户提供的通知原文，只输出一个 JSON 对象，不要输出 markdown 代码块或任何解释。',
  '字段：',
  'summary：不超过 80 字的中文摘要；',
  'keyPoints：3-5 条中文要点数组；',
  'deadline：正文中的截止日期或关键时间（如 "11月20日" 或 "2026-11-20"），没有则填 null；',
  'evidence：支撑 deadline 或核心结论的原文句子，逐字摘录不超过 60 字，没有则填 null。',
].join('\n')

/** 从模型返回里抠出第一个 JSON 对象，容忍 ```json 围栏与前后杂文字。 */
function extractJson(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidates = [fenced?.[1], text]
  for (const candidate of candidates) {
    if (!candidate) continue
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start === -1 || end <= start) continue
    try {
      const parsed = JSON.parse(candidate.slice(start, end + 1))
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
    } catch {
      // 继续尝试下一段
    }
  }
  return null
}

function asText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export async function summarizeWithLlm(text: string, credentials: LlmCredentials, signal?: AbortSignal): Promise<LlmSummary> {
  const base = credentials.baseUrl.trim().replace(/\/+$/, '')
  const apiKey = credentials.apiKey.trim()
  if (!base || !apiKey) throw new Error('接入信息不完整（缺少接口地址或 API Key）')
  const endpoint = VENDOR_ENDPOINTS[credentials.vendorKey]
  const apiModel = credentials.apiModel.trim() || endpoint?.apiModel || ''
  if (!apiModel) throw new Error('缺少模型名称')

  const controller = new AbortController()
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort)
  const timeoutId = setTimeout(() => controller.abort(), 30000)
  try {
    const response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: apiModel,
        temperature: 0.2,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text.slice(0, 6000) },
        ],
      }),
      signal: controller.signal,
    })
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 160)
      throw new Error(`厂商返回 ${response.status}${detail ? `：${detail}` : ''}`)
    }
    const payload = JSON.parse(await response.text()) as { choices?: { message?: { content?: string } }[] }
    const content = payload.choices?.[0]?.message?.content ?? ''
    if (!content.trim()) throw new Error('模型返回为空')
    const parsed = extractJson(content)
    if (parsed) {
      const keyPoints = Array.isArray(parsed.keyPoints)
        ? parsed.keyPoints.filter((point): point is string => typeof point === 'string' && point.trim().length > 0).slice(0, 6)
        : []
      const deadline = asText(parsed.deadline)
      const evidence = asText(parsed.evidence)
      return {
        summary: asText(parsed.summary) ?? content.trim().slice(0, 160),
        keyPoints,
        deadline: deadline && deadline !== 'null' ? deadline : undefined,
        evidence,
        raw: content,
      }
    }
    // 模型没按 JSON 返回：整段当摘要，诚实标注待核对
    return { summary: content.trim().slice(0, 160), keyPoints: [], raw: content }
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) throw new Error('请求超时（30 秒），请检查接口地址或稍后再试')
    if (error instanceof Error) throw error
    throw new Error(String(error))
  } finally {
    clearTimeout(timeoutId)
    signal?.removeEventListener('abort', onAbort)
  }
}
