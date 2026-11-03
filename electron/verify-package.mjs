/**
 * 打包产物的端到端验证：直接拉起 desktop-dist 里的 exe，
 * 检查 preload 桥、首屏摘要弹框、逐字标题动画，并走遍 5 个导航页面。
 *
 * 用法：node electron/verify-package.mjs [exe 路径]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from '@playwright/test'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')
const defaultExe = path.join(root, 'desktop-dist', 'Subscriber', 'Subscriber.exe')
const exePath = path.resolve(process.argv[2] || defaultExe)
const shotDir = path.join(root, 'shots')

// 宿主终端可能导出了 ELECTRON_RUN_AS_NODE，会让 electron.exe 退化成 Node
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const NAV = ['今日精选', '全部信息', '消息与订阅', '我的收藏', '完成回顾']
const failures = []

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✓ ${label}`)
  } else {
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
    failures.push(label)
  }
}

if (!fs.existsSync(exePath)) {
  console.error(`找不到主程序：${exePath}`)
  process.exit(1)
}
fs.mkdirSync(shotDir, { recursive: true })

console.log(`验证目标：${exePath}`)
const app = await electron.launch({ executablePath: exePath, env })
const page = await app.firstWindow()

const pageErrors = []
page.on('pageerror', error => pageErrors.push(error.message))
page.on('console', message => {
  if (message.type() === 'error') pageErrors.push(`console: ${message.text()}`)
})

try {
  await page.waitForLoadState('domcontentloaded')

  // 1. 应用标识
  const meta = await app.evaluate(({ app: electronApp }) => ({
    name: electronApp.getName(),
    version: electronApp.getVersion(),
    userData: electronApp.getPath('userData'),
    packaged: electronApp.isPackaged,
  }))
  console.log(`应用：${meta.name} ${meta.version}（packaged=${meta.packaged}）`)
  console.log(`用户数据：${meta.userData}`)
  check('应用名为 Subscriber', meta.name === 'Subscriber', meta.name)
  check('以打包形态运行（file:// 加载）', meta.packaged === true)

  // 2. preload 桥与页面渲染
  const shell = await page.evaluate(() => ({
    protocol: location.protocol,
    title: document.title,
    hasBridge: Boolean(window.subscriberDesktop?.isDesktop),
    splitChars: document.querySelectorAll('.split-char').length,
    hasCanvas: Boolean(document.querySelector('.app-backdrop canvas')),
    bodyText: document.body.innerText.length,
  }))
  console.log(`页面：${shell.title}（${shell.protocol}，正文 ${shell.bodyText} 字）`)
  check('通过 file:// 加载', shell.protocol === 'file:', shell.protocol)
  check('preload 桥已注入', shell.hasBridge)
  check('逐字标题已渲染', shell.splitChars > 0, `${shell.splitChars} 个字符`)
  check('ASCII 背景画布存在', shell.hasCanvas)

  // 2.5 主进程 IPC：实时抓取 / RSS 抓取。
  // collector.cjs 曾经漏打进 asar（源码运行正常、打包版一律报「未打包」），
  // 这里用一个必然连不上的本地端口做探针：能走到网络层就说明解析器确实打进包了。
  const bridge = await page.evaluate(async () => {
    const api = window.subscriberDesktop || {}
    const probe = async url => {
      try {
        return await api.fetchRss(url)
      } catch (error) {
        return { ok: false, message: String(error && error.message ? error.message : error) }
      }
    }
    return {
      hasLive: typeof api.fetchLive === 'function',
      hasRss: typeof api.fetchRss === 'function',
      hasCustomLive: typeof api.fetchCustomLive === 'function',
      hasClipboard: typeof api.readClipboard === 'function',
      clipboard: await api.readClipboard?.(),
      bad: await probe('file:///c:/windows/win.ini'),
      offline: await probe('http://127.0.0.1:9/probe.xml'),
    }
  })
  check('preload 暴露实时抓取与 RSS 抓取', bridge.hasLive && bridge.hasRss)
  check(
    'preload 暴露自定义官网与剪贴板通道',
    bridge.hasCustomLive && bridge.hasClipboard && typeof bridge.clipboard?.ok === 'boolean',
    JSON.stringify(bridge.clipboard)
  )
  check(
    'RSS 抓取拒绝非 http(s) 地址',
    bridge.bad?.ok === false && /http/.test(bridge.bad.message || ''),
    bridge.bad?.message
  )
  check(
    'RSS 解析器已打包（请求走到网络层）',
    bridge.offline?.ok === false && !/未打包/.test(bridge.offline.message || ''),
    bridge.offline?.message
  )

  // 3. 首屏摘要弹框
  const digest = page.getByRole('dialog', { name: '今天，值得关注这些' })
  await digest.waitFor({ state: 'visible', timeout: 15000 })
  await digest.getByRole('button', { name: '开始浏览' }).click()
  await digest.waitFor({ state: 'hidden', timeout: 10000 })
  check('首屏摘要弹框可打开并关闭', true)
  await page.screenshot({ path: path.join(shotDir, 'desktop-01-home.png') })

  // 4. 走遍全部导航页面
  for (const [index, label] of NAV.entries()) {
    await page.locator('.main-nav').getByRole('button', { name: new RegExp(label) }).click()
    await page.waitForTimeout(850)
    const state = await page.evaluate(() => ({
      heading: document.querySelector('.page-heading h1, .split-heading')?.textContent?.trim(),
      cards: document.querySelectorAll('.library-list > *, .review-list > *').length,
      chars: document.querySelectorAll('.split-char').length,
    }))
    check(
      `${label} 页面正常渲染`,
      Boolean(state.heading) && state.chars > 0,
      `标题「${state.heading}」，${state.chars} 个逐字字符`
    )
    await page.screenshot({ path: path.join(shotDir, `desktop-0${index + 2}-${label}.png`) })
  }

  check('无运行时错误', pageErrors.length === 0, pageErrors.join(' | '))
} finally {
  await app.close()
}

if (failures.length > 0) {
  console.error(`\n验证失败 ${failures.length} 项：${failures.join('、')}`)
  process.exit(1)
}
console.log('\n全部检查通过')
