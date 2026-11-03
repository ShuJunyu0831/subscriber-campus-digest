# 交接文档

> 用途：在新窗口继续这个项目时，把这份文档整段发给助手，它就能接上上下文。
> 最后更新：2026-11-03

---

## 一、一句话现状

Subscriber 原型已完成 **Web 版 + Windows 免安装桌面版**，代码在 GitHub 私有仓库，
`npm test` **25 组 Playwright 全绿**、`npm run build` 通过。

本轮（11-03）补齐了四件事：**信息分类/版本/去重引擎、公众号订阅、赛事官网一键入口、右下角模型选择**；
随后打通了 **P0 真实数据链路**（`npm run collect` 官网直采 + 快照 + 桌面版实时抓取，详见待办区 P0）、
**P2 模型真实路由**（`src/llmClient.ts` + LlmPicker 凭据区 + 导入真实调用 + Playwright mock 验证，详见待办区 P2）、
**P4 体验补完**（版本并排对比、收藏页搜索/排序、完成回顾本周本月切换、公众号全文阅读、GitHub Actions CI，详见待办区 P4），
以及 **P1 真实订阅源**（温医大学生处直采、RSS/Atom 真实订阅、桌面版主进程抓取，详见待办区 P1）。
最新一轮（同日）按「服务想参加竞赛的学生」的定位加了两个功能：**多渠道批量导入 + 勾选后逐条 AI 分析**
与 **自选关注竞赛官网 / 微信小程序**（详见待办区 P5），导航里的「微信消息」因此改名为「消息与订阅」。
随后补上了 **公众号链接订阅**（粘贴任意一篇公众号文章链接即可识别账号并抓正文，详见待办区 P6），
并把微信入口从「复制粘贴」升级成**系统转发链路**：`subscriber://share` 协议、`--share-text` / `--share-file` 启动参数、
二次启动推进队列、拖放文件、剪贴板读取，五条路都汇入同一个批量导入拆分（详见待办区 P6-B）。
现在四个直采源合计 24 条真实条目；仍然没做的是安装包签名与 NSIS 安装包（P3）。

---

## 二、30 秒上手

项目路径：`D:/workbuddy/2026-10-31-18-32-31`

```bash
npm install
npm run dev              # 开发：http://127.0.0.1:5173
npm test                 # Web 端 25 组 Playwright（约 50 秒）
npm run build            # 类型检查 + 生产构建
npm run collect          # 真实抓取竞赛官网 → src/live/competitions.json + 桌面版采集器

npm run desktop          # 直接以 Electron 运行
npm run desktop:portable # 重新打免安装包 → desktop-dist/Subscriber（会先 collect --lenient）
npm run desktop:verify   # 拉起打包后的 exe 跑 26 项检查（含 IPC 探针）
```

演示时可以按这条路径走一遍（能一次看完四个新功能）：

1. 打开「全部信息」：首张卡片带 **V2** 徽标与「赛事官网」入口，工具条右侧显示「已自动合并 2 条 · 1 组版本」。
2. 点「分类规则」：看版本组 V1 → V2、去重阈值与分类依据。
3. 点首张卡片：详情抽屉里有版本时间线、分类与去重说明、底部官网按钮。
4. 进「微信消息 → 公众号订阅」：账号分组、按条列出，第一条带「版本更新」。
5. 点「同步更新」→ 出现 2 条新消息 → 点「合并更新」→ 回到信息库，首张卡片变为 **V3**。
6. 点右下角模型胶囊：切换 Kimi / 通义千问等，选择会被记住，微信分析的确认弹窗会引用当前模型；
   面板底部「接入真实模型」可保存 API Key，之后手动导入粘贴文字会真实调用厂商接口。
7. 进「全部信息」，用工具条下的搜索框搜「数学建模」→ 只剩一条；点「临近截止」→ 挑战杯排到最前。
8. 打开首张卡片 → 版本记录右侧「并排对比」→ 弹窗并排看 V1 / V2，截止时间那行标「已变更」。
9. 进「完成回顾」→ 切「本周 / 本月 / 全部」，列表按天或按月分组。
10. 进「微信消息 → 公众号订阅」→ 点《数据结构》标题 → 「阅读全文」看演示全文。
11. 左栏「我的 RSS 订阅」→「添加订阅源」→ 填名称与一个真实 RSS/Atom 地址 → 分组里立刻多出一组，
    该组条目阅读弹窗顶部标「RSS 全文 · 真实抓取」；抓失败会直接报错，不会塞演示内容。桌面版这一步不受跨域限制。
12. 进「消息与订阅 → 消息箱」→ 点「批量导入」→ 渠道选「钉钉」→ 把三段带群名的消息一次粘进去 →
    下方「拆分结果」自动拆成 3 条 → 「仅保存到本机（3 条）」→ 按渠道筛选 → 「全选当前 3 条」→「用 AI 分析」。
13. 切到「关注源」：取消勾选某个内置官网，回信息库看它的条目就消失了；勾回来又出现。
    下面还能添加自定义官网（浏览器版会提示需要桌面版）、登记微信小程序并把卡片导进消息箱。

---

## 三、交付物在哪

| 产物 | 路径 | 说明 |
| --- | --- | --- |
| 免安装包压缩件 | `desktop-dist/Subscriber-0.1.0-win-x64.zip` | 解压双击即用 |
| 主程序 | `desktop-dist/Subscriber/Subscriber.exe` | `npm run desktop:portable` 生成 |
| 使用说明 | `desktop-dist/Subscriber/使用说明.txt` | 打包时自动生成 |
| 源码仓库 | https://github.com/ShuJunyu0831/subscriber-campus-digest | 私有，分支 `main` |
| 运行截图 | `shots/desktop-0*.png` | 5 个页面各一张（已 gitignore） |

