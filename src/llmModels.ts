export type ModelKind = '通用' | '推理' | '长文本' | '代码'

export interface LlmModel {
  id: string
  name: string
  vendor: string
  vendorKey: string
  kind: ModelKind
  context: string
  note: string
  badge?: string
  accent: string
}

/**
 * 各厂商 OpenAI 兼容接入端点与默认 API 模型名。
 * 端点来自各厂商公开文档，正式使用前请以厂商最新文档为准；用户可在模型面板里修改。
 */
export interface VendorEndpoint {
  baseUrl: string
  apiModel: string
  keyUrl: string
}

export const VENDOR_ENDPOINTS: Record<string, VendorEndpoint> = {
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', apiModel: 'deepseek-chat', keyUrl: 'https://platform.deepseek.com/' },
  qwen: { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiModel: 'qwen-plus', keyUrl: 'https://bailian.console.aliyun.com/' },
  kimi: { baseUrl: 'https://api.moonshot.cn/v1', apiModel: 'moonshot-v1-8k', keyUrl: 'https://platform.moonshot.cn/' },
  glm: { baseUrl: 'https://open.bigmodel.cn/api/paas/v4', apiModel: 'glm-4-air', keyUrl: 'https://open.bigmodel.cn/' },
  doubao: { baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', apiModel: 'doubao-seed-1-6-250615', keyUrl: 'https://console.volcengine.com/ark/' },
  minimax: { baseUrl: 'https://api.minimaxi.com/v1', apiModel: 'MiniMax-Text-01', keyUrl: 'https://platform.minimaxi.com/' },
  ernie: { baseUrl: 'https://qianfan.baidubce.com/v2', apiModel: 'ernie-4.5-turbo-128k', keyUrl: 'https://console.bce.baidu.com/qianfan/' },
  spark: { baseUrl: 'https://spark-api-open.xf-yun.com/v1', apiModel: 'generalv3.5', keyUrl: 'https://console.xfyun.cn/' },
  hunyuan: { baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1', apiModel: 'hunyuan-turbos-latest', keyUrl: 'https://console.cloud.tencent.com/hunyuan/' },
}

/**
 * 国内常见大模型清单。
 * P2：id 映射到各厂商的 API 模型名（VENDOR_ENDPOINTS），接入真实调用。
 */
export const llmModels: LlmModel[] = [
  {
    id: 'deepseek-v3.2',
    name: 'DeepSeek-V3.2',
    vendor: '深度求索',
    vendorKey: 'deepseek',
    kind: '通用',
    context: '128K',
    note: '中文长文与结构化抽取稳定，成本低',
    badge: '默认',
    accent: '#4d6bfe',
  },
  {
    id: 'deepseek-r1',
    name: 'DeepSeek-R1',
    vendor: '深度求索',
    vendorKey: 'deepseek',
    kind: '推理',
    context: '128K',
    note: '带思维链，适合复杂日期与条款比对',
    accent: '#4d6bfe',
  },
  {
    id: 'qwen3-max',
    name: '通义千问 Qwen3-Max',
    vendor: '阿里云',
    vendorKey: 'qwen',
    kind: '通用',
    context: '256K',
    note: '长文档摘要与多语言表现均衡',
    accent: '#615ced',
  },
  {
    id: 'qwen3-coder',
    name: 'Qwen3-Coder-Plus',
    vendor: '阿里云',
    vendorKey: 'qwen',
    kind: '代码',
    context: '256K',
    note: '解析代码作业与实验说明更可靠',
    accent: '#615ced',
  },
  {
    id: 'doubao-1.6',
    name: '豆包 Doubao-Seed-1.6',
    vendor: '字节跳动',
    vendorKey: 'doubao',
    kind: '通用',
    context: '256K',
    note: '响应快，适合日常通知的批量归类',
    accent: '#2f6bff',
  },
  {
    id: 'kimi-k2',
    name: 'Kimi K2',
    vendor: '月之暗面',
    vendorKey: 'kimi',
    kind: '长文本',
    context: '256K',
    note: '一次读完多份通知与附件',
    badge: '长文本',
    accent: '#1f1f1f',
  },
  {
    id: 'glm-4.6',
    name: '智谱 GLM-4.6',
    vendor: '智谱 AI',
    vendorKey: 'glm',
    kind: '通用',
    context: '200K',
    note: '中英混排与表格信息提取较好',
    accent: '#3a5bd9',
  },
  {
    id: 'ernie-5',
    name: '文心一言 ERNIE 5.0',
    vendor: '百度',
    vendorKey: 'ernie',
    kind: '通用',
    context: '128K',
    note: '中文语义理解与政策解读见长',
    accent: '#2932e1',
  },
  {
    id: 'hunyuan-t1',
    name: '腾讯混元 Hunyuan-T1',
    vendor: '腾讯',
    vendorKey: 'hunyuan',
    kind: '推理',
    context: '128K',
    note: '长链推理，适合冲突信息交叉验证',
    accent: '#0052d9',
  },
  {
    id: 'minimax-m2',
    name: 'MiniMax-M2',
    vendor: 'MiniMax',
    vendorKey: 'minimax',
    kind: '通用',
    context: '200K',
    note: '摘要与改写自然，适合生成知单',
    accent: '#e2504a',
  },
  {
    id: 'spark-x1',
    name: '讯飞星火 X1',
    vendor: '科大讯飞',
    vendorKey: 'spark',
    kind: '推理',
    context: '128K',
    note: '中文教育场景语料丰富',
    accent: '#0a6cff',
  },
]

export const DEFAULT_MODEL_ID = 'deepseek-v3.2'

export function resolveModel(id: string): LlmModel {
  return llmModels.find(model => model.id === id) ?? llmModels[0]
}

/** 按厂商分组，保持 llmModels 的先后顺序。 */
export function groupModels(): { vendor: string; vendorKey: string; models: LlmModel[] }[] {
  const groups: { vendor: string; vendorKey: string; models: LlmModel[] }[] = []
  for (const model of llmModels) {
    const existing = groups.find(group => group.vendorKey === model.vendorKey)
    if (existing) existing.models.push(model)
    else groups.push({ vendor: model.vendor, vendorKey: model.vendorKey, models: [model] })
  }
  return groups
}
