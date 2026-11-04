import { expect, test } from '@playwright/test'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { classifyLibrary, deadlineDays, deadlineLabel, inferCategory, parseDateText } from '../src/classify'
import { buildLiveItem, type LiveSource } from '../src/liveSource'
import { parseFeedXml } from '../src/rss'
import { decodeTextBytes } from '../src/textDecode'
import type { InfoItem } from '../src/data'

const NOW = new Date('2026-11-04T10:00:00+08:00')

function item(overrides: Partial<InfoItem> & Pick<InfoItem, 'id' | 'title'>): InfoItem {
  return {
    category: '竞赛',
    summary: '',
    source: '校教务处',
    sourceType: '官网直采',
    publishedAt: '11月01日 09:00',
    tags: [],
    favorite: false,
    liked: false,
    completed: false,
    priority: 'normal',
    evidence: '',
    keyPoints: [],
    ...overrides,
  }
}

const source: LiveSource = {
  id: 'test',
  name: '测试官网',
  homepage: 'https://example.edu.cn/',
  listUrl: 'https://example.edu.cn/list',
  origin: 'https://example.edu.cn',
  linkPattern: /\/notice\/\d+/,
  limit: 5,
}

function liveDeadline(body: string) {
  return buildLiveItem(source, 'https://example.edu.cn/notice/1', '测试公告', `<h1>测试公告</h1><p>${body}</p>`, '2026-10-10').deadline
}

test.describe('分类与时间引擎', () => {
  test('无关键词时回退新闻，而不是默认竞赛', () => {
    const guess = inferCategory('')
    expect(guess.category).toBe('新闻')
    expect(guess.confidence).toBeLessThan(50)
    expect(inferCategory('数学建模竞赛').category).toBe('竞赛')
  })

  test('非法日期不会被 Date 自动滚动成有效日期', () => {
    expect(parseDateText('2026-02-30')).toBeNull()
    expect(parseDateText('2026-13-01')).toBeNull()
    expect(parseDateText('2026-01-01 25:99')).toBeNull()
    expect(parseDateText('2026年2月28日')).not.toBeNull()
  })

  test('短日期按固定 now 推断跨年', () => {
    expect(parseDateText('1月5日', new Date('2026-12-31T12:00:00+08:00'))).toBe(
      new Date('2027-01-05T23:59:00+08:00').getTime(),
    )
    expect(parseDateText('12月31日', new Date('2027-01-01T12:00:00+08:00'))).toBe(
      new Date('2026-12-31T23:59:00+08:00').getTime(),
    )
  })

  test('刚过期不足一天也显示已截止', () => {
    const expired = item({
      id: 1,
      title: '已过期的竞赛',
      deadline: '11月04日 09:59',
      deadlineTs: '2026-11-04T09:59:00+08:00',
    })
    expect(deadlineDays(expired, NOW)).toBeLessThan(0)
    expect(deadlineLabel(expired, NOW)).toBe('已截止')
  })

  test('版本只展示最新结论，且所有原始 id 都能打开同一事件', () => {
    const first = item({
      id: 11,
      title: '关于举办数学建模竞赛的通知',
      eventKey: 'mcm-test',
      summary: '首次通知，11月20日截止。',
      deadline: '11月20日',
      deadlineTs: '2026-11-20T23:59:00+08:00',
      publishedTs: '2026-11-01T09:00:00+08:00',
      evidence: '首次通知原文',
    })
    const second = item({
      id: 12,
      title: '关于举办数学建模竞赛的通知（延期）',
      eventKey: 'mcm-test',
      summary: '延期到11月25日。',
      deadline: '11月25日',
      deadlineTs: '2026-11-25T23:59:00+08:00',
      publishedTs: '2026-11-03T09:00:00+08:00',
      evidence: '延期通知原文',
    })
    const mirror = item({
      id: 13,
      title: '关于举办数学建模竞赛的通知（延期）',
      source: '竞赛聚合号（转载）',
      eventKey: 'mcm-test',
      summary: '延期到11月25日。',
      deadline: '11月25日',
      deadlineTs: '2026-11-25T23:59:00+08:00',
      publishedTs: '2026-11-03T09:00:00+08:00',
      evidence: '转载',
    })
    const library = classifyLibrary([first, second, mirror], NOW)
    expect(library.visible).toHaveLength(1)
    const entry = library.visible[0]
    expect(entry.versions).toHaveLength(2)
    expect(entry.item.id).toBe(12)
    expect(entry.item.deadline).toBe('11月25日')
    expect(entry.duplicateCount).toBe(1)
    for (const original of [first, second, mirror]) expect(library.byId.get(original.id)).toBe(entry)
  })
})

