const { contextBridge, ipcRenderer } = require('electron')

// 只暴露只读的环境信息与官网抓取通道，渲染进程仍然拿不到 Node 能力
contextBridge.exposeInMainWorld('subscriberDesktop', {
  platform: process.platform,
  version: process.versions.electron,
  isDesktop: true,
  /** 主进程实时抓取竞赛官网，返回 { ok, message, report }。 */
  fetchLive: () => ipcRenderer.invoke('live:fetch')
})
