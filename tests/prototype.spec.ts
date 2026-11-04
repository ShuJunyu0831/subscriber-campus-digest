import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

/** 打开首页并关闭首屏今日摘要弹框，避免遮住后续操作。 */
async function openHome(page: Page) {
  await page.goto('/')
  const digest = page.getByRole('dialog', { name: '今天，值得关注这些' })
  if (await digest.isVisible()) {
    await digest.getByRole('button', { name: '开始浏览' }).click()
    await expect(digest).toBeHidden()
  }
}

test('首屏摘要弹框展示今日条目并可关闭', async ({ page }) => {
  await page.goto('/')
  const digest = page.getByRole('dialog', { name: '今天，值得关注这些' })
  await expect(digest).toBeVisible()
  await expect(digest.locator('.digest-date')).toBeVisible()
  await digest.getByRole('button', { name: '开始浏览' }).click()
  await expect(digest).toBeHidden()
  await expect(page.getByRole('heading', { name: '今日精选', exact: true })).toBeVisible()
})

test('收藏、详情与完成回顾可以连续操作', async ({ page }) => {
  await openHome(page)
  await expect(page.getByRole('heading', { name: '今日精选', exact: true })).toBeVisible()
  const firstCard = page.locator('.info-card').first()
  await firstCard.getByRole('button', { name: '取消收藏' }).click()
  await expect(firstCard.getByRole('button', { name: '收藏', exact: true })).toBeVisible()
  await firstCard.locator('.card-main').click()
  const detailDialog = page.getByRole('dialog', { name: '信息详情' })
  await expect(detailDialog).toBeVisible()
  await detailDialog.getByRole('button', { name: '标记完成', exact: true }).click()
  await page.getByRole('button', { name: '返回', exact: true }).click()
  await page.locator('.main-nav').getByRole('button', { name: /完成回顾/ }).click()
  await expect(page.getByRole('heading', { name: '完成回顾', exact: true })).toBeVisible()
  await expect(page.locator('.completed-list')).toContainText('数学建模')
})

test('手动导入校验并生成模拟条目', async ({ page }) => {
  await openHome(page)
  await page.getByRole('button', { name: '导入新信息' }).click()
  await page.getByRole('button', { name: '开始整理' }).click()
  await expect(page.getByText('请先粘贴需要整理的文字。')).toBeVisible()
  await page.locator('textarea').fill('全国大学生软件创新大赛报名通知\n报名截止时间为11月20日。')
  await page.getByRole('button', { name: '开始整理' }).click()
  await expect(page.getByRole('dialog', { name: '导入一条信息' })).toBeHidden()
  await page.locator('.main-nav').getByRole('button', { name: /全部信息/ }).click()
  await expect(page.locator('.library-list')).toContainText('全国大学生软件创新大赛报名通知')
})

test('接入真实模型后粘贴文字调用 OpenAI 兼容接口（mock 验证）', async ({ page }) => {
  let apiCalls = 0
  await page.route('**/chat/completions*', async route => {
    const request = route.request()
    if (request.method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'authorization, content-type' },
      })
      return
    }
    apiCalls += 1
    const body = request.postDataJSON() as { model?: string; messages?: { role: string; content: string }[] }
    expect(body?.model).toContain('deepseek')
    const userText = body?.messages?.find(message => message.role === 'user')?.content ?? ''
    expect(userText).toContain('数学建模')
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        choices: [{
          message: {
            role: 'assistant',
            content: JSON.stringify({
              summary: '校内数学建模选拔赛开始报名，11月20日截止组队。',
              keyPoints: ['面向全校本科生开放', '11月20日报名截止', '需三人组队参赛'],
              deadline: '11月20日',
              evidence: '报名截止时间为11月20日。',
            }),
          },
        }],
      }),
    })
  })

  // 在模型面板里保存凭据（只写本机 localStorage）
  await openHome(page)
  await page.locator('.llm-trigger').click()
  const panel = page.getByRole('dialog', { name: '选择分析模型' })
  await panel.getByRole('button', { name: /接入真实模型/ }).click()
  await panel.getByLabel('API Key').fill('sk-test-prototype')
  await panel.getByRole('button', { name: '保存并接入' }).click()
  await expect(panel).toContainText('已接入')
  await page.locator('.llm-trigger').click()

  // 粘贴文字导入 → 走真实接口而非模拟
  await page.getByRole('button', { name: '导入新信息' }).click()
  const modal = page.getByRole('dialog', { name: '导入一条信息' })
  await expect(modal).toContainText('真实调用')
  await modal.locator('textarea').fill('2026 年校内数学建模选拔报名通知\n报名截止时间为11月20日。')
  await modal.getByRole('button', { name: '开始整理' }).click()
  await expect(modal).toBeHidden()
  expect(apiCalls).toBe(1)

  // 信息库里出现的是模型返回的摘要，而不是演示文案
  await page.locator('.main-nav').getByRole('button', { name: /全部信息/ }).click()
  await expect(page.locator('.library-list')).toContainText('校内数学建模选拔赛开始报名')
  await expect(page.locator('.library-list')).not.toContainText('这是原型生成的模拟摘要')
})

