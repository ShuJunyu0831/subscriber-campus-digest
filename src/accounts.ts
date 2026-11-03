import type { Category } from './data'

export type AccountTrust = 'official' | 'media' | 'aggregator'

export interface OfficialAccount {
  id: string
  name: string
  handle: string
  org: string
  description: string
  trust: AccountTrust
  trustLabel: string
  topics: Category[]
  avatar: string
  accent: string
  subscribers: string
  cadence: string
  defaultSubscribed: boolean
}

export interface AccountArticle {
  id: string
  accountId: string
  title: string
  digest: string
  publishedAt: string
  category: Category
  keywords: string[]
  readMinutes: number
  /** 与信息库共用的事件标识：同一 eventKey 的文章会被判为同一件事的不同版本。 */
  eventKey?: string
  deadline?: string
  deadlineTs?: string
  officialUrl?: string
  /** 演示全文（按段落）。只有部分示例文章提供，用于展示阅读体验；真实全文需授权后读取。 */
  fullText?: string[]
  /** 全文来源：demo 演示数据、rss 用户订阅源、wechat 用户粘贴的公众号文章链接（阅读弹窗据此标注）。 */
  fullTextOrigin?: 'demo' | 'rss' | 'wechat'
  /** 订阅源等非内置账号的来源名，入库时写入 InfoItem.source。 */
  sourceName?: string
  /** 只有点过“同步更新”后才出现的条目。 */
  incoming?: boolean
}

/**
 * 公众号演示数据。
 * 说明：微信没有面向第三方应用的公众号文章读取接口，正式版需要用户提供已获授权的
 * RSS / 开放平台凭据；这里的订阅、更新与文章内容都是本地演示数据，不会访问网络。
 */
export const officialAccounts: OfficialAccount[] = [
  {
    id: 'jwc',
    name: '校教务处 · 教学通知',
    handle: 'gh_jwc_notice',
    org: '教务处',
    description: '选课、调课、考试与竞赛报名的官方口径，重要节点会连发多条。',
    trust: 'official',
    trustLabel: '学校官方',
    topics: ['课程通知', '竞赛'],
    avatar: '教',
    accent: '#2d6252',
    subscribers: '1.8 万人',
    cadence: '工作日 1—3 条',
    defaultSubscribed: true,
  },
  {
    id: 'cs',
    name: '计算机学院 · 学生工作',
    handle: 'gh_cs_students',
    org: '计算机学院',
    description: '学院赛事、讲座与实验室开放信息，通知常带附件与报名表。',
    trust: 'official',
    trustLabel: '学院官方',
    topics: ['竞赛', '课程通知'],
    avatar: '计',
    accent: '#456a5a',
    subscribers: '6,420 人',
    cadence: '每周 3—5 条',
    defaultSubscribed: true,
  },
  {
    id: 'dxs',
    name: '中国大学生在线',
    handle: 'dxs.moe.gov.cn',
    org: '教育部中国大学生在线',
    description: '全国性赛事与政策解读，转载时会标注原始出处。',
    trust: 'media',
    trustLabel: '官方媒体',
    topics: ['竞赛', '新闻'],
    avatar: '大',
    accent: '#8a653f',
    subscribers: '126 万人',
    cadence: '每日 2—4 条',
    defaultSubscribed: true,
  },
  {
    id: 'qcb',
    name: '挑战杯全国组委会',
    handle: 'gh_tzb_org',
    org: '“挑战杯”全国组委会',
    description: '只发布赛事章程、申报说明与评审结果，更新频率低但优先级高。',
    trust: 'official',
    trustLabel: '赛事官方',
    topics: ['竞赛'],
    avatar: '挑',
    accent: '#9b5c34',
    subscribers: '23.5 万人',
    cadence: '每月 2—5 条',
    defaultSubscribed: false,
  },
  {
    id: 'jsj',
    name: '竞赛君（聚合）',
    handle: 'gh_jingsaijun',
    org: '个人运营',
    description: '把多个学校的竞赛通知汇总成清单，更新快，但需要回到原始通知核对。',
    trust: 'aggregator',
    trustLabel: '非官方聚合',
    topics: ['竞赛'],
    avatar: '竞',
    accent: '#77837a',
    subscribers: '4.1 万人',
    cadence: '每日 1—2 条',
    defaultSubscribed: false,
  },
]