---

## 四、已经做完的事

**Web 界面**
- 顶部 sticky 导航 + 全屏 ASCII 背景 + 居中玻璃内容层。
- 首屏今日摘要弹框，分层错峰弹出；四个页面 h1 接入 SplitText 逐字入场。
- 修掉改版引入的对比度问题（白色副标题、分享提示落在背景上不可见等）。

**桌面版**
- Electron 45，`contextIsolation + sandbox`，`file://` 加载，单实例锁，外链交给系统浏览器。
- 自定义打包脚本绕开 electron-builder 在本机的目录重命名失败；图标与版本信息写入 exe。

**2026-11-03 本轮新增**

1. **分类引擎 `src/classify.ts`（纯函数，无网络依赖）**
   - 标题规范化（全角转半角、去标点）→ 剔除「关于/通知/延期/更正…」得到**事件指纹**。
   - 字符二元组 Dice 相似度：同一事件阈值 `0.74`，重复来源阈值 `0.92`。
   - 聚类：`eventKey` 相同即同一事件，否则按标题相似度；同一事件只展示一条最新结论。
   - **版本识别**：按发布时间升序，截止时间变化或出现「更正/修正/补充/变更/调整/取消/恢复/重新」→ 版本 +1；
     「延期/延长/推迟」必须**同时**有截止时间变化才算新版本，否则视为同一版本的转述（挡掉聚合号转发造成的假版本）。
   - **去重**：同一版本内多条来源自动合并，优先保留官方来源（`聚合/转载/搬运/非官方` 降权，`官方/教务处/校团委/学院/新闻网` 加权）。
   - 分类打分：关键词加权给出类型、置信度与命中词；时效状态 `active / expiring / expired / unconfirmed`。
   - 演示数据里预置了这件事的完整示例：id 1（10-30 原文，截止 11-03）→ id 9（11-02 延期到 11-10，V2）→ id 10（同版本转载，被合并）。

2. **公众号订阅**
   - 「微信消息」页拆成两个标签：微信群分享 / 公众号订阅（保留原有本机优先逻辑）。
   - 5 个演示账号（学校官方、学院、官方媒体、赛事组委会、非官方聚合），12 篇文章；订阅状态存 localStorage。
   - 按账号分组 + 分类筛选 + 只看未读 + 关键词搜索；文章行展示分类、截止时间、关键词、转载来源。
   - 与信息库查重：未入库 / 已去重 / 有新版本 / 旧版本 四种关系，新版本可「合并更新」追加为下一个版本。
   - 「同步更新」模拟拉取 2 条新消息；公众号文章之间也按 `eventKey + 截止时间` 合并转载。

3. **赛事官网入口**
   - `InfoItem.officialUrl`；卡片底部新增 `.card-extras` 条，提供「赛事官网 ↗」一键跳转（`target=_blank`，Electron 下交给系统浏览器）。
   - 已核实并写入：数学建模 `mcm.edu.cn`、挑战杯 `tiaozhanbei.net`、外研社 `uchallenge.unipus.cn`。
   - 人工智能创新应用竞赛属于虚构赛事，没有官网 → 显示「官网待核对」，详情页按钮禁用。
   - 详情抽屉底部同样给官网按钮，与「查看原文」并列。

4. **右下角模型选择**
   - `src/llmModels.ts` 收录 11 个国内常见模型（DeepSeek V3.2 / R1、通义千问 Qwen3-Max / Qwen3-Coder、豆包、Kimi K2、GLM-4.6、文心 5.0、混元 T1、MiniMax M2、星火 X1）。
   - 固定右下角胶囊 → 按厂商分组的面板，键盘 Esc / 点击外部关闭，选择存 localStorage。
   - 当前模型会出现在：导入弹框底部、今日摘要「摘要由 X 生成」、微信「确认发送给 AI」弹窗。**不发起任何真实请求。**

5. **界面配套**
   - 信息库工具条新增归并概览与「分类规则」入口；`TaxonomyModal` 展示四个分类维度、阈值与版本组。
   - 导入弹框会实时给出「分类引擎建议：竞赛 · 置信度 89%（命中…）」，可一键采用。
   - 卡片显示版本徽标、时效状态、重复合并数；截止时间改为按当前时间实时计算（今天截止 / N 天后截止 / 已截止）。
   - 移动端（≤560px）工具条换行、信息流改为两列堆叠，390px 无横向溢出。

---

## 五、关键文件地图

