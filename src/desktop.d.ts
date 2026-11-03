export {}

declare global {
  interface Window {
    subscriberDesktop?: {
      platform: string
      version: string
      isDesktop: boolean
      /** 桌面版可用：主进程实时抓取竞赛官网，返回 { ok, message, report }。 */
      fetchLive?: () => Promise<{
        ok: boolean
        message: string
        report: {
          fetchedAt: string
          items: import('./data').NewItemInput[]
          logs: { source: string; ok: boolean; count: number; message: string }[]
        } | null
      }>
      /** 桌面版可用：主进程抓取 RSS / Atom 订阅源（无跨域限制），返回 { ok, message, parsed }。 */
      fetchRss?: (url: string) => Promise<{
        ok: boolean
        message: string
        parsed: {
          title: string | null
          items: import('./rss').FeedItem[]
        } | null
      }>
      /** 桌面版可用：主进程抓取用户添加的竞赛官网列表页，返回 { ok, message, items }。 */
      fetchCustomLive?: (name: string, listUrl: string) => Promise<{
        ok: boolean
        message: string
        items: import('./data').NewItemInput[]
      }>
      /** 桌面版可用：读取一次系统剪贴板（用户点击才读，不监听变化）。 */
      readClipboard?: () => Promise<{ ok: boolean; text: string; message: string }>
      /** 桌面版可用：从队列取走外部转发进来的内容（取走即清空）。 */
      pullIncomingShares?: () => Promise<{ title: string; text: string }[]>
      /** 桌面版可用：有新转发内容时收到通知；返回取消订阅函数。 */
      onIncomingShare?: (callback: () => void) => (() => void)
      /** 桌面版可用：主进程抓取用户粘贴的公众号文章链接，返回 { ok, message, article }。 */
      fetchWechatArticle?: (url: string) => Promise<{
        ok: boolean
        message: string
        article: import('./wechatArticle').ParsedWechatArticle | null
      }>
    }
  }
}
