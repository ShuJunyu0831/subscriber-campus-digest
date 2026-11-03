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
  await page.locator('.main-nav').getByRole('button', { name: /微信消息/ }).click()
  await expect(page.getByRole('heading', { name: '微信消息', exact: true })).toBeVisible()
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
  await page.locator('.main-nav').getByRole('button', { name: /微信消息/ }).click()
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
  await expect(page.locator('.insight-chip')).toContainText('已自动合并 2 条')
  // 原文与转载只出现一次
  await expect(page.locator('.library-list .card-main h3').filter({ hasText: '数学建模' })).toHaveCount(1)

  await page.locator('.insight-chip').click()
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
  await page.locator('.main-nav').getByRole('button', { name: /微信消息/ }).click()
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
  await page.locator('.main-nav').getByRole('button', { name: /微信消息/ }).click()
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
  await page.locator('.mobile-nav').getByRole('button', { name: /微信消息/ }).click()
  await page.getByRole('tab', { name: /公众号订阅/ }).click()
  await expect(page.locator('.account-overview')).toBeVisible()
  await expect(page.locator('.feed-article').first()).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