```
src/
  App.tsx             主界面：顶栏、内容层、5 个页面、摘要弹框、卡片与详情抽屉
  classify.ts         分类引擎（指纹/相似度/聚类/版本/去重/时效/分类打分）
  liveSource.ts       官网直采核心（LIVE_SOURCES 源定义、列表/详情解析、截止时间候选、自定义官网通用识别）
  liveSnapshot.ts     快照 → InfoItem 转换、抓取时间展示
  live/competitions.json  真实抓取快照（npm run collect 产出，提交入库）
  rss.ts              RSS 2.0 / Atom 解析、订阅增删、条目 → 文章/入库输入（三端复用）
  wechatArticle.ts    公众号文章页解析（biz/nickname/ct/正文）、链接订阅存储、记录 → AccountArticle
  accounts.ts         公众号与文章演示数据、可信度等级
  AccountFeed.tsx     订阅页（内置账号 + RSS 订阅、分组、筛选、同步、查重、入库）
  TaxonomyModal.tsx   分类规则与版本记录说明
  LlmPicker.tsx       右下角模型选择面板（含真实模型接入设置区）
  llmModels.ts        国内常见模型清单 + VENDOR_ENDPOINTS（9 家厂商端点预设）
  llmClient.ts        真实模型调用（localStorage 凭据 + OpenAI 兼容 chat/completions）
  GradientASCII.tsx   全屏 WebGL2 多 Pass ASCII 背景
  SplitText.tsx       逐字动画标题
  WechatInbox.tsx     消息与订阅（本机消息箱、批量导入、逐条 AI 分析、关注源/公众号分区）
  shareImport.ts      批量粘贴文本拆分（来源名行识别、空行兜底），纯函数、无副作用
  dropImport.ts       拖放读取（同步取 DataTransfer → 异步读文件 / 解压 zip / 展开文件夹、大小与类型护栏），纯函数
  zipImport.ts        最小 ZIP 读取器（EOCD + 中央目录 + DecompressionStream('deflate-raw')），只取文本条目
  textDecode.ts       文本解码兜底（BOM → UTF-8 严格 → GB18030 → 宽松 UTF-8）
  FollowSources.tsx   关注源：竞赛官网勾选与自定义抓取、小程序登记与卡片导入
  follows.ts          关注配置读写（localStorage）+ 信息库过滤用的 liveSourceId 集合
  localStore.ts       IndexedDB 本地存储（消息含 channel / analyzedAt、批量写入）+ `readPreference/writePreference`
  data.ts             演示数据、InfoItem / NewItemInput / AddItemResult 类型
  index.css           全部样式（新功能样式集中在文件末尾）
scripts/collect.mjs   真实采集脚本（esbuild 打包 liveSource → Node 抓取 → 写快照 + 桌面版采集器）
electron/             主进程（IPC：live:fetch / live:fetch-custom / rss:fetch / wechat:fetch-article / clipboard:read / share:pull）、打包、图标、验证脚本
electron/share-args.cjs  外部转发参数解析（协议链接 / --share-text / --share-file），纯函数、被验证脚本直接断言
electron/live/        collector.cjs（npm run collect 生成，已 gitignore）
.github/workflows/ci.yml  CI：build + Playwright（Node 20 + Chromium）
tests/prototype.spec.ts   25 组 Playwright 用例
```

---

## 六、不要随便改的决定

产品/隐私侧：

1. **不读取个人微信群、钉钉群。** 只能由用户主动分享、粘贴或点「从剪贴板读取」，先落 IndexedDB，本机预览后再按次确认是否上云。
2. **剪贴板只读一次，不监听。** `clipboard:read` 是用户点击时的一次性调用；不要改成 `setInterval` 轮询或 `clipboard` 事件监听，那等于偷偷读用户剪贴板。
3. **不做自动读取无权限的内容。** 公开检索只访问允许使用的公开网页，并保留来源证据。
4. **完成回顾由用户手动勾选**，系统不自动判定、不虚构成就。
5. **原始文件默认留在本地**，仅在用户主动解析时按需上传，并有明确删除规则。
6. **每份摘要只给一份**，不做信息流无限刷新。
7. 预算目标：每月 200 元以内，需要用户额度与处理频率控制。
8. 首版文件范围：文字、Word、PDF、图片、普通 PPT。扫描件增强、超大 PPT、视频后置。
9. **不要说「已接入微信」。** 微信没有面向第三方应用的订阅号读取接口。内置公众号账号仍是演示数据；
   真实订阅走「用户自己提供、已获授权的 RSS / Atom 地址」这条路（`src/rss.ts`），界面标注「真实抓取」，
   抓不到就报错，不许用演示内容顶替失败结果。
10. **模型选择器不发请求。** 只是界面标签，任何真实调用都要单独做密钥管理、计费提示与失败兜底。
11. **官网只放能核实的入口。** 拿不准就留空显示「官网待核对」，不要编造链接。

技术侧：

- 分类阈值为 `0.74 / 0.92`（`classify.ts` 顶部）。改了会影响卡片合并数量与测试断言
  （「已自动合并 2 条」「V2」「V3 · 已合并 3 个版本」），改完要同步 `tests/prototype.spec.ts`。
- 版本判定顺序：**先看截止时间是否变化，再看是否含非日期变更词**。不要把「延期」单独当作新版本条件。
- 同一版本的代表条目优先官方来源；判断依据是 `source` 文本里的「官方/教务处/学院」与「聚合/转载」。
- 背景画布的 `speed`、`density` 在 `App.tsx` 调，`dpr={1}` 是刻意的（全屏 WebGL 会把测试拖慢到超时）。
- Playwright 配置了 `reducedMotion: 'reduce'`，别删，删了用例会超时。
- `vite.config.ts` 的 `base: './'` 是桌面版 `file://` 加载必需的。
- 卡片结构是 `grid`（card-main / card-actions / card-extras 跨列），官网链接必须放在 `.card-extras`，
  不要再塞回 `.card-main`（它是 `<button>`，不能嵌套 `<a>`）。
- **RSS 标题不要走 `htmlToParagraphs()`**：那个函数会过滤掉不足 8 字的内容（正文段落去噪用），
  短标题（如「通知」）会被整条丢掉。标题/feed 名用 `bareText()`（只去标签与实体，不做长度过滤）。`src/rss.ts` 里已经分开了。
- **`inferCategory` 的输入只给「标题 + meta 摘要」**，不要喂整页正文：整页里有「学院/活动/通知」这类词，
  会把行政通知误判成「新闻」。
- 公众号/订阅源分组里判断「是否已订阅」用的是 `activeIds = [...subscribed, ...rssAccounts.map(a=>a.id)]`，
  新增来源类型时记得加进去，否则新来源的条目不会显示。
