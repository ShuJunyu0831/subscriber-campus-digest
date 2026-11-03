const { app, BrowserWindow, Menu, shell, ipcMain, clipboard } = require('electron')
const path = require('node:path')
const { parseShareArgs } = require('./share-args.cjs')

const DEV_URL = 'http://127.0.0.1:5173'
const devMode = process.argv.includes('--dev')

/** @type {BrowserWindow | null} */
let mainWindow = null

/* ------------------------------------------------------------------ *
 * 外部转发接收（微信 / 钉钉「转发到其他应用」、协议链接、命令行）
 *
 * 应用能不能出现在微信的转发列表里由系统与微信决定，我们控制不了；
 * 但只要被选中（或用户用 subscriber:// 链接 / 启动参数），内容就会进队列，
 * 渲染进程拉取后直接打开批量导入，不需要用户再复制粘贴。
 * ------------------------------------------------------------------ */
const shareQueue = []

function pushShares(items) {
  if (!Array.isArray(items) || items.length === 0) return
  shareQueue.push(...items)
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('share:pending', shareQueue.length)
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

ipcMain.handle('share:pull', () => shareQueue.splice(0))

// 官网直采采集器（scripts/collect.mjs 打包产出；缺失时返回提示而不是崩溃）
let liveCollector = null
function loadLiveCollector() {
  if (liveCollector !== null) return liveCollector
  try {
    // eslint-disable-next-line global-require
    liveCollector = require('./live/collector.cjs')
  } catch {
    liveCollector = false
  }
  return liveCollector
}

ipcMain.handle('live:fetch', async () => {
  const collector = loadLiveCollector()
  if (!collector) return { ok: false, message: '官网采集器未打包（需先运行 npm run collect）', report: null }
  try {
    const report = await collector.fetchLiveCompetitions()
    const failed = report.logs.filter(log => !log.ok).map(log => log.source)
    return {
      ok: report.items.length > 0,
      message: report.items.length > 0
        ? `抓取 ${report.items.length} 条${failed.length ? `（${failed.join('、')} 失败）` : ''}`
        : '官网没有返回可用条目',
      report,
    }
  } catch (error) {
    return { ok: false, message: `抓取失败：${error && error.message ? error.message : '未知错误'}`, report: null }
  }
})

/**
 * 用户添加的 RSS / Atom 订阅源：主进程抓取，绕开浏览器跨域限制。
 * 解析逻辑与浏览器端共用同一份 src/rss.ts（打包进 collector.cjs）。
 */
ipcMain.handle('rss:fetch', async (_event, url) => {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url.trim())) {
    return { ok: false, message: '请填写以 http:// 或 https:// 开头的 RSS 地址', parsed: null }
  }
  const collector = loadLiveCollector()
  if (!collector || typeof collector.fetchFeed !== 'function') {
    return { ok: false, message: '订阅源解析器未打包（需先运行 npm run collect）', parsed: null }
  }
  try {
    const parsed = await collector.fetchFeed(url.trim())
    return {
      ok: parsed.items.length > 0,
      message: `抓取 ${parsed.items.length} 篇`,
      parsed: { title: parsed.title ?? null, items: parsed.items },
    }
  } catch (error) {
    return { ok: false, message: error && error.message ? error.message : '抓取失败', parsed: null }
  }
})

/**
 * 用户自己添加的竞赛官网：抓列表页 → 通用识别公告链接 → 抓前几条详情。
 * 识别规则与内置源共用（src/liveSource.ts），只是 linkPattern 换成了通用启发式。
 */
ipcMain.handle('live:fetch-custom', async (_event, payload) => {
  const name = typeof payload?.name === 'string' ? payload.name.trim() : ''
  const listUrl = typeof payload?.listUrl === 'string' ? payload.listUrl.trim() : ''
  if (!/^https?:\/\//i.test(listUrl)) {
    return { ok: false, message: '请填写以 http:// 或 https:// 开头的官网地址', items: [] }
  }
  const collector = loadLiveCollector()
  if (!collector || typeof collector.fetchCustomSource !== 'function') {
    return { ok: false, message: '官网采集器未打包（需先运行 npm run collect）', items: [] }
  }
  try {
    return await collector.fetchCustomSource(name || '自定义官网', listUrl)
  } catch (error) {
    return { ok: false, message: `抓取失败：${error && error.message ? error.message : '未知错误'}`, items: [] }
  }
})

