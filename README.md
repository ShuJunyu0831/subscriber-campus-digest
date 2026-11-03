# Subscriber

面向大学生的一站式信息订阅工具，把散落在竞赛官网、校园新闻、课程群和微信群里的信息收拢成**每天一份精选摘要**。

目前是 Web 原型 + Windows 桌面版，核心验证的是「竞赛截止提醒」这一件事——每天只看一份摘要，不用在五个群里翻消息。

![首页](docs/home.png)

## 功能

- **今日精选摘要**：打开即弹出当天摘要，先给结论，再列条目；条目数量、临近截止与版本变更都由分类引擎实时计算。
- **信息分类与归档**：关键词加权给出内容类型与置信度；按事件指纹聚合，自动合并重复来源；同一事件的不同时间版本（延期、更正、补充）按发布时间排序，只展示最新结论，旧版本保留在版本记录里。
- **信息库**：按竞赛、新闻、课程通知筛选，支持搜索、收藏、时效状态（进行中 / 临近截止 / 已截止 / 待核对）与版本徽标。
- **公众号订阅**：订阅公众号后按账号分组、按条列出文章，支持分类筛选、只看未读、搜索、同步更新；与信息库查重，新版本可一键合并。演示数据全部在本地。
- **赛事官网入口**：能核实到官网的赛事卡片与详情页提供一键跳转，未核实到的标注「官网待核对」。
- **微信消息（本机优先）**：不读取你的聊天记录。通过系统分享面板或粘贴导入，先把片段存在浏览器 IndexedDB，本机预览后再决定是否按次确认上云分析。
- **模型选择**：右下角可切换 DeepSeek、通义千问、豆包、Kimi、GLM、文心、混元、MiniMax、星火等国内常见模型，选择保存在本机；仅切换界面标签，不发起真实请求。
- **我的收藏 / 完成回顾**：完成状态由用户手动勾选，不自动虚构成就。
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
npm test         # Playwright 端到端测试（12 组）
```

## 桌面版

```bash
npm run desktop           # 构建后以 Electron 直接运行
npm run desktop:portable  # 组装免安装包到 desktop-dist/Subscriber
npm run desktop:verify    # 拉起打包后的 exe 做 13 项端到端检查
```

`desktop:portable` 不使用 electron-builder 的 nsis 目标，而是自行「复制运行时 + 生成 asar + 单文件改名 + 写入图标与版本信息」，全程不做大目录重命名与批量删除。图标由 `build/icon.png` 经 `npm run desktop:icon` 生成七尺寸 `.ico`，再用 `resedit` 写入 PE 资源。

## 项目结构

```
src/
  App.tsx             主界面：顶栏导航、居中的内容层、摘要弹框、卡片与详情
  classify.ts         分类引擎：标题指纹、聚类去重、版本识别、时效状态
  accounts.ts         公众号与文章演示数据
  AccountFeed.tsx     公众号订阅页：分组、去重、同步与入库
  TaxonomyModal.tsx   分类规则与版本记录说明
  LlmPicker.tsx       右下角模型选择
  llmModels.ts        国内常见模型清单
  GradientASCII.tsx   全屏 WebGL2 ASCII 背景
  SplitText.tsx       逐字动画标题
  WechatInbox.tsx     微信消息：本机分享导入 + 公众号订阅标签
  localStore.ts       IndexedDB 本地存储 + 轻量偏好
  data.ts             演示数据与公共类型
electron/             Electron 主进程、打包与验证脚本
tests/                Playwright 用例
```

## 隐私设计

- 无群或账号授权，不读取任何没有权限的内容。
- 公开检索只访问允许使用的公开网页，并保留来源。
- 原始文件默认留在本地，仅在用户主动发起解析时按需上传，并明确删除规则。
- 微信消息不做自动读取，改用系统分享/粘贴入口，先落本机再按次确认。
- 公众号订阅使用演示数据：微信没有面向第三方应用的订阅号读取接口，正式版需要用户授权的 RSS 或开放平台凭据。
- 模型选择只改变界面标签，不包含任何 API 调用或密钥。

## 状态说明

这是原型阶段的项目，信息库与公众号文章均为演示数据，尚未接入真实订阅源。分类、去重、版本归并、官网入口与模型选择都可在本地完整体验；真实抓取与模型调用需要各自的数据源授权与 API Key。

接手开发的上下文、已知问题与环境坑位见 [HANDOFF.md](HANDOFF.md)。

## 许可

未附许可协议，默认保留所有权利。