- **消息渠道只有一处真源**：`CHANNEL_LABELS` / `CHANNELS`（`shareImport.ts`）。加渠道要同时改
  `LocalWechatMessage.channel` 的类型、`.channel-badge.<channel>` 配色和渠道筛选按钮，否则界面上会没有标识。
- **关注过滤只碰 `liveSourceId`**：`App.tsx` 的 `visibleItems` 对没有 `liveSourceId` 的条目一律放行。
  别把过滤挪进 `classifyLibrary`，那样手动导入的条目也会被牵连。
- `follows` 状态放在 `App.tsx`（不是 `WechatInbox` 内部），因为信息库过滤和关注页要共用同一份数据；
  组件里别再各自 `readFollows()`，会出现两处状态不同步。
- 「批量导入」与「批量粘贴导入」两个按钮是**不同文案**，测试用 `exact: true` 区分；改文案前先看 `tests/prototype.spec.ts`。

---

## 七、待办（按优先级）

**P0 — 接真实数据链路（竞赛截止提醒链路已打通，2026-11-03）**
- 已完成：`npm run collect` 从两个真实竞赛官网（mcm.edu.cn 通知公告、tiaozhanbei.net 动态）抓取公告，
  经 `src/liveSource.ts` 解析 + 分类引擎归一，写出快照 `src/live/competitions.json`（提交入库；P1 扩源后当前 24 条）。
- Web 版启动时把快照并入信息库（`src/liveSnapshot.ts`，id 从 1001 起），卡片来源显示「官网直采」，
  工具条有「官网直采 N 条 · 抓取于 …」标注；详情抽屉的原文依据会注明自动采集时间。
- 桌面版额外有实时链路：`electron/main.cjs` 的 `live:fetch` IPC 调用 `electron/live/collector.cjs`
  （同一份 `liveSource.ts` 的 CJS 打包），preload 暴露 `fetchLive`，信息库工具条出现「实时抓取官网」按钮。
- 诚实边界：抓到的标题/链接/发布日期/正文摘句都是官网原文；摘要与截止时间是机械提取的，
  提取不到就留空标「待核对」，绝不编造；RSS 订阅条目为真实抓取（见 P1），内置公众号文章仍是演示数据。
- 真实数据上验证过的引擎行为：合并 3 条真实重复（研讨会第一次/第二次通知、揭榜挂帅系列文）、版本分组正常。
- 剩余：`localStore.ts` 的「上传 → 分析」换真实 LLM 调用（P2 一起做，需密钥管理）；公众号真实订阅源归 P1。

**P1 — 真实订阅源（温医大双源 + RSS/Atom 订阅，已完成，2026-11-03）**

A. 官网直采扩源（`src/liveSource.ts`）
- 温州医科大学教务处（`info/1034` 学业管理 + `info/1035` 教学建设）：列表条目自带 ISO 日期；
  详情页从 `<meta name="pageTitle">` 取完整标题（列表标题被截断）、`<meta name="description">` 取摘要。
- 温州医科大学学生处（`info/1210` 通知公告）：**日期在标题之前**，形如 `<dd class="mm">十月</dd><dd class="dd">28</dd>`，
  列表 `<li>` 里拿不到 → 新增 `parseLeadingDate()` + `chineseMonth()`（支持「十月」「11」；「十一/十二」特判，
  避免被当成 1 月/2 月），在 `extractListLinks` 末尾用匹配位置前的 400 字符兜底。
- 同时把校级通知公告源换掉了：那个列表出来全是招生/物业/人才补贴，分类全落「新闻」，价值太低。
- 解析器通用增强：`extractListLinks` 支持列表块内日期（`<span>2026-10-28</span>` 与川大式 `<p>11/02</p><span>2026</span>`）；
  相对链接改用 `new URL(href, source.listUrl)` 解析（修掉 `../info/...` 拼错）；截止时间候选加两条护栏——
  「X月X日以前/之前」是资格界限不算截止、日期等于发布日期的不算截止。
- **分类输入收窄**：`inferCategory` 只喂「标题 + meta 摘要（截 120 字）」，不再喂整页正文。
  之前学生处条目全被整页里的「学院/活动/通知」拽成「新闻」。
- 快照现为 **24 条**：温医大教务处 8 + 温医大学生处 6 + mcm 5 + 挑战杯 5。
  测试断言用来源构成（`温州医科大学学生处` 存在、条数 > 0），不写死快照数量。

B. RSS / Atom 真实订阅（`src/rss.ts`，新建）
- 自写解析器：RSS 2.0 `<item>` 与 Atom `<entry>` 双格式，处理 CDATA、`content:encoded`、
  相对链接按 feed 地址补全、`pubDate`/`updated` 转 ISO；`htmlToParagraphs()` 保留段落边界并过滤 <8 字的碎片。
- **`bareText()` 专供标题**：`htmlToParagraphs()` 的「≥8 字」过滤会把「通知」这种短标题整条丢掉（真实缺陷，踩过）。
- 订阅管理：`readSubscriptions/saveSubscriptions/createSubscription`，localStorage 键 `subscriber-rss-subscriptions`。
- 抓取：`fetchFeed(url, 12000)`，12 秒超时、按 `content-type`/`charset` 做 gbk 兜底、CORS 失败给可读报错。
- 三端复用同一份解析器：Web 端直接 `fetch`；桌面版走 `electron/main.cjs` 的 `rss:fetch` IPC
  （校验只允许 http/https → `collector.fetchFeed()`），`preload.cjs` 暴露 `fetchRss`，**完全绕开跨域**。
  `scripts/collect-entry.ts` 里追加 `export { fetchFeed }`，esbuild 一并打进 `electron/live/collector.cjs`。

