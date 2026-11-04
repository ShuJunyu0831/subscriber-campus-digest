/**
 * 打包产物的端到端验证：直接拉起 desktop-dist 里的 exe，
 * 检查 preload 桥、首屏摘要弹框、逐字标题动画，并走遍 5 个导航页面。
 *
 * 用法：node electron/verify-package.mjs [exe 路径]
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
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

// 0. 转发参数解析：纯函数，先验一遍再启动应用，失败时能立刻定位到解析而不是打包
const { parseShareArgs } = createRequire(import.meta.url)('../electron/share-args.cjs')
const forwarded = parseShareArgs([
  'Subscriber.exe',
  'subscriber://share?text=%E7%AB%9E%E8%B5%9B%E9%80%9A%E7%9F%A5%EF%BC%9A11%E6%9C%8820%E6%97%A5%E6%88%AA%E6%AD%A2',
  '--share-text',
  '第二段内容',
])
check(
  '协议链接与命令行转发都能解析',
  forwarded.length === 2 && forwarded[0].text === '竞赛通知：11月20日截止' && forwarded[1].text === '第二段内容',
  JSON.stringify(forwarded)
)
check('无关启动参数不会被当成转发内容', parseShareArgs(['Subscriber.exe', '--dev', '.']).length === 0)

console.log(`验证目标：${exePath}`)
// 模拟「转发到其他应用」：微信把转发的聊天记录落成文件，再用 Subscriber 打开它
const tempShare = path.join(os.tmpdir(), `subscriber-verify-share-${process.pid}.txt`)
fs.writeFileSync(tempShare, [
  'ACM 集训队通知群',
  '校赛报名 11 月 18 日截止，三人一队。',
  '',
  '蓝桥杯备赛群',
  '省赛 11 月 25 日开始报名。',
].join('\n'), 'utf8')

const launchArgs = ['--share-file', tempShare]
// 允许在用户已打开桌面版时用独立 userData 做检验，避免 Chromium 缓存/单实例锁互相抢占。
if (process.env.SUBSCRIBER_VERIFY_USER_DATA) {
  launchArgs.push(`--user-data-dir=${process.env.SUBSCRIBER_VERIFY_USER_DATA}`)
}

const app = await electron.launch({
  executablePath: exePath,
  env,
  args: launchArgs,
})
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
    themeChoice: document.documentElement.getAttribute('data-theme'),
    themeButton: Boolean(document.querySelector('[data-theme-state]')),
    paper: getComputedStyle(document.documentElement).getPropertyValue('--paper').trim(),
    bodyText: document.body.innerText.length,
  }))
  console.log(`页面：${shell.title}（${shell.protocol}，正文 ${shell.bodyText} 字）`)
  check('通过 file:// 加载', shell.protocol === 'file:', shell.protocol)
  check('preload 桥已注入', shell.hasBridge)
  check('首页标题按文本渲染（不再逐字动画）', shell.splitChars === 0, `${shell.splitChars} 个逐字字符`)
  check('全屏噪点画布已移除（贴合纸质底纹）', shell.hasCanvas === false)
  check('语义色板已注入', /^#/.test(shell.paper), shell.paper)
  check('默认跟随系统外观（未写死 data-theme）', shell.themeChoice === null, String(shell.themeChoice))
  check('顶栏有主题切换入口', shell.themeButton)

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
      hasWechat: typeof api.fetchWechatArticle === 'function',
      hasForward: typeof api.pullIncomingShares === 'function' && typeof api.onIncomingShare === 'function',
      emptyQueue: await api.pullIncomingShares?.().catch(() => null),
      clipboard: await api.readClipboard?.(),
      notWechat: await api.fetchWechatArticle?.('https://example.com/not-wechat').catch(error => ({ ok: false, message: String(error) })),
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
    '公众号链路只接受 mp.weixin.qq.com 链接',
    bridge.hasWechat && bridge.notWechat?.ok === false && !/未打包/.test(bridge.notWechat?.message || ''),
    bridge.notWechat?.message
  )
  check(
    '外部转发通道可用（队列可拉取）',
    bridge.hasForward && Array.isArray(bridge.emptyQueue),
    JSON.stringify(bridge.emptyQueue)
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

  // 3. 外部转发启动时，摘要不能盖住批量导入预览
  const digest = page.getByRole('dialog', { name: '今天，值得关注这些' })
  check('外部分享启动时不会用首屏摘要遮挡导入预览', !(await digest.isVisible()))

  // 2.6 外部转发：启动参数带内容时，应用应自动切到「消息与订阅」并打开批量导入
  const forwardedDialog = page.getByRole('dialog', { name: '批量导入消息' })
  await forwardedDialog.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {})
  check('外部转发内容自动进入批量导入', await forwardedDialog.isVisible())
  if (await forwardedDialog.isVisible()) {
    await forwardedDialog.locator('.batch-preview-head').waitFor({ timeout: 5000 }).catch(() => {})
    check(
      '转发内容被拆成可保存的条目',
      /2 条/.test(await forwardedDialog.locator('.batch-preview-head').innerText().catch(() => '')),
      await forwardedDialog.locator('.batch-preview-head').innerText().catch(() => '')
    )
    const firstRow = await forwardedDialog.locator('.batch-row').first().innerText().catch(() => '')
    check('转发文件里的来源名被识别', firstRow.includes('ACM 集训队通知群'), firstRow.replace(/\s+/g, ' '))
    await forwardedDialog.getByRole('button', { name: '取消' }).click()
    await forwardedDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
  }

  // 3.1 手动打开首屏摘要，确认文案与关闭按钮仍可用
  await page.locator('.main-nav').getByRole('button', { name: /今日精选/ }).click()
  await page.getByRole('button', { name: /阅读完整摘要/ }).click()
  await digest.waitFor({ state: 'visible', timeout: 10000 })
  await digest.getByRole('button', { name: '开始浏览' }).click()
  await digest.waitFor({ state: 'hidden', timeout: 10000 })
  check('首屏摘要弹框可打开并关闭', true)
  await page.screenshot({ path: path.join(shotDir, 'desktop-01-home.png') })

  // 3.1.1 删除入口：单条按钮在信息库每张卡片上，多选模式给出底部操作条
  await page.locator('.main-nav').getByRole('button', { name: /全部信息/ }).click()
  await page.locator('.library-list .info-card').first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {})
  const deleteEntryCount = await page.locator('.card-actions .icon-button.danger').count()
  check('信息卡片带删除入口', deleteEntryCount > 0, `${deleteEntryCount} 个`)
  await page.getByRole('button', { name: '选择', exact: true }).click()
  const selectionBar = page.locator('.selection-bar')
  const barShown = await selectionBar.isVisible().catch(() => false)
  await page.locator('.library-list .info-card').first().locator('.card-main').click()
  const selectionText = await selectionBar.locator('.selection-count').innerText().catch(() => '')
  check('信息库可多选并显示底部操作条', barShown && /已选 1 条/.test(selectionText), selectionText)
  await selectionBar.getByRole('button', { name: '退出', exact: true }).click()
  await page.locator('.main-nav').getByRole('button', { name: /今日精选/ }).click()

  // 2.7 拖放：故意先回到「今日精选」，证明拖到窗口任意位置都能接住
  //     （只把 drop 绑在消息箱区块上时，拖到别处 drop 根本不会触发，这是实际报过的问题）
  await page.locator('.main-nav').getByRole('button', { name: /今日精选/ }).click()
  await page.waitForTimeout(600)
  await page.evaluate(() => {
    const data = new DataTransfer()
    data.setData('text/plain', '拖放验证群\n省赛报名 12 月 1 日截止。')
    for (const type of ['dragenter', 'dragover']) {
      document.body.dispatchEvent(new DragEvent(type, { dataTransfer: data, bubbles: true, cancelable: true }))
    }
  })
  const dropOverlay = page.locator('.drop-overlay')
  await dropOverlay.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
  check('拖到窗口任意位置都有整窗松手提示', await dropOverlay.isVisible(),
    (await dropOverlay.innerText().catch(() => '')).replace(/\s+/g, ' '))

  await page.evaluate(() => {
    const data = new DataTransfer()
    data.setData('text/plain', '拖放验证群\n省赛报名 12 月 1 日截止。')
    document.body.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }))
  })
  const droppedDialog = page.getByRole('dialog', { name: '批量导入消息' })
  await droppedDialog.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
  check('拖入的文字自动切页并进入批量导入', await droppedDialog.isVisible())
  if (await droppedDialog.isVisible()) {
    const droppedHead = await droppedDialog.locator('.batch-preview-head').innerText().catch(() => '')
    check('拖入内容被拆成可保存的条目', /1 条/.test(droppedHead), droppedHead)
    await droppedDialog.getByRole('button', { name: '取消' }).click()
    await droppedDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
  }
  check('松手后整窗提示已收起', await dropOverlay.isHidden().catch(() => true))

  // 2.8 拖入 .zip 聊天记录：验证打包环境里 DecompressionStream('deflate-raw') 可用
  const fixturePath = path.join(root, 'tests', 'fixtures', 'chat-export.zip')
  if (fs.existsSync(fixturePath)) {
    const zipBase64 = fs.readFileSync(fixturePath).toString('base64')
    await page.evaluate((payload) => {
      const bytes = Uint8Array.from(atob(payload), char => char.charCodeAt(0))
      const data = new DataTransfer()
      data.items.add(new File([bytes], '聊天记录_20261104_000456.zip', { type: 'application/zip' }))
      document.body.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }))
    }, zipBase64)
    const zipDialog = page.getByRole('dialog', { name: '批量导入消息' })
    await zipDialog.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {})
    check('拖入的 .zip 聊天记录能解开', await zipDialog.isVisible())
    if (await zipDialog.isVisible()) {
      const zipHead = await zipDialog.locator('.batch-preview-head').innerText().catch(() => '')
      check('压缩包里的文本条目都被拆出来（4 条，png 跳过）', /4 条/.test(zipHead), zipHead)
      const zipBody = await zipDialog.innerText().catch(() => '')
      check('压缩包内 GBK 条目没有变成乱码', zipBody.includes('电子设计竞赛群'))
      check('压缩包内 .html 条目已剥掉标签', !zipBody.includes('<p>'))
      await zipDialog.getByRole('button', { name: '取消' }).click()
      await zipDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
    }
  }


  // 4. 走遍全部导航页面
  let splitTotal = 0
  for (const [index, label] of NAV.entries()) {
    await page.locator('.main-nav').getByRole('button', { name: new RegExp(label) }).click()
    await page.waitForTimeout(850)
    const state = await page.evaluate(() => ({
      heading: document.querySelector('.page-heading h1, .split-heading')?.textContent?.trim(),
      cards: document.querySelectorAll('.library-list > *, .review-list > *').length,
      chars: document.querySelectorAll('.split-char').length,
    }))
    splitTotal += state.chars
    check(
      `${label} 页面正常渲染`,
      Boolean(state.heading),
      `标题「${state.heading}」，${state.chars} 个逐字字符`
    )
    await page.screenshot({ path: path.join(shotDir, `desktop-0${index + 2}-${label}.png`) })
  }
  check('次要页面保留逐字入场动画', splitTotal > 0, `${splitTotal} 个字符`)

  check('无运行时错误', pageErrors.length === 0, pageErrors.join(' | '))
} finally {
  await app.close()
  try { fs.unlinkSync(tempShare) } catch { /* 临时文件删不掉不影响结论 */ }
}

if (failures.length > 0) {
  console.error(`\n验证失败 ${failures.length} 项：${failures.join('、')}`)
  process.exit(1)
}
console.log('\n全部检查通过')
