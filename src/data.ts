export type Category = '竞赛' | '新闻' | '课程通知'
export type SourceType = '公开检索' | '用户导入' | '公众号订阅'
export type View = 'today' | 'library' | 'favorites' | 'review' | 'wechat'

export interface InfoItem {
  id: number
  title: string
  category: Category
  summary: string
  source: string
  sourceType: SourceType
  publishedAt: string
  /** ISO 时间，供版本排序使用；缺省时会从 publishedAt 的中文文本推断。 */
  publishedTs?: string
  deadline?: string
  /** ISO 时间，供时效判断使用；缺省时会从 deadline 的中文文本推断。 */
  deadlineTs?: string
  eventDate?: string
  location?: string
  eligibility?: string
  organizer?: string
  /** 可核实的赛事官网；没有把握时留空，界面显示“官网待核对”。 */
  officialUrl?: string
  /** 同一件事的稳定标识，跨来源合并与版本归并都靠它。 */
  eventKey?: string
  tags: string[]
  favorite: boolean
  liked: boolean
  completed: boolean
  completedAt?: string
  priority: 'high' | 'normal'
  evidence: string
  keyPoints: string[]
  daily?: boolean
}

/** 新增条目时允许携带的字段，供手动导入 / 公开检索 / 公众号订阅共用。 */
export interface NewItemInput {
  title: string
  category: Category
  source: string
  summary?: string
  sourceType?: SourceType
  publishedAt?: string
  publishedTs?: string
  deadline?: string
  deadlineTs?: string
  eventDate?: string
  location?: string
  eligibility?: string
  organizer?: string
  officialUrl?: string
  eventKey?: string
  tags?: string[]
  evidence?: string
  keyPoints?: string[]
  daily?: boolean
}

export interface AddItemResult {
  ok: boolean
  item?: InfoItem
  duplicate?: InfoItem
}

