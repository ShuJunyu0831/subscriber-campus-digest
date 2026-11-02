import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// 桌面版用 file:// 加载，Service Worker 不可用，分享入口改走粘贴导入
const isDesktopShell = window.location.protocol === 'file:'

if (!isDesktopShell && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {
      // 分享入口不可用时，仍可通过手动粘贴导入。
    })
  })
}