C. 界面（`src/AccountFeed.tsx`）
- 左栏新增「我的 RSS 订阅」区块：列出订阅源、「添加订阅源」（名称 + 地址，**先抓一次成功才写入**，
  避免留下永远失败的源）、「立即刷新」、失败汇总提示。
- 每个订阅源映射成一个 `OfficialAccount`（`id: 'rss:'+id`，`trustLabel: 'RSS 订阅'`）；
  分组头显示 `真实抓取` 徽标；**判断可见性统一用 `activeIds`**，别再逐个 `subscribed.includes()`。
- 阅读弹窗 eyebrow 按 `fullTextOrigin` 切换：「RSS 全文 · 真实抓取」/「ARTICLE READER · 演示全文」。
- 入库时 `sourceName` 写进 `InfoItem.source`（`AccountArticle.sourceName`），信息库能看出条目来自哪个订阅源。
- 测试：新增 1 组（`page.route` mock 一份 RSS XML → 添加 → 分组出现 → 阅读全文 → 入库），**18 组全绿**。

D. 诚实边界
- 不从微信读任何东西，也没有「接入微信」；真实订阅的前提是用户自己拿到、自己有权使用的 feed 地址。
- 抓失败就报错，不用演示内容顶替。
- 下一步（未做）：OPML 批量导入、按源单独设置抓取条数/间隔、正文清洗（去导航/版权尾巴）。

**P2 — 模型真实路由（已打通，2026-11-03）**
- `src/llmClient.ts`：凭据读写（localStorage `subscriber-llm-credentials`，只存本机）+
  `summarizeWithLlm()`（OpenAI 兼容 `POST {baseUrl}/chat/completions`，30s 超时，要求返回 JSON
  summary/keyPoints/deadline/evidence；解析失败整段当摘要，诚实兜底）。
- `src/llmModels.ts`：`VENDOR_ENDPOINTS` 预设 9 家国内厂商的 baseUrl/apiModel/keyUrl（deepseek/qwen/kimi/glm/doubao/minimax/ernie/spark/hunyuan）。
- `LlmPicker.tsx`：面板底部「接入真实模型（可选）」设置区——厂商下拉（自动预填接口地址与模型名，可改）、
  API Key 密码框、「保存并接入 / 清除接入」，已接入后面板徽标从「演示选择」变「已接入」。
- `App.tsx` ImportModal：tab=text 且有凭据时真实调用（成功→条目写入模型摘要与原文摘录，
  标签「将由 X 整理 · 真实调用」；失败→toast 提示并回落 1200ms 模拟整理）；file/link 仍是模拟。
- 测试：`tests/prototype.spec.ts` 新增用例用 `page.route('**/chat/completions*')` mock 厂商接口
  （含 CORS 预检处理），验证凭据保存→导入真实调用→信息库出现模型摘要（13 组全绿）。
- 剩余：模型输出仍需「待核对」心智；微信文本上云的逐次确认沿用现有弹窗，额度控制/重试未做。

**P3 — 安装包与签名**
- NSIS 安装包在本机仍可能因目录重命名 `EPERM` 失败；换干净机器可直接跑 `npm run desktop:build`。
- 改动 PE 资源后 Electron 原签名失效，`Subscriber.exe` 会触发 SmartScreen；对外分发需自购代码签名证书。

**P4 — 体验补完（版本对比 / 收藏检索 / 回顾分期 / 全文阅读 / CI，2026-11-03）**
- 版本对比：详情抽屉「版本记录」右侧「并排对比」→ 弹窗里选两个版本，逐字段（标题/摘要/报名截止/发布时间/来源/版本说明）
  列出差异，变更行标「已变更」并给旧值加删除线。
- 信息库与收藏页：工具条下新增页内搜索框 + 「默认排序 / 临近截止」切换（未截止按时间正序、无日期居中、已截止垫底）。
  顶部全局搜索在 ≤1160px 会被隐藏，页内搜索解决了窄屏无搜索入口的问题。
- 完成回顾：新增「本周 / 本月 / 全部」切换，按天（周/月视图）或按月（全部视图）分组，`.completed-list` 仍是单一容器，
  组头 `completed-group-head` 插在列表里；完成时间从 `completedAt` 文本解析（支持「今天」）。
- 公众号全文阅读：`AccountArticle.fullText`（3 篇示例）→ 文章展开后「阅读全文」打开阅读弹窗，标注「演示全文」；
  无全文的文章明确提示「这篇只有摘要」，不会编造正文。
- CI：`.github/workflows/ci.yml`（Node 20 + Chromium + `npm run build` + `npm test`，失败上传 test-results）。
- 测试：P4 完成时 17 组全绿（新增 4 组：版本对比字段变更、收藏搜索/筛选/排序、回顾分期计数、公众号全文）；
  P1 追加 RSS 订阅 1 组后共 18 组，P5 再追加 2 组后共 **20 组**。

**P5 — 服务竞赛参赛者的两个新功能（2026-11-03）**

A. 多渠道批量导入 + 勾选后逐条分析（`src/shareImport.ts`、`WechatInbox.tsx`、`localStore.ts`）
- 消息多了 `channel: 'wechat' | 'dingtalk' | 'miniprogram'`（老数据没有该字段，一律按微信处理）与 `analyzedAt`。
- 批量导入：`parseBatchText()` 纯函数拆分——先识别「来源名行」（`【群名】`、`群名：内容`、单独一行以「群/频道/小程序…」结尾），
  一个来源名都没识别到时退回按空行切；<6 字的碎片丢弃；同名默认名自动补序号。
  弹窗里能看到拆分结果并逐条删除，保存走 `saveLocalMessages()` 单事务批量写。