test('公开检索防止重复订阅且重开后保留已订阅状态', async ({ page }) => {
  await openHome(page)
  await page.locator('.discover-button').click()
  await page.getByRole('button', { name: '检索', exact: true }).click()
  await expect(page.locator('.result-skeletons')).toBeVisible()
  await expect(page.getByText(/找到 2 条模拟信息/)).toBeVisible()
  await expect(page.locator('.discover-result').first().getByRole('button', { name: '已订阅' })).toBeDisabled()
  await page.locator('.discover-result').nth(1).getByRole('button', { name: '订阅', exact: true }).click()
  await expect(page.locator('.discover-result').nth(1).getByRole('button', { name: '已订阅' })).toBeDisabled()
  await page.getByRole('button', { name: '关闭' }).click()
  await page.locator('.discover-button').click()
  await page.getByRole('button', { name: '检索', exact: true }).click()
  await expect(page.locator('.discover-result').nth(1).getByRole('button', { name: '已订阅' })).toBeDisabled()
  await page.getByRole('button', { name: '关闭' }).click()
  await page.locator('.main-nav').getByRole('button', { name: /全部信息/ }).click()
  await expect(page.locator('.library-list .card-main h3').filter({ hasText: '生成式人工智能应用设计校园赛通知' })).toHaveCount(1)
})

test('微信分享先存本机且每次上云必须再次确认', async ({ page }) => {
  await openHome(page)
  await page.locator('.main-nav').getByRole('button', { name: /消息与订阅/ }).click()
  await expect(page.getByRole('heading', { name: '消息与订阅', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '载入演示分享' }).click()
  await expect(page.getByRole('dialog', { name: '导入微信分享' })).toBeVisible()
  await page.getByRole('button', { name: '仅保存到本机' }).click()
  await expect(page.getByText('2026 软件创新竞赛通知群')).toBeVisible()
  await page.reload()
  const digest = page.getByRole('dialog', { name: '今天，值得关注这些' })
  if (await digest.isVisible()) {
    await digest.getByRole('button', { name: '开始浏览' }).click()
    await expect(digest).toBeHidden()
  }
  await page.locator('.main-nav').getByRole('button', { name: /消息与订阅/ }).click()
  await expect(page.getByText('2026 软件创新竞赛通知群')).toBeVisible()
  await page.getByRole('button', { name: '选择2026 软件创新竞赛通知群' }).click()
  await page.getByRole('button', { name: '用 AI 分析' }).click()
  const consentDialog = page.getByRole('dialog', { name: '确认发送给 AI' })
  const analyzeButton = consentDialog.getByRole('button', { name: '确认并分析' })
  await expect(analyzeButton).toBeDisabled()
  await expect(consentDialog.locator('.outbound-preview')).toContainText('手机号已隐藏')
  await expect(consentDialog.locator('.outbound-preview')).not.toContainText('13800138000')
  await consentDialog.getByRole('checkbox').check()
  await expect(analyzeButton).toBeEnabled()
  await analyzeButton.click()
  await expect(consentDialog).toBeHidden()
  await page.locator('.main-nav').getByRole('button', { name: /全部信息/ }).click()
  await expect(page.locator('.library-list')).toContainText('全国大学生软件创新大赛报名开始')
})

test('PWA 分享入口可接收文本并打开本地导入确认', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null)
  await page.evaluate(async () => {
    const form = new FormData()
    form.set('title', '课程通知群')
    form.set('text', '本周四的数据结构课调整到周五下午两点。')
    form.set('url', '')
    // 服务 worker 会 303 重定向，这里不跟随，只等它把草稿写入 IndexedDB
    const response = await fetch('/share-target', { method: 'POST', body: form, redirect: 'manual' })
    if (response.type !== 'opaqueredirect' && !response.ok) throw new Error(`share-target ${response.status}`)
  })
  // 等草稿真正落库，避免并发下导航早于写入造成的偶发失败
  await expect.poll(
    () => page.evaluate(() => new Promise<boolean>(resolve => {
      const request = indexedDB.open('subscriber-share-inbox', 1)
      request.onerror = () => resolve(false)
      request.onsuccess = () => {
        const db = request.result
        if (!db.objectStoreNames.contains('incoming')) { resolve(false); return }
        const count = db.transaction('incoming', 'readonly').objectStore('incoming').count('pending')
        count.onsuccess = () => resolve(count.result > 0)
        count.onerror = () => resolve(false)
      }
    })),
    { timeout: 8000 },
  ).toBe(true)
  await page.goto('/?share=received')
  const shareDialog = page.getByRole('dialog', { name: '导入微信分享' })
  await expect(shareDialog).toBeVisible()
  await expect(shareDialog.locator('input')).toHaveValue('课程通知群')
  await expect(shareDialog.locator('textarea')).toHaveValue('本周四的数据结构课调整到周五下午两点。')
})

test('390px 移动端无横向溢出且导航可用', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openHome(page)
  await expect(page.locator('.mobile-nav')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.locator('.mobile-add').click()
  await expect(page.getByRole('dialog', { name: '导入一条信息' })).toBeVisible()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await page.locator('.mobile-nav').getByRole('button', { name: /信息库/ }).click()
  await expect(page.getByRole('heading', { name: '全部信息', exact: true })).toBeVisible()
})