test.describe('官网截止时间提取', () => {
  test('报名区间取结束日', () => {
    expect(liveDeadline('报名时间：10月16日－10月23日。')).toContain('10月23日')
    expect(liveDeadline('报名时间：2026年10月15日12:00－10月19日12:00。')).toContain('10月19日')
  })

  test('“X日前提交”是截止时间而不是资格界限', () => {
    expect(liveDeadline('请于11月20日18:00前提交报名材料。')).toContain('11月20日')
  })

  test('统计周期不会被当成报名截止', () => {
    expect(liveDeadline('统计数据时间为2026年1月1日至2026年12月31日。')).toBeUndefined()
  })

  test('活动日期与报名截止同时出现时优先截止', () => {
    expect(liveDeadline('活动日期为11月5日，报名截止11月1日。')).toContain('11月1日')
  })
})

test.describe('RSS / Atom 与文本编码', () => {
  test('Atom 选择 alternate 链接、支持相对地址与实体', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title>测试订阅</title>
        <entry>
          <title>课程调整通知</title>
          <link rel="self" href="/feed/entry/1.xml"/>
          <link rel="alternate" href="/news/1?a=1&amp;b=2"/>
          <published>2026-11-03T08:00:00+08:00</published>
          <content type="html"><![CDATA[<p>本周四的课程调整到周五下午。</p>]]></content>
        </entry>
      </feed>`
    const feed = parseFeedXml(xml, 'https://example.edu.cn/feed.xml')
    expect(feed.items).toHaveLength(1)
    expect(feed.items[0].link).toBe('https://example.edu.cn/news/1?a=1&b=2')
    expect(feed.items[0].paragraphs[0]).toContain('课程调整')
  })

  test('UTF-8 与 GB18030 字节都能正确解码', () => {
    expect(decodeTextBytes(new TextEncoder().encode('中文通知'))).toBe('中文通知')
    // “中文”的 GBK 编码
    expect(decodeTextBytes(Uint8Array.from([0xd6, 0xd0, 0xce, 0xc4]))).toBe('中文')
    const utf16 = Uint8Array.from([0xff, 0xfe, 0x2d, 0x4e, 0x87, 0x65])
    expect(decodeTextBytes(utf16)).toBe('中文')
  })
})

test.describe('系统转发参数', () => {
  const require = createRequire(join(process.cwd(), 'tests', 'core.spec.ts'))
  const { decodeProtocolArg, parseShareArgs, readTextFile } = require('../electron/share-args.cjs') as {
    decodeProtocolArg: (raw: string) => { title: string; text: string } | null
    parseShareArgs: (argv: string[]) => { title: string; text: string }[]
    readTextFile: (path: string) => string | null
  }

  test('支持 subscriber:// 协议、--share-text 与 --share-file', () => {
    expect(decodeProtocolArg('subscriber://share?title=竞赛群&text=报名截止11月20日')).toEqual({
      title: '竞赛群',
      text: '报名截止11月20日',
    })
    expect(parseShareArgs(['Subscriber.exe', '--share-text', '课程调整通知'])).toEqual([{ title: '', text: '课程调整通知' }])
    expect(parseShareArgs(['Subscriber.exe', '--share-text', ''])).toEqual([])
  })

  test('--share-file 能读 GB18030，并把 HTML 转成纯文本', () => {
    const dir = mkdtempSync(join(tmpdir(), 'subscriber-share-'))
    try {
      const gbk = join(dir, 'gbk.txt')
      // “中文通知”的 GB18030 编码
      writeFileSync(gbk, Uint8Array.from([0xd6, 0xd0, 0xce, 0xc4, 0xcd, 0xa8, 0xd6, 0xaa]))
      expect(readTextFile(gbk)).toBe('中文通知')
      const html = join(dir, 'chat.html')
      writeFileSync(html, '<html><body><p>竞赛通知</p><script>alert(1)</script></body></html>', 'utf8')
      expect(readTextFile(html)).toContain('竞赛通知')
      expect(readTextFile(html)).not.toContain('<p>')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