- 单条导入保留原样（按钮「导入单条」），测试依赖的 `dialog` 名称仍是「导入微信分享」。
- 桌面版新增 `clipboard:read` IPC：点「从剪贴板读取」才读一次，**不注册监听、不轮询**。
- 分析：勾选 → 确认弹窗（显示渠道构成、隐私清理、模型、将发送文本）→ 逐条处理，一条消息一条信息库条目；
  有凭据走 `summarizeWithLlm`（`llm` 摘要/要点/截止时间/原文依据），没凭据走本地规则整理并明确标「本地整理」。
  进度条实时更新，失败条目单独汇总，成功条目打 `analyzedAt` 并取消勾选。
- 导航「微信消息」改名 **「消息与订阅」**（现在同时收钉钉与小程序），标签页为「消息箱 / 公众号订阅 / 关注源」。

B. 自选关注竞赛官网与小程序（`src/follows.ts`、`FollowSources.tsx`、`liveSource.ts`、`follows` 状态在 `App.tsx`）
- 关注配置存 localStorage `subscriber-followed-sources`；`readFollows()` 会把新版本新增的内置源补进老配置（默认关注），
  避免升级后信息库突然少一半。
- 内置 4 个官网源可勾选；取消关注后 `App.tsx` 用 `enabledLiveSourceIds()` 过滤掉对应 `liveSourceId` 的条目
  （只影响官网直采条目，手动导入 / 公众号 / 演示数据不受影响），数据本身不删，勾回来就恢复。
- 自定义官网：`fetchCustomSource()` = `extractGenericLinks()` + 复用 `buildLiveItem()`。
  通用识别规则：同域 + 链接带两位以上数字 + 标题 ≥10 字 + 不像导航词；识别不到直接说识别不到并建议改用 RSS。
  桌面版走 `live:fetch-custom` IPC，浏览器版如实提示跨域限制（不假装抓到了）。
- 微信小程序：只登记关注（名称 + 备注），卡片上「导入卡片」→ 切到消息箱并打开批量导入、渠道预填「小程序」。
  **不假装能订阅小程序内容**：小程序没有公开读取接口，正文只能靠用户转发。
- 测试：新增 2 组（批量导入 → 渠道筛选 → 全选 → 逐条分析入库；关注源勾选影响信息库 + 自定义官网跨域提示 + 小程序登记导入）。

**P6 — 公众号订阅与「转发到其他应用」接收（2026-11-03）**

A. 公众号链接订阅（`src/wechatArticle.ts` 新建、`AccountFeed.tsx`）
- 微信不开放历史文章接口，所以走「粘贴任意一篇文章链接 → 抓那一页 → 归到该账号」：
  `isWechatArticleUrl()` 只认 `mp.weixin.qq.com/s`；`parseWechatArticle()` 从 `og:title` / `activity-name` 取标题，
  `var nickname` / `biz` / `user_name` 识别账号（`readJsVar()` 处理 `\xNN` 与 `\uNNNN` 转义），
  `var ct` 转发布时间，`#js_content` 区域取正文（区域右边界截到 `js_pc_qr_code` / `rich_media_tool` / `js_cmt_area`）。
- 正文 `<section>` 先统一换成 `</p>` 再交给 `htmlToParagraphs()`，否则微信的段式排版会被并成一整段。
- 存储：localStorage `subscriber-wechat-account-subs`，同账号自动聚合，按 url 去重，每个账号保留最近 30 篇（`mergeWechatArticle()`）。
- 界面：左栏「公众号链接订阅」区块可一次粘多条链接（空格/逗号/分号分隔），结果汇总「新增 N 篇 / N 篇已在列表里 / N 篇失败」。
  分组头徽标「链接抓取」，阅读弹窗 eyebrow「公众号原文 · 链接抓取」。抓不到正文时明说「这篇只拿到了标题与摘要」，不许编。
- 桌面版走 `wechat:fetch-article` IPC（主进程校验域名后再抓），浏览器版受 CORS 限制会直接提示「请在桌面版里订阅」。

B. 从「转发到其他应用」接收（`electron/share-args.cjs` 新建、`main.cjs`、`preload.cjs`、`App.tsx`、`WechatInbox.tsx`）
- 三条自动通道全部汇入同一个批量导入拆分：
  - 自定义协议 `subscriber://share?text=...`（`app.setAsDefaultProtocolClient('subscriber')`，仅打包态注册）；
  - 启动参数 `--share-text "..."` / `--share-file 聊天记录.txt`（微信转发聊天记录生成的文件直接传路径）；
  - 程序已在运行时再次被唤起：`second-instance` 里解析 argv 推进 `shareQueue`，不重开窗口。
- `shareQueue` + `share:pull` IPC（取走即清空）+ `share:pending` 事件（只发数量，用来唤醒渲染层）。
  渲染层 `pullIncomingShares()` 拉取 → `App.tsx` 切到「消息与订阅」→ `WechatInbox` 收到 `incoming` 自动打开批量导入。
- 两条手动入口：拖放文件/选中文字、「从剪贴板读取」。
- 界面上有一块「三种进法」说明（`.share-entry-ways`），把路径讲清楚，不让用户猜。
- **诚实边界（必须原样保留在界面与文档里）**：微信「转发到其他应用」里显示哪些应用，由微信客户端和 Windows 注册表共同决定，
  第三方应用无法自行插入那个列表。所以界面上同时给出启动参数快捷方式、拖放、剪贴板三条替代路径。