test('同一事件的多版本自动归并且只保留最新结论', async ({ page }) => {
  await openHome(page)
  await page.locator('.main-nav').getByRole('button', { name: /全部信息/ }).click()
  const first = page.locator('.library-list .info-card').first()
  await expect(first.locator('.version-chip')).toHaveText('V2')
  // 官网直采条目并入后，引擎在真实数据上也会合并重复：合并数不低于演示数据的 2 条
  const mergeChip = page.locator('.insight-chip').first()
  await expect(mergeChip).toContainText(/已自动合并 [2-9] 条/)
  await expect(mergeChip).toContainText('组版本')
  // 官网直采快照条目已并入信息库，工具条有真实抓取标注（快照数量随官网更新变化，只断言来源构成）
  await expect(page.locator('.live-chip')).toContainText(/官网直采 \d+ 条/)
  await expect(page.locator('.library-list .source-type').filter({ hasText: '官网直采' }).first()).toBeVisible()
  // P1：温州医科大学教务处的真实教务通知在信息库中可见
  await expect(page.locator('.library-list .source-name').filter({ hasText: '温州医科大学教务处' }).first()).toBeVisible()
  // 演示事件的原文与转载只出现一次（用唯一的事件词校验，避免与官网直采条目撞标题）
  await expect(page.locator('.library-list .card-main h3').filter({ hasText: '校内选拔报名' })).toHaveCount(1)

  await page.locator('.insight-chip').first().click()
  const modal = page.getByRole('dialog', { name: '分类与版本规则' })
  await expect(modal).toBeVisible()
  await expect(modal.locator('.taxonomy-group')).toHaveCount(1)
  await expect(modal.locator('.taxonomy-group')).toContainText('V1')
  await expect(modal.locator('.taxonomy-group')).toContainText('V2')
  await modal.getByRole('button', { name: '知道了' }).click()

  await first.locator('.card-main').click()
  const drawer = page.getByRole('dialog', { name: '信息详情' })
  await expect(drawer.locator('.version-timeline li')).toHaveCount(2)
  await expect(drawer.locator('.version-timeline')).toContainText('已被后续版本取代')
  await expect(drawer.locator('.version-timeline')).toContainText('当前版本')
  await expect(drawer.locator('.classify-facts')).toContainText('已自动合并 1 条重复')
})

test('公众号订阅按账号分组、自动去重并可把新版本并入信息库', async ({ page }) => {
  await openHome(page)
  await page.locator('.main-nav').getByRole('button', { name: /消息与订阅/ }).click()
  await page.getByRole('tab', { name: /公众号订阅/ }).click()

  await expect(page.locator('.feed-group')).toHaveCount(3)
  await expect(page.locator('.feed-article')).toHaveCount(8)
  await expect(page.locator('.account-overview')).toContainText('已去重转载')
  await expect(page.locator('.feed-group-head').filter({ hasText: '竞赛君' })).toHaveCount(0)

  // 订阅管理：把未订阅的聚合号加进来
  await page.getByRole('button', { name: '管理', exact: true }).click()
  const manager = page.getByRole('dialog', { name: '公众号订阅管理' })
  await expect(manager.locator('.account-manager-row')).toHaveCount(5)
  await manager.locator('.account-manager-row').filter({ hasText: '竞赛君' }).getByRole('button', { name: '订阅', exact: true }).click()
  await manager.getByRole('button', { name: '完成', exact: true }).click()
  await expect(page.locator('.feed-group-head').filter({ hasText: '竞赛君' })).toHaveCount(1)
  const beforeSync = await page.locator('.feed-article').count()

  // 同步更新：模拟拉取到 2 条新消息
  await page.getByRole('button', { name: '同步更新' }).click()
  await expect(page.locator('.feed-article')).toHaveCount(beforeSync + 2)
  await expect(page.getByText('已同步最新')).toBeVisible()

  // 再次延期的那篇文章以“版本更新”出现，合并后信息库变为 V3
  const updateRow = page.locator('.feed-article').filter({ hasText: '再次延期' })
  await expect(updateRow.locator('.feed-badge')).toContainText('版本更新')
  await updateRow.getByRole('button', { name: /合并更新/ }).click()
  await page.locator('.main-nav').getByRole('button', { name: /全部信息/ }).click()
  const first = page.locator('.library-list .info-card').first()
  await expect(first.locator('.version-chip')).toHaveText('V3')
  await expect(first.locator('.card-extras')).toContainText('V3 · 已合并 3 个版本')
})

test('赛事卡片提供官网一键入口，缺失时标注待核对', async ({ page }) => {
  await openHome(page)
  await page.locator('.main-nav').getByRole('button', { name: /全部信息/ }).click()
  const first = page.locator('.library-list .info-card').first()
  const official = first.locator('.official-link')
  await expect(official).toBeVisible()
  await expect(official).toHaveAttribute('href', 'https://www.mcm.edu.cn/')
  await expect(official).toHaveAttribute('target', '_blank')

  const aiCard = page.locator('.library-list .info-card').filter({ hasText: '人工智能创新应用竞赛' })
  await expect(aiCard.locator('.official-missing')).toContainText('官网待核对')
})

