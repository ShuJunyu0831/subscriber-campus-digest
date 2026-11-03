const { contextBridge, ipcRenderer } = require('electron')

// 只暴露只读的环境信息与官网抓取通道，渲染进程仍然拿不到 Node 能力
contextBridge.exposeInMainWorld('subscriberDesktop', {
  platform: process.platform,
  version: process.versions.electron,
  isDesktop: true,
  /** 主进程实时抓取竞赛官网，返回 { ok, message, report }。 */
  fetchLive: () => ipcRenderer.invoke('live:fetch'),
  /** 主进程抓取用户添加的 RSS / Atom 订阅源，返回 { ok, message, parsed }。 */
  fetchRss: url => ipcRenderer.invoke('rss:fetch', url),
  /** 主进程抓取用户添加的竞赛官网列表页，返回 { ok, message, items }。 */
  fetchCustomLive: (name, listUrl) => ipcRenderer.invoke('live:fetch-custom', { name, listUrl }),
  /** 读取一次系统剪贴板文本（用户点击才读，不做监听）。 */
  readClipboard: () => ipcRenderer.invoke('clipboard:read')
})
