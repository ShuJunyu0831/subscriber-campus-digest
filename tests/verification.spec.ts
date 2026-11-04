import { expect, test, type Page } from '@playwright/test'

async function openHome(page: Page) {
  await page.goto('/')
  const digest = page.getByRole('dialog', { name: '今天，值得关注这些' })
  if (await digest.isVisible()) {
    await digest.getByRole('button', { name: '开始浏览' }).click()
    await expect(digest).toBeHidden()
  }
}

async function openLibrary(page: Page) {
  await page.locator('.main-nav').getByRole('button', { name: /全部信息/ }).click()
  await expect(page.locator('.library-list')).toBeVisible()
}

async function previewTextImport(page: Page, content: string) {
  await page.getByRole('button', { name: '导入新信息' }).click()
  const importDialog = page.getByRole('dialog', { name: '导入一条信息' })
  await importDialog.locator('textarea').fill(content)
  await importDialog.getByRole('button', { name: '开始整理' }).click()
  const preview = page.getByRole('dialog', { name: '确认写入信息库' })
  await expect(preview).toBeVisible()
  return preview
}

test('全局搜索会带着关键词进入信息库并真正过滤', async ({ page }) => {
  await openHome(page)
  const search = page.getByLabel('搜索全部信息')
  await search.fill('挑战杯')
  await search.press('Enter')
  await expect(page.getByRole('heading', { name: '全部信息', exact: true })).toBeVisible()
  await expect(page.getByLabel('在信息库中搜索')).toHaveValue('挑战杯')
  const cards = page.locator('.library-list .info-card')
  await expect(cards.first()).toBeVisible()
  for (const text of await cards.allInnerTexts()) expect(text).toContain('挑战杯')
})

test('手动导入先预览，取消不写入；确认后条目与收藏完成状态跨刷新保留', async ({ page }) => {
  await openHome(page)
  const title = '唯一持久化回归条目'
  const dialog = await previewTextImport(page, `${title}\n这是只应在本机保存的测试正文。`)
  await expect(dialog).toContainText('确认前尚未写入')

  await dialog.getByRole('button', { name: '返回修改' }).click()
  await page.getByRole('dialog', { name: '导入一条信息' }).getByRole('button', { name: '取消' }).click()
  await openLibrary(page)
  await expect(page.locator('.library-list')).not.toContainText(title)

  const preview = await previewTextImport(page, `${title}\n这是只应在本机保存的测试正文。`)
  await preview.getByRole('button', { name: '确认入库' }).click()
  await expect(preview).toBeHidden()
  await openLibrary(page)
  const card = page.locator('.library-list .info-card').filter({ hasText: title })
  await expect(card).toHaveCount(1)

  await card.getByRole('button', { name: '收藏', exact: true }).click()
  await expect(card.getByRole('button', { name: '取消收藏' })).toBeVisible()
  await card.locator('.card-main').click()
  const detail = page.getByRole('dialog', { name: '信息详情' })
  await detail.getByRole('button', { name: '标记完成', exact: true }).click()
  await detail.getByRole('button', { name: '返回', exact: true }).click()

  // 等 IndexedDB 事务落盘后再刷新，避免把「尚未写完」误判成持久化失败。
  await expect.poll(() => page.evaluate(() => new Promise<boolean>(resolve => {
    const request = indexedDB.open('subscriber-info-library', 1)
    request.onerror = () => resolve(false)
    request.onsuccess = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('items')) { resolve(false); return }
      const all = db.transaction('items', 'readonly').objectStore('items').getAll()
      all.onsuccess = () => resolve((all.result as { title?: string; favorite?: boolean; completed?: boolean }[])
        .some(item => item.title === '唯一持久化回归条目' && item.favorite && item.completed))
      all.onerror = () => resolve(false)
    }
  })), { timeout: 5000 }).toBe(true)

  await page.reload()
  await openHome(page)
  await openLibrary(page)
  const restored = page.locator('.library-list .info-card').filter({ hasText: title })
  await expect(restored).toHaveCount(1)
  await expect(restored).toHaveClass(/is-completed/)
  await expect(restored.getByRole('button', { name: '取消收藏' })).toBeVisible()
})

test('外部分享自动关闭摘要、只接收一次，取消后返回消息页不重放', async ({ page }) => {
  await page.addInitScript(() => {
    const state = { delivered: false, pulls: 0 }
    ;(window as unknown as { __shareState: typeof state }).__shareState = state
    ;(window as unknown as { subscriberDesktop: unknown }).subscriberDesktop = {
      isDesktop: true,
      pullIncomingShares: async () => {
        state.pulls += 1
        if (state.delivered) return []
        state.delivered = true
        return [{ title: '软件竞赛通知群', text: '报名截止到11月20日，请三人组队。' }]
      },
      onIncomingShare: () => () => undefined,
    }
  })
  await page.goto('/')

  const digest = page.getByRole('dialog', { name: '今天，值得关注这些' })
  await expect(digest).toBeHidden()
  const batch = page.getByRole('dialog', { name: '批量导入消息' })
  await expect(batch).toBeVisible()
  await expect(batch).toContainText('软件竞赛通知群')

  await batch.getByRole('button', { name: '取消' }).click()
  await expect(batch).toBeHidden()
  await openLibrary(page)
  await page.locator('.main-nav').getByRole('button', { name: /消息与订阅/ }).click()
  await expect(page.getByRole('dialog', { name: '批量导入消息' })).toBeHidden()
  expect(await page.evaluate(() => (window as unknown as { __shareState: { pulls: number } }).__shareState.pulls)).toBe(1)
})

test('选中 Kimi 后请求必须发往 Kimi 端点并使用 Kimi API 模型', async ({ page }) => {
  const requests: { host: string; model: string }[] = []
  await page.route('https://api.moonshot.cn/**', async route => {
    const request = route.request()
    if (request.method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-headers': 'authorization, content-type',
        },
      })
      return
    }
    const body = request.postDataJSON() as { model?: string }
    requests.push({ host: new URL(request.url()).host, model: body.model ?? '' })
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({
        summary: 'Kimi 返回的真实摘要。',
        keyPoints: ['核对报名截止'],
        deadline: '11月20日',
        evidence: '报名截止到11月20日。',
      }) } }] }),
    })
  })

  await openHome(page)
  await page.locator('.llm-trigger').click()
  let panel = page.getByRole('dialog', { name: '选择分析模型' })
  await panel.getByRole('button', { name: /Kimi K2/ }).click()
  await expect(page.locator('.llm-trigger')).toContainText('Kimi K2')

  await page.locator('.llm-trigger').click()
  panel = page.getByRole('dialog', { name: '选择分析模型' })
  await panel.getByRole('button', { name: /接入真实模型/ }).click()
  await expect(panel.getByLabel('厂商')).toHaveValue('kimi')
  await panel.getByLabel('API Key').fill('sk-kimi-test')
  await panel.getByRole('button', { name: '保存并接入' }).click()
  await expect(panel).toContainText('已接入 月之暗面')
  await page.locator('.llm-trigger').click()

  const preview = await previewTextImport(page, 'Kimi 路由测试：校园竞赛报名截止到11月20日。')
  await preview.getByRole('button', { name: '确认入库' }).click()
  await expect(preview).toBeHidden()

  expect(requests).toHaveLength(1)
  expect(requests[0].host).toBe('api.moonshot.cn')
  expect(requests[0].model).toBe('kimi-k2-0905-preview')
})
