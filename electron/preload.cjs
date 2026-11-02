const { contextBridge } = require('electron')

// 只暴露只读的环境信息，渲染进程仍然拿不到 Node 能力
contextBridge.exposeInMainWorld('subscriberDesktop', {
  platform: process.platform,
  version: process.versions.electron,
  isDesktop: true
})
