/**
 * collect.mjs 的入口：只负责导出采集器与订阅源解析器。
 * 单独成文件是为了让 esbuild 的 bundle 边界清晰（不把 scripts/ 里的 Node 代码混进去）。
 */
export { fetchLiveCompetitions } from '../src/liveSource'
// 用户自己添加的竞赛官网：桌面版主进程抓取（ipc: live:fetch-custom）
export { fetchCustomSource } from '../src/liveSource'
// 桌面版主进程用同一个解析器抓 RSS，避免浏览器跨域限制（ipc: rss:fetch）
export { fetchFeed } from '../src/rss'
// 公众号文章链接解析（ipc: wechat:fetch-article）
export { fetchWechatArticle } from '../src/wechatArticle'
