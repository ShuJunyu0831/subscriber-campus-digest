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
    }
  }
}
