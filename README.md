# Subscriber

面向大学生的一站式信息订阅工具，把散落在竞赛官网、校园新闻、课程群和微信群里的信息收拢成**每天一份精选摘要**。

目前是 Web 原型 + Windows 桌面版，核心验证的是「竞赛截止提醒」这一件事——每天只看一份摘要，不用在五个群里翻消息。

![首页](docs/home.png)

## 功能

- **今日精选摘要**：打开即弹出当天摘要，先给结论，再列条目；条目数量、临近截止与版本变更都由分类引擎实时计算。
- **信息分类与归档**：关键词加权给出内容类型与置信度；按事件指纹聚合，自动合并重复来源；同一事件的不同时间版本（延期、更正、补充）按发布时间排序，只展示最新结论，旧版本保留在版本记录里。
- **信息库**：按竞赛、新闻、课程通知筛选，支持页内搜索、收藏、时效状态（进行中 / 临近截止 / 已截止 / 待核对）与版本徽标；可按「临近截止」重排；版本记录支持两个版本并排对比、逐字段标出变更。
- **公众号订阅**：订阅公众号后按账号分组、按条列出文章，支持分类筛选、只看未读、搜索、同步更新；与信息库查重，新版本可一键合并。内置账号为演示数据。
- **RSS / Atom 真实订阅**：粘贴任意 RSS 或 Atom 地址即可接入真实订阅源，抓取到的标题、链接、时间、正文段落都是原始内容，标注「RSS 全文 · 真实抓取」；桌面版走主进程抓取，不受浏览器跨域限制。
- **赛事官网入口**：能核实到官网的赛事卡片与详情页提供一键跳转，未核实到的标注「官网待核对」。
- **微信消息（本机优先）**：不读取你的聊天记录。通过系统分享面板或粘贴导入，先把片段存在浏览器 IndexedDB，本机预览后再决定是否按次确认上云分析。
- **模型选择**：右下角可切换 DeepSeek、通义千问、豆包、Kimi、GLM、文心、混元、MiniMax、星火等国内常见模型，选择保存在本机；面板底部可填自己的 API Key 接入真实模型，接入后手动导入文字会真实调用厂商接口（未接入则只有界面标签，不发起请求）。
- **我的收藏 / 完成回顾**：收藏页同样支持页内搜索与排序；完成回顾可按本周 / 本月 / 全部切换并按天或按月分组。完成状态由用户手动勾选，不自动虚构成就。
- **Windows 桌面版**：Electron 免安装包，双击即用。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 框架 | React 19 + TypeScript |
| 构建 | Vite 6 |
| 样式 | Tailwind CSS 4 + 自定义 CSS 变量 |
| 动画 | GSAP + SplitText（逐字入场）、CSS `@keyframes` |
| 背景 | WebGL2 多 Pass 渐变 ASCII（移植自 React Bits GradientASCII） |
| 桌面 | Electron 45（contextIsolation + sandbox，`file://` 加载） |
| 测试 | Playwright |

## 快速开始

```bash
npm install
npm run dev      # http://127.0.0.1:5173
npm run build    # 类型检查 + 生产构建
npm test         # Playwright 端到端测试（18 组）
```

## 桌面版

```bash
npm run desktop           # 构建后以 Electron 直接运行
npm run desktop:portable  # 组装免安装包到 desktop-dist/Subscriber
npm run desktop:verify    # 拉起打包后的 exe 做 16 项端到端检查
```

`desktop:portable` 不使用 electron-builder 的 nsis 目标，而是自行「复制运行时 + 生成 asar + 单文件改名 + 写入图标与版本信息」，全程不做大目录重命名与批量删除。图标由 `build/icon.png` 经 `npm run desktop:icon` 生成七尺寸 `.ico`，再用 `resedit` 写入 PE 资源。

## 项目结构

```
src/
  App.tsx             主界面：顶栏导航、居中的内容层、摘要弹框、卡片与详情
  classify.ts         分类引擎：标题指纹、聚类去重、版本识别、时效状态
  liveSource.ts       官网直采：LIVE_SOURCES 源定义、列表/详情解析、日期与截止时间提取
  liveSnapshot.ts     快照 → 信息库条目，抓取时间与来源标注
  live/competitions.json  真实抓取快照（npm run collect 产出，提交入库）
  rss.ts              RSS / Atom 解析、订阅管理、条目转文章与入库输入
  accounts.ts         公众号与文章演示数据
  AccountFeed.tsx     订阅页：内置账号 + RSS 订阅、分组、去重、同步与入库
  TaxonomyModal.tsx   分类规则与版本记录说明
  LlmPicker.tsx       右下角模型选择
  llmModels.ts        国内常见模型清单
  llmClient.ts        真实模型调用（本机凭据 + OpenAI 兼容接口）
  GradientASCII.tsx   全屏 WebGL2 ASCII 背景
  SplitText.tsx       逐字动画标题
  WechatInbox.tsx     微信消息：本机分享导入 + 公众号订阅标签
  localStore.ts       IndexedDB 本地存储 + 轻量偏好
  data.ts             演示数据与公共类型
electron/             Electron 主进程（含 live:fetch / rss:fetch）、打包与验证脚本
scripts/              真实采集脚本（npm run collect）
tests/                Playwright 用例
.github/workflows/ci.yml  CI：构建 + 端到端测试
```

## 隐私设计

- 无群或账号授权，不读取任何没有权限的内容。
- 公开检索只访问允许使用的公开网页，并保留来源。
- 原始文件默认留在本地，仅在用户主动发起解析时按需上传，并明确删除规则。
- 微信消息不做自动读取，改用系统分享/粘贴入口，先落本机再按次确认。
- 公众号订阅的**内置账号**使用演示数据：微信没有面向第三方应用的订阅号读取接口。真实订阅走「你自己提供、你已获授权的 RSS / Atom 地址」这条路，订阅列表与文章列表只存在本机 localStorage。
- RSS 抓取只请求你亲手添加的那个地址，不扫描、不爬取其他页面；请求不带账号凭据。
- 模型选择只改变界面标签，不包含任何 API 调用或密钥。

## 状态说明

这是原型阶段的项目。**官网直采已是真实数据**：`npm run collect` 会从温州医科大学教务处、温州医科大学学生处、全国大学生数学建模竞赛官网、"挑战杯"官网四个站点抓取真实公告（标题、链接、日期、正文摘句均为官网原文；摘要与截止时间为机械提取，提取不到标"待核对"），快照存于 `src/live/competitions.json` 并入信息库；桌面版支持主进程实时抓取。

**RSS / Atom 订阅也是真实数据**：解析器在 `src/rss.ts`，Web 版直接 `fetch`（受目标站点 CORS 限制），桌面版经主进程 IPC 抓取（无跨域限制）。抓不到就明说抓不到，不会用演示内容顶替。

**内置公众号文章与部分校内条目仍为演示数据**：微信没有面向第三方应用的订阅号读取接口，正式版需要用户授权的 RSS 或开放平台凭据；模型调用需要你自己的 API Key。分类、去重、版本归并、官网入口与模型选择都可在本地完整体验。

接手开发的上下文、已知问题与环境坑位见 [HANDOFF.md](HANDOFF.md)。

## 许可

未附许可协议，默认保留所有权利。