test('右下角可切换国内大模型并记住选择', async ({ page }) => {
  await openHome(page)
  await page.locator('.llm-trigger').click()
  const panel = page.getByRole('dialog', { name: '选择分析模型' })
  await expect(panel).toBeVisible()
  await expect(panel.locator('.llm-option')).toHaveCount(11)
  await expect(panel).toContainText('通义千问')
  await expect(panel).toContainText('Kimi')
  await expect(panel).toContainText('文心一言')

  await panel.getByRole('button', { name: /Kimi K2/ }).click()
  await expect(page.locator('.llm-trigger')).toContainText('Kimi K2')

  await page.reload()
  const digest = page.getByRole('dialog', { name: '今天，值得关注这些' })
  if (await digest.isVisible()) {
    await digest.getByRole('button', { name: '开始浏览' }).click()
    await expect(digest).toBeHidden()
  }
  await expect(page.locator('.llm-trigger')).toContainText('Kimi K2')

  // 微信分析的确认弹窗引用当前选择的模型
  await page.locator('.main-nav').getByRole('button', { name: /消息与订阅/ }).click()
  await page.getByRole('button', { name: '载入演示分享' }).click()
  await page.getByRole('button', { name: '仅保存到本机' }).click()
  await page.getByRole('button', { name: '选择2026 软件创新竞赛通知群' }).click()
  await page.getByRole('button', { name: '用 AI 分析' }).click()
  const consent = page.getByRole('dialog', { name: '确认发送给 AI' })
  await expect(consent).toContainText('Kimi K2')
  await expect(consent.locator('.outbound-preview')).toContainText('手机号已隐藏')
})