/**
 * 读取剪贴板：只在用户点击时读一次，不注册监听、不轮询。
 * 批量转发消息的路径是「复制 → 点一下导入」，而不是让应用盯着剪贴板。
 */
ipcMain.handle('clipboard:read', () => {
  try {
    const text = clipboard.readText()
    return { ok: Boolean(text && text.trim()), text: text ?? '', message: text && text.trim() ? '' : '剪贴板里没有文字' }
  } catch (error) {
    return { ok: false, text: '', message: error && error.message ? error.message : '无法读取剪贴板' }
  }
})

/**
 * 公众号文章：用户粘贴链接，主进程抓这一页并解析出账号名与正文（浏览器有跨域限制）。
 * 只抓用户给出的这一个 URL，不遍历该账号的其他文章。
 */
ipcMain.handle('wechat:fetch-article', async (_event, url) => {
  const target = typeof url === 'string' ? url.trim() : ''
  if (!/^https?:\/\/mp\.weixin\.qq\.com\/s(\/|\?|$)/i.test(target)) {
    return { ok: false, message: '请填写 mp.weixin.qq.com 的公众号文章链接', article: null }
  }
  const collector = loadLiveCollector()
  if (!collector || typeof collector.fetchWechatArticle !== 'function') {
    return { ok: false, message: '公众号解析器未打包（需先运行 npm run collect）', article: null }
  }
  try {
    const article = await collector.fetchWechatArticle(target)
    return { ok: true, message: `已识别公众号「${article.accountName}」`, article }
  } catch (error) {
    return { ok: false, message: error && error.message ? error.message : '抓取失败', article: null }
  }
})

function resolveIndex() {  return path.join(__dirname, '..', 'dist', 'index.html')
}

function resolveIcon() {
  // public/ 里的图标会被 Vite 复制到 dist/，打包进 asar 后依然可读
  return path.join(__dirname, '..', 'dist', 'icon-512.png')
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 880,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#F3F5EE',
    title: 'Subscriber',
    icon: resolveIcon(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  })

  // 先渲染再显示，避免白屏闪烁
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  // 站内链接在新窗口打开时交给系统浏览器，应用自身不弹新窗口
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  // 阻止页面被导航到外部站点（例如误触的整页跳转）
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow?.webContents.getURL() ?? ''
    if (!current) return
    const isSameFile = url.split('#')[0].split('?')[0] === current.split('#')[0].split('?')[0]
    if (isSameFile) return
    event.preventDefault()
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (devMode) {
    mainWindow.loadURL(DEV_URL)
  } else {
    mainWindow.loadFile(resolveIndex())
  }
}

if (!app.requestSingleInstanceLock()) {
  // 已经有实例在运行，交给它处理
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    // 第二次启动往往就是「转发到 Subscriber」：argv 里带着内容
    pushShares(parseShareArgs(argv))
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(() => {
    // 桌面应用不需要 Electron 默认菜单
    Menu.setApplicationMenu(null)

    // 注册 subscriber:// 协议，让「能打开链接的地方」都能把内容交给 Subscriber。
    // 开发模式下注册的是 electron.exe，会污染注册表，所以只在打包版注册。
    if (!devMode && !process.defaultApp) {
      try {
        app.setAsDefaultProtocolClient('subscriber')
      } catch {
        // 注册失败不影响其它入口
      }
    }

    // 首次启动也可能带着内容（从转发列表直接拉起）
    pushShares(parseShareArgs(process.argv))

    // 禁止任何 webview 挂载
    app.on('web-contents-created', (_event, contents) => {
      contents.on('will-attach-webview', event => event.preventDefault())
    })

    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