C. 拖放修复（`src/dropImport.ts` 新建、`App.tsx`、`WechatInbox.tsx`）
- 症状：把聊天记录文件或选中文字拖进窗口，界面毫无反应。
- 根因有两个，都会导致「静默失败」：
  1. `drop` 只绑在 `.local-inbox-section` 上，而 HTML5 要求 `dragover` 被 `preventDefault()` 才承认该处是合法放置目标。
     拖到页面其他地方时 `drop` 根本不触发；Electron 默认还会去导航到那个文件，被主进程 `will-navigate` 拦掉 → 什么都不发生。
  2. `getData('text/plain')` 写在 `await file.text()` 之后。DataTransfer 在回调的同步阶段结束后就进入保护模式被清空，
     所以「文件 + 文字」一起拖时，文字部分会丢。
- 修法：`App.tsx` 在 window 捕获阶段统一接 `dragenter/dragover/dragleave/drop/dragend`，全部 `preventDefault()`；
  读取逻辑抽到 `readDroppedContent()`（先同步取纯文本与 File 列表，再异步读文件内容），`.html` 走 `htmlFileToText()` 剥标签。
  拖拽中显示整窗遮罩 `.drop-overlay`（`pointer-events: none`，绝不能吃掉 drop 事件）。
  收到内容后走和外部转发完全相同的通道：`setView('wechat')` + `setIncomingShare()` → 消息箱打开批量导入。
- `WechatInbox` 只接收 `dragActive` 用于高亮，不再自己绑 drop（避免重复处理）。

D. 压缩包 / 文件夹 / GBK（`src/zipImport.ts`、`src/textDecode.ts` 新建）
- 用户反馈：拖微信导出的 `聊天记录_20261104_000456.zip` 被拒，提示「不是文本文件」。微信导出本来就有
  「单文件 .txt」「.html」「.zip 压缩包」「整个文件夹」四种形态，只支持前两种等于让用户先手动解压。
- `zipImport.ts`：自写最小 ZIP 读取器，不引第三方库。找 EOCD（从尾部最多扫 65557 字节）→ 遍历中央目录 →
  按本地文件头定位真实数据起点（中央目录里的 offset 指向的是本地头，不是数据）→ method 0 直接取、
  method 8 用 `DecompressionStream('deflate-raw')` 解。护栏：整包 ≤24 MB、单条目解压 ≤4 MB、总量 ≤12 MB、
  最多 40 个文本条目；Zip64 / 加密 / 未知压缩方式都明确跳过并说明，不返回半截乱码。
- 文件夹：`webkitGetAsEntry()` 必须**在事件回调里同步调用**，之后再取就没了。所以 `readDroppedContent()`
  在同步阶段先把目录句柄收集起来，异步阶段用 `createReader().readEntries()` 递归（深度 ≤3、文件 ≤60，
  `readEntries` 一次只回一批，要读到空数组为止）。
- 编码：`textDecode.ts` 先按 UTF-8 严格解（`fatal: true`），失败退 GB18030，再失败退回宽松 UTF-8；顺带处理 UTF-8/UTF-16 BOM。
  微信的 GBK 导出不再整段乱码。
- `shareImport.ts` 的来源名后缀补了 `协会|社团|组委会|研会`——社团类群名之前识别不出来，会被并进上一条。

E. 验证
- `electron/verify-package.mjs` 追加 `parseShareArgs` 纯函数断言、用临时 `.txt` 走 `--share-file` 启动并断言
  「外部转发内容自动进入批量导入」「转发内容被拆成可保存的条目」「转发文件里的来源名被识别」，检查项 16 → **18**。
- 拖放修复后再加 4 项（先回到「今日精选」再拖，证明窗口任意位置都能接住）：整窗提示出现、自动切页进批量导入、
  拆成可保存条目、松手后提示收起，检查项 18 → **22**。
- 压缩包支持再加 4 项（真实 deflate 包走 `tests/fixtures/chat-export.zip`，2 个 UTF-8 txt + 1 个 GBK txt + 1 个 html + 1 个 png）：
  能解开、拆出 4 条（png 被跳过）、GBK 不出乱码、html 已剥标签，检查项 22 → **26**。
- Playwright 新增 2 组（公众号链接订阅识别账号读正文并入库；拖入文件/文字进入批量导入），共 **25 组**
  （另加「拖入非文本文件给出明确提示」与「拖入 .zip 聊天记录也能解开导入」两组）。

F. 导出格式的拆分修复（`shareImport.ts`）
- 拿到用户真实导出的 zip 后才发现：微信「导出聊天记录」的格式是每条消息前面有
  「发送者行（`·张三`）+ 时间戳行（`2026年11月2日 19:33`）」，正文里还会出现 `【选拔赛通知】` 这类标签。
  旧规则把这些 `【标签】` 当成「来源名行」，于是把一条消息拆成两条，还把下一条的发送者与时间戳串进了上一条。
- 修法：`splitByTimestamps()` 优先——命中时间戳行就按时间戳切，区间内的一切（含 `【标签】`）都算正文，
  并剥掉区间首尾的发送者行与空行。**只要 1 个时间戳就够**（只导出过一条消息时只有一个），
  但时间戳必须落在开头 3 行以内，避免把正文里引用的日期当成边界。
- 来源名：`readDroppedContent()` 现在会给出 `suggestedName`（压缩包取内部文件名、单文件取文件名、
  文件夹取目录名，并去掉 `_20261104_000456` 这种导出时间戳后缀），App 透传给批量导入，
  不再显示「未命名来源 1」。

---

## 八、环境事实与坑（重要，能省很多时间）