test('390px 移动端公众号订阅页无横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openHome(page)
  await page.locator('.mobile-nav').getByRole('button', { name: /消息与订阅/ }).click()
  await page.getByRole('tab', { name: /公众号订阅/ }).click()
  await expect(page.locator('.account-overview')).toBeVisible()
  await expect(page.locator('.feed-article').first()).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('详情页可并排对比两个版本并标出变化字段', async ({ page }) => {
  await openHome(page)
  await page.locator('.main-nav').getByRole('button', { name: /全部信息/ }).click()
  await page.locator('.library-list .info-card').first().locator('.card-main').click()

  const drawer = page.getByRole('dialog', { name: '信息详情' })
  await expect(drawer).toBeVisible()
  await drawer.getByRole('button', { name: /并排对比/ }).click()

  const compare = page.getByRole('dialog', { name: '版本对比' })
  await expect(compare).toBeVisible()
  await expect(compare.locator('.compare-head')).toContainText('V1')
  await expect(compare.locator('.compare-head')).toContainText('V2')

  // 截止时间从 11月03日 改到 11月10日，这一行必须被标成「已变更」
  const deadlineRow = compare.locator('.compare-row').filter({ hasText: /^报名截止/ })
  await expect(deadlineRow).toHaveClass(/changed/)
  await expect(deadlineRow).toContainText('11月03日 23:59')
  await expect(deadlineRow).toContainText('11月10日 23:59')
  expect(await compare.locator('.compare-row.changed').count()).toBeGreaterThan(0)

  await compare.locator('.modal-actions').getByRole('button', { name: '关闭' }).click()
  await expect(compare).toBeHidden()
  await expect(drawer).toBeVisible()
})

test('收藏页可搜索、按分类筛选并切换排序', async ({ page }) => {
  await openHome(page)
  await page.locator('.main-nav').getByRole('button', { name: /我的收藏/ }).click()
  await expect(page.locator('.searchbar-hint')).toContainText('已收藏')
  const favoriteCards = page.locator('.library-list .info-card')
  expect(await favoriteCards.count()).toBeGreaterThan(1)

  // 页内搜索（顶部搜索框在窄屏会被隐藏，这里必须独立可用）
  await page.getByLabel('在信息库中搜索').fill('数学建模')
  await expect(favoriteCards).toHaveCount(1)
  await expect(favoriteCards.first()).toContainText('数学建模')
  await page.getByRole('button', { name: '清除搜索' }).click()
  expect(await favoriteCards.count()).toBeGreaterThan(1)

  // 分类筛选保留收藏范围
  await page.locator('.filter-tabs').getByRole('button', { name: /课程通知/ }).click()
  await expect(favoriteCards).toHaveCount(0)
  await page.locator('.filter-tabs').getByRole('button', { name: /竞赛/ }).click()
  expect(await favoriteCards.count()).toBeGreaterThan(0)

  // 排序：临近截止把最早的未截止竞赛顶到最前
  await page.locator('.filter-tabs').getByRole('button', { name: /全部/ }).click()
  await page.getByRole('button', { name: '临近截止' }).click()
  await expect(favoriteCards.first()).toContainText('数学建模')
  await page.getByRole('button', { name: '默认排序' }).click()
  await expect(page.locator('.library-list .info-card').first()).toBeVisible()
})

test('完成回顾可按本周 / 本月 / 全部切换并分组', async ({ page }) => {
  await openHome(page)
  await page.locator('.main-nav').getByRole('button', { name: /完成回顾/ }).click()
  const periods = page.locator('.review-periods')
  await expect(periods.getByRole('button', { name: /全部/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.completed-group-head')).not.toHaveCount(0)
  const allCount = await page.locator('.completed-list article').count()
  expect(allCount).toBeGreaterThan(0)

  // 演示数据里的完成记录都在上周，本周应为空
  await periods.getByRole('button', { name: /本周/ }).click()
  await expect(page.locator('.completed-list article')).toHaveCount(0)
  await expect(page.locator('.empty-state')).toBeVisible()

  // 标记一条完成 → 本周计数与列表同步增长
  await page.locator('.main-nav').getByRole('button', { name: /全部信息/ }).click()
  await page.locator('.library-list .info-card').first().getByRole('button', { name: '标记完成' }).click()
  await page.locator('.main-nav').getByRole('button', { name: /完成回顾/ }).click()
  await expect(periods.getByRole('button', { name: /本周/ })).toContainText('1')
  await periods.getByRole('button', { name: /全部/ }).click()
  await expect(page.locator('.completed-list article')).toHaveCount(allCount + 1)
})

test('完成回顾用瀑布流排列：多列不重叠，窄屏自动单列', async ({ page }) => {
  await openHome(page)
  // 先攒够卡片，单列布局看不出瀑布流
  await page.locator('.main-nav').getByRole('button', { name: /全部信息/ }).click()
  const cards = page.locator('.library-list .info-card')
  for (let index = 0; index < 6; index += 1) {
    const button = cards.nth(index).getByRole('button', { name: '标记完成' })
    if (await button.count()) await button.click()
  }
  await page.locator('.main-nav').getByRole('button', { name: /完成回顾/ }).click()

  const grid = page.locator('.completed-masonry').first()
  await expect(grid).toBeVisible()

  const measure = () => grid.locator('.completed-tile').evaluateAll(nodes => nodes.map(node => {
    const rect = node.getBoundingClientRect()
    return { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) }
  }))

  const boxes = await measure()
  expect(boxes.length).toBeGreaterThanOrEqual(6)

  // 宽屏应该排成多列
  expect(new Set(boxes.map(box => box.x)).size).toBeGreaterThan(1)

  // 任意两张卡片不能重叠（这就是绝对定位最容易翻车的地方）
  for (let a = 0; a < boxes.length; a += 1) {
    for (let b = a + 1; b < boxes.length; b += 1) {
      const first = boxes[a]
      const second = boxes[b]
      const overlap = first.x < second.x + second.w && second.x < first.x + first.w
        && first.y < second.y + second.h && second.y < first.y + first.h
      expect(overlap, `卡片 ${a} 与 ${b} 重叠`).toBe(false)
    }
  }

  // 容器高度覆盖到最下面一张卡片，否则后面的内容会被压住
  const gridBox = await grid.boundingBox()
  const lowest = Math.max(...boxes.map(box => box.y + box.h))
  expect(gridBox!.y + gridBox!.height + 1).toBeGreaterThanOrEqual(lowest)

  // 窄屏退回单列
  await page.setViewportSize({ width: 390, height: 900 })
  await page.waitForTimeout(500)
  const narrow = await measure()
  expect(new Set(narrow.map(box => box.x)).size).toBe(1)
})

test('公众号文章可以打开演示全文阅读', async ({ page }) => {
  await openHome(page)
  await page.locator('.main-nav').getByRole('button', { name: /消息与订阅/ }).click()
  await page.getByRole('tab', { name: /公众号订阅/ }).click()

  const article = page.locator('.feed-article').filter({ hasText: '数据结构' }).first()
  await article.locator('.feed-title').click()
  await article.getByRole('button', { name: '阅读全文' }).click()

  const reader = page.getByRole('dialog', { name: '文章全文预览' })
  await expect(reader).toBeVisible()
  await expect(reader).toContainText('演示全文')
  await expect(reader).toContainText('信息楼B203')
  await expect(reader).toContainText('请各班学习委员相互转告')

  await reader.locator('.modal-actions').getByRole('button', { name: '关闭' }).click()
  await expect(reader).toBeHidden()
})

test('可添加真实 RSS 订阅源：抓取、分组、阅读全文并入库', async ({ page }) => {
  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>温医大竞赛订阅</title>
    <item>
      <title>关于举办2026年校园程序设计竞赛的通知</title>
      <link>https://example.com/p/1</link>
      <pubDate>Mon, 02 Nov 2026 09:00:00 +0800</pubDate>
      <description><![CDATA[<p>面向全校本科生，三人组队，11月20日前在教务系统报名。</p>]]></description>
      <content:encoded><![CDATA[<p>面向全校本科生，三人组队参赛。</p><p>报名截止时间为11月20日，逾期不再补报。</p>]]></content:encoded>
    </item>
    <item>
      <title>图书馆冬季开放时间调整</title>
      <link>https://example.com/p/2</link>
      <pubDate>Sun, 01 Nov 2026 08:00:00 +0800</pubDate>
      <description>自11月10日起，图书馆闭馆时间调整为22:30。</description>
    </item>
  </channel>
</rss>`
  await page.route('https://example.com/feed.xml', route => route.fulfill({
    status: 200,
    contentType: 'application/rss+xml; charset=utf-8',
    headers: { 'access-control-allow-origin': '*' },
    body: feed,
  }))

  await openHome(page)
  await page.locator('.main-nav').getByRole('button', { name: /消息与订阅/ }).click()
  await page.getByRole('tab', { name: /公众号订阅/ }).click()

  await page.locator('.account-rss').getByRole('button', { name: '添加' }).click()
  const dialog = page.getByRole('dialog', { name: '添加订阅源' })
  await dialog.getByLabel('订阅源名称').fill('温医大竞赛订阅')
  await dialog.getByLabel('RSS / Atom 地址').fill('https://example.com/feed.xml')
  await dialog.getByRole('button', { name: '添加并抓取' }).click()
  await expect(dialog).toBeHidden()

  // 订阅源在界面上表现为一个「账号」，并标注内容来自真实抓取
  const group = page.locator('.feed-group').filter({ hasText: '温医大竞赛订阅' })
  await expect(group).toBeVisible()
  await expect(group.locator('.trust-chip.rss')).toContainText('真实抓取')
  await expect(group).toContainText('关于举办2026年校园程序设计竞赛的通知')
  await expect(group).toContainText('图书馆冬季开放时间调整')

  // 全文来自订阅源正文（content:encoded），不是演示文案
  const article = group.locator('.feed-article').filter({ hasText: '校园程序设计竞赛' })
  await article.locator('.feed-title').click()
  await article.getByRole('button', { name: '阅读全文' }).click()
  const reader = page.getByRole('dialog', { name: '文章全文预览' })
  await expect(reader).toContainText('RSS 全文')
  await expect(reader).toContainText('报名截止时间为11月20日，逾期不再补报。')
  await reader.locator('.modal-actions').getByRole('button', { name: '关闭' }).click()

  // 入库后与信息库其余条目一起走查重与分类
  await article.getByRole('button', { name: '入库' }).click()
  await page.locator('.main-nav').getByRole('button', { name: /全部信息/ }).click()
  await expect(page.locator('.library-list')).toContainText('校园程序设计竞赛')
})

test('微信与钉钉消息可批量导入本机并逐条分析入库', async ({ page }) => {
  await openHome(page)
  await page.locator('.main-nav').getByRole('button', { name: /消息与订阅/ }).click()
  await page.getByRole('button', { name: '批量导入', exact: true }).click()

  const dialog = page.getByRole('dialog', { name: '批量导入消息' })
  await expect(dialog).toBeVisible()
  // 渠道可切换：这次整批都是钉钉
  await dialog.locator('.channel-picker').getByRole('button', { name: '钉钉' }).click()
  await dialog.locator('textarea').fill([
    'ACM 集训队通知群',
    '校赛报名截止 11 月 18 日，三人一队，线上提交题解。',
    '',
    '蓝桥杯备赛群',
    '省赛 11 月 25 日开始报名，报名费由学院统一承担。',
    '',
    '数学建模交流群：国赛校选 11 月 3 日晚截止，请尽快组队。',
  ].join('\n'))

  // 三条都识别成独立来源，不需要手工拆
  await expect(dialog.locator('.batch-preview-head')).toContainText('3 条')
  await expect(dialog.locator('.batch-row')).toHaveCount(3)
  await dialog.getByRole('button', { name: /仅保存到本机（3 条）/ }).click()
  await expect(dialog).toBeHidden()

  await expect(page.locator('.local-message')).toHaveCount(3)
  await expect(page.locator('.channel-badge.dingtalk')).toHaveCount(3)

  // 渠道筛选与全选
  await page.locator('.channel-filter').getByRole('button', { name: /^钉钉/ }).click()
  await expect(page.locator('.local-message')).toHaveCount(3)
  await page.getByRole('button', { name: /全选当前 3 条/ }).click()
  await expect(page.getByText('已选 3 条消息')).toBeVisible()

  // 勾选后逐条交给模型（无凭据时是本地整理，仍一条一条走完）
  await page.getByRole('button', { name: '用 AI 分析' }).click()
  const consent = page.getByRole('dialog', { name: '确认发送给 AI' })
  await expect(consent).toContainText('3 条钉钉消息')
  await expect(consent).toContainText('本地整理')
  await consent.getByRole('checkbox').check()
  await consent.getByRole('button', { name: '确认并分析' }).click()
  await expect(consent).toBeHidden()

  await expect(page.locator('.analyzed-label')).toHaveCount(3)
  await page.locator('.main-nav').getByRole('button', { name: /全部信息/ }).click()
  await expect(page.locator('.library-list')).toContainText('校赛报名截止')
  await expect(page.locator('.library-list')).toContainText('省赛 11 月 25 日开始报名')
})

test('关注源可自选竞赛官网与微信小程序', async ({ page }) => {
  await openHome(page)
  await page.locator('.main-nav').getByRole('button', { name: /消息与订阅/ }).click()
  await page.getByRole('tab', { name: /关注源/ }).click()

  // 内置官网默认全部关注
  const wmuCheckbox = page.getByRole('checkbox', { name: '取消关注温州医科大学教务处' })
  await expect(wmuCheckbox).toBeChecked()

  await page.locator('.main-nav').getByRole('button', { name: /全部信息/ }).click()
  await expect(page.locator('.info-card').filter({ hasText: '温州医科大学教务处' }).first()).toBeVisible()

  // 取消关注 → 该来源的条目从信息库消失（数据还在，重新关注就回来）
  await page.locator('.main-nav').getByRole('button', { name: /消息与订阅/ }).click()
  await page.getByRole('tab', { name: /关注源/ }).click()
  await wmuCheckbox.uncheck()
  await page.locator('.main-nav').getByRole('button', { name: /全部信息/ }).click()
  await expect(page.locator('.info-card').filter({ hasText: '温州医科大学教务处' })).toHaveCount(0)

  // 重新关注 → 条目回来
  await page.locator('.main-nav').getByRole('button', { name: /消息与订阅/ }).click()
  await page.getByRole('tab', { name: /关注源/ }).click()
  await page.getByRole('checkbox', { name: '关注温州医科大学教务处' }).check()
  await page.locator('.main-nav').getByRole('button', { name: /全部信息/ }).click()
  await expect(page.locator('.info-card').filter({ hasText: '温州医科大学教务处' }).first()).toBeVisible()

  // 自定义官网：浏览器版没有跨域能力，必须如实说明而不是假装抓到了
  await page.locator('.main-nav').getByRole('button', { name: /消息与订阅/ }).click()
  await page.getByRole('tab', { name: /关注源/ }).click()
  await page.getByLabel('官网名称').fill('全国大学生广告艺术大赛')
  await page.getByLabel('公告列表页地址').fill('https://adc.example.com/news/')
  await page.getByRole('button', { name: '添加并抓取' }).click()
  await expect(page.locator('.form-error')).toContainText('浏览器版受跨域限制')
  await expect(page.locator('.follow-card').filter({ hasText: '全国大学生广告艺术大赛' })).toBeVisible()

  // 小程序：只能登记关注，内容靠转发卡片导入
  await page.getByRole('button', { name: '关注小程序' }).click()
  await page.getByLabel('小程序名称').fill('挑战杯赛事助手')
  await page.getByRole('button', { name: '关注', exact: true }).click()
  const miniCard = page.locator('.follow-card').filter({ hasText: '挑战杯赛事助手' })
  await expect(miniCard).toBeVisible()
  await expect(miniCard.locator('.follow-tag.mini')).toContainText('小程序')

  await miniCard.getByRole('button', { name: '导入卡片' }).click()
  const batch = page.getByRole('dialog', { name: '批量导入消息' })
  await expect(batch).toBeVisible()
  await expect(batch.locator('.channel-picker button.active')).toContainText('小程序')
  await batch.getByRole('button', { name: '取消' }).click()
  await expect(batch).toBeHidden()
})

test('粘贴公众号文章链接即可订阅：识别账号、读正文并入库', async ({ page }) => {
  const articleHtml = `<!doctype html><html><head>
<meta property="og:title" content="关于举办2026年校园程序设计竞赛的通知">
<meta property="og:description" content="面向全校本科生，三人组队，11月20日前在教务系统报名。">
<meta property="og:site_name" content="温医大竞赛中心">
</head><body>
<h1 id="activity-name">关于举办2026年校园程序设计竞赛的通知</h1>
<script>
var nickname = "温医大竞赛中心";
var user_name = "gh_abc123";
var biz = "MzA5MTIzNDU2Nw==";
var ct = "1762000000";
</script>
<div id="js_content">
<section><p>面向全校本科生，三人组队参赛，每队不超过三人，可跨年级组队。</p></section>
<section>报名截止时间为 11 月 20 日 23:59，逾期不再补报。</section>
</div>
<div id="js_pc_qr_code">扫码关注</div>
</body></html>`

  await page.route('https://mp.weixin.qq.com/s/**', route => route.fulfill({
    status: 200,
    contentType: 'text/html; charset=utf-8',
    headers: { 'access-control-allow-origin': '*' },
    body: articleHtml,
  }))

  await openHome(page)
  await page.locator('.main-nav').getByRole('button', { name: /消息与订阅/ }).click()
  await page.getByRole('tab', { name: /公众号订阅/ }).click()

  await page.locator('.wechat-subs').getByRole('button', { name: '订阅' }).click()
  const dialog = page.getByRole('dialog', { name: '订阅公众号' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('公众号文章链接').fill('https://mp.weixin.qq.com/s/AbCdEf123')
  await dialog.getByRole('button', { name: '抓取并订阅' }).click()
  await expect(dialog).toBeHidden()

  // 公众号被识别成账号，文章归到它下面，并标注内容来自链接抓取
  const group = page.locator('.feed-group').filter({ hasText: '温医大竞赛中心' })
  await expect(group).toBeVisible()
  await expect(group.locator('.trust-chip.wechat')).toContainText('链接抓取')
  await expect(group).toContainText('关于举办2026年校园程序设计竞赛的通知')

  // 正文来自页面 #js_content，不是编造的
  await group.locator('.feed-title').click()
  await group.getByRole('button', { name: '阅读全文' }).click()
  const reader = page.getByRole('dialog', { name: '文章全文预览' })
  await expect(reader.locator('.eyebrow')).toContainText('公众号原文 · 链接抓取')
  await expect(reader.locator('.reader-text')).toContainText('逾期不再补报')
  await reader.getByRole('button', { name: '加入信息库' }).click()
  await expect(reader).toBeHidden()

  await page.locator('.main-nav').getByRole('button', { name: /全部信息/ }).click()
  await expect(page.locator('.library-list')).toContainText('校园程序设计竞赛')
})

test('拖入聊天记录文件或选中的文字即可进入批量导入', async ({ page }) => {
  await openHome(page)
  // 故意不先在消息页：拖到首页（窗口任意位置）也要能接住并自动切页
  await expect(page.getByRole('heading', { name: '今日精选', exact: true })).toBeVisible()

  await page.evaluate(() => {
    const target = document.body
    const data = new DataTransfer()
    data.items.add(new File(['蓝桥杯备赛群\n省赛 11 月 25 日开始报名。'], 'chat.txt', { type: 'text/plain' }))
    data.setData('text/plain', 'ACM 集训队通知群\n校赛报名 11 月 18 日截止。')
    const fire = (type: string) => target.dispatchEvent(
      new DragEvent(type, { dataTransfer: data, bubbles: true, cancelable: true }),
    )
    fire('dragenter')
    fire('dragover')
  })

  // 拖到窗口上会给出整窗提示，而不是只有那个小方块有反应
  await expect(page.locator('.drop-overlay')).toBeVisible()
  await expect(page.locator('.drop-overlay')).toContainText('松手就导入消息箱')

  await page.evaluate(() => {
    const target = document.body
    const data = new DataTransfer()
    data.items.add(new File(['蓝桥杯备赛群\n省赛 11 月 25 日开始报名。'], 'chat.txt', { type: 'text/plain' }))
    data.setData('text/plain', 'ACM 集训队通知群\n校赛报名 11 月 18 日截止。')
    target.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }))
  })

  await expect(page.locator('.drop-overlay')).toBeHidden()
  const dialog = page.getByRole('dialog', { name: '批量导入消息' })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.batch-preview-head')).toContainText('2 条')
  await dialog.getByRole('button', { name: /仅保存到本机（2 条）/ }).click()
  await expect(dialog).toBeHidden()
  await expect(page.locator('.local-message')).toHaveCount(2)
  await expect(page.locator('.local-message-list')).toContainText('蓝桥杯备赛群')
})

test('拖入非文本文件时给出明确提示，不会静默失败', async ({ page }) => {
  await openHome(page)
  await page.evaluate(() => {
    const data = new DataTransfer()
    data.items.add(new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' }))
    document.body.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }))
  })
  await expect(page.locator('.toast')).toContainText('没有读到可导入的文字')
  await expect(page.locator('.toast')).toContainText('photo.png')
  await expect(page.getByRole('dialog', { name: '批量导入消息' })).toBeHidden()
})

test('拖入微信导出的 .zip 聊天记录也能解开导入', async ({ page }) => {
  await openHome(page)
  // 真实 deflate 压缩包（含两个 txt、一个 html、一张会被跳过的 png）
  const base64 = readFileSync('tests/fixtures/chat-export.zip').toString('base64')
  await page.evaluate((payload: string) => {
    const bytes = Uint8Array.from(atob(payload), char => char.charCodeAt(0))
    const data = new DataTransfer()
    data.items.add(new File([bytes], '聊天记录_20261104_000456.zip', { type: 'application/zip' }))
    document.body.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }))
  }, base64)

  const dialog = page.getByRole('dialog', { name: '批量导入消息' })
  await expect(dialog).toBeVisible()
  // 三个 txt + 一个 html 都认出来了，png 被跳过
  await expect(dialog.locator('.batch-preview-head')).toContainText('4 条')
  await expect(dialog.locator('.batch-row').first()).toContainText('蓝桥杯备赛群')
  // .html 条目剥掉了标签，不是把 <p> 当正文
  await expect(dialog).toContainText('数学建模通知群')
  await expect(dialog).not.toContainText('<p>')
  // GBK 编码的条目不能变成乱码
  await expect(dialog).toContainText('电子设计竞赛群')

  await dialog.getByRole('button', { name: /仅保存到本机（4 条）/ }).click()
  await expect(dialog).toBeHidden()
  await expect(page.locator('.local-message')).toHaveCount(4)
})

test('微信导出的聊天记录按时间戳逐条拆开，正文里的【标签】不会被当成群名', async ({ page }) => {
  await openHome(page)
  const base64 = readFileSync('tests/fixtures/wechat-export.zip').toString('base64')
  await page.evaluate((payload: string) => {
    const bytes = Uint8Array.from(atob(payload), char => char.charCodeAt(0))
    const data = new DataTransfer()
    data.items.add(new File([bytes], '聊天记录_20261104_000456.zip', { type: 'application/zip' }))
    document.body.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }))
  }, base64)

  const dialog = page.getByRole('dialog', { name: '批量导入消息' })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.batch-preview-head')).toContainText('2 条')
  // 两条消息各成一条，来源名取压缩包内的文件名
  await expect(dialog.locator('.batch-row').first()).toContainText('聊天记录 1')
  await expect(dialog.locator('.batch-row').nth(1)).toContainText('聊天记录 2')

  const text = await dialog.innerText()
  // 发送者行与时间戳是切分依据，不能留在正文里
  expect(text).not.toContain('·张三')
  expect(text).not.toContain('19:33')
  // 【标签】属于正文，不能变成群名
  await expect(dialog.locator('.batch-row').nth(1)).toContainText('【选拔赛通知】')
  await expect(dialog.locator('.batch-row').nth(1)).toContainText('【第二临床医学院职业发展协会】')
})