export const initialItems: InfoItem[] = [
  {
    id: 1,
    title: '全国大学生数学建模竞赛校内选拔报名',
    category: '竞赛',
    summary: '面向全校本科生，三人组队报名。校内选拔将重点考察数学建模、编程与论文写作能力。',
    source: '校教务处 · 竞赛通知',
    sourceType: '用户导入',
    publishedAt: '10月30日 16:20',
    publishedTs: '2026-10-30T16:20:00+08:00',
    deadline: '11月03日 23:59',
    deadlineTs: '2026-11-03T23:59:00+08:00',
    eventDate: '11月12日—11月15日',
    location: '线上报名，校内选拔地点待通知',
    eligibility: '全校全日制本科生，三人组队',
    organizer: '教务处、数学学院',
    officialUrl: 'https://www.mcm.edu.cn/',
    eventKey: 'mcm-2026-campus',
    tags: ['数学建模', '团队协作', 'A类竞赛'],
    favorite: true,
    liked: false,
    completed: false,
    priority: 'high',
    evidence: '请参赛学生于11月3日23:59前完成组队，并由队长在竞赛管理系统提交报名信息。逾期不再补报。',
    keyPoints: ['每队三名成员，可跨专业组队', '报名后需完成校内培训签到', '选拔结果预计于11月7日前公布'],
    daily: true,
  },
  {
    id: 2,
    title: '“挑战杯”课外学术科技作品竞赛校赛启动',
    category: '竞赛',
    summary: '校赛项目征集已开启，自然科学类论文、哲学社会科学类调查报告和科技发明制作均可申报。',
    source: '校团委 · 公告',
    sourceType: '公开检索',
    publishedAt: '10月29日 09:10',
    publishedTs: '2026-10-29T09:10:00+08:00',
    deadline: '11月08日 18:00',
    deadlineTs: '2026-11-08T18:00:00+08:00',
    eventDate: '11月下旬校赛答辩',
    location: '大学生活动中心',
    eligibility: '在校学生，个人或团队申报',
    organizer: '校团委',
    officialUrl: 'https://www.tiaozhanbei.net/',
    eventKey: 'tiaozhanbei-2026-campus',
    tags: ['挑战杯', '科研', '项目申报'],
    favorite: false,
    liked: true,
    completed: false,
    priority: 'normal',
    evidence: '各参赛团队须在11月8日18:00前提交项目申报书、作品材料及指导教师推荐意见。',
    keyPoints: ['申报材料需同时提交电子版与纸质版', '团队成员原则上不超过8人', '已获往届国奖作品不得重复申报'],
  },
  {
    id: 3,
    title: '“外研社·国才杯”英语演讲赛校园初赛',
    category: '竞赛',
    summary: '校园初赛采用三分钟定题演讲形式，报名明日截止，报名后需加入赛事通知群获取考场安排。',
    source: '外国语学院 · 赛事页面',
    sourceType: '公开检索',
    publishedAt: '10月28日 14:30',
    publishedTs: '2026-10-28T14:30:00+08:00',
    deadline: '11月01日 12:00',
    deadlineTs: '2026-11-01T12:00:00+08:00',
    eventDate: '11月05日 14:00',
    location: '外国语学院报告厅',
    eligibility: '在校本科生、研究生',
    organizer: '外国语学院',
    officialUrl: 'https://uchallenge.unipus.cn/',
    eventKey: 'unipus-2026-campus',
    tags: ['英语演讲', '校园初赛', '即将截止'],
    favorite: true,
    liked: true,
    completed: false,
    priority: 'high',
    evidence: '报名通道将于11月1日中午12:00关闭，请选手准确填写学号与联系方式，并留意后续考场通知。',
    keyPoints: ['定题演讲时长三分钟', '报名无需缴纳费用', '赛前需携带学生证核验身份'],
    daily: true,
  },
  {
    id: 4,
    title: '大学生人工智能创新应用竞赛作品征集',
    category: '竞赛',
    summary: '围绕人工智能在校园、公益和产业场景中的创新应用，提交作品方案与演示材料。',
    source: '计算机学院 · 创新实践中心',
    sourceType: '用户导入',
    publishedAt: '10月27日 11:00',
    publishedTs: '2026-10-27T11:00:00+08:00',
    deadline: '11月12日 20:00',
    deadlineTs: '2026-11-12T20:00:00+08:00',
    eventDate: '12月初现场路演',
    location: '线上提交',
    eligibility: '2—5人团队，需一名指导教师',
    organizer: '创新实践中心',
    eventKey: 'ai-innovation-2026-campus',
    tags: ['人工智能', '创新实践', '作品征集'],
    favorite: false,
    liked: false,
    completed: false,
    priority: 'normal',
    evidence: '参赛团队应于11月12日20:00前提交项目计划书、演示视频及可运行作品或原型。',
    keyPoints: ['鼓励跨学科组队', '需说明数据来源与模型使用情况', '入围作品将参加现场路演'],
  },
  {
    id: 5,
    title: '《数据结构》第 9 周课程调整通知',
    category: '课程通知',
    summary: '周二课程调整至周四下午，原教室不变；本次课程将安排二叉树实验讲解，请提前安装实验环境。',
    source: '计算机学院 · 课程群文件',
    sourceType: '用户导入',
    publishedAt: '今天 08:15',
    publishedTs: '2026-11-03T08:15:00+08:00',
    eventDate: '11月05日 14:00',
    eventKey: 'course-ds-week9-2026',
    location: '信息楼 B203',
    tags: ['数据结构', '调课', '实验'],
    favorite: false,
    liked: false,
    completed: false,
    priority: 'high',
    evidence: '原定于周二第3—4节的课程调整至周四第5—6节，地点仍为信息楼B203，请同学们相互转告。',
    keyPoints: ['上课时间由周二调整至周四', '教室保持不变', '需提前完成实验环境配置'],
    daily: true,
  },
  {
    id: 6,
    title: '高校学生创新创业训练计划项目申报指引更新',
    category: '新闻',
    summary: '新一期项目申报强调过程管理与跨学科协作，适合准备参与科研训练的同学提前了解。',
    source: '校园新闻网 · 教学动态',
    sourceType: '公开检索',
    publishedAt: '今天 07:40',
    publishedTs: '2026-11-03T07:40:00+08:00',
    eventKey: 'news-innovation-training-2026',
    tags: ['创新训练', '项目申报', '校园新闻'],
    favorite: false,
    liked: false,
    completed: false,
    priority: 'normal',
    evidence: '学校发布新一期大学生创新创业训练计划项目申报指引，明确项目遴选、过程管理与结题要求。',
    keyPoints: ['项目分为创新训练、创业训练与创业实践', '鼓励跨专业组建项目团队', '申报前建议联系指导教师'],
    daily: true,
  },
  {
    id: 7,
    title: '大学生心理健康讲座：如何与压力相处',
    category: '课程通知',
    summary: '心理健康中心专题讲座，涵盖压力识别、时间管理与求助渠道，已标记为完成。',
    source: '学生工作部 · 活动通知',
    sourceType: '用户导入',
    publishedAt: '10月25日 12:00',
    publishedTs: '2026-10-25T12:00:00+08:00',
    eventDate: '10月28日 19:00',
    eventKey: 'lecture-mental-health-1028',
    location: '图书馆报告厅',
    tags: ['心理健康', '讲座', '已完成'],
    favorite: false,
    liked: true,
    completed: true,
    completedAt: '10月28日',
    priority: 'normal',
    evidence: '讲座将于10月28日19:00在图书馆报告厅举行，预约成功的同学请提前十五分钟入场。',
    keyPoints: ['了解压力识别方法', '学习基础放松练习', '知晓校内心理支持渠道'],
  },
  {
    id: 8,
    title: '校园开源社区秋季技术分享会',
    category: '新闻',
    summary: '学生开源社区围绕前端工程化与开源协作开展分享，活动资料已归档。',
    source: '校园开源社区 · 活动回顾',
    sourceType: '公开检索',
    publishedAt: '10月22日 18:00',
    publishedTs: '2026-10-22T18:00:00+08:00',
    eventDate: '10月26日 19:30',
    eventKey: 'event-opensource-1026',
    location: '创新创业中心',
    tags: ['开源', '技术分享', '已完成'],
    favorite: true,
    liked: false,
    completed: true,
    completedAt: '10月26日',
    priority: 'normal',
    evidence: '本次技术分享会将介绍前端工程化实践及首次参与开源项目的方法，欢迎对开发感兴趣的同学参加。',
    keyPoints: ['了解前端工程化基本流程', '认识开源协作方式', '获取社区后续活动信息'],
  },
  {
    // 演示“同一事件的不同时间版本”：教务处原文在 10/30 发布，11/02 官方号补充了延期说明
    id: 9,
    title: '【延期】全国大学生数学建模竞赛校内选拔报名延长至11月10日',
    category: '竞赛',
    summary: '应多数学院申请，校内选拔报名截止时间由11月3日顺延至11月10日23:59，已报名队伍无需重复提交。',
    source: '中国大学生在线 · 公众号',
    sourceType: '公众号订阅',
    publishedAt: '11月02日 20:10',
    publishedTs: '2026-11-02T20:10:00+08:00',
    deadline: '11月10日 23:59',
    deadlineTs: '2026-11-10T23:59:00+08:00',
    eventDate: '11月12日—11月15日',
    location: '线上报名，校内选拔地点待通知',
    eligibility: '全校全日制本科生，三人组队',
    organizer: '教务处、数学学院',
    officialUrl: 'https://www.mcm.edu.cn/',
    eventKey: 'mcm-2026-campus',
    tags: ['数学建模', '延期通知', '报名截止'],
    favorite: true,
    liked: false,
    completed: false,
    priority: 'high',
    evidence: '校内选拔报名截止时间由11月3日23:59顺延至11月10日23:59，已报名队伍无需重复提交，培训安排另行通知。',
    keyPoints: ['截止时间顺延至11月10日', '已报名队伍无需重复提交', '培训与考场安排另行通知'],
    daily: true,
  },
  {
    // 同一版本的转载来源，用来演示“自动去重 + 官方来源优先”
    id: 10,
    title: '数学建模校赛报名延长至11月10日，别错过',
    category: '竞赛',
    summary: '多所学校已确认延期，统一截止到11月10日。转自各校教务处通知，仅供参考。',
    source: '竞赛君 · 聚合',
    sourceType: '公众号订阅',
    publishedAt: '11月02日 20:32',
    publishedTs: '2026-11-02T20:32:00+08:00',
    deadline: '11月10日 23:59',
    deadlineTs: '2026-11-10T23:59:00+08:00',
    eventKey: 'mcm-2026-campus',
    tags: ['数学建模', '延期通知', '转载'],
    favorite: false,
    liked: false,
    completed: false,
    priority: 'normal',
    evidence: '多所学校已确认延期，统一截止到11月10日。转自各校教务处通知，仅供参考。',
    keyPoints: ['以教务处原文为准'],
  },
]

export const categoryMeta = {
  竞赛: { className: 'competition', label: '竞赛' },
  新闻: { className: 'news', label: '新闻' },
  课程通知: { className: 'course', label: '课程通知' },
}