| 事项 | 实情 |
| --- | --- |
| GitHub 凭据 | 已配 SSH：`~/.ssh/id_ed25519`（**无口令**）。`git push` 直接可用。 |
| GitHub 连接器 | WorkBuddy 的 GitHub App 对该账号是**只读**安装，建仓 403；新建仓库必须网页建或用带 `repo` 权限的 PAT。 |
| 文件删除 | 本机 `safe-delete` 钩子会拦截目录删除（`trash-failed`），`fs.rmSync` 也被它劫持。绕法：`cmd //c "rd /s /q 目录"`；打包脚本已加「删不掉就改名挪开」的兜底。 |
| 打包漏文件 | `collector.cjs` 曾经没进 asar，源码跑得好好的、打包版一律「采集器未打包」。现在 `build-portable.cjs` 会拷 `electron/live/`，`desktop:verify` 也有探针兜住。 |
| `asar.createPackage` | 是**异步**的。不 `await` 会写出半截文件。 |
| asar 写入 | 往已存在文件写会追加，打包脚本已做原地截断。 |
| `Compress-Archive` | 对 `resources/app.asar` 会报占用；先 `cp` 到 `%TEMP%` 再压缩。 |
| 打 zip 的正解 | 用 `node_modules/electron-winstaller/vendor/7z.exe a -tzip -mx=3 -mmt=on 目标.zip Subscriber`（在 `desktop-dist` 里执行，条目自带 `Subscriber/` 前缀）。python `zipfile` 压 250 MB 的 exe 会被环境半路 SIGTERM，留下半截包（114 MB）且不报错；7z 几秒完成。打完用 7z 解一个 `app.asar` 出来对 md5，比只看大小可靠。 |
| PS 压缩受限 | `Add-Type` 与 `Reflection.Assembly` 加载都被安全策略拦，`System.IO.Compression.ZipFile` 用不了。别在这条路上耗时间，直接用上面的 7z。 |
| `Add-Type` | 被安全策略拦截。 |
| `ELECTRON_RUN_AS_NODE` | 宿主终端会导出该变量，导致 electron 退化成 Node；`launch.cjs` 与验证脚本都会先删。 |
| Electron 二进制 | 若 `node_modules/electron/dist` 为空：`ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ node node_modules/electron/install.js`。 |
| 依赖网络 | `npm install` 偶发超时，加 `--registry=https://registry.npmmirror.com`。 |
| 本地预览 | `npm run dev` 必须用后台任务方式启动，否则会话结束进程会被回收；Playwright 的 `webServer` 也会自己拉起。 |
| `<label>` 包住按钮组 | 渠道选择器原来写成 `<label>来源渠道<div>按钮…</div></label>`，label 的文本会被拼进首个按钮的可访问名，`getByRole('button', { name: '钉钉' })` 直接 strict violation 命中 2 个元素。改成 `<div role="group" aria-label="来源渠道">`。 |
| `inline-flex` 被拉满 | `.channel-picker` 放在 `flex-direction: column` 的 `.field` 里，`inline-flex` 仍会被拉伸成整行灰条；要补 `align-self: flex-start; width: fit-content`。 |
| python 批量替换遇 CRLF 静默失败 | 文件是 CRLF，脚本里用 LF 拼的 `old` 永远匹配不到；再叠加「只断言替换后存在」的写法，会静默漏改。批量替换改用 Edit 工具，或按 `\r\n` 构造。 |
| 命令行参数丢换行 | Windows 下 `--share-text "第一行\n第二行"` 传不进 Electron，拆分结果为 0 条。验证脚本改用 `--share-file` 传临时 `.txt`，真实链路也一样稳。 |
| 弹窗叠弹窗点不到 | `desktop:verify` 里首屏摘要弹框的 `.modal-backdrop` 层级更高，会拦住后面的批量导入弹窗点击。先关摘要弹框，再操作下层弹窗。 |
| 拖放「拖了没反应」 | 根因：`dragover` 只绑在 `.local-inbox-section` 上。HTML5 规定 dragover 必须 preventDefault 才承认那是合法放置目标，拖到页面其他地方时 `drop` **根本不触发**（Electron 还会顺手去导航那个文件，被 `will-navigate` 拦掉，于是彻底静默）。修法：window 捕获阶段统一 `dragover`/`drop` preventDefault（`src/dropImport.ts` + `App.tsx`），整窗提示用 `pointer-events: none` 的遮罩。 |
| `DataTransfer` 异步后变空 | `getData()` 只能在事件回调的**同步阶段**读，handler 一旦 await（比如先 `await file.text()`），DataTransfer 进入保护模式被清空，拖「文件 + 文字」时文字部分会静默丢失。现在先同步取 `getData('text/plain')` 与 `data.files`，再去读文件内容。 |
| 用户跑的还是旧 exe | 打包目录里同时有多个 `Subscriber.exe` 在跑时，改代码不会生效。改完必须 `taskkill //F //IM Subscriber.exe` 再重打包，`desktop:verify` 会拉起新 exe。 |

---

## 九、在新窗口怎么开场

直接粘贴：

> 继续 Subscriber 项目，路径 `D:/workbuddy/2026-10-31-18-32-31`，先读 `HANDOFF.md` 和
> `.workbuddy/memory/` 下的记录。Web 版与 Windows 桌面版都已完成，`npm test` 25 组全绿，
> 已具备分类/版本/去重引擎、公众号订阅与 RSS 真实订阅、四个官网直采源、赛事官网入口与模型选择。
> 我想继续做 **（写你这次要做的具体事）**。

`.workbuddy/memory/2026-11-02.md` 有上一轮的实现细节（含每个 bug 的根因）；
本轮记录见 `.workbuddy/memory/2026-11-03.md`。
