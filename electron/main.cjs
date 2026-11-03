const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron')
const path = require('node:path')

const DEV_URL = 'http://127.0.0.1:5173'
const devMode = process.argv.includes('--dev')

/** @type {BrowserWindow | null} */
let mainWindow = null

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

function resolveIndex() {
  return path.join(__dirname, '..', 'dist', 'index.html')
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
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(() => {
    // 桌面应用不需要 Electron 默认菜单
    Menu.setApplicationMenu(null)

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
