# 交接文档

> 用途：在新窗口继续这个项目时，把这份文档整段发给助手，它就能接上上下文。
> 最后更新：2026-11-03

---

## 一、一句话现状

Subscriber 原型已完成 **Web 版 + Windows 免安装桌面版**，代码已推到 GitHub 私有仓库，
两端测试全绿（Web 7 组 Playwright、桌面 13 项端到端检查）。**未完成的是真实数据链路**——
现在所有条目都来自演示数据，云端分析能力还没接。

---

## 二、30 秒上手

项目路径：`D:/workbuddy/2026-10-31-18-32-31`

```bash
npm install
npm run dev              # 开发：http://127.0.0.1:5173
npm test                 # Web 端 7 组 Playwright（约 50 秒）
npm run build            # 类型检查 + 生产构建

npm run desktop          # 直接以 Electron 运行
npm run desktop:portable # 重新打免安装包 → desktop-dist/Subscriber
npm run desktop:verify   # 拉起打包后的 exe 跑 13 项检查
```

---

## 三、交付物在哪

| 产物 | 路径 | 说明 |
| --- | --- | --- |
| 免安装包压缩件 | `desktop-dist/Subscriber-0.1.0-win-x64.zip` | 152 MB，解压双击即用 |
| 主程序 | `desktop-dist/Subscriber/Subscriber.exe` | 239 MB |
| 使用说明 | `desktop-dist/Subscriber/使用说明.txt` | 打包时自动生成 |
| 源码仓库 | https://github.com/ShuJunyu0831/subscriber-campus-digest | 私有，分支 `main` |
| 运行截图 | `shots/desktop-0*.png` | 5 个页面各一张（已 gitignore） |

---

## 四、已经做完的事

**Web 界面**
- 布局从「左侧边栏 + 卡片内画布」重构为「顶部 sticky 导航 + 全屏 ASCII 背景 + 居中玻璃内容层」。
- 首屏弹出今日摘要弹框，带分层错峰弹出动画（封面 → 导语 → 列表逐条 → 底部按钮）。
- 四个页面的 h1 接入 SplitText 逐字入场（今日精选、信息库、微信消息、完成回顾）。
- 修掉改版引入的对比度问题：白色副标题覆盖深色、分享提示落在 ASCII 背景上几乎不可见等。

**桌面版**
- Electron 45，`contextIsolation + sandbox`，`file://` 加载，单实例锁，外链交给系统浏览器。
- 自定义打包脚本绕开 electron-builder 在本机的目录重命名失败。
- 应用图标（7 个尺寸）与版本信息已写入 exe，`app.getName()` 为 `Subscriber`，
  用户数据在 `%APPDATA%\Subscriber`。
- 桌面版没有系统分享面板，微信消息页文案已改为「复制 → 粘贴导入」。

**仓库**
- 34 个文件 / 1.3 MB，排除 `node_modules`、`dist`、`release`、`desktop-dist` 等（否则超 1 GB）。
- 补了 `README.md`、`.gitignore`、`.gitattributes`（统一 LF）。

---

## 五、关键文件地图

```
src/
  App.tsx             主界面：顶栏、内容层、5 个页面、摘要弹框（ModalShell）
  GradientASCII.tsx   全屏 WebGL2 多 Pass ASCII 背景（field/glyph/halo/blur/composite）
  GradientASCII.css
  SplitText.tsx       逐字动画标题（移植 React Bits，含 reduced-motion 降级）
  WechatInbox.tsx     微信消息本机优先导入（系统分享 / 粘贴）
  localStore.ts       IndexedDB 本地存储（分享收件箱等）
  data.ts             全部演示数据 —— 接真实数据源时从这里替换
  main.tsx            入口，file:// 下跳过 Service Worker 注册
  index.css           全部样式（含 .digest-modal 弹出动画、.app-veil 遮罩）
electron/
  main.cjs            主进程：窗口、导航拦截、外链处理
  preload.cjs         contextBridge 暴露 subscriberDesktop
  launch.cjs          清 ELECTRON_RUN_AS_NODE 后拉起 Electron
  build-portable.cjs  免安装包组装（复制运行时 + asar + 改名 + 写图标）
  make-icon.cjs       png → 7 尺寸 ico（pngjs 面积平均下采样）
  patch-exe.cjs       用 resedit 写图标与版本信息
  verify-package.mjs  13 项端到端验证
tests/prototype.spec.ts   7 组 Playwright 用例
```

---

## 六、不要随便改的决定

这些是产品/技术上的既定选择，改动前先确认：