export const accountArticles: AccountArticle[] = [
  {
    id: 'art-mcm-jwc',
    accountId: 'jwc',
    title: '关于2026年全国大学生数学建模竞赛校内选拔报名的通知',
    digest: '面向全校本科生，三人组队，11月3日23:59前由队长在竞赛管理系统提交报名。逾期不再补报。',
    publishedAt: '2026-10-30T16:20:00+08:00',
    category: '竞赛',
    keywords: ['数学建模', '组队报名', 'A类竞赛'],
    readMinutes: 3,
    eventKey: 'mcm-2026-campus',
    deadline: '11月03日 23:59',
    deadlineTs: '2026-11-03T23:59:00+08:00',
    officialUrl: 'https://www.mcm.edu.cn/',
    fullText: [
      '各学院、各位同学：为选拔优秀队伍参加2026年全国大学生数学建模竞赛，学校决定开展校内选拔，现将有关事项通知如下。',
      '一、参赛对象：全校全日制本科生，三人一队，鼓励跨学院、跨专业组队。每队须指定一名队长，负责报名与材料提交。',
      '二、报名方式：请于11月3日23:59前由队长登录竞赛管理系统，填写队伍信息并上传学生证照片，逾期不再补报。',
      '三、选拔安排：11月12日至15日进行校内选拔，形式为连续三天的建模与论文写作，具体地点另行通知。',
      '四、其他：已报名队伍请留意教务处后续通知，赛前培训安排将在报名结束后统一发布。',
    ],
  },
  {
    id: 'art-ds-jwc',
    accountId: 'jwc',
    title: '《数据结构》第 9 周课程调整通知',
    digest: '原定周二第3—4节的课程调整至周四第5—6节，地点仍为信息楼B203，请提前配置实验环境。',
    publishedAt: '2026-11-03T08:15:00+08:00',
    category: '课程通知',
    keywords: ['数据结构', '调课', '实验'],
    readMinutes: 1,
    eventKey: 'course-ds-week9-2026',
    fullText: [
      '因任课教师参加学校教学研讨会，原定于周二第3—4节的《数据结构》课程调整至周四第5—6节。',
      '上课地点不变，仍为信息楼B203。本次课程将安排二叉树实验讲解，请同学们提前完成实验环境配置。',
      '请各班学习委员相互转告，如有疑问请联系计算机学院教务办公室。',
    ],
  },
  {
    id: 'art-midterm-jwc',
    accountId: 'jwc',
    title: '2026年秋季学期期中教学检查安排',
    digest: '第10—11周开展期中教学检查，各学院需提交教学进度表与学生座谈会记录，学生可在教务系统反馈意见。',
    publishedAt: '2026-11-02T17:40:00+08:00',
    category: '课程通知',
    keywords: ['期中检查', '教学进度', '教务系统'],
    readMinutes: 2,
  },
  {
    id: 'art-ds-cs',
    accountId: 'cs',
    title: '转发：数据结构第 9 周课程调整通知',
    digest: '学院教务办转发教务处调课通知：周二第3—4节调整至周四第5—6节，地点仍在信息楼B203。',
    publishedAt: '2026-11-03T09:10:00+08:00',
    category: '课程通知',
    keywords: ['数据结构', '调课', '转发'],
    readMinutes: 1,
    eventKey: 'course-ds-week9-2026',
  },
  {
    id: 'art-tzb-cs',
    accountId: 'cs',
    title: '“挑战杯”课外学术科技作品竞赛校赛启动',
    digest: '自然科学类论文、哲学社会科学类调查报告与科技发明制作均可申报，11月8日18:00前提交申报书。',
    publishedAt: '2026-10-29T09:10:00+08:00',
    category: '竞赛',
    keywords: ['挑战杯', '科研', '项目申报'],
    readMinutes: 4,
    eventKey: 'tiaozhanbei-2026-campus',
    deadline: '11月08日 18:00',
    deadlineTs: '2026-11-08T18:00:00+08:00',
    officialUrl: 'https://www.tiaozhanbei.net/',
  },
  {
    id: 'art-ai-cs',
    accountId: 'cs',
    title: '学院人工智能创新应用竞赛作品征集',
    digest: '围绕校园、公益与产业场景提交 AI 应用方案，2—5人团队，需一名指导教师，入围作品参加现场路演。',
    publishedAt: '2026-10-27T11:00:00+08:00',
    category: '竞赛',
    keywords: ['人工智能', '创新实践', '作品征集'],
    readMinutes: 3,
    eventKey: 'ai-innovation-2026-campus',
    deadline: '11月12日 20:00',
    deadlineTs: '2026-11-12T20:00:00+08:00',
  },
  {
    id: 'art-mcm-ext-dxs',
    accountId: 'dxs',
    title: '【再次延期】数学建模校内选拔报名延长至11月12日',
    digest: '因报名系统维护，截止时间由11月10日再次顺延至11月12日23:59，已报名队伍无需重复提交。',
    publishedAt: '2026-11-03T09:40:00+08:00',
    category: '竞赛',
    keywords: ['数学建模', '延期', '报名截止'],
    readMinutes: 2,
    eventKey: 'mcm-2026-campus',
    deadline: '11月12日 23:59',
    deadlineTs: '2026-11-12T23:59:00+08:00',
    officialUrl: 'https://www.mcm.edu.cn/',
    fullText: [
      '各参赛队伍：因报名系统维护，经竞赛组委会研究决定，校内选拔报名截止时间由11月10日23:59再次顺延至11月12日23:59。',
      '已完成报名的队伍无需重复提交，报名信息以系统记录为准。系统维护期间无法登录，请错峰提交。',
      '培训与考场安排将根据最终报名情况另行通知，请关注教务处与本公众号推送。',
    ],
  },
  {
    id: 'art-job-dxs',
    accountId: 'dxs',
    title: '2026届毕业生秋季双选会将于11月中旬举行',
    digest: '近 240 家用人单位参会，覆盖软件、智能制造与教育行业，需提前在就业系统预约入场时段。',
    publishedAt: '2026-11-01T10:00:00+08:00',
    category: '新闻',
    keywords: ['双选会', '就业', '预约入场'],
    readMinutes: 3,
  },
  {
    id: 'art-scdx-dxs',
    accountId: 'dxs',
    title: '高校学生创新创业训练计划项目申报指引更新',
    digest: '新一期申报强调过程管理与跨学科协作，明确创新训练、创业训练与创业实践三类项目的结题要求。',
    publishedAt: '2026-11-03T07:40:00+08:00',
    category: '新闻',
    keywords: ['创新训练', '项目申报', '跨学科'],
    readMinutes: 4,
    eventKey: 'news-innovation-training-2026',
  },
  {
    id: 'art-tzb-qcb',
    accountId: 'qcb',
    title: '第十九届“挑战杯”全国竞赛作品申报说明',
    digest: '本届申报新增作品查重与原创性承诺书，跨校组队需由第一作者所在学校盖章推荐。',
    publishedAt: '2026-10-31T15:30:00+08:00',
    category: '竞赛',
    keywords: ['挑战杯', '申报说明', '原创性'],
    readMinutes: 5,
    officialUrl: 'https://www.tiaozhanbei.net/',
  },
  {
    id: 'art-roundup-jsj',
    accountId: 'jsj',
    title: '【汇总】近期可报名的 12 项大学生竞赛',
    digest: '数学建模、电子设计、服务外包等赛事报名时间一览。清单由人工整理，具体日期请以各校通知为准。',
    publishedAt: '2026-11-03T07:20:00+08:00',
    category: '竞赛',
    keywords: ['竞赛清单', '报名时间', '汇总'],
    readMinutes: 6,
  },
  {
    id: 'art-mcm-ext-jsj',
    accountId: 'jsj',
    title: '数学建模校赛报名延长至11月10日，别错过',
    digest: '多所学校已确认延期，统一截止到11月10日。转自各校教务处通知，仅供参考。',
    publishedAt: '2026-11-03T09:00:00+08:00',
    category: '竞赛',
    keywords: ['数学建模', '延期', '汇总'],
    readMinutes: 2,
    eventKey: 'mcm-2026-campus',
    deadline: '11月10日 23:59',
    deadlineTs: '2026-11-10T23:59:00+08:00',
  },
]

