import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  workers: 4,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 1440, height: 1000 },
    headless: true,
    // 背景是持续重绘的 WebGL 画布，软件渲染下会拖慢每个动作。
    // 模拟"减少动态效果"让组件只渲染静态帧，测试更稳定也更接近无障碍预期。
    reducedMotion: 'reduce',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
  },
})