1. **不读取个人微信群。** 微信消息只能由用户主动分享或粘贴，先落 IndexedDB，本机预览后再**按次确认**是否上云。
2. **不做自动读取无权限的内容。** 公开检索只访问允许使用的公开网页，并保留来源证据。
3. **完成回顾由用户手动勾选**，系统不自动判定、不虚构成就。
4. **原始文件默认留在本地**，仅在用户主动解析时按需上传，并有明确删除规则。
5. **每份摘要只给一份**，不做信息流无限刷新。
6. 预算目标：每月 200 元以内，需要用户额度与处理频率控制。
7. 首版文件范围：文字、Word、PDF、图片、普通 PPT。扫描件增强、超大 PPT、视频后置。

技术侧：

- 背景画布的 `speed`、`density` 等参数在 `App.tsx` 里调，`dpr={1}` 是刻意的（全屏 WebGL 会把测试拖慢到超时）。
- Playwright 配置了 `reducedMotion: 'reduce'`，让背景只渲染静态帧——别删，删了 7 组用例会超时。
- `vite.config.ts` 的 `base: './'` 是桌面版 `file://` 加载必需的。

---

## 七、待办（按优先级）

**P0 — 接真实数据链路**（这是原型最核心的缺口）
- 现状：`src/data.ts` 里全是写死的演示条目，`declinedByUser` 状态的云服务授权导致「上传 → 分析」是模拟的。
- 下一步：重新走一次云服务开通授权（需要用户在 WorkBuddy 里点同意），然后把 `localStore.ts` 的上传与分析替换成真实调用。
- 首次要验证的就是「竞赛截止提醒」这一条链路。

**P1 — 订阅源接入**
- 尚无真实抓取：竞赛官网、校园新闻、课程通知都还没有 source adapter。
- 建议先做 2–3 所学校的固定页面，验证解析稳定性，再谈覆盖面。

**P2 — 安装包与签名**
- NSIS 安装包出不来：electron-builder 要先把 Electron 解压到 `win-unpacked.tmp` 再重命名大目录，本机报 `EPERM`。
  换一台没装文件钩子的机器可直接跑 `npm run desktop:build`。
- 改动 PE 资源后 Electron 原签名失效，`Subscriber.exe` 会触发 SmartScreen 提示。
  要发给别人用，需要自购代码签名证书。

**P3 — 体验补完**
- 完成回顾还没有跨周/跨月视图。
- 收藏页没有分类与搜索。
- 没有 GitHub Actions；可以把 `npm test` 挂上去做 CI。

---

## 八、环境事实与坑（重要，能省很多时间）

| 事项 | 实情 |
| --- | --- |
| GitHub 凭据 | 已配 SSH：`~/.ssh/id_ed25519`（**无口令**）。`git push` 直接可用，无需再授权。 |
| GitHub 连接器 | WorkBuddy 的 GitHub App 对该账号是**只读**安装，建仓返回 `403 Resource not accessible by integration`。新建仓库必须手动在网页上建，或改用带 `repo` 权限的 PAT。 |
| 文件删除 | 本机 `safe-delete` 钩子会拦截对目录的删除（`trash-failed`）。`desktop-dist/Subscriber-win32-x64`、`release/` 两个过期目录共约 1 GB **删不掉**，需要手动删。 |
| `asar.createPackage` | 是**异步**的。不 `await` 会复制到写了一半的文件，表现为产物大小乱跳（507/998/1488 KB）且偶尔损坏。 |
| asar 写入 | 往已存在的文件写会追加，不会截断——打包脚本已用原地截断处理。 |
| `Compress-Archive` | 对 `resources/app.asar` 会报「正由另一进程使用」。绕法：先 `cp` 到 `%TEMP%` 再压缩。 |
| `Add-Type` | 被安全策略拦截，PowerShell 里不能用它加载 .NET 程序集。 |
| `ELECTRON_RUN_AS_NODE` | 宿主终端会导出该变量，导致 `electron.exe` 退化成 Node 并报 `requestSingleInstanceLock` 错误。`launch.cjs` 与验证脚本都会先删掉它。 |
| Electron 二进制 | 若 `node_modules/electron/dist` 为空，用 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ node node_modules/electron/install.js`。 |
| 依赖网络 | `npm install` 偶发超时，加 `--registry=https://registry.npmmirror.com`。 |

---

## 九、在新窗口怎么开场

直接粘贴：

> 继续 Subscriber 项目，路径 `D:/workbuddy/2026-10-31-18-32-31`，先读 `HANDOFF.md` 和
> `.workbuddy/memory/` 下的记录。当前 Web 版和 Windows 桌面版都已完成并推到 GitHub，
> 我想继续做 **（写你这次要做的具体事）**。

`.workbuddy/memory/2026-11-02.md` 里有更细的实现过程记录（含每个 bug 的根因），
排查同类问题时会比这份文档更具体。