/** 点击“同步更新”后追加的条目，用来演示新消息抵达与版本合并。 */
export const incomingArticles: AccountArticle[] = [
  {
    id: 'art-nuedc-cs',
    accountId: 'cs',
    title: '全国大学生电子设计竞赛校内报名启动',
    digest: '三人一组，11月18日前完成校内报名，12月上旬进行校内选拔测试，优秀队伍推荐参加省赛。',
    publishedAt: '2026-11-03T11:20:00+08:00',
    category: '竞赛',
    keywords: ['电子设计', '校内选拔', '三人组队'],
    readMinutes: 3,
    deadline: '11月18日 18:00',
    deadlineTs: '2026-11-18T18:00:00+08:00',
    officialUrl: 'https://nuedc.xjtu.edu.cn/',
    incoming: true,
  },
  {
    id: 'art-winter-jwc',
    accountId: 'jwc',
    title: '关于开展2026年冬季学期选课工作的通知',
    digest: '第一轮选课11月6日开放，通识课与体育课采用志愿抽签，退补选截止到11月20日。',
    publishedAt: '2026-11-03T11:05:00+08:00',
    category: '课程通知',
    keywords: ['选课', '抽签', '退补选'],
    readMinutes: 4,
    incoming: true,
  },
]

export const accountById = new Map(officialAccounts.map(account => [account.id, account]))

export const trustWeight: Record<AccountTrust, number> = {
  official: 3,
  media: 2,
  aggregator: 1,
}

export const categoryAccent: Record<Category, string> = {
  竞赛: 'competition',
  新闻: 'news',
  课程通知: 'course',
}

export function formatArticleTime(iso: string, now = new Date()): string {
  const date = new Date(iso)
  const sameDay = date.toDateString() === now.toDateString()
  const time = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date)
  if (sameDay) return `今天 ${time}`
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return `昨天 ${time}`
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(date) + ` ${time}`
}
